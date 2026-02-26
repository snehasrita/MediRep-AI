import asyncio
import json
import logging
import re
import threading
from typing import List, Optional
from urllib.parse import urlparse

import google.generativeai as genai
import httpx

from config import GEMINI_API_KEY, GEMINI_MODEL, MAX_HISTORY_MESSAGES, GROQ_API_KEY, GROQ_MODEL
from models import PatientContext, Message, Citation, DrugInfo, ChatMessage
from pydantic import BaseModel, Field
from services.language_service import detect_language, get_language_instruction, is_language_supported_by_groq

logger = logging.getLogger(__name__)

# Groq API configuration
GROQ_API_BASE = "https://api.groq.com/openai/v1"

# Conservative allowlist to avoid garbage citation links.
TRUSTED_CITATION_DOMAINS = (
    "fda.gov",
    "nih.gov",
    "ncbi.nlm.nih.gov",
    "dailymed.nlm.nih.gov",
    "cdc.gov",
    "who.int",
    "mayoclinic.org",
    "medscape.com",
    "drugs.com",
    "rxlist.com",
)

# Thread-safe lazy initialization
_model = None
_configured = False
_model_lock = threading.Lock()


def _get_model():
    """Lazy initialization of Gemini model (thread-safe)."""
    global _model, _configured

    if _model is not None:
        return _model

    with _model_lock:
        if _model is not None:
            return _model

        if not GEMINI_API_KEY:
            raise ValueError("GEMINI_API_KEY is not configured")

        if not _configured:
            genai.configure(api_key=GEMINI_API_KEY)
            _configured = True

        _model = genai.GenerativeModel(GEMINI_MODEL)

    return _model


SYSTEM_PROMPT = """You are MediRep AI, a conversational medical assistant for healthcare professionals in India.

OPERATING MODES:

MODE 1: GENERAL INQUIRY (No [Patient Context])
- Provide standard medical information for healthcare professionals.
- Focus on efficacy, mechanism of action, and standard dosing.

MODE 2: PATIENT SPECIFIC ([Patient Context] present)
- PERSONALIZE every answer to the patient's Age, Conditions, Allergies.
- Cross-check drug recommendations against patient profile.
- Explicitly mention compatibility or risks.

KNOWLEDGE SOURCES (You may receive one or more):

[Drug Database] - Indian drug data from our drug database
- Contains: drug name, generic name, price, manufacturer, therapeutic class.
- Use for pricing, brand availability, and Indian market info.
- Cite as (Source: Database).

[Medical Knowledge (NIH)] - Authoritative Q&A from NIH/MedQuAD
- Contains: medical questions and expert answers from NIH sources.
- Use for symptoms, diagnoses, conditions, treatment guidelines.
- Highly reliable clinical information. Cite as (Source: NIH).

[Database Info for X] - Specific drug lookup result
- Detailed info for a specific drug query.
- If incomplete (missing indications/side effects), supplement with your medical knowledge.

RESPONSE RULES:
1. ANSWER ONLY what was asked - be direct and concise.
2. If database info is incomplete, USE YOUR MEDICAL KNOWLEDGE to fill gaps.
3. For symptom queries: explain causes, when to seek care, management.
4. For drug queries: include dosage, side effects, interactions if relevant.
5. Cite sources: (Source: Database), (Source: NIH), or (Source: Medical Knowledge).
6. Prefix critical warnings with "Important:".
7. For simple replies (yes, thanks), use chat history, ignore keyword-matched context.
8. For follow-ups like "rephrase", "one-line", "summarize that", keep the same drug/topic from prior turns; do not switch medications unless the user explicitly asks.
9. Keep default answers short: 2-4 sentences, under ~90 words, unless the user asks for detailed explanation.
10. Do not add unrelated generic care checklists. Include only the highest-yield items directly tied to the asked drug/question.
11. For monitoring questions, prioritize drug-specific safety/efficacy monitoring first; avoid routine broad panels unless explicitly requested.
12. If user asks for "one-line" output, return exactly one sentence.
13. If user asks for an exact bullet count, follow that format exactly.
14. For company portfolio/product-list queries in rep mode, use ONLY products explicitly present in the provided company product database context. If none are provided, say data is unavailable. Never invent brands or doses.
15. For time-sensitive questions (e.g., latest/current/today/this year/recommendation updates), treat claims as unverified unless supported by provided [Web Search Results].
16. If time-sensitive web results are present, include an explicit "As of <date>" statement and keep claims scoped to those sources only.
17. If no live web evidence is provided for a time-sensitive ask, clearly say you cannot verify the current update right now.
18. Do not assert country-specific guideline recommendations unless a matching country/regulator source is present.

CONVERSATION STYLE:
- Natural, professional, not robotic.
- Simple language healthcare workers understand.
- Do not append extra follow-up questions unless user asks for more.
- Plain text by default; use bullets or structured format only when user requests it.
- Keep under 250 words unless detail requested.
"""


def _compose_system_prompt(system_prompt_prefix: str = "") -> str:
    """Compose system prompt with an optional prefix (e.g., rep-mode instructions)."""
    prefix = (system_prompt_prefix or "").strip()
    if not prefix:
        return SYSTEM_PROMPT
    return f"{prefix}\n\n{SYSTEM_PROMPT}"


def format_patient_context(context: Optional[PatientContext]) -> str:
    """Format patient context for the prompt."""
    if not context:
        return ""

    parts = []
    if context.age is not None:
        parts.append(f"Age: {context.age}")
    if context.sex:
        parts.append(f"Sex: {context.sex}")
    if context.weight:
        parts.append(f"Weight: {context.weight}kg")
    if context.pre_existing_diseases:
        parts.append(f"Pre-existing diseases: {', '.join(context.pre_existing_diseases)}")
    if context.current_meds:
        parts.append(f"Current medications: {', '.join(context.current_meds)}")

    if parts:
        return f"\n\n[Patient Context] {', '.join(parts)}"
    return ""


def extract_citations(response_text: str, drug_name: Optional[str] = None) -> List[Citation]:
    """Extract trusted citations from response text only (no fabricated fallback links)."""
    citations = []

    # Look for URLs in the text
    url_pattern = r'https?://[^\s\)\]\}\>,"]+'
    urls = re.findall(url_pattern, response_text or "")
    seen = set()

    for raw_url in urls:
        url = raw_url.rstrip(".,;:!?")
        if not url or url in seen:
            continue
        seen.add(url)

        try:
            host = (urlparse(url).hostname or "").lower()
        except Exception:
            continue
        if not host:
            continue

        trusted = None
        for domain in TRUSTED_CITATION_DOMAINS:
            if host == domain or host.endswith(f".{domain}"):
                trusted = domain
                break
        if not trusted:
            continue

        if "fda.gov" in trusted:
            citations.append(Citation(title="FDA Drug Information", url=url, source="FDA"))
        elif "nih.gov" in trusted or "ncbi" in trusted or "dailymed" in trusted:
            citations.append(Citation(title="NIH/PubMed/DailyMed", url=url, source="NIH"))
        elif "cdc.gov" in trusted:
            citations.append(Citation(title="CDC Guidance", url=url, source="CDC"))
        elif "who.int" in trusted:
            citations.append(Citation(title="WHO Guidance", url=url, source="WHO"))
        else:
            citations.append(Citation(title="Reference", url=url, source=trusted))

        if len(citations) >= 3:
            break

    return citations


def generate_suggestions(message: str, response_text: str) -> List[str]:
    """Generate conversational follow-up suggestions based on context."""
    combined_text = (message + " " + response_text).lower()

    # Extract drug name from response for personalized suggestions
    drug_pattern = r'\b([A-Z][a-z]+(?:\s+\d+)?)\b'
    potential_drugs = re.findall(drug_pattern, response_text)

    stop_words = {'the', 'this', 'that', 'with', 'from', 'have', 'been', 'will', 'should',
                  'could', 'would', 'may', 'can', 'are', 'for', 'and', 'but', 'not', 'yes',
                  'warning', 'caution', 'note', 'important', 'source', 'sources', 'clinical',
                  'patient', 'patients', 'doctor', 'medical', 'treatment', 'therapy', 'fda',
                  'label', 'guidelines', 'recommended', 'advise', 'consult'}

    found_drugs = [d for d in potential_drugs if d.lower() not in stop_words and len(d) > 3]
    drug_name = found_drugs[0] if found_drugs else None

    # Determine what was already discussed to suggest OTHER topics
    discussed_dosage = any(x in combined_text for x in ['dosage', 'dose', 'mg', 'daily'])
    discussed_side_effects = any(x in combined_text for x in ['side effect', 'adverse', 'reaction'])
    discussed_interactions = any(x in combined_text for x in ['interaction', 'concurrent', 'combine'])
    discussed_warnings = any(x in combined_text for x in ['warning', 'caution', 'contraindic'])
    discussed_uses = any(x in combined_text for x in ['used for', 'indication', 'treat', 'relieve'])

    suggestions = []

    # Suggest topics NOT yet discussed
    if drug_name:
        if not discussed_dosage:
            suggestions.append(f"What's the recommended dosage?")
        if not discussed_side_effects:
            suggestions.append(f"What are the side effects?")
        if not discussed_interactions:
            suggestions.append(f"Any drug interactions?")
        if not discussed_warnings:
            suggestions.append(f"Any important warnings?")
        if not discussed_uses and len(suggestions) < 3:
            suggestions.append(f"What is it used for?")
        if len(suggestions) < 3:
            suggestions.append(f"Are there cheaper alternatives?")
    else:
        suggestions = [
            "Tell me more",
            "What should I monitor?",
            "Any precautions?"
        ]

    return suggestions[:3]


def _strip_trailing_cta(response_text: str) -> str:
    """Remove trailing model CTA prompts like 'Would you like ...?'."""
    text = (response_text or "").strip()
    if not text:
        return text

    # Remove final line(s) that are pure CTA follow-up prompts.
    lines = [ln.rstrip() for ln in text.splitlines()]
    cta_prefixes = (
        "would you like",
        "do you want",
        "would you want",
    )
    while lines:
        last = lines[-1].strip().lower()
        if any(last.startswith(p) for p in cta_prefixes):
            lines.pop()
            continue
        break
    text = "\n".join(lines).strip()

    # If CTA appears as trailing sentence on same line, trim it.
    text = re.sub(
        r'(?is)\s*(would you like|do you want|would you want)\b.*\?$',
        "",
        text
    ).strip()
    return text


def _enforce_user_format(message: str, response_text: str) -> str:
    """Apply lightweight deterministic formatting constraints from user message."""
    text = _strip_trailing_cta(response_text)
    msg = (message or "").lower()

    # One-line requests: return exactly one sentence.
    if any(k in msg for k in ("one-line", "one line", "single line")):
        first_line = next((ln.strip() for ln in text.splitlines() if ln.strip()), "")
        if not first_line:
            return text
        m = re.match(r"(.+?[.!?])(\s|$)", first_line)
        return (m.group(1).strip() if m else first_line).strip()

    # Exact bullet count requests: coerce to N bullets when feasible.
    m = re.search(r"exactly\s+(\d+)\s+bullet", msg)
    if m:
        n = max(1, min(int(m.group(1)), 10))

        # Collect candidate items from existing lines first.
        items = []
        for ln in text.splitlines():
            s = ln.strip()
            if not s:
                continue
            s = re.sub(r'^\s*[-*•]\s*', '', s)
            s = re.sub(r'^\s*\d+[.)]\s*', '', s)
            if s and s not in items:
                items.append(s)

        # Fallback: split by sentences if lines are not enough.
        if len(items) < n:
            for s in re.split(r'(?<=[.!?])\s+', text):
                s = s.strip()
                if s and s not in items:
                    items.append(s)
                if len(items) >= n:
                    break

        if items:
            return "\n".join(f"- {it.rstrip(' .')}" for it in items[:n])

    return text


async def _call_groq_api(
    messages: List[dict],
    system_prompt: str,
    temperature: float = 0.7
) -> str:
    """Call Groq API as fallback when Gemini fails."""
    if not GROQ_API_KEY:
        raise ValueError("GROQ_API_KEY is not configured")

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            # Prepare messages for OpenAI-compatible API
            api_messages = [{"role": "system", "content": system_prompt}]
            api_messages.extend(messages)

            response = await client.post(
                f"{GROQ_API_BASE}/chat/completions",
                headers={
                    "Authorization": f"Bearer {GROQ_API_KEY}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": GROQ_MODEL,
                    "messages": api_messages,
                    "temperature": temperature,
                    "max_tokens": 2000
                }
            )

            if response.status_code != 200:
                logger.error("Groq API error: %s - %s", response.status_code, response.text)
                raise Exception(f"Groq API error: {response.status_code}")

            data = response.json()
            return data["choices"][0]["message"]["content"]
    except Exception as e:
        logger.error("Groq API call failed: %s", e)
        raise


async def _generate_response_with_groq(
    message: str,
    patient_context: Optional[PatientContext] = None,
    history: Optional[List[Message]] = None,
    drug_info: Optional[DrugInfo] = None,
    rag_context: Optional[str] = None,
    system_prompt_prefix: str = ""
) -> dict:
    """Generate response using Groq API as fallback."""
    logger.info("Using Groq API as fallback for response generation")

    if history is None:
        history = []

    # Build context
    context_parts = []

    if rag_context:
        context_parts.append(f"\n\n[Knowledge Base Context]\n{rag_context}")

    patient_str = format_patient_context(patient_context)
    if patient_str:
        context_parts.append(patient_str)

    drug_name_for_citation = None
    if drug_info:
        drug_name_for_citation = drug_info.name
        drug_context = f"\n\n[Database Info for {drug_info.name}]"
        
        # Track what info is available vs missing
        has_indication = False
        has_side_effects = False
        
        if drug_info.generic_name:
            drug_context += f"\nGeneric: {drug_info.generic_name}"
        if drug_info.indications and any(drug_info.indications):
            drug_context += f"\nIndications: {'; '.join(drug_info.indications[:3])}"
            has_indication = True
        if drug_info.dosage:
            drug_context += f"\nDosage: {'; '.join(drug_info.dosage[:2])}"
        if drug_info.warnings:
            drug_context += f"\nWarnings: {'; '.join(drug_info.warnings[:3])}"
        if drug_info.contraindications:
            drug_context += f"\nContraindications: {'; '.join(drug_info.contraindications[:3])}"
        if drug_info.side_effects and any(drug_info.side_effects):
            drug_context += f"\nSide Effects: {'; '.join(drug_info.side_effects[:5])}"
            has_side_effects = True
        if drug_info.interactions:
            drug_context += f"\nInteractions: {'; '.join(drug_info.interactions[:3])}"
        if drug_info.price_raw:
            drug_context += f"\nPrice: {drug_info.price_raw}"
        if drug_info.manufacturer:
            drug_context += f"\nManufacturer: {drug_info.manufacturer}"
        
        # Add explicit instruction when key info is missing
        if not has_indication or not has_side_effects:
            drug_context += "\n\n[INSTRUCTION: Database has limited info. USE YOUR MEDICAL KNOWLEDGE to provide complete information about indications, uses, side effects, and mechanism of action.]"
        
        context_parts.append(drug_context)

    # Format history for Groq (OpenAI-compatible format)
    formatted_messages = []
    for msg in history[-MAX_HISTORY_MESSAGES:]:
        formatted_messages.append({
            "role": msg.role,
            "content": msg.content
        })

    # Build user message with context
    user_message = message
    if context_parts:
        user_message = "".join(context_parts) + "\n\n[Question] " + message

    formatted_messages.append({"role": "user", "content": user_message})

    response_text = await _call_groq_api(
        messages=formatted_messages,
        system_prompt=_compose_system_prompt(system_prompt_prefix),
        temperature=0.7
    )

    response_text = _enforce_user_format(message, response_text.strip())

    if not response_text:
        response_text = "I apologize, but I couldn't generate a response. Please try rephrasing your question."

    # Extract citations and generate suggestions
    citations = extract_citations(response_text, drug_name_for_citation)
    suggestions = generate_suggestions(message, response_text)

    return {
        "response": response_text,
        "citations": citations,
        "suggestions": suggestions
    }


class IntentPlan(BaseModel):
    intent: str = Field(default="GENERAL", description="One of: INFO, SUBSTITUTE, INTERACTION, SYMPTOM, GENERAL")
    drug_names: List[str] = Field(default_factory=list, description="List of recognized drug names found in the text. e.g. ['Dolo 650', 'Metformin']")
    entities: Optional[List[str]] = Field(default_factory=list, description="Other entities like symptoms or conditions.")



async def plan_intent(message: str, history: List[ChatMessage] = None) -> IntentPlan:
    """Analyze user message to determine intent and extract entities, considering history."""
    try:
        model = _get_model()
        
        # Format recent history for context (last 3 turns)
        history_context = ""
        if history:
            recent = history[-3:]
            for msg in recent:
                role = "User" if msg.role == "user" else "Assistant"
                history_context += f"{role}: {msg.content}\n"
        
        prompt = f"""Analyze the medical query and extract Intent and Entities.
Use conversation history to resolve references (e.g., "it", "that drug").

HISTORY:
{history_context}

CURRENT QUERY: "{message}"

Intents:
- INFO: Drug details, price, manufacturer, dosage, or general info about a specific drug.
- SUBSTITUTE: Cheaper alternatives, substitutes, or generic versions.
- INTERACTION: Drug-drug, drug-food, or drug-condition interactions.
- SYMPTOM: Questions about symptoms, conditions, diseases, diagnosis, or treatment guidelines (no specific drug mentioned).
- GENERAL: Greetings, thanks, or unclear queries.

Extract:
- intent: One of INFO, SUBSTITUTE, INTERACTION, SYMPTOM, GENERAL
- drug_names: Specific drug brand names or generics. Resolve "it"/"the drug" from HISTORY.
- entities: Symptoms, conditions, or body parts mentioned.

Return JSON only."""
        
        response = await asyncio.to_thread(
            lambda: model.generate_content(
                prompt,
                generation_config=genai.types.GenerationConfig(
                    response_mime_type="application/json",
                    temperature=0.0
                )
            )
        )
        
        text = response.text.strip()
        # Clean potential markdown code blocks
        if text.startswith("```json"):
            text = text[7:-3]
        
        return IntentPlan.model_validate_json(text)
        
    except Exception as e:
        logger.error("Intent planning failed: %s", e)
        # Fallback to general intent
        return IntentPlan(intent="GENERAL", drug_names=[])


async def generate_response(
    message: str,
    patient_context: Optional[PatientContext] = None,
    history: Optional[List[Message]] = None,
    drug_info: Optional[DrugInfo] = None,
    rag_context: Optional[str] = None,
    images: Optional[List[str]] = None,
    language: str = "auto",
    system_prompt_prefix: str = ""
) -> dict:
    """Generate a response using Gemini with RAG context."""

    if history is None:
        history = []

    # Language detection (if auto) and instruction
    detected_lang = language if language != "auto" else detect_language(message)
    lang_instruction = get_language_instruction(detected_lang)
    logger.info("Language: requested=%s, detected=%s", language, detected_lang)

    try:
        model = _get_model()
        
        # Format history for Gemini
        formatted_history = []
        for msg in history[-MAX_HISTORY_MESSAGES:]:
            role = "user" if msg.role == "user" else "model"
            formatted_history.append({
                "role": role,
                "parts": [msg.content]
            })
        
        # Build context
        context_parts = []
        
        # 1. Add RAG context (retrieved knowledge)
        if rag_context:
            context_parts.append(f"\n\n[Knowledge Base Context]\n{rag_context}")
        
        # 2. Add patient context
        patient_str = format_patient_context(patient_context)
        if patient_str:
            context_parts.append(patient_str)
        
        # 3. Add drug info from database with explicit instruction to supplement
        drug_name_for_citation = None
        if drug_info:
            drug_name_for_citation = drug_info.name
            drug_context = f"\n\n[Database Info for {drug_info.name}]"
            
            # Track what info is available vs missing
            has_indication = False
            has_side_effects = False
            
            if drug_info.generic_name:
                drug_context += f"\nGeneric: {drug_info.generic_name}"
            if drug_info.indications and any(drug_info.indications):
                drug_context += f"\nIndications: {'; '.join(drug_info.indications[:3])}"
                has_indication = True
            if drug_info.dosage:
                drug_context += f"\nDosage: {'; '.join(drug_info.dosage[:2])}"
            if drug_info.warnings:
                drug_context += f"\nWarnings: {'; '.join(drug_info.warnings[:3])}"
            if drug_info.contraindications:
                drug_context += f"\nContraindications: {'; '.join(drug_info.contraindications[:3])}"
            if drug_info.side_effects and any(drug_info.side_effects):
                drug_context += f"\nSide Effects: {'; '.join(drug_info.side_effects[:5])}"
                has_side_effects = True
            if drug_info.interactions:
                drug_context += f"\nInteractions: {'; '.join(drug_info.interactions[:3])}"
            if drug_info.price_raw:
                drug_context += f"\nPrice: {drug_info.price_raw}"
            if drug_info.manufacturer:
                drug_context += f"\nManufacturer: {drug_info.manufacturer}"
            
            # Add explicit instruction when key info is missing
            if not has_indication or not has_side_effects:
                drug_context += "\n\n[INSTRUCTION: Database has limited info. USE YOUR MEDICAL KNOWLEDGE to provide complete information about indications, uses, side effects, and mechanism of action.]"
            
            context_parts.append(drug_context)

        # Start chat
        chat = model.start_chat(history=formatted_history)

        # Build user message with context
        # Language instruction comes FIRST (LLMs pay more attention to start)
        user_message_text = ""
        if lang_instruction:
            user_message_text = lang_instruction + "\n"

        if context_parts:
            user_message_text += "".join(context_parts) + "\n\n[Question] " + message
        else:
            user_message_text += message
        
        # Prepare content parts (Text + Images)
        content_parts = [_compose_system_prompt(system_prompt_prefix) + "\n\n" + user_message_text]
        
        if images:
            import base64
            for img_str in images:
                # Handle data URL format (e.g., "data:image/jpeg;base64,.....")
                if "base64," in img_str:
                    img_str = img_str.split("base64,")[1]
                
                try:
                    image_data = base64.b64decode(img_str)
                    content_parts.append({
                        "mime_type": "image/jpeg", # Defaulting to jpeg, Gemini auto-detects usually or we can parse header
                        "data": image_data
                    })
                except Exception as e:
                    logger.error(f"Failed to decode image: {e}")

        # Send with system prompt (as text part of the first message)
        response = await asyncio.wait_for(
            asyncio.to_thread(
                lambda: chat.send_message(content_parts)
            ),
            timeout=30.0
        )
        
        response_text = _enforce_user_format(message, (response.text or "").strip())
        
        if not response_text:
            response_text = "I apologize, but I couldn't generate a response. Please try rephrasing your question."
        
        # Extract citations and generate suggestions
        citations = extract_citations(response_text, drug_name_for_citation)
        suggestions = generate_suggestions(message, response_text)
        
        return {
            "response": response_text,
            "citations": citations,
            "suggestions": suggestions
        }
    
    except asyncio.TimeoutError:
        logger.warning("Gemini API timeout, attempting Groq fallback")
        # Only use Groq for English - it has poor multi-language support
        if not is_language_supported_by_groq(detected_lang):
            logger.warning("Skipping Groq fallback for non-English language: %s", detected_lang)
            raise Exception("Request timed out. Please try again.") from None
        try:
            return await _generate_response_with_groq(
                message=message,
                patient_context=patient_context,
                history=history,
                drug_info=drug_info,
                rag_context=rag_context,
                system_prompt_prefix=system_prompt_prefix
            )
        except Exception as groq_error:
            logger.error("Groq fallback also failed: %s", groq_error)
            raise Exception("Request timed out. Please try again.") from None
    except Exception as e:
        logger.warning("Gemini API error: %s, attempting Groq fallback", e)
        # Only use Groq for English - it has poor multi-language support
        if not is_language_supported_by_groq(detected_lang):
            logger.warning("Skipping Groq fallback for non-English language: %s", detected_lang)
            raise Exception("Failed to generate response") from e
        try:
            return await _generate_response_with_groq(
                message=message,
                patient_context=patient_context,
                history=history,
                drug_info=drug_info,
                rag_context=rag_context,
                system_prompt_prefix=system_prompt_prefix
            )
        except Exception as groq_error:
            logger.error(f"Groq fallback also failed: {groq_error}", exc_info=True)
            raise Exception("Failed to generate response") from e


async def transcribe_audio(audio_bytes: bytes, mime_type: str = "audio/webm") -> str:
    """Transcribe audio using Gemini."""
    try:
        model = _get_model()
        
        prompt = "Listen to this audio and provide a verbatim transcription of what is said. Return ONLY the text, no conversational filler or intro."
        
        content_parts = [
            prompt,
            {
                "mime_type": mime_type,
                "data": audio_bytes
            }
        ]
        
        response = await asyncio.to_thread(
            lambda: model.generate_content(content_parts)
        )
        
        return response.text.strip()
    except Exception as e:
        logger.error("Transcription failed: %s", e)
        raise Exception("Transcription failed") from e
async def analyze_patient_text(text: str) -> PatientContext:
    """
    Extract structured patient context from unstructured clinical text.
    """
    try:
        model = _get_model()
        
        prompt = f"""You are a medical data extraction specialist.
Analyze the following unstructured clinical text/notes and extract structured patient information.

CLINICAL TEXT:
"{text}"

INSTRUCTIONS:
1. Extract the following fields:
   - Age (integer, 0 if unknown)
   - Sex (male, female, other)
   - Weight (float in kg, null/None if unknown)
   - Pre-existing Diseases (list of strings, e.g. "Diabetes", "Hypertension")
   - Current Medications (list of strings, e.g. "Metformin", "Amlodipine")

2. Return JSON ONLY. Format:
{{
  "age": int,
  "sex": "male"|"female"|"other",
  "weight": float|null,
  "pre_existing_diseases": ["str"...],
  "current_meds": ["str"...]
}}

3. If information is missing, use empty lists or 0/null.
4. Normalize drug names and diseases to standard medical title case.
"""

        response = await asyncio.to_thread(
            lambda: model.generate_content(
                prompt,
                generation_config=genai.types.GenerationConfig(
                    response_mime_type="application/json",
                    temperature=0.0
                )
            )
        )
        
        json_text = response.text.strip()
        # Clean markdown if present
        if json_text.startswith("```json"):
            json_text = json_text[7:-3]
            
        data = json.loads(json_text)
        
        return PatientContext(
            age=data.get("age", 0),
            sex=data.get("sex", "male"),
            weight=data.get("weight"),
            pre_existing_diseases=data.get("pre_existing_diseases", []),
            current_meds=data.get("current_meds", [])
        )

    except Exception as e:
        logger.error("Patient text analysis failed: %s", e)
        # Return empty context on failure
        return PatientContext(age=0, sex="male", pre_existing_diseases=[], current_meds=[])
