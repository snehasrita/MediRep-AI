"""
Drug Interaction Service - LLM-powered interaction checking.

NO HARDCODED DATA - Uses Gemini LLM for all drug interaction analysis.
"""
import asyncio
import json
import logging
import re
import threading
from typing import List, Optional, Dict, Any

import google.generativeai as genai
import httpx

from config import GEMINI_API_KEY, GEMINI_MODEL, API_TIMEOUT, GROQ_API_KEY, GROQ_MODEL
from models import DrugInteraction, PatientContext

logger = logging.getLogger(__name__)

# Lazy initialization with thread-safe lock
_interaction_model = None
_configured = False
_interaction_init_lock = threading.Lock()

# Valid severity values
VALID_SEVERITIES = {"major", "moderate", "minor"}


def _get_interaction_model():
    """Lazy initialization of Gemini model for interactions (thread-safe)."""
    global _interaction_model, _configured
    
    if not GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY is not configured")
    
    if _interaction_model is not None:
        return _interaction_model
    
    with _interaction_init_lock:
        if _interaction_model is not None:
            return _interaction_model
        
        if not _configured:
            genai.configure(api_key=GEMINI_API_KEY)
            _configured = True
        
        _interaction_model = genai.GenerativeModel(GEMINI_MODEL)
    
    return _interaction_model


INTERACTION_PROMPT = """You are a clinical pharmacology expert. Analyze drug-drug and drug-patient interactions.

Drugs to analyze: {drugs}
{context_str}

For each CLINICALLY SIGNIFICANT interaction (Drug-Drug OR Drug-Condition OR Drug-Allergy):
- drug1: drug name (lowercase)
- drug2: drug name (lowercase) OR condition/allergy name
- severity: "minor", "moderate", or "major" (use major for contraindications)
- description: mechanism and clinical significance
- recommendation: actionable clinical guidance

SEVERITY CRITERIA:
- major: Life-threatening, contraindicated, or requires intervention
- moderate: May require monitoring or dose adjustment  
- minor: Minimal clinical significance

Return ONLY a valid JSON object with an "interactions" key containing the list.
Empty list if no significant interactions.

Example:
{{
  "interactions": [
    {{"drug1": "warfarin", "drug2": "aspirin", "severity": "major", "description": "Increased bleeding risk", "recommendation": "Avoid combination"}},
    {{"drug1": "ibuprofen", "drug2": "peptic ulcer", "severity": "major", "description": "NSAIDs exacerbate ulcers", "recommendation": "Avoid usage"}}
  ]
}}"""


def sanitize_drug_name(name: str) -> str:
    """Sanitize drug name to prevent prompt injection."""
    cleaned = re.sub(r'[\x00-\x1f\x7f-\x9f]', '', name)
    cleaned = cleaned.strip()
    cleaned = re.sub(r'[^a-zA-Z0-9\s\-/]', '', cleaned)
    return cleaned[:50]


def _parse_interaction_item(item: Dict[str, Any]) -> Optional[DrugInteraction]:
    """Parse a dict into DrugInteraction, validating drug names and severity."""
    if not isinstance(item, dict):
        return None
    
    drug1 = str(item.get("drug1", "")).strip().lower()
    drug2 = str(item.get("drug2", "")).strip().lower()
    
    if not drug1 or not drug2:
        return None
    
    severity = str(item.get("severity", "moderate")).lower().strip()
    if severity not in VALID_SEVERITIES:
        logger.warning("Invalid severity '%s', defaulting to 'moderate'", severity)
        severity = "moderate"
    
    return DrugInteraction(
        drug1=drug1,
        drug2=drug2,
        severity=severity,
        description=str(item.get("description", "")),
        recommendation=str(item.get("recommendation", ""))
    )


def extract_balanced_json_array(text: str) -> Optional[str]:
    """Extract balanced JSON array from text, handling strings correctly."""
    start = text.find('[')
    if start == -1:
        return None
    
    depth = 0
    in_string = False
    escape_next = False
    
    for i, char in enumerate(text[start:], start):
        if escape_next:
            escape_next = False
            continue
        
        if char == '\\' and in_string:
            escape_next = True
            continue
        
        if char == '"' and not escape_next:
            in_string = not in_string
            continue
        
        if not in_string:
            if char == '[':
                depth += 1
            elif char == ']':
                depth -= 1
                if depth == 0:
                    return text[start:i+1]
    
    return None


def _extend_interactions_from_results(
    results: List[Dict[str, Any]],
    interactions: List[DrugInteraction]
) -> None:
    """Parse results list and append valid DrugInteraction objects."""
    for item in results:
        parsed = _parse_interaction_item(item)
        if parsed:
            interactions.append(parsed)


async def _check_interactions_groq(drugs: List[str], context_str: str) -> List[DrugInteraction]:
    """Fallback interaction check using Groq API."""
    if not GROQ_API_KEY:
        logger.warning("GROQ_API_KEY not set")
        return []

    sanitized_drugs = [sanitize_drug_name(d) for d in drugs if d]
    prompt = INTERACTION_PROMPT.format(drugs=", ".join(sanitized_drugs), context_str=context_str)
    
    try:
        # Use a more generous timeout for Groq as 70b models can be slow
        async with httpx.AsyncClient(timeout=45.0) as client:
            response = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {GROQ_API_KEY}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": GROQ_MODEL or "llama3-70b-8192",
                    "messages": [
                        {"role": "system", "content": "You are a clinical pharmacology expert. Output ONLY valid JSON."},
                        {"role": "user", "content": prompt}
                    ],
                    "temperature": 0.0,
                    "response_format": {"type": "json_object"}
                }
            )
            
            if response.status_code != 200:
                logger.error("Groq error: %s - %s", response.status_code, response.text)
                return []
                
            data = response.json()
            if not data.get("choices"):
                return []
                
            content = data["choices"][0]["message"]["content"]
            
            interactions: List[DrugInteraction] = []
            try:
                # Handle potentially wrapped JSON (some models wrap it in {"interactions": [...]})
                results = json.loads(content)
                if isinstance(results, dict):
                    # Try to find a list value
                    if "interactions" in results and isinstance(results["interactions"], list):
                        results = results["interactions"]
                    else:
                        # Fallback: look for any list value
                        for v in results.values():
                            if isinstance(v, list):
                                results = v
                                break
                
                if isinstance(results, list):
                    _extend_interactions_from_results(results, interactions)
            except json.JSONDecodeError:
                json_str = extract_balanced_json_array(content)
                if json_str:
                    results = json.loads(json_str)
                    _extend_interactions_from_results(results, interactions)
            
            return interactions
            
    except Exception as e:
        logger.error("Groq request failed: %s", e)
        return []


async def check_interactions(drugs: List[str], patient_context: Optional[PatientContext] = None) -> List[DrugInteraction]:
    """
    Check interactions using LLM, including patient context (pre-existing diseases).
    
    NO HARDCODED DATA - Uses Gemini for all interaction analysis.
    
    ⚠️ DISCLAIMER: This is clinical decision support only.
    Always verify with official sources and use clinical judgment.
    """
    context_present = bool(patient_context and (patient_context.pre_existing_diseases or patient_context.current_meds))
    
    if len(drugs) < 1 and not context_present:
        return []
    
    if len(drugs) < 2 and not context_present:
        return []
    
    # Sanitize inputs
    sanitized_drugs = [sanitize_drug_name(d) for d in drugs if d]
    
    # Build context string
    context_str = ""
    if patient_context:
        parts = []
        if patient_context.pre_existing_diseases:
            parts.append(f"Pre-existing Diseases: {', '.join(patient_context.pre_existing_diseases)}")
        if patient_context.current_meds:
            parts.append(f"Current Medications: {', '.join(patient_context.current_meds)}")
        if patient_context.age is not None:
            parts.append(f"Age: {patient_context.age}")
        
        if parts:
            context_str = "Patient Context:\n" + "\n".join(parts)
            
    interactions: List[DrugInteraction] = []
    
    try:
        model = _get_interaction_model()
        prompt = INTERACTION_PROMPT.format(drugs=", ".join(sanitized_drugs), context_str=context_str)
        
        response = await asyncio.wait_for(
            asyncio.to_thread(model.generate_content, prompt),
            timeout=30.0  # Increased timeout for complex interactions
        )
        
        try:
            response_text = (response.text or "").strip()
        except Exception as e:
            logger.warning("Failed to read Gemini response.text: %s", e)
            response_text = ""
        
        if not response_text:
            return interactions
        
        # Parse AI response
        try:
            results = json.loads(response_text)
            if isinstance(results, list):
                _extend_interactions_from_results(results, interactions)
            elif isinstance(results, dict) and "interactions" in results:
                _extend_interactions_from_results(results["interactions"], interactions)
                
        except json.JSONDecodeError:
            json_str = extract_balanced_json_array(response_text)
            if json_str:
                try:
                    results = json.loads(json_str)
                    _extend_interactions_from_results(results, interactions)
                except (json.JSONDecodeError, TypeError):
                    logger.warning("Failed to parse interaction JSON")
        
        return interactions
    
    except asyncio.TimeoutError:
        logger.warning("Gemini interaction check timed out. Attempting Groq fallback.")
        return await _check_interactions_groq(drugs, context_str)
    except Exception as e:
        logger.warning("Gemini interaction check failed: %s. Attempting Groq fallback.", e)
        return await _check_interactions_groq(drugs, context_str)


# Singleton wrapper for compatibility
class InteractionService:
    """Wrapper to provide object-oriented access to interaction checking."""
    async def check(self, drugs: List[str], patient_context: Optional[PatientContext] = None) -> List[DrugInteraction]:
        return await check_interactions(drugs, patient_context)

interaction_service = InteractionService()
