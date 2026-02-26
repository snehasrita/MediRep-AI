from fastapi import APIRouter, HTTPException, Depends, Request
from typing import Optional, List
import logging
import asyncio
import re
from datetime import datetime, timezone
from urllib.parse import urlparse

from slowapi import Limiter
from limiter import get_client_ip

from models import ChatRequest, ChatResponse, Message, Track2Data, RepModeContext
from services.gemini_service import generate_response, plan_intent
from services.drug_service import get_drug_info, find_cheaper_substitutes
from services.rag_service import rag_service
from services.interaction_service import interaction_service
from services.enhanced_context_service import (
    build_enhanced_context,
    detect_enhanced_intents,
    get_pharma_rep_system_prompt,
    handle_pharma_rep_command,
)
from services.pharma_rep_service import pharma_rep_service
from services.supabase_service import SupabaseService
from services.context_service import (
    load_session_context,
    compress_and_update_context,
    get_or_create_session,
    save_message_to_session,
)
from services.web_search_service import search_medical, search_web, format_web_results_for_llm, WebSearchResult
from services.ocr_service import extract_prescription_text
from middleware.auth import get_current_user, get_optional_user

logger = logging.getLogger(__name__)
router = APIRouter()

# Local limiter for chat endpoint (separate from global app limiter)
limiter = Limiter(key_func=get_client_ip)

VOICE_MODE_PREFIX = """[VOICE MODE]
Response will be read aloud via TTS. Rules:
- Max ~100 words unless user asks for detail
- Natural conversational sentences, no lists or bullets
- NEVER reference UI: no "click", "enable Search mode", "toggle", "share"
- No markdown, no URLs, no citations in text
- If drug name seems misspelled/misheard, suggest closest match
- End with a short spoken follow-up question
"""


async def _save_prescription(
    user_id: str,
    session_id: str,
    image_data: str,
    ocr_text: str,
    auth_token: str
) -> None:
    """Save prescription image and OCR result to database (background task)."""
    try:
        # Get authenticated Supabase client for RLS
        client = SupabaseService.get_auth_client(auth_token)

        # Determine mime type from base64 header if present
        mime_type = "image/jpeg"
        if image_data.startswith("data:"):
            mime_type = image_data.split(";")[0].split(":")[1]

        # Clean base64 data
        clean_image = image_data
        if "base64," in image_data:
            clean_image = image_data.split("base64,")[1]

        # Insert into prescriptions table
        result = await asyncio.to_thread(
            lambda: client.table("prescriptions").insert({
                "user_id": user_id,
                "session_id": session_id,
                "image_data": clean_image[:50000],  # Limit size (first 50k chars)
                "image_mime_type": mime_type,
                "raw_ocr_text": ocr_text[:5000],  # Limit OCR text
                "processing_status": "completed",
                "ocr_model": "gemini-vision",
                "ocr_confidence": 0.85,
                "processed_at": datetime.now(timezone.utc).isoformat()
            }).execute()
        )

        if result.data:
            logger.info("Prescription saved: %s", result.data[0].get("id"))
        else:
            logger.warning("Prescription save returned no data")

    except Exception as e:
        logger.error("Failed to save prescription: %s", e)


def _detect_substitute_intent(message: str) -> bool:
    """Detect if user is asking for alternatives/substitutes using keywords."""
    keywords = ['alternative', 'substitute', 'cheaper', 'generic', 'similar',
                'instead of', 'replace', 'other option', 'less expensive']
    msg_lower = message.lower()
    return any(kw in msg_lower for kw in keywords)


def _detect_rephrase_intent(message: str) -> bool:
    """Detect follow-up phrasing requests that should stay anchored to prior context."""
    keywords = [
        "rephrase", "rewrite", "in one line", "one-line", "in short",
        "briefly", "summarize", "simplify", "patient counseling",
        "now give that", "say that in", "explain that in"
    ]
    msg_lower = message.lower()
    return any(kw in msg_lower for kw in keywords)


def _is_pronoun_followup(message: str) -> bool:
    """Detect ambiguous follow-ups that refer to previous turns (e.g., 'it', 'that medicine')."""
    msg = (message or "").lower().strip()
    if not msg:
        return False
    patterns = [
        r"\bit\b",
        r"\bthat\b",
        r"\bthis\b",
        r"\bthat medicine\b",
        r"\bthis medicine\b",
        r"\bthat drug\b",
        r"\bthis drug\b",
        r"\bthat one\b",
        r"\bthis one\b",
    ]
    return any(re.search(p, msg) for p in patterns)


def _wants_sources(message: str) -> bool:
    """Detect explicit requests for links/citations/sources."""
    msg = (message or "").lower()
    keywords = [
        "source", "sources", "citation", "citations",
        "reference", "references", "link", "links",
        "evidence", "pubmed", "guideline", "guidelines",
    ]
    return any(kw in msg for kw in keywords)


def _is_freshness_sensitive_query(message: str) -> bool:
    """
    Detect time-sensitive questions that require live-source verification.
    Examples: latest/current recommendations, this year updates, today's availability.
    """
    msg = (message or "").lower().strip()
    if not msg:
        return False

    # Avoid false positives for routine context statements.
    if any(x in msg for x in ("current medication", "current medications", "current meds")):
        return False

    strong_markers = (
        "latest", "most recent", "today", "this year", "as of",
        "updated", "update", "new recommendation", "current recommendation",
        "current guidelines", "guideline update", "recommendation update",
        "availability now", "current availability", "price trend", "recently approved",
    )
    if any(marker in msg for marker in strong_markers):
        return True

    # Year-specific asks are often update-sensitive.
    if re.search(r"\b20\d{2}\b", msg):
        return any(
            k in msg for k in (
                "guideline", "recommendation", "update", "price",
                "availability", "trend", "approved", "launch", "policy"
            )
        )
    return False


def _build_freshness_web_query(message: str) -> str:
    """Build a focused web query for time-sensitive asks."""
    msg = (message or "").strip()
    msg_lower = msg.lower()

    if "rsv" in msg_lower:
        return (
            "RSV prevention latest recommendations infants maternal vaccination "
            "nirsevimab clesrovimab palivizumab CDC AAP WHO 2025 2026"
        )

    if any(k in msg_lower for k in ("guideline", "recommendation", "update", "advisory")):
        return f"{msg} official guideline update CDC WHO NIH"

    if any(k in msg_lower for k in ("price", "availability", "stock", "market", "launch")):
        return f"{msg} latest India availability price official"

    return f"{msg} latest official update"


def _filter_authoritative_freshness_results(
    results: List[WebSearchResult],
    message: str
) -> List[WebSearchResult]:
    """Keep only reliable domains for time-sensitive medical/market updates."""
    msg = (message or "").lower()
    trusted_domains = {
        # Clinical/public-health guidance
        "cdc.gov", "who.int", "nih.gov", "ncbi.nlm.nih.gov",
        "dailymed.nlm.nih.gov", "fda.gov", "aap.org",
        # India regulators/gov guidance
        "mohfw.gov.in", "icmr.gov.in", "nha.gov.in", "cdsco.gov.in", "gov.in",
    }
    # For market availability/price asks, also allow major pharmacy aggregators.
    if any(k in msg for k in ("price", "availability", "stock", "market", "retail", "cost")):
        trusted_domains.update({"1mg.com", "apollopharmacy.in", "netmeds.com", "pharmeasy.in"})

    filtered: List[WebSearchResult] = []
    for r in results:
        host = ""
        try:
            host = (urlparse(r.url).hostname or r.source or "").lower().replace("www.", "")
        except Exception:
            host = (r.source or "").lower().replace("www.", "")
        if any(host == d or host.endswith(f".{d}") for d in trusted_domains):
            filtered.append(r)
    return filtered


def _strip_inline_urls(text: str) -> str:
    """Remove raw URLs from assistant text when sources were not requested."""
    if not text:
        return ""
    cleaned = re.sub(r"https?://\S+", "", text)
    cleaned = re.sub(r"[ \t]{2,}", " ", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip()


def _strip_inline_reference_tokens(text: str) -> str:
    """Remove inline citation artifacts like 【3†source】 or [2†source]."""
    if not text:
        return ""
    cleaned = text
    # Common tool-citation token formats with dagger marker.
    cleaned = re.sub(r"[【\[]\s*\d+\s*†\s*source\s*[】\]]", "", cleaned, flags=re.IGNORECASE)
    # More generic bracketed dagger references, e.g. 【3†L120-L130】.
    cleaned = re.sub(r"[【\[]\s*\d+\s*†[^\]】]{0,80}[】\]]", "", cleaned)
    # Bracketed source tags: [Web Result 5], [Company Info], [Source 2], etc.
    cleaned = re.sub(
        r"\[\s*(?:web\s*result|company\s*info|source|sources|citation|citations|evidence|reference|references)\s*[:#-]?\s*\d*\s*\]",
        "",
        cleaned,
        flags=re.IGNORECASE,
    )
    cleaned = re.sub(r"[ \t]{2,}", " ", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip()


def _strip_inline_source_attributions(text: str) -> str:
    """Remove inline '(Source: ...)' / '(Sources: ...)' / '(Source 1,2)' tags from assistant text."""
    if not text:
        return ""
    ic = re.IGNORECASE
    cleaned = text
    # Parenthetical attributions: (Source: NIH), (Sources: CDC, WHO), (Source 1, 4)
    cleaned = re.sub(r"\(\s*sources?\s*:\s*[^)]+\)", "", cleaned, flags=ic)
    cleaned = re.sub(r"\(\s*sources?\s+\d+[^)]*\)", "", cleaned, flags=ic)
    # Standalone lines like: Source: NIH
    cleaned = re.sub(r"(?im)^\s*sources?\s*:\s*.+$", "", cleaned)
    # If a source-only line like "(Source: NIH)." was stripped, it can leave a dangling "." line.
    cleaned = re.sub(r"(?m)^\s*[.]\s*$\n?", "", cleaned)
    cleaned = re.sub(r"[ \t]{2,}", " ", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip()


def _is_substitute_fallback_response(text: str) -> bool:
    """Detect generic fallback responses that ignore available web results."""
    msg = (text or "").lower()
    markers = (
        "couldn't find verified cheaper substitutes",
        "could not find verified cheaper substitutes",
        "no verified cheaper substitutes",
        "enable search mode for live market options",
    )
    return any(m in msg for m in markers)


def _is_session_summary_request(message: str) -> bool:
    """Detect requests asking to summarize/recap the whole conversation."""
    msg = (message or "").lower()
    keywords = [
        "summarize everything",
        "summarise everything",
        "summarize all",
        "summarise all",
        "summary of our chat",
        "summary of this chat",
        "recap",
        "what we discussed",
        "everything we discussed",
        "so far",
    ]
    return any(kw in msg for kw in keywords)


def _is_pmjay_package_rate_request(message: str) -> bool:
    """Detect when the user is asking for PM-JAY package code/rate details."""
    msg = (message or "").lower()
    if not msg:
        return False

    has_pmjay = any(k in msg for k in ("pmjay", "pm-jay", "pmj", "pm jai", "ayushman"))
    has_rate = any(
        k in msg
        for k in (
            "package rate",
            "tariff",
            "package code",
            "package codes",
            "hbp rate",
            "rate for",
            "rate",
        )
    )
    return bool(has_pmjay and has_rate)


def _is_insurance_like_query(message: str) -> bool:
    """Detect insurance/reimbursement/admin asks using centralized logic."""
    from services.enhanced_context_service import detect_enhanced_intents
    intents = detect_enhanced_intents(message)
    return "INSURANCE" in intents


def _is_moa_like_query(message: str) -> bool:
    """Detect MOA/pharmacology-scoped questions."""
    from services.enhanced_context_service import detect_enhanced_intents
    intents = detect_enhanced_intents(message)
    if "MOA" in intents:
        return True
    msg = (message or "").lower()
    return any(
        marker in msg
        for marker in (
            "mechanism",
            "mechanism of action",
            "moa",
            "pharmacology",
            "pharmacodynamic",
            "pathway",
            "target",
            "receptor",
        )
    )


def _is_rep_like_query(message: str, rep_company: Optional[dict] = None) -> bool:
    """Detect pharma-rep/product-portfolio scoped questions."""
    from services.enhanced_context_service import detect_enhanced_intents
    intents = detect_enhanced_intents(message)
    if {"PHARMA_REP", "PRODUCTS", "SUPPORT"} & intents:
        return True

    msg = (message or "").lower()
    rep_markers = (
        "portfolio",
        "product",
        "products",
        "brand",
        "support program",
        "patient support",
        "patient assistance",
        "manufacturer",
        "manufacture",
        "manufactures",
        "what do you make",
        "company",
    )
    if any(marker in msg for marker in rep_markers):
        return True

    if rep_company:
        company_name = (rep_company.get("company_name") or "").lower().strip()
        company_key = (rep_company.get("company_key") or "").lower().strip()
        if (company_name and company_name in msg) or (company_key and company_key in msg):
            return True

    return False


def _render_pmjay_package_rate_answer(insurance_ctx, user_message: str) -> Optional[str]:
    """
    Render a DB-only answer for PM-JAY package rate questions.
    Do not hallucinate inclusions/exclusions beyond available fields.
    """
    if not insurance_ctx or not getattr(insurance_ctx, "matched_procedure", None):
        return None

    scheme = getattr(insurance_ctx, "scheme", None)
    if not scheme or (scheme.scheme_code or "").upper() != "PMJAY":
        return None

    matched = insurance_ctx.matched_procedure
    others = list(getattr(insurance_ctx, "other_matches", []) or [])
    all_matches = [matched] + others

    # De-dup by package code (DB can return near-duplicates).
    seen = set()
    deduped = []
    for m in all_matches:
        code = (getattr(m, "package_code", "") or "").strip()
        key = code or getattr(m, "procedure_name", "")
        if not key or key in seen:
            continue
        seen.add(key)
        deduped.append(m)

    lines = []
    lines.append(f"PM-JAY package rates (from database) for: {matched.procedure_name}")
    lines.append("")
    lines.append("Package code(s) and rate:")
    for m in deduped:
        implants = "includes implants" if getattr(m, "includes_implants", False) else "implants not included/unspecified"
        sc = (getattr(m, "special_conditions", "") or "").strip()
        sc_part = f"; notes: {sc}" if sc else ""
        lines.append(f"- {m.package_code}: {m.rate_display} ({implants}{sc_part})")

    lines.append("")
    lines.append("Inclusions/exclusions:")
    lines.append("- Available DB fields: `includes_implants` and `special_conditions` only.")
    lines.append("- Detailed clinical/service inclusions/exclusions: UNKNOWN (not stored in the current table).")

    # "3 closest matches" request: we do not have a similarity metric; use next 3 variants as nearest.
    if len(deduped) > 1:
        lines.append("")
        lines.append("Closest matches (next variants in DB results):")
        for m in deduped[1:4]:
            lines.append(f"- {m.procedure_name} ({m.package_code}): {m.rate_display}")

    return "\n".join(lines).strip()


def _extract_substitute_target(message: str) -> Optional[str]:
    """Best-effort extraction of medicine target for substitute queries."""
    text = (message or "").strip()
    if not text:
        return None

    patterns = [
        r"(?:substitute|substitutes|alternative|alternatives|cheaper option|cheaper options)\s+for\s+(.+)$",
        r"(?:instead of|replace)\s+(.+)$",
        r"(?:alternative|alternatives)\s+to\s+(.+)$",
        r"for\s+(.+)$",
    ]

    candidate = None
    for p in patterns:
        m = re.search(p, text, flags=re.IGNORECASE)
        if m:
            candidate = (m.group(1) or "").strip()
            break

    if not candidate:
        return None

    candidate = re.sub(r"[?.!,;:]+$", "", candidate).strip()
    candidate = re.sub(r"\b(please|pls|thanks|thank you)\b$", "", candidate, flags=re.IGNORECASE).strip()

    bad = {"generic", "drug", "medicine", "medication", "it", "that", "this"}
    if candidate.lower() in bad:
        return None
    return candidate or None


def _sanitize_drug_candidate(value: Optional[str]) -> Optional[str]:
    """Discard placeholder values that should not be treated as drug names."""
    if not value:
        return None
    v = value.strip()
    if not v:
        return None
    bad = {"generic", "drug", "medicine", "medication", "it", "that", "this"}
    return None if v.lower() in bad else v


def _extract_drug_from_moa_query(message: str) -> Optional[str]:
    """
    Deterministic drug name extraction for MOA-type questions.
    Used as a fallback when LLM planning fails (prevents wrong history backfill).
    """
    msg = (message or "").strip()
    if not msg:
        return None

    patterns = [
        r"\b(?:moa|mechanism of action|mechanism)\b.*?\b(?:of|for)\s+([A-Za-z0-9][A-Za-z0-9-]*(?:\s+[A-Za-z0-9][A-Za-z0-9-]*){0,3})",
        r"^([A-Za-z][A-Za-z0-9-]*(?:\s+[A-Za-z0-9][A-Za-z0-9-]*){0,3})\s*(?:[-–—:]+|\s+)\s*(?:moa|mechanism)\b",
    ]
    for p in patterns:
        m = re.search(p, msg, flags=re.IGNORECASE)
        if not m:
            continue
        candidate = (m.group(1) or "").strip()
        candidate = re.sub(r"[?.!,;:]+$", "", candidate).strip()
        candidate = _sanitize_drug_candidate(candidate)
        if candidate:
            return candidate

    first = msg.splitlines()[0].strip()
    m = re.match(r"^([A-Za-z][A-Za-z0-9-]*(?:\s+\d+)?)(?:\s+|[-–—:])", first)
    if m:
        candidate = _sanitize_drug_candidate(m.group(1))
        if candidate and candidate.lower() not in {"explain", "compare", "describe", "tell"}:
            return candidate

    return None


def _message_mentions_drug(message: str, drug_name: str) -> bool:
    msg = (message or "").lower()
    dn = (drug_name or "").lower().strip()
    return bool(msg and dn and dn in msg)


def _build_rep_auto_web_query(
    message: str,
    rep_company: Optional[dict],
    primary_drug: Optional[str],
    enhanced_intents: Optional[set] = None
) -> Optional[str]:
    """
    Build an automatic web search query for active rep-mode, when user asks
    company/product-related questions about a drug/medicine.
    """
    if not rep_company:
        return None

    msg = (message or "").strip()
    msg_lower = msg.lower()
    company_name = (rep_company.get("company_name") or rep_company.get("company_key") or "").strip()
    if not company_name:
        return None

    company_focus_markers = (
        "brand", "manufacturer", "made by",
        "product", "products", "portfolio", "available", "do you have",
        "represent", "your medicine", "your drug", "your products",
    )
    mentions_company_context = (
        company_name.lower() in msg_lower
        or any(k in msg_lower for k in company_focus_markers)
    )

    asks_products = bool(enhanced_intents and "PRODUCTS" in enhanced_intents)

    # Trigger only when clearly company/product scoped in rep mode.
    if not (mentions_company_context or asks_products):
        return None

    area_map = {
        "respiratory": ("respiratory", "asthma", "copd", "inhaler"),
        "cardiovascular": ("cardiovascular", "cardiac", "hypertension"),
        "diabetes": ("diabetes", "antidiabetic", "insulin"),
        "gastro": ("gastro", "acid", "ulcer"),
        "pain": ("pain", "analgesic", "nsaid"),
        "anti-infective": ("antibiotic", "antifungal", "antiviral"),
        "cns": ("cns", "neurology", "psychiatric"),
    }
    for area, keys in area_map.items():
        if any(k in msg_lower for k in keys):
            return f"{company_name} {area} products India"

    if primary_drug and primary_drug.lower() not in company_name.lower():
        return f"{company_name} {primary_drug} medicine India"
    return f"{company_name} {msg} India"


def _extract_company_trusted_domains(rep_company: Optional[dict]) -> List[str]:
    """Collect additional trusted domains from active rep company metadata."""
    if not rep_company:
        return []
    domains: List[str] = []
    website = (rep_company.get("website") or "").strip()
    if website:
        try:
            host = (urlparse(website).hostname or "").lower().replace("www.", "")
            if host:
                domains.append(host)
        except Exception:
            pass
    key = (rep_company.get("company_key") or "").strip().lower()
    if key:
        domains.extend([f"{key}.com", f"{key}.in"])
    # de-dup while preserving order
    seen = set()
    ordered = []
    for d in domains:
        if d and d not in seen:
            seen.add(d)
            ordered.append(d)
    return ordered


async def _load_extended_session_history(
    session_id: str,
    auth_token: str,
    limit_exchanges: int = 40
) -> List[Message]:
    """
    Load a larger chunk of session history from DB.
    Each exchange row maps to 1 user + 1 assistant message.
    """
    try:
        client = SupabaseService.get_auth_client(auth_token)
        if not client:
            return []

        result = await asyncio.to_thread(
            lambda: client.table("chat_history").select(
                "message, response, sequence_num"
            ).eq("session_id", session_id).order(
                "sequence_num", desc=True
            ).limit(limit_exchanges).execute()
        )

        rows = list(reversed(result.data or []))
        history = []
        for row in rows:
            history.append(Message(role="user", content=row.get("message", "")))
            history.append(Message(role="assistant", content=row.get("response", "")))
        return history
    except Exception as e:
        logger.warning("Extended session history load failed: %s", e)
        return []


@router.post("/chat", response_model=ChatResponse)
@limiter.limit("10/minute")
async def chat_endpoint(
    request: Request,  # Required for rate limiting
    chat_request: ChatRequest,
    user: object = Depends(get_current_user)  # user is AuthUser object
):
    """
    Digital Medical Representative AI - Powered by Gemini with RAG
    
    Provides healthcare professionals with instant, accurate drug and
    reimbursement information with citations from official sources.
    
    Session-based: Conversations persist across requests.
    Context compression: Efficient memory without sending all messages.
    """
    # Get user ID and Token
    user_id = user.id
    auth_token = user.token
    
    # Do not log message content (PHI/PII risk).
    logger.info(
        "Chat request received. web_search_mode=%s, voice_mode=%s",
        chat_request.web_search_mode,
        chat_request.voice_mode,
    )
    
    try:
        # ============================================================
        # SESSION & CONTEXT LOADING (new - everything else unchanged)
        # ============================================================

        # Get or create session
        try:
            session = await get_or_create_session(user_id, auth_token, chat_request.session_id)
            session_id = session["id"]
            current_summary = session.get("context_summary")
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception:
            raise HTTPException(status_code=503, detail="Session service unavailable")

        # Load compressed context + recent history
        context_data_loaded = await load_session_context(
            session_id=session_id,
            auth_token=auth_token,
            summary=session.get("context_summary"),
            message_count=session.get("message_count"),
        )

        # Build history for LLM: recent exchanges from DB
        # (replaces client-sent history with server-side history)
        history_for_llm = []
        intent_history_for_llm = []

        # Add context summary as system context if exists
        if context_data_loaded["summary"]:
            # Inject summary as first assistant message for context
            history_for_llm.append(Message(
                role="assistant",
                content=f"[Previous conversation context: {context_data_loaded['summary']}]"
            ))

        # Add recent full exchanges
        for h in context_data_loaded["recent_history"]:
            msg = Message(role=h["role"], content=h["content"])
            history_for_llm.append(msg)
            # Keep intent planner focused on recent concrete turns (exclude summary injection)
            intent_history_for_llm.append(msg)

        # For explicit session-recap requests, pull deeper history from DB so answer
        # is based on the whole conversation, not only the latest turns.
        if _is_session_summary_request(chat_request.message):
            extended_history = await _load_extended_session_history(
                session_id=session_id,
                auth_token=auth_token,
                limit_exchanges=40
            )
            if extended_history:
                summary_preface = []
                if context_data_loaded["summary"]:
                    summary_preface.append(Message(
                        role="assistant",
                        content=f"[Previous conversation context: {context_data_loaded['summary']}]"
                    ))
                history_for_llm = summary_preface + extended_history
                intent_history_for_llm = extended_history
                logger.info("Extended history loaded for summary request: %d messages", len(extended_history))

        # ============================================================
        # PRESCRIPTION OCR - Extract text from uploaded images
        # ============================================================
        ocr_context = ""

        if chat_request.images:
            logger.info("Processing %d image(s) for OCR", len(chat_request.images))

            for i, image_b64 in enumerate(chat_request.images[:3]):  # Limit to 3 images
                try:
                    ocr_result = await extract_prescription_text(image_b64)

                    if ocr_result.get("success") and ocr_result.get("text"):
                        extracted_text = ocr_result["text"]
                        logger.info("OCR extracted %d chars from image %d", len(extracted_text), i + 1)

                        # Add to context for Gemini (with instruction to not repeat)
                        ocr_context += f"\n\n[Prescription Context - Image {i + 1}]\n"
                        ocr_context += extracted_text[:2000]  # Limit text length
                        ocr_context += "\n[INSTRUCTION: Use this prescription data as context. Do NOT repeat or summarize the prescription details unless specifically asked. Answer the user's question directly using this context.]"

                        # Save prescription to database (background task)
                        asyncio.create_task(_save_prescription(
                            user_id=user_id,
                            session_id=session_id,
                            image_data=image_b64,
                            ocr_text=extracted_text,
                            auth_token=auth_token
                        ))
                    else:
                        # OCR failed or not available - Gemini will handle the image directly
                        logger.info("OCR skipped for image %d: %s", i + 1, ocr_result.get("error", "unknown"))

                except Exception as e:
                    logger.warning("OCR failed for image %d: %s", i + 1, e)
                    # Continue - Gemini can still process the image visually

        # ============================================================
        # EXISTING WORKFLOW
        # ============================================================

        # 0. Handle pharma rep mode commands (no LLM call)
        rep_command = await handle_pharma_rep_command(
            chat_request.message,
            user_id=user_id,
            auth_token=auth_token
        )
        if rep_command and rep_command.get("is_command"):
            response_text = rep_command.get("response", "")

            # Persist command to history (best-effort); skip compression for commands.
            asyncio.create_task(save_message_to_session(
                user_id=user_id,
                session_id=session_id,
                message=chat_request.message,
                response=response_text,
                auth_token=auth_token,
            ))

            # Construct Track2Data for immediate frontend state update
            track2_data = None
            rep_data = rep_command.get("data", {})
            
            # Case 1: Activation Success
            if rep_data and rep_data.get("success") and rep_data.get("company_key"):
                track2_data = Track2Data(
                    rep_mode=RepModeContext(
                        active=True,
                        company_key=rep_data.get("company_key"),
                        company_name=rep_data.get("company")
                    )
                )
            
            # Case 2: Deactivation / Clear
            elif "Deactivated" in response_text or "general mode" in response_text:
                 track2_data = Track2Data(rep_mode=RepModeContext(active=False))

            return ChatResponse(
                response=response_text,
                citations=[],
                suggestions=["List companies", "Set rep mode [company]", "Exit rep mode"],
                session_id=session_id,
                web_sources=[],
                track2=track2_data
            )

        # Load active rep-mode context once per request.
        # If frontend sends chat_mode as rep:<company>, sync server-side rep mode.
        rep_company = None
        requested_mode = (chat_request.chat_mode or "normal").strip()
        requested_mode_lower = requested_mode.lower()
        rep_mode_enabled = requested_mode_lower.startswith("rep")
        requested_rep_company = None
        if requested_mode_lower.startswith("rep:"):
            requested_rep_company = requested_mode.split(":", 1)[1].strip()

        if rep_mode_enabled:
            try:
                rep_company = await asyncio.to_thread(
                    pharma_rep_service.get_active_company_context,
                    user_id,
                    auth_token
                )
            except Exception as e:
                logger.warning("Failed to load active rep company context: %s", e)
                rep_company = None

            if requested_rep_company:
                active_name = (rep_company.get("company_name") or "").strip().lower() if rep_company else ""
                active_key = (rep_company.get("company_key") or "").strip().lower() if rep_company else ""
                requested_norm = requested_rep_company.strip().lower()
                if not rep_company or requested_norm not in {active_name, active_key}:
                    try:
                        result = await asyncio.to_thread(
                            pharma_rep_service.set_company_mode,
                            user_id,
                            auth_token,
                            requested_rep_company
                        )
                        if result.get("success"):
                            rep_company = await asyncio.to_thread(
                                pharma_rep_service.get_active_company_context,
                                user_id,
                                auth_token
                            )
                        else:
                            logger.warning("Failed to auto-sync rep mode from chat_mode: %s", result.get("message"))
                    except Exception as e:
                        logger.warning("Rep mode auto-sync failed for '%s': %s", requested_rep_company, e)

        # 1. Intent Planning & Entity Extraction (LLM Powered)
        plan = await plan_intent(chat_request.message, history=intent_history_for_llm)
        logger.info("Intent Plan: %s, Drugs: %s", plan.intent, plan.drug_names)
        
        enhanced_intents = detect_enhanced_intents(chat_request.message)
        logger.info(f"[DEBUG] Initial Enhanced Intents: {enhanced_intents}")
        
        regex_insurance_check = _is_insurance_like_query(chat_request.message)
        logger.info(f"[DEBUG] _is_insurance_like_query regex check: {regex_insurance_check}")
        
        is_insurance_query = ("INSURANCE" in enhanced_intents) or regex_insurance_check
        logger.info(f"[DEBUG] Final is_insurance_query: {is_insurance_query}")
        
        if is_insurance_query:
            enhanced_intents.add("INSURANCE")
        
        is_freshness_query = _is_freshness_sensitive_query(chat_request.message)
        is_moa_query = "MOA" in enhanced_intents
        is_moa_mode_query = is_moa_query or _is_moa_like_query(chat_request.message)
        is_rep_mode_query = bool({"PHARMA_REP", "PRODUCTS", "SUPPORT"} & enhanced_intents) or _is_rep_like_query(chat_request.message, rep_company)

        # ============================================================
        # STRICT MODE ENFORCEMENT
        # ============================================================
        mode = (chat_request.chat_mode or "normal").lower()
        
        if mode == "insurance":
            # Strict rejection of non-insurance queries
            if not is_insurance_query:
                response_text = (
                    "Insurance mode only handles PM-JAY, CGHS, ESI, reimbursement, and package-rate questions. "
                    "Please switch to Default Chat or another mode for this query."
                )
                if chat_request.voice_mode:
                    response_text = (
                        "You are in insurance mode. Ask about PM-JAY, CGHS, ESI, reimbursement, or package rates, "
                        "or switch mode for clinical questions."
                    )
                return ChatResponse(
                    response=response_text,
                    session_id=session_id
                )
        
        elif mode == "moa":
            # Strict rejection of any non-MOA query
            if not is_moa_mode_query:
                response_text = (
                    "Mechanism mode only handles mechanism of action, receptors, pathways, pharmacodynamics, "
                    "and pharmacokinetics. Please switch mode for insurance, pricing, or general chat."
                )
                if chat_request.voice_mode:
                    response_text = (
                        "You are in mechanism mode. Ask about mechanism of action, receptors, pathways, "
                        "or pharmacokinetics, or switch mode for other topics."
                    )
                return ChatResponse(
                    response=response_text,
                    session_id=session_id
                )
        
        elif mode.startswith("rep"):
            # Strict rep mode: only company/product/rep support queries are allowed.
            if not is_rep_mode_query:
                response_text = (
                    "Rep mode only handles company portfolio, brand positioning, product details, and support programs. "
                    "Please switch to Default, Insurance, or MOA mode for this query."
                )
                if chat_request.voice_mode:
                    response_text = (
                        "You are in rep mode. Ask company, product, brand, or support-program questions, "
                        "or switch mode for other topics."
                    )
                return ChatResponse(
                    response=response_text,
                    session_id=session_id
                )

        # Use strict mode to override intent if needed
        if mode == "insurance":
            # Force intent to optimize for insurance RAG
            enhanced_intents.add("INSURANCE")
        
        if mode == "moa":
            # Force MOA intent
            enhanced_intents.add("MOA")
            is_moa_query = True

        # ============================================================
        
        # Guardrail: insurance/admin package-rate questions should not be routed into

        # Guardrail: insurance/admin package-rate questions should not be routed into
        # substitute flow even if planner misclassifies intent from prior drug context.
        if is_insurance_query and plan.intent == "SUBSTITUTE":
            logger.info("Intent override: SUBSTITUTE -> GENERAL (insurance query detected)")
            plan.intent = "GENERAL"

        # Pronoun follow-up anchoring:
        # For messages like "side effects of it", resolve "it" to the most recent
        # explicit drug mentioned in prior USER turns, not long-range summary content.
        if _is_pronoun_followup(chat_request.message):
            recent_user_messages = [
                h["content"] for h in context_data_loaded["recent_history"] if h.get("role") == "user"
            ]
            resolved_drug = None

            for prev_user_msg in reversed(recent_user_messages[-3:]):
                if not prev_user_msg or _is_pronoun_followup(prev_user_msg):
                    continue
                try:
                    prev_plan = await plan_intent(prev_user_msg, history=[])
                    if prev_plan.drug_names:
                        resolved_drug = prev_plan.drug_names[0]
                        break
                except Exception:
                    continue

            if resolved_drug:
                if not plan.drug_names or plan.drug_names[0].lower() != resolved_drug.lower():
                    logger.info("Pronoun resolution override: %s -> %s", plan.drug_names, resolved_drug)
                plan.drug_names = [resolved_drug]
                if plan.intent == "GENERAL":
                    plan.intent = "INFO"

        # Keyword-based intent override (fallback when LLM intent fails)
        is_substitute_query = _detect_substitute_intent(chat_request.message)
        if is_substitute_query and plan.intent == "GENERAL":
            if is_insurance_query:
                logger.info("Skipping SUBSTITUTE keyword override for insurance-like query")
            else:
                plan.intent = "SUBSTITUTE"
                logger.info("Intent overridden to SUBSTITUTE based on keywords")

        context_data = {}
        msg_context = ""
        track2_data = None
        substitute_needs_live_search = False
        substitute_target_for_search = None
        rep_auto_web_query = None
        rep_extra_trusted_domains: List[str] = []

        # MOA queries must not be satisfied by history-based drug backfill.
        # If the user explicitly mentions a drug in the current message, prefer that.
        if is_moa_query:
            moa_drug = _extract_drug_from_moa_query(chat_request.message)
            if moa_drug and (not plan.drug_names or plan.drug_names[0].lower() != moa_drug.lower()):
                logger.info("MOA drug override from message: %s -> %s", plan.drug_names, moa_drug)
                plan.drug_names = [moa_drug]
                if plan.intent == "GENERAL":
                    plan.intent = "INFO"

        # Extract drug name from history if not in current message
        drug_from_history = None
        if (
            not plan.drug_names
            and history_for_llm
            and not _is_pronoun_followup(chat_request.message)
            and not is_insurance_query
            and "PRODUCTS" not in enhanced_intents
            and not is_moa_query
        ):
            # Look for drug names in recent history
            for hist_msg in reversed(history_for_llm[-4:]):
                if hist_msg.role == "assistant" and hist_msg.content:
                    # Simple extraction: look for capitalized words that might be drug names
                    potential = re.findall(r'\b([A-Z][a-z]+(?:\s+\d+)?)\b', hist_msg.content[:200])
                    stop_words = {'the', 'this', 'that', 'yes', 'would', 'important', 'source', 'fda'}
                    drugs = [p for p in potential if p.lower() not in stop_words and len(p) > 3]
                    if drugs:
                        drug_from_history = drugs[0]
                        plan.drug_names = [drug_from_history]
                        logger.info("Drug extracted from history: %s", drug_from_history)
                        break

        # 2. Execution based on Intent
        if plan.intent == "SUBSTITUTE" and not is_insurance_query:
            # Find cheaper alternatives
            explicit_target = _extract_substitute_target(chat_request.message)
            drug_name = (
                explicit_target
                or (_sanitize_drug_candidate(plan.drug_names[0]) if plan.drug_names else None)
                or _sanitize_drug_candidate(drug_from_history)
            )
            if drug_name:
                substitute_target_for_search = drug_name
                subs = await find_cheaper_substitutes(drug_name)
                if subs:
                    context_data['substitutes'] = subs
                    if chat_request.voice_mode:
                        top_names = ", ".join([s.name for s in subs[:3] if s.name])
                        response_text = (
                            f"I found verified cheaper substitutes for {drug_name} in the database: {top_names}. "
                            "Do you want a quick price comparison?"
                        )
                    else:
                        lines = [f"Cheaper substitutes for {drug_name} (database):", ""]
                        for s in subs[:5]:
                            price_info = s.price_raw or "price not listed"
                            mfg_info = f" | {s.manufacturer}" if s.manufacturer else ""
                            lines.append(f"- {s.name} | {price_info}{mfg_info}")
                        lines.append("")
                        lines.append("Only lower-priced matches are included based on available database pricing.")
                        response_text = "\n".join(lines).strip()

                    asyncio.create_task(save_message_to_session(
                        user_id=user_id,
                        session_id=session_id,
                        message=chat_request.message,
                        response=response_text,
                        auth_token=auth_token,
                    ))
                    return ChatResponse(
                        response=response_text,
                        citations=[],
                        suggestions=[] if chat_request.voice_mode else [
                            f"Compare top 2 substitutes for {drug_name}",
                            f"Show cheapest substitute for {drug_name}",
                            "Check dosage-equivalent options",
                        ],
                        session_id=session_id,
                        web_sources=[],
                        track2=None
                    )
                else:
                    if not chat_request.web_search_mode:
                        if chat_request.voice_mode:
                            response_text = (
                                f"I couldn't find verified cheaper substitutes for {drug_name} in my current database. "
                                "I can check live market options now if you want. Should I proceed?"
                            )
                        else:
                            response_text = (
                                f"I couldn't find verified cheaper substitutes for {drug_name} "
                                "in the current database. If you want, enable Search mode for live market options "
                                "or share specific alternatives and I can compare them."
                            )
                        asyncio.create_task(save_message_to_session(
                            user_id=user_id,
                            session_id=session_id,
                            message=chat_request.message,
                            response=response_text,
                            auth_token=auth_token,
                        ))
                        return ChatResponse(
                            response=response_text,
                            citations=[],
                            suggestions=[] if chat_request.voice_mode else [
                                f"Compare {drug_name} with a specific alternative",
                                "Enable Search mode for live options",
                                "Show generic name and dosing equivalent"
                            ],
                            session_id=session_id,
                            web_sources=[],
                            track2=None
                        )
                    # Search mode ON: continue pipeline so model can answer from live sources.
                    substitute_needs_live_search = True
                    msg_context += (
                        f"\n\n[Local database has no substitute records for {drug_name}]\n"
                        "[INSTRUCTION: Search mode is enabled. Use upcoming web search results to provide "
                        "a concise in-chat answer with candidate alternatives available in India. "
                        "Do not fabricate exact prices/manufacturers, and do not output raw URLs in the main answer.]"
                    )
            else:
                if chat_request.voice_mode:
                    response_text = (
                        "Please tell me the exact medicine name and strength, for example Augmentin 625 mg, "
                        "and I will check cheaper substitutes. Which medicine should I check?"
                    )
                else:
                    response_text = (
                        "Please specify the exact medicine and strength (for example: Augmentin 625 mg) "
                        "so I can check verified cheaper substitutes."
                    )
                asyncio.create_task(save_message_to_session(
                    user_id=user_id,
                    session_id=session_id,
                    message=chat_request.message,
                    response=response_text,
                    auth_token=auth_token,
                ))
                return ChatResponse(
                    response=response_text,
                    citations=[],
                    suggestions=[] if chat_request.voice_mode else [
                        "Give cheaper substitutes for Augmentin 625",
                        "Compare two specific alternatives",
                        "Show generic equivalent"
                    ],
                    session_id=session_id,
                    web_sources=[],
                    track2=None
                )

        elif plan.intent == "INFO" or plan.intent == "GENERAL":
            # Fetch drug info if any drug names present
            if plan.drug_names:
                for drug in plan.drug_names[:1]:
                    # Fast path for chat: DB-only (avoid extra LLM/openFDA calls here).
                    info = await get_drug_info(drug, enrich=False, allow_openfda=False)
                    if info:
                        context_data['drug_info'] = info
                        msg_context += f"\n\n[Database Info for {info.name}]\n"
                        if info.price_raw:
                            msg_context += f"Price: {info.price_raw}\n"
                        if info.manufacturer:
                            msg_context += f"Manufacturer: {info.manufacturer}\n"
                        if info.substitutes:
                            msg_context += f"Substitutes: {', '.join(info.substitutes[:3])}\n"

        elif plan.intent == "INTERACTION":
            # Check drug interactions if multiple drugs mentioned
            if len(plan.drug_names) >= 2:
                interactions = await interaction_service.check(plan.drug_names)
                if interactions:
                    msg_context += "\n\n[Drug Interactions Found]\n"
                    for inter in interactions[:3]:
                        msg_context += f"- {inter.drug1} + {inter.drug2}: {inter.severity} - {inter.description}\n"

        # 2b. Enhanced Track2 context (MOA, comparison, insurance, rep-mode)
        if enhanced_intents or rep_company:
            try:
                enhanced_context, track2_data = await build_enhanced_context(
                    message=chat_request.message,
                    drug_name=plan.drug_names[0] if plan.drug_names else None,
                    intents=enhanced_intents,
                    auth_token=auth_token,
                    rep_company=rep_company
                )
                if enhanced_context:
                    msg_context += "\n\n" + enhanced_context
                    logger.info("Enhanced context added: %d chars (intents=%s, track2=%s)", 
                               len(enhanced_context), enhanced_intents, 
                               "present" if track2_data else "none")
            except Exception as e:
                logger.warning("Enhanced context build failed: %s", e)
                track2_data = None

        # Safety guard: do not attach irrelevant MoA evidence to this message.
        if track2_data and track2_data.moa and track2_data.moa.drug_name:
            if (not _is_pronoun_followup(chat_request.message)) and (not _message_mentions_drug(chat_request.message, track2_data.moa.drug_name)):
                logger.warning(
                    "Dropping mismatched Track2 MoA: moa_drug=%s message=%s",
                    track2_data.moa.drug_name, chat_request.message[:80]
                )
                track2_data.moa = None

        # DB-first insurance answers: for PM-JAY package rate requests, return directly from DB
        # to avoid LLM hallucinations and "not found" regressions when data exists.
        if is_insurance_query and track2_data and track2_data.insurance and _is_pmjay_package_rate_request(chat_request.message):
            direct_text = _render_pmjay_package_rate_answer(track2_data.insurance, chat_request.message)
            if direct_text:
                response_text = direct_text

                asyncio.create_task(save_message_to_session(
                    user_id=user_id,
                    session_id=session_id,
                    message=chat_request.message,
                    response=response_text,
                    auth_token=auth_token,
                    patient_context=chat_request.patient_context.model_dump() if chat_request.patient_context else None,
                    citations=None,
                ))

                asyncio.create_task(compress_and_update_context(
                    session_id=session_id,
                    user_message=chat_request.message,
                    assistant_response=response_text,
                    auth_token=auth_token,
                    current_summary=current_summary,
                ))

                return ChatResponse(
                    response=response_text,
                    citations=[],
                    suggestions=[],
                    session_id=session_id,
                    web_sources=[],
                    track2=track2_data,
                )

        # Auto-enable web search for company/product-scoped rep-mode questions.
        if rep_company:
            rep_extra_trusted_domains = _extract_company_trusted_domains(rep_company)
            rep_auto_web_query = _build_rep_auto_web_query(
                message=chat_request.message,
                rep_company=rep_company,
                primary_drug=plan.drug_names[0] if plan.drug_names else None,
                enhanced_intents=enhanced_intents,
            )
            if rep_auto_web_query and not chat_request.web_search_mode:
                msg_context += (
                    "\n\n[INSTRUCTION: Company-specific web results are supplemental. "
                    "Prioritize database/rep context first, then use web context for latest availability updates.]"
                )

        # 3. RAG Search using Qdrant + Turso (Hybrid: drug_embeddings + medical_qa)
        rag_content = None

        # Heuristic: Skip RAG for short/conversational/pronoun follow-up replies.
        # Pronoun follow-ups ("it", "that medicine") should stay anchored to recent
        # conversation context instead of pulling fresh retrieval context.
        is_conversational = (
            len(chat_request.message.strip()) < 5
            or _detect_rephrase_intent(chat_request.message)
            or _is_pronoun_followup(chat_request.message)
            or chat_request.message.lower().strip() in {
            'yes', 'yeah', 'yep', 'sure', 'ok', 'okay', 'no', 'nope', 'thanks', 'thank you'
            }
        )

        if not is_conversational:
            try:
                # Determine intent for hybrid weighting
                # Symptom keywords boost medical_qa results
                symptom_keywords = {'symptom', 'symptoms', 'feel', 'feeling', 'pain', 'ache',
                                   'diagnosis', 'diagnose', 'disease', 'condition', 'treatment'}
                query_lower = chat_request.message.lower()
                effective_intent = plan.intent

                if any(kw in query_lower for kw in symptom_keywords):
                    effective_intent = "SYMPTOM"

                # If we already have strong DB context for a drug/info query, skip extra RAG work.
                # (Keeps behavior the same but avoids wasted latency on common INFO requests.)
                has_db_context = bool(context_data.get("drug_info") or context_data.get("substitutes"))
                should_run_rag = effective_intent == "SYMPTOM" or not (
                    has_db_context and effective_intent in ("INFO", "SUBSTITUTE")
                )

                if should_run_rag:
                    rag_content = await rag_service.search_hybrid(
                        query=chat_request.message,
                        intent=effective_intent,
                        top_k=5
                    )
                    logger.info("Hybrid RAG context found: %s (intent: %s)", bool(rag_content), effective_intent)
                else:
                    logger.info("RAG skipped (DB context present, intent=%s)", effective_intent)

                # Fallback: If no hybrid matches, try direct text search in Turso
                if not rag_content and (plan.intent == "GENERAL" or not plan.drug_names):
                    desc_results = await rag_service.search_by_description(chat_request.message, limit=3)
                    if desc_results:
                        rag_content = desc_results

            except Exception as e:
                logger.warning("RAG search failed: %s", e)

        # ============================================================
        # WEB SEARCH (Explicit mode OR Fallback)
        # ============================================================
        web_results = []
        web_context = ""
        
        # Web search triggers:
        # 1) Explicit Search mode
        # 2) Track2 service fallback recommendation
        # 3) Rep-mode company/product scoped auto-query
        # 4) Time-sensitive "latest/current/update" questions
        needs_web_search = bool(
            chat_request.web_search_mode
            or (track2_data and track2_data.needs_web_search and track2_data.web_search_query)
            or rep_auto_web_query
            or is_freshness_query
        )
        
        if needs_web_search:
            logger.info(
                "WEB SEARCH TRIGGERED: explicit=%s, freshness=%s, rag_content=%s, drug_info=%s",
                chat_request.web_search_mode, is_freshness_query, bool(rag_content), bool(context_data.get('drug_info'))
            )
            try:
                if is_freshness_query:
                    web_query = _build_freshness_web_query(chat_request.message)
                    raw_results = await search_web(web_query, num_results=12)
                    web_results = _filter_authoritative_freshness_results(raw_results, chat_request.message)[:5]
                    if not web_results:
                        # Secondary attempt via existing medical search wrapper.
                        web_results = await search_medical(
                            web_query,
                            num_results=5,
                            extra_trusted_domains=rep_extra_trusted_domains if rep_auto_web_query else None
                        )
                else:
                    web_query = (
                        f"cheaper substitutes for {substitute_target_for_search} India"
                        if substitute_needs_live_search and substitute_target_for_search
                        else (
                            rep_auto_web_query
                            or (track2_data.web_search_query if track2_data else None)
                            or chat_request.message
                        )
                    )
                    web_results = await search_medical(
                        web_query,
                        num_results=5,
                        extra_trusted_domains=rep_extra_trusted_domains if rep_auto_web_query else None
                    )
                    if not web_results and rep_auto_web_query:
                        # Rep-mode fallback: allow company-token-filtered raw web results
                        # when strict medical trusted filtering yields zero.
                        raw_results = await search_web(web_query, num_results=10)
                        company_token = (rep_company.get("company_key") or "").strip().lower() if rep_company else ""
                        domain_tokens = rep_extra_trusted_domains or []

                        def _is_company_relevant(r: WebSearchResult) -> bool:
                            host = ""
                            try:
                                host = (urlparse(r.url).hostname or r.source or "").lower().replace("www.", "")
                            except Exception:
                                host = (r.source or "").lower().replace("www.", "")
                            blob = f"{host} {r.title} {r.snippet}".lower()
                            if company_token and company_token in blob:
                                return True
                            return any(dt and (host == dt or host.endswith(f".{dt}")) for dt in domain_tokens)

                        web_results = [r for r in raw_results if _is_company_relevant(r)][:5]
                        if web_results:
                            logger.info("Rep fallback web results selected: %d", len(web_results))

                if web_results:
                    web_context = format_web_results_for_llm(web_results)
                    msg_context += "\n\n" + web_context
                    if is_freshness_query:
                        as_of_dt = datetime.now(timezone.utc)
                        as_of_label = f"{as_of_dt.strftime('%B')} {as_of_dt.day}, {as_of_dt.year}"
                        msg_context += (
                            f"\n\n[INSTRUCTION: This is a time-sensitive question. Use ONLY [Web Search Results] "
                            f"for latest/current claims and start with 'As of {as_of_label},'. "
                            "If a claim is not supported by those web results, explicitly say it is unavailable/unknown. "
                            "Do not assert country-specific recommendations unless those sources are present.]"
                        )
                    logger.info("Web search added %d results for: %s", len(web_results), web_query[:80])
                else:
                    logger.warning("Web search returned 0 results")
            except Exception as e:
                logger.warning("Web search failed: %s", e)
        else:
            logger.info("WEB SEARCH SKIPPED: explicit=%s, freshness=%s, rag_content=%s, drug_info=%s",
                       chat_request.web_search_mode, is_freshness_query, bool(rag_content), bool(context_data.get('drug_info')))

        # Fail closed for time-sensitive asks when live verification failed.
        if is_freshness_query and not web_results:
            as_of_dt = datetime.now(timezone.utc)
            as_of_label = f"{as_of_dt.strftime('%B')} {as_of_dt.day}, {as_of_dt.year}"
            if chat_request.voice_mode:
                response_text = (
                    f"As of {as_of_label}, I couldn't verify a current update from live authoritative sources. "
                    "I can try a live web check now if you want."
                )
            else:
                response_text = (
                    f"I couldn't verify a current update from live authoritative sources as of {as_of_label}. "
                    "Please retry in Search mode shortly."
                )
            asyncio.create_task(save_message_to_session(
                user_id=user_id,
                session_id=session_id,
                message=chat_request.message,
                response=response_text,
                auth_token=auth_token,
                citations=None,
            ))
            return ChatResponse(
                response=response_text,
                citations=[],
                suggestions=[] if chat_request.voice_mode else [
                    "Retry this query in Search mode",
                    "Ask for guidance by country (e.g., US or India)",
                    "Ask for sources to review directly"
                ],
                session_id=session_id,
                web_sources=[],
                track2=track2_data,
            )

        # 4. Generate Response
        # Combine all context: user message + OCR text + drug/RAG context
        full_message = chat_request.message
        if ocr_context:
            full_message += ocr_context
        full_message += msg_context

        prefix_parts = []
        rep_prefix = get_pharma_rep_system_prompt(rep_company)
        if rep_prefix:
            prefix_parts.append(rep_prefix)
        if chat_request.voice_mode:
            prefix_parts.append(VOICE_MODE_PREFIX)
        effective_system_prefix = "\n\n".join(prefix_parts)

        gemini_result = await generate_response(
            message=full_message,  # Inject structured data including OCR
            patient_context=chat_request.patient_context,
            history=history_for_llm,  # Use session history, not client history
            drug_info=context_data.get('drug_info'),
            rag_context=rag_content,
            images=chat_request.images,
            language=chat_request.language,  # Multi-language support
            system_prompt_prefix=effective_system_prefix,
        )

        response_text = gemini_result.get("response", "")
        citations = gemini_result.get("citations", [])
        suggestions = gemini_result.get("suggestions", [])
        if chat_request.voice_mode:
            suggestions = []

        # Guardrail: when live substitute results exist, avoid returning stale "no substitutes" fallback text.
        if substitute_needs_live_search and web_results and _is_substitute_fallback_response(response_text):
            unique_sources = []
            for result in web_results:
                src = (result.source or "").replace("www.", "").strip()
                if src and src not in unique_sources:
                    unique_sources.append(src)
                if len(unique_sources) >= 3:
                    break
            source_hint = f" on {', '.join(unique_sources)}" if unique_sources else ""
            target = substitute_target_for_search or "this medicine"
            response_text = (
                f"Live search found current market alternatives for {target}{source_hint}; "
                "use same composition and strength equivalents and compare current strip prices before dispensing."
            )

        # Strip inline citation artifacts from model text; structured citations/web sources
        # are handled separately in response fields.
        response_text = _strip_inline_reference_tokens(response_text)

        # Keep answer body clean unless the user explicitly requested sources.
        if not _wants_sources(chat_request.message):
            response_text = _strip_inline_urls(response_text)
            response_text = _strip_inline_source_attributions(response_text)

        # Show links only when explicitly requested.
        include_links = bool(_wants_sources(chat_request.message))
        if not include_links:
            citations = []

        # 5. Save to session & compress context (non-blocking background tasks)
        patient_ctx = chat_request.patient_context.model_dump() if chat_request.patient_context else None
        citations_data = [c.model_dump() for c in citations] if citations else None

        # Save message to session
        asyncio.create_task(save_message_to_session(
            user_id=user_id,
            session_id=session_id,
            message=chat_request.message,
            response=response_text,
            auth_token=auth_token,
            patient_context=patient_ctx,
            citations=citations_data,
        ))

        # Compress context for next message (runs in background)
        asyncio.create_task(compress_and_update_context(
            session_id=session_id,
            user_message=chat_request.message,
            assistant_response=response_text,
            auth_token=auth_token,
            current_summary=current_summary,
        ))

        # Convert web results to response model format
        web_sources_response = [
            {"title": r.title, "url": r.url, "snippet": r.snippet, "source": r.source}
            for r in web_results
        ] if (include_links and web_results) else []

        return ChatResponse(
            response=response_text,
            citations=citations,
            suggestions=suggestions,
            session_id=session_id,
            web_sources=web_sources_response,
            track2=track2_data,
        )

    except ValueError as e:
        # Common case: missing AI provider config (e.g., GEMINI_API_KEY not set).
        logger.warning("Chat unavailable (misconfigured AI provider): %s", e)
        raise HTTPException(status_code=503, detail="AI service not configured")
    except Exception as e:
        logger.exception("Chat error")
        raise HTTPException(
            status_code=500, 
            detail="Internal server error. Please try again."
        )
