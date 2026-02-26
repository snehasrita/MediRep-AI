"""
Enhanced Context Service - Integrates all new Track 2 features.

This service combines:
- Mechanism of Action (moa_service)
- Therapeutic Comparison (therapeutic_comparison_service)
- Insurance/Reimbursement (insurance_service)
- Pharma Rep Mode (pharma_rep_service)

Usage in chat.py:
    from services.enhanced_context_service import build_enhanced_context, detect_enhanced_intents

    # In chat_endpoint, after plan_intent():
    enhanced_intents = detect_enhanced_intents(chat_request.message)
    enhanced_context = await build_enhanced_context(
        message=chat_request.message,
        drug_name=plan.drug_names[0] if plan.drug_names else None,
        intents=enhanced_intents
    )
    msg_context += enhanced_context
"""
import asyncio
import logging
from typing import Optional, Dict, Any, List, Set
import re

from services.moa_service import moa_service
from services.therapeutic_comparison_service import therapeutic_comparison_service
from services.insurance_service import insurance_service
from services.pharma_rep_service import pharma_rep_service

logger = logging.getLogger(__name__)

# Words that commonly appear in insurance/admin queries but are not useful for procedure search.
_PROCEDURE_NOISE_WORDS = {
    "pmjay", "pm-jay", "pmj", "pm jai", "ayushman", "bharat", "cghs", "jai",
    "insurance", "coverage", "covered", "reimbursement", "reimburse", "claim", "cashless",
    "package", "rate", "procedure", "hbp", "price", "cost", "how", "much",
    "for", "of", "the", "a", "an", "in", "on", "to", "and", "or",
}


def _extract_procedure_query(message: str) -> Optional[str]:
    """
    Best-effort procedure query extraction from a free-form insurance question.

    We keep it intentionally simple:
    - If we can find a trailing fragment after "rate for" / "package rate for", use that.
    - Otherwise pass the whole message; InsuranceService will token-filter.
    """
    msg = (message or "").strip()
    if not msg:
        return None
    lower = msg.lower()

    markers = [
        "package rate for",
        "package for",
        "rate for",
        "rate of",
        "cost for",
        "reimbursement for",
        "claim for",
    ]
    for marker in markers:
        idx = lower.find(marker)
        if idx != -1:
            candidate = msg[idx + len(marker):].strip()
            # Strip common instruction tails: "Total Hip Replacement: give ...", "X - include ..."
            candidate = re.split(r"[:;\n]", candidate, maxsplit=1)[0].strip() or candidate
            candidate = re.split(r"\b(give|provide|show|list|include|including)\b", candidate, maxsplit=1, flags=re.IGNORECASE)[0].strip() or candidate
            return candidate or msg

    # Fall back to message (later token filtering will remove noise words).
    return msg


def _extract_scheme_hint(message: str) -> Optional[str]:
    """
    If the user is clearly asking about one scheme, pass it through to the DB lookup
    so we don't accidentally render "first scheme in DB" (which can hide PM-JAY matches).
    """
    msg = (message or "").lower()
    if not msg:
        return None

    has_pmjay = any(k in msg for k in ("pmjay", "pm-jay", "pmj", "pm jai", "ayushman"))
    has_cghs = "cghs" in msg
    has_esi = any(k in msg for k in ("esi", "esic"))

    mentioned = sum(1 for x in (has_pmjay, has_cghs, has_esi) if x)
    if mentioned != 1:
        return None
    if has_pmjay:
        return "PMJAY"
    if has_cghs:
        return "CGHS"
    if has_esi:
        # Only return ESI if it exists in DB; the caller should still handle missing schemes.
        return "ESI"
    return None

# =============================================================================
# INTENT DETECTION KEYWORDS
# =============================================================================
MOA_KEYWORDS = {
    "mechanism", "how does", "how do", "works by", "working", "pharmacology",
    "action of", "mode of action", "moa", "pharmacodynamic", "receptor",
    "target", "pathway", "biochemical"
}

COMPARE_KEYWORDS = {
    "compare", "comparison", "versus", "vs", "better than", "difference between",
    "differences", "which is better", "alternative to", "instead of",
    "differentiate", "differentiates", "therapeutic alternative"
}

INSURANCE_KEYWORDS = {
    "insurance", "coverage", "covered", "reimbursement", "reimburse",
    "pmjay", "pm-jay", "pmj", "pm jai", "ayushman", "cghs", "esi", "esic", "hbp",
    "tariff",
    "package code", "package codes",
    "package rate", "empanelled", "beneficiary", "health scheme"
}

PHARMA_REP_KEYWORDS = {
    "represent", "rep mode", "company mode", "pharma company", "brand mode",
    "support program", "patient assistance", "medical affairs"
}

# Keywords that trigger product lookup when in rep mode
PRODUCT_KEYWORDS = {
    "product", "products", "portfolio", "what drugs", "your drugs",
    "which drugs", "drug portfolio", "medicines", "what do you make",
    "what do you sell", "offerings", "catalog", "catalogue",
    "manufacture", "manufactures", "manufacturer", "make", "makes"
}

# Keywords that trigger support program lookup when in rep mode
SUPPORT_KEYWORDS = {
    "support program", "patient assistance", "pap", "affordability",
    "free drug", "copay", "co-pay", "financial assistance", "help program",
    "access program", "patient support", "support programs"
}

# Keywords that trigger drug class listing (e.g., "list all ACE inhibitors")
CLASS_LIST_KEYWORDS = {
    "list all", "list drugs in", "drugs in class", "all drugs in",
    "what drugs are", "which drugs are", "members of", "drugs that are"
}

# Common drug class names to detect (for extraction)
DRUG_CLASS_NAMES = {
    # Cardiovascular
    "ace inhibitor", "ace inhibitors", "arb", "arbs", "angiotensin receptor blocker",
    "beta blocker", "beta blockers", "calcium channel blocker", "ccb",
    "diuretic", "diuretics", "statin", "statins", "anticoagulant", "anticoagulants",
    "antiplatelet", "antiplatelets", "antihypertensive", "antihypertensives",
    # Diabetes
    "biguanide", "biguanides", "sulfonylurea", "sulfonylureas", "sglt2 inhibitor",
    "dpp-4 inhibitor", "glp-1 agonist", "insulin", "antidiabetic",
    # CNS
    "ssri", "ssris", "snri", "snris", "antidepressant", "antidepressants",
    "antipsychotic", "antipsychotics", "benzodiazepine", "benzodiazepines",
    "anticonvulsant", "anticonvulsants", "antiepileptic", "antiepileptics",
    # Pain/Inflammation
    "nsaid", "nsaids", "opioid", "opioids", "analgesic", "analgesics",
    "corticosteroid", "corticosteroids", "steroid", "steroids",
    # Anti-infective
    "antibiotic", "antibiotics", "antifungal", "antifungals", "antiviral", "antivirals",
    "fluoroquinolone", "fluoroquinolones", "macrolide", "macrolides",
    "penicillin", "penicillins", "cephalosporin", "cephalosporins",
    # Respiratory
    "bronchodilator", "bronchodilators", "antihistamine", "antihistamines",
    "leukotriene inhibitor", "inhaled corticosteroid",
    # GI
    "ppi", "ppis", "proton pump inhibitor", "h2 blocker", "h2 blockers",
    "antacid", "antacids", "antiemetic", "antiemetics", "laxative", "laxatives",
    # Other
    "immunosuppressant", "immunosuppressants", "antirheumatic", "biologics",
}


def detect_enhanced_intents(message: str) -> Set[str]:
    """
    Detect which enhanced features should be activated based on message content.

    Returns:
        Set of intent strings: 'MOA', 'COMPARE', 'INSURANCE', 'PHARMA_REP',
        'PRODUCTS', 'SUPPORT', 'CLASS_LIST'
    """
    msg_lower = message.lower()
    intents = set()

    # Helper for word-boundary check
    def has_keyword_regex(text: str, keywords: Set[str], label: str) -> bool:
        for k in keywords:
            # Use strict word boundary for standard keywords
            # For multi-word phrases, boundaries apply to the whole phrase start/end
            pattern = r"\b" + re.escape(k) + r"\b"
            if re.search(pattern, text):
                logger.info(f"[DEBUG] Intent {label} matched keyword: '{k}'")
                return True
        return False

    # Check for MOA intent
    if has_keyword_regex(msg_lower, MOA_KEYWORDS, "MOA"):
        intents.add("MOA")

    # Check for comparison intent
    if has_keyword_regex(msg_lower, COMPARE_KEYWORDS, "COMPARE"):
        intents.add("COMPARE")

    # Check for insurance intent
    if has_keyword_regex(msg_lower, INSURANCE_KEYWORDS, "INSURANCE"):
        intents.add("INSURANCE")

    # Check for pharma rep mode intent
    if has_keyword_regex(msg_lower, PHARMA_REP_KEYWORDS, "PHARMA_REP"):
        intents.add("PHARMA_REP")

    # Check for product lookup intent
    if has_keyword_regex(msg_lower, PRODUCT_KEYWORDS, "PRODUCTS"):
        intents.add("PRODUCTS")

    # Check for support program intent
    if has_keyword_regex(msg_lower, SUPPORT_KEYWORDS, "SUPPORT"):
        intents.add("SUPPORT")

    # Check for drug class listing intent
    start_pattern = r"\b(" + "|".join(re.escape(k) for k in CLASS_LIST_KEYWORDS) + r")\b"
    if re.search(start_pattern, msg_lower):
        # Also verify a drug class name is mentioned
        class_pattern = r"\b(" + "|".join(re.escape(k) for k in DRUG_CLASS_NAMES) + r")\b"
        if re.search(class_pattern, msg_lower):
            intents.add("CLASS_LIST")

    return intents


async def build_enhanced_context(
    message: str,
    drug_name: Optional[str] = None,
    procedure: Optional[str] = None,
    intents: Optional[Set[str]] = None,
    auth_token: Optional[str] = None,
    rep_company: Optional[Dict[str, Any]] = None
) -> tuple:
    """
    Build enhanced context for the LLM using all Track 2 features.

    Args:
        message: User's message
        drug_name: Extracted drug name (if any)
        procedure: Extracted procedure name (if any)
        intents: Set of detected intents (if None, will auto-detect)
        auth_token: User's auth token for database access
        rep_company: Active rep mode company context (if any)

    Returns:
        Tuple of (formatted context string, Track2Data object)
    """
    # Import models here to avoid circular imports
    from models import (
        Track2Data, InsuranceContext, InsuranceSchemeInfo, InsuranceProcedureMatch,
        MoAContext, CompareContext, CompareAlternative, RepModeContext
    )

    if intents is None:
        intents = detect_enhanced_intents(message)

    # Initialize Track2Data components
    track2_insurance = None
    track2_moa = None
    track2_compare = None
    track2_rep_mode = None

    if not intents and not drug_name and not rep_company:
        return "", Track2Data()

    context_parts = []
    tasks = []

    # 1. Mechanism of Action
    if "MOA" in intents and drug_name:
        tasks.append(("MOA", moa_service.get_mechanism_of_action(drug_name)))

    # 2. Therapeutic Comparison
    if "COMPARE" in intents and drug_name:
        tasks.append(("COMPARE", therapeutic_comparison_service.get_therapeutic_alternatives(drug_name)))

    # 3. Insurance/Reimbursement
    if "INSURANCE" in intents:
        procedure_query = procedure or _extract_procedure_query(message)
        scheme_hint = _extract_scheme_hint(message)
        # Insurance service is synchronous (Supabase client); run it off the event loop.
        tasks.append((
            "INSURANCE",
            asyncio.to_thread(
                insurance_service.get_coverage_info,
                drug_name=drug_name,
                procedure=procedure_query,
                scheme=scheme_hint,
                auth_token=auth_token
            )
        ))

    # 4. Drug Class Listing (e.g., "list all ACE inhibitors")
    extracted_class = None
    if "CLASS_LIST" in intents:
        extracted_class = _extract_drug_class(message)
        if extracted_class:
            tasks.append((
                "CLASS_LIST",
                therapeutic_comparison_service.get_class_members(extracted_class, limit=15)
            ))

    # 5. Pharma Rep Context (if active)
    if rep_company:
        rep_context = pharma_rep_service.format_company_context_for_llm(rep_company)
        if rep_context:
            context_parts.append(rep_context)

        # Build structured rep mode context
        track2_rep_mode = RepModeContext(
            active=True,
            company_key=rep_company.get("company_key"),
            company_name=rep_company.get("company_name"),
            company_id=rep_company.get("company_id")
        )

        company_key = rep_company.get("company_key", "")
        company_name = rep_company.get("company_name", "Company")

        # 5. Product lookup - fetch REAL products from Turso database
        # Trigger on PRODUCTS intent OR when in rep mode and asking about drugs
        if "PRODUCTS" in intents or (drug_name and company_key):
            # Extract therapeutic area from message if present
            therapeutic_area = _extract_therapeutic_area(message)
            tasks.append((
                "PRODUCTS",
                asyncio.to_thread(
                    pharma_rep_service.get_company_products,
                    company_key,
                    therapeutic_area,
                    15,  # limit
                    auth_token
                )
            ))

        # 6. Support Programs - fetch from Supabase database
        if "SUPPORT" in intents:
            tasks.append((
                "SUPPORT",
                asyncio.to_thread(
                    pharma_rep_service.get_support_programs,
                    company_key,
                    auth_token
                )
            ))

    # Track web search fallback flags
    needs_web_search = False
    web_search_query = None

    # Execute all async tasks in parallel
    if tasks:
        results = await asyncio.gather(
            *[task[1] for task in tasks],
            return_exceptions=True
        )

        for i, (intent_name, _) in enumerate(tasks):
            result = results[i]
            if isinstance(result, Exception):
                logger.warning(f"Enhanced context {intent_name} failed: {result}")
                continue

            if intent_name == "MOA" and result:
                formatted = moa_service.format_for_llm(result)
                if formatted:
                    context_parts.append(formatted)
                # Build structured MoA context
                pathway_equation = _build_moa_pathway_equation(drug_name or "", result)
                track2_moa = MoAContext(
                    drug_name=drug_name or "",
                    mechanism=result.get("mechanism_of_action"),
                    drug_class=result.get("drug_class"),
                    pharmacodynamics=result.get("pharmacodynamics"),
                    targets=result.get("targets", []),
                    pathway_equation=pathway_equation,
                    sources=result.get("sources", [])
                )

            elif intent_name == "COMPARE" and result:
                formatted = therapeutic_comparison_service.format_for_llm(result)
                if formatted:
                    context_parts.append(formatted)
                # Build structured comparison context
                alternatives = []
                for alt in result.get("alternatives", [])[:5]:
                    alternatives.append(CompareAlternative(
                        name=alt.get("name", ""),
                        generic_name=alt.get("generic_name"),
                        therapeutic_class=alt.get("therapeutic_class"),
                        price_raw=alt.get("price_raw")
                    ))
                track2_compare = CompareContext(
                    drug_name=drug_name or "",
                    therapeutic_class=result.get("therapeutic_class"),
                    alternatives=alternatives,
                    comparison_factors=result.get("comparison_factors", []),
                    sources=result.get("sources", [])
                )

            elif intent_name == "INSURANCE" and result:
                formatted = insurance_service.format_for_llm(result)
                if formatted:
                    context_parts.append(formatted)
                # Build structured insurance context
                scheme_info = None
                matched_proc = None
                other_matches = []

                # Extract scheme info from first scheme in result
                schemes = result.get("schemes", [])
                if schemes:
                    first_scheme = schemes[0]
                    scheme_info = InsuranceSchemeInfo(
                        scheme_code=first_scheme.get("scheme_short", ""),
                        scheme_name=first_scheme.get("scheme_name", ""),
                        source_url=first_scheme.get("source_url"),
                        last_verified_at=first_scheme.get("last_verified")
                    )
                    # Extract procedure details if present
                    proc_details = first_scheme.get("procedure_details", {})
                    if proc_details and proc_details.get("matched_procedure"):
                        matched_proc = InsuranceProcedureMatch(
                            package_code=proc_details.get("package_code", ""),
                            procedure_name=proc_details.get("matched_procedure", ""),
                            rate_inr=proc_details.get("pmjay_rate", 0),
                            rate_display=proc_details.get("rate_display") or f"₹{proc_details.get('pmjay_rate', 0):,}",
                            category=proc_details.get("category"),
                            sub_category=proc_details.get("sub_category"),
                            includes_implants=proc_details.get("includes_implants", False),
                            special_conditions=proc_details.get("special_conditions"),
                            data_source=proc_details.get("data_source")
                        )
                    # Extract other matches
                    for om in proc_details.get("other_matches", [])[:2]:
                        other_matches.append(InsuranceProcedureMatch(
                            package_code=om.get("package_code", ""),
                            procedure_name=om.get("matched_procedure", ""),
                            rate_inr=om.get("pmjay_rate", 0) if isinstance(om.get("pmjay_rate"), int) else 0,
                            rate_display=om.get("rate_display") or om.get("pmjay_rate", ""),
                            category=om.get("category"),
                            sub_category=om.get("sub_category"),
                            includes_implants=om.get("includes_implants", False),
                            special_conditions=om.get("special_conditions"),
                            data_source=om.get("data_source")
                        ))

                track2_insurance = InsuranceContext(
                    query=procedure or _extract_procedure_query(message),
                    scheme=scheme_info,
                    matched_procedure=matched_proc,
                    other_matches=other_matches,
                    no_match_reason=result.get("error") if not matched_proc else None,
                    note=result.get("note") or (
                        "No exact package match found in database. Check NHA HBP portal for latest rates."
                        if result.get("needs_web_search") else None
                    )
                )
                
                # Capture web search fallback flags
                if result.get("needs_web_search"):
                    needs_web_search = True
                    web_search_query = result.get("web_search_query")
                    web_search_note = f"\n[NOTE: No exact match in HBP database. Consider web search for: '{web_search_query}']"
                    context_parts.append(web_search_note)

            elif intent_name == "PRODUCTS":
                company_name = rep_company.get("company_name", "Company") if rep_company else "Company"
                if result:
                    formatted = pharma_rep_service.format_products_for_llm(result, company_name)
                    if formatted:
                        context_parts.append(formatted)
                else:
                    context_parts.append(
                        f"\n[{company_name} Products from Database]\n"
                        "[INSTRUCTION: No verified products were found in the database for this request. "
                        "Do NOT invent product names and do NOT infer portfolio from brand-name fragments "
                        "(for example names containing company-like tokens). "
                        "State that portfolio data is unavailable for the asked area.]"
                    )

            elif intent_name == "SUPPORT" and result:
                formatted = pharma_rep_service.format_support_programs_for_llm(result)
                if formatted:
                    context_parts.append(formatted)

            elif intent_name == "CLASS_LIST" and result:
                # extracted_class is set above when CLASS_LIST intent is detected
                class_name = extracted_class or "Drug Class"
                formatted = therapeutic_comparison_service.format_class_members_for_llm(class_name, result)
                if formatted:
                    context_parts.append(formatted)

    # Build final Track2Data object
    track2_data = Track2Data(
        insurance=track2_insurance,
        moa=track2_moa,
        compare=track2_compare,
        rep_mode=track2_rep_mode,
        needs_web_search=needs_web_search,
        web_search_query=web_search_query
    )

    return "\n".join(context_parts), track2_data


def _extract_drug_class(message: str) -> Optional[str]:
    """
    Extract drug class name from message for class listing.

    Examples:
        "list all ACE inhibitors" -> "ACE inhibitors"
        "what drugs are statins" -> "statins"
    """
    msg_lower = message.lower()

    # Find the longest matching class name (to prefer "ACE inhibitors" over "ACE")
    matches = [cls for cls in DRUG_CLASS_NAMES if cls in msg_lower]
    if matches:
        # Return the longest match, properly capitalized
        longest = max(matches, key=len)
        # Capitalize properly for API query
        return longest.title() if len(longest) > 4 else longest.upper()

    return None


def _extract_therapeutic_area(message: str) -> Optional[str]:
    """Extract therapeutic area from message for filtering products."""
    msg_lower = message.lower()

    # Common therapeutic areas to detect
    therapeutic_keywords = {
        "respiratory": ["respiratory", "asthma", "copd", "inhaler", "bronchitis"],
        "cardiovascular": ["cardiovascular", "cardiac", "heart", "hypertension", "blood pressure"],
        "diabetes": ["diabetes", "diabetic", "insulin", "metformin", "glucose"],
        "oncology": ["oncology", "cancer", "tumor", "chemotherapy"],
        "anti-infective": ["antibiotic", "anti-infective", "infection", "antimicrobial"],
        "pain": ["pain", "analgesic", "painkiller", "nsaid"],
        "gastro": ["gastro", "stomach", "acid", "digestive", "gi"],
        "cns": ["cns", "neurological", "brain", "depression", "anxiety", "psychiatric"],
    }

    for area, keywords in therapeutic_keywords.items():
        if any(kw in msg_lower for kw in keywords):
            return area

    return None


def _build_moa_pathway_equation(drug_name: str, moa_result: Dict[str, Any]) -> Optional[str]:
    """
    Best-effort one-line mechanism chain derived from structured MoA context.
    This is intentionally conservative: only emit when we can confidently identify a target/class.
    """
    dn = (drug_name or "").strip()
    if not dn or not moa_result:
        return None

    drug_class = (moa_result.get("drug_class") or "").strip()
    mechanism = (moa_result.get("mechanism_of_action") or "").strip()
    pharmacodynamics = (moa_result.get("pharmacodynamics") or "").strip()
    targets = moa_result.get("targets") or []

    blob = " ".join([drug_class, mechanism, " ".join([str(t) for t in targets if t])]).lower()

    def has_any(*needles: str) -> bool:
        return any(n and n in blob for n in needles)

    target_label = None
    verb = None
    effect = None

    # Calcium channel blockers
    if has_any("calcium channel", "l-type", "cav1.2", "cacna1c"):
        target_label = "L-type calcium channels"
        if has_any("cav1.2", "cacna1c"):
            target_label = "L-type calcium channels (Cav1.2)"
        verb = "blocks"
        effect = "arteriolar vasodilation → ↓SVR/↓BP"

    # ARBs
    elif has_any("angiotensin ii receptor", "at1", "agtr1"):
        target_label = "angiotensin II type 1 (AT1) receptor"
        verb = "blocks"
        effect = "↓vasoconstriction/↓aldosterone → ↓BP"

    # ACE inhibitors
    elif has_any("angiotensin converting enzyme", "angiotensin-converting enzyme", " ace "):
        target_label = "angiotensin-converting enzyme (ACE)"
        verb = "inhibits"
        effect = "↓Ang II, ↑bradykinin → vasodilation → ↓BP"

    # Beta blockers
    elif has_any("beta-1", "β1", "adrb1", "beta adrenergic"):
        target_label = "β1-adrenergic receptor"
        verb = "blocks"
        effect = "↓HR/↓contractility; ↓renin"

    # PPIs
    elif has_any("h+/k+", "h+-k+-atpase", "proton pump"):
        target_label = "gastric H+/K+-ATPase (proton pump)"
        verb = "inhibits"
        effect = "↓gastric acid secretion"

    # SSRIs
    elif has_any("serotonin transporter", "sert", "slc6a4"):
        target_label = "serotonin transporter (SERT)"
        verb = "inhibits"
        effect = "↑synaptic serotonin"

    # Statins
    elif has_any("hmg-coa reductase", "hmgcr"):
        target_label = "HMG-CoA reductase"
        verb = "inhibits"
        effect = "↓cholesterol synthesis → ↑LDL receptor → ↓LDL"

    if not target_label or not verb:
        return None

    # If we have a better effect snippet from pharmacodynamics, prefer it (short, high-level).
    pd = re.sub(r"\s+", " ", pharmacodynamics).strip()
    if pd and len(pd) <= 120 and not pd.lower().startswith("see"):
        effect = pd

    if effect:
        return f"{dn} → {verb} {target_label} → {effect}"
    return f"{dn} → {verb} {target_label}"


def get_pharma_rep_system_prompt(rep_company: Optional[Dict[str, Any]] = None) -> str:
    """
    Get the pharma rep system prompt if brand mode is active.
    This should be prepended to the main system prompt.
    """
    if not rep_company:
        return ""
    return pharma_rep_service.generate_rep_system_prompt(rep_company)


async def handle_pharma_rep_command(message: str, user_id: str, auth_token: str) -> Optional[Dict[str, Any]]:
    """
    Handle pharma rep mode commands.

    Commands:
    - "set rep mode cipla" / "represent cipla"
    - "clear rep mode" / "exit rep mode"
    - "list companies" / "available companies"

    Returns:
        Response dict if command was handled, None otherwise
    """
    msg_lower = message.lower().strip()

    # Set rep mode
    if "set rep mode" in msg_lower or msg_lower.startswith("represent "):
        company_query = ""
        if "set rep mode" in msg_lower:
            company_query = msg_lower.split("set rep mode", 1)[1].strip()
        elif msg_lower.startswith("represent "):
            company_query = msg_lower.split("represent", 1)[1].strip()

        # Handle "for" / "to" prepositions (e.g., "set rep mode for cipla")
        if company_query.startswith("for "):
            company_query = company_query[4:].strip()
        elif company_query.startswith("to "):
            company_query = company_query[3:].strip()

        if not company_query:
            companies = await asyncio.to_thread(pharma_rep_service.get_available_companies, auth_token)
            company_list = "\n".join([f"- {c['name']} ({c['key']}): {c['focus']}" for c in companies])
            return {
                "is_command": True,
                "response": f"Which company should I represent?\n{company_list}\n\nSay 'set rep mode [company]' to activate.",
                "data": {"companies": companies}
            }

        result = await asyncio.to_thread(pharma_rep_service.set_company_mode, user_id, auth_token, company_query)
        return {
            "is_command": True,
            "response": result.get("message", "Rep mode updated."),
            "data": result
        }

    # Clear rep mode
    if any(phrase in msg_lower for phrase in ["clear rep mode", "exit rep mode", "general mode"]):
        result = await asyncio.to_thread(pharma_rep_service.clear_company_mode, user_id, auth_token)
        return {
            "is_command": True,
            "response": result.get("message", "Switched to general mode"),
            "data": result
        }

    # List available companies
    if "list companies" in msg_lower or "available companies" in msg_lower:
        companies = await asyncio.to_thread(pharma_rep_service.get_available_companies, auth_token)
        company_list = "\n".join([f"- {c['name']} ({c['key']}): {c['focus']}" for c in companies])
        return {
            "is_command": True,
            "response": f"Available companies for rep mode:\n{company_list}\n\nSay 'set rep mode [company]' to activate.",
            "data": {"companies": companies}
        }

    return None


# =============================================================================
# EXAMPLE INTEGRATION IN CHAT.PY
# =============================================================================
"""
# Add to imports in chat.py:
from services.enhanced_context_service import (
    build_enhanced_context,
    detect_enhanced_intents,
    get_pharma_rep_system_prompt,
    handle_pharma_rep_command
)
from services.pharma_rep_service import pharma_rep_service

# Add at the start of chat_endpoint (after auth):
# Check for pharma rep commands
rep_command = await handle_pharma_rep_command(chat_request.message, user_id, auth_token)
if rep_command and rep_command.get("is_command"):
    return ChatResponse(
        response=rep_command["response"],
        citations=[],
        suggestions=["Tell me about your products", "What's your flagship drug?", "Support programs?"],
        session_id=session_id
    )

# Get active rep company context (if user is in rep mode)
rep_company = pharma_rep_service.get_active_company_context(user_id, auth_token)

# Add after plan_intent():
enhanced_intents = detect_enhanced_intents(chat_request.message)
logger.info("Enhanced intents detected: %s", enhanced_intents)
if rep_company:
    logger.info("Rep mode active for: %s", rep_company.get("company_name"))

# Add before generate_response():
if enhanced_intents or plan.drug_names or rep_company:
    enhanced_context = await build_enhanced_context(
        message=chat_request.message,
        drug_name=plan.drug_names[0] if plan.drug_names else None,
        intents=enhanced_intents,
        auth_token=auth_token,
        rep_company=rep_company
    )
    msg_context += enhanced_context
    logger.info("Enhanced context added: %d chars", len(enhanced_context))

# Modify system prompt if in rep mode:
pharma_rep_prompt = get_pharma_rep_system_prompt(rep_company)
# Pass pharma_rep_prompt to generate_response() to prepend to system prompt

# NOW WIRED UP:
# - get_company_products() - fetches REAL products from Turso (250K drugs)
# - get_support_programs() - fetches support programs from Supabase
# - format_products_for_llm() - formats product list for LLM context
# - format_support_programs_for_llm() - formats support programs for LLM context
# - get_class_members() - lists all drugs in a therapeutic class (RxClass API)
# - format_class_members_for_llm() - formats class member list for LLM context
#
# Example queries now supported:
# - "list all ACE inhibitors"
# - "what drugs are statins"
# - "show me all beta blockers"
# - "drugs in the SSRI class"
"""
