"""
Insurance/Reimbursement Service - Coverage info for Indian health schemes.

DATA SOURCES:
- Scheme info: Supabase `insurance_schemes` table
- Package rates: Supabase `insurance_package_rates` table

IMPORTANT: No public API exists for Indian health insurance data.
Data is curated from official government documents:
- PM-JAY: NHA HBP 2.2 Manual (https://nha.gov.in/img/resources/HBP-2.2-manual.pdf)
- CGHS: CGHS Official Website (https://cghs.gov.in)
- Private: IRDAI Guidelines

This service fetches from database. Admins can update when official rates change.
"""
import logging
import re
from typing import Optional, Dict, Any, List

from services.supabase_service import SupabaseService

logger = logging.getLogger(__name__)

_WS_RE = re.compile(r"\s+")
_NON_ALNUM_RE = re.compile(r"[^a-z0-9]+")

# Stopwords/noise commonly present in insurance/admin questions.
_PROCEDURE_STOPWORDS = {
    "pmjay", "pm-jay", "pmj", "pm jai", "ayushman", "bharat", "cghs", "hbp", "jai",
    "insurance", "coverage", "covered", "reimbursement", "reimburse", "claim", "cashless",
    "package", "rate", "procedure", "cost", "price", "pricing", "how", "much",
    "for", "of", "the", "a", "an", "in", "on", "to", "and", "or", "is", "are",
    "what", "whats", "tell", "me", "pls", "please", "does", "do", "did",
    "under", "with", "without", "surgery", "operation", "treatment", "therapy",
    "cover", "medicine", "medicines", "medication",
    # Instructional / formatting words that often follow a procedure name in prompts.
    "give", "provide", "show", "list", "details", "detail",
    "code", "codes", "packagecode", "packagecodes",
    "include", "includes", "including", "inclusion", "inclusions",
    "exclude", "excludes", "excluding", "exclusion", "exclusions",
    "closest", "match", "matches", "multiple", "similar",
}


class InsuranceService:
    """Service for insurance and reimbursement information from database."""

    def __init__(self):
        self._scheme_cache: Dict[str, Dict] = {}
        self._rates_cache: Dict[str, List] = {}

    def _get_client(self, auth_token: Optional[str] = None):
        """Get Supabase client.

        These tables have RLS policies that allow reads for authenticated users.
        When called from an authenticated request (chat), pass the user's token.
        """
        if auth_token:
            try:
                return SupabaseService.get_auth_client(auth_token)
            except Exception as e:
                logger.warning("Failed to create auth Supabase client: %s", e)
        return SupabaseService.get_client()

    def _fetch_schemes(self, scheme_code: Optional[str] = None, auth_token: Optional[str] = None) -> List[Dict]:
        """Fetch insurance schemes from Supabase."""
        client = self._get_client(auth_token)
        if not client:
            logger.warning("Supabase client not available")
            return []

        try:
            query = client.table("insurance_schemes").select("*").eq("is_active", True)

            if scheme_code:
                query = query.eq("scheme_code", scheme_code.upper())

            result = query.execute()
            return result.data or []
        except Exception as e:
            logger.error(f"Failed to fetch insurance schemes: {e}")
            return []

    def _fetch_package_rates(
        self,
        scheme_id: str,
        category: Optional[str] = None,
        procedure_search: Optional[str] = None,
        limit: Optional[int] = None,
        auth_token: Optional[str] = None
    ) -> List[Dict]:
        """Fetch package rates from Supabase using multi-stage fallback search."""
        client = self._get_client(auth_token)
        if not client:
            return []

        # Helper to execute query
        def run_query(filter_fn):
            try:
                q = client.table("insurance_package_rates").select("*").eq("scheme_id", scheme_id)
                if category:
                    q = q.ilike("category", f"%{category}%")
                
                q = filter_fn(q)
                
                if limit:
                    q = q.limit(limit)
                
                return q.order("category").execute().data or []
            except Exception as e:
                logger.warning(f"Rate search attempt failed: {e}")
                return []

        # Strategy 1: Explicit WFTS (Web Full Text Search)
        # Good for exact phrases but strict on word forms
        if procedure_search:
            search_term = procedure_search.replace("%", " ").strip()
            if len(search_term) >= 3:
                results = run_query(lambda q: q.filter("procedure_name_normalized", "wfts", search_term))
                if results: 
                    return results

            # Strategy 2: "Brute Force" AND-match (All words must be present as substrings)
            # "hip replacement" -> ILIKE %hip% AND ILIKE %replacement%
            # This catches "Total Hip Replacement" when query is "hip replacement"
            tokens = [t for t in search_term.split() if len(t) > 2] # Ignore tiny words
            if tokens:
                def build_and_query(q):
                    for token in tokens:
                        q = q.ilike("procedure_name_normalized", f"%{token}%")
                    return q
                
                results = run_query(build_and_query)
                if results:
                    return results

            # Strategy 3: REMOVED (OR-based matching)

            # If we had a specific search term but found nothing, return EMPTY.
            # Do NOT return random rows (Fallback) which confuses the user.
            return []

        # Fallback: Only return generic list if NO search term was provided (browsing mode)
        return run_query(lambda q: q)

    def _procedure_search_pattern(self, query: str) -> str:
        """Build an ILIKE pattern for procedure search from a free-form query."""
        q = (query or "").strip().lower()
        if not q:
            return ""

        # Normalize to tokens (keep order), drop noise.
        q = _WS_RE.sub(" ", q)
        q = _NON_ALNUM_RE.sub(" ", q)
        tokens = [t for t in q.split() if len(t) >= 3 and t not in _PROCEDURE_STOPWORDS]
        if not tokens:
            return ""

        # Join with % so words can match non-contiguously within procedure_name_normalized.
        return "%".join(tokens[:6])

    def get_coverage_info(
        self,
        drug_name: Optional[str] = None,
        procedure: Optional[str] = None,
        scheme: Optional[str] = None,
        auth_token: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Get comprehensive insurance coverage information from database.

        Args:
            drug_name: Optional drug to check coverage for
            procedure: Optional procedure to check rates for
            scheme: Optional specific scheme (PMJAY, CGHS, PRIVATE, or None for all)

        Returns:
            Dict with coverage info for requested schemes
        """
        result = {
            "query": {
                "drug_name": drug_name,
                "procedure": procedure,
                "scheme_filter": scheme
            },
            "schemes": [],
            "comparison": None,
            "data_note": "Data sourced from official government documents. No public API exists for Indian health insurance."
        }

        # Normalize scheme filter
        scheme_filter = None
        if scheme:
            scheme_upper = scheme.upper()
            if scheme_upper in ["PMJAY", "PMJ", "AYUSHMAN", "PM-JAY", "PM JAI"]:
                scheme_filter = "PMJAY"
            elif scheme_upper == "CGHS":
                scheme_filter = "CGHS"
            elif scheme_upper == "PRIVATE":
                scheme_filter = "PRIVATE"

        # Fetch schemes from database
        schemes = self._fetch_schemes(scheme_filter, auth_token=auth_token)

        if not schemes:
            # Database might not be populated or connection failed
            result["error"] = "Unable to fetch insurance schemes from database"
            result["fallback_note"] = "Please ensure Supabase is configured and migration has been run"
            return result

        for scheme_data in schemes:
            scheme_info = self._format_scheme_info(scheme_data, drug_name, procedure, auth_token=auth_token)
            result["schemes"].append(scheme_info)

        # Add comparison if multiple schemes
        if len(result["schemes"]) > 1:
            result["comparison"] = self._generate_comparison(result["schemes"])

        # Check if we got any procedure details - if not, flag for web search fallback
        has_procedure_match = any(
            s.get("procedure_details") and s["procedure_details"].get("matched_procedure")
            for s in result["schemes"]
        )
        if procedure and not has_procedure_match:
            result["needs_web_search"] = True
            result["web_search_query"] = f"PM-JAY package rate for {procedure} India 2024"

        return result

    def _format_scheme_info(
        self,
        scheme: Dict,
        drug_name: Optional[str],
        procedure: Optional[str],
        auth_token: Optional[str] = None
    ) -> Dict[str, Any]:
        """Format scheme data from database for API response."""
        import json

        # Parse JSON fields
        eligibility = scheme.get("eligibility", [])
        covered_items = scheme.get("covered_items", [])
        excluded_items = scheme.get("excluded_items", [])
        drug_coverage = scheme.get("drug_coverage", {})

        # Handle if stored as strings
        if isinstance(eligibility, str):
            try:
                eligibility = json.loads(eligibility)
            except:
                eligibility = []

        if isinstance(covered_items, str):
            try:
                covered_items = json.loads(covered_items)
            except:
                covered_items = []

        if isinstance(excluded_items, str):
            try:
                excluded_items = json.loads(excluded_items)
            except:
                excluded_items = []

        if isinstance(drug_coverage, str):
            try:
                drug_coverage = json.loads(drug_coverage)
            except:
                drug_coverage = {}

        info = {
            "scheme_name": scheme.get("scheme_full_name") or scheme.get("scheme_name"),
            "scheme_short": scheme.get("scheme_code"),
            "scheme_type": scheme.get("scheme_type"),
            "coverage_limit": scheme.get("coverage_limit_display"),
            "coverage_type": scheme.get("coverage_type"),
            "eligibility": eligibility,
            "covered_items": covered_items,
            "excluded_items": excluded_items,
            "drug_coverage": drug_coverage,
            "helpline": scheme.get("helpline"),
            "website": scheme.get("website"),
            # data_source removed
            "source_url": scheme.get("source_url"),
            "last_verified": scheme.get("last_verified_at")
        }

        # Add drug-specific note
        if drug_name:
            info["drug_note"] = self._generate_drug_note(
                drug_name,
                drug_coverage,
                # data_source=scheme.get("data_source") # Removed per user request
            )

        # Check for procedure rates (PM-JAY specific)
        if procedure and scheme.get("scheme_code") == "PMJAY":
            proc_info = self._find_procedure_rate(scheme.get("id"), procedure, auth_token=auth_token)
            if proc_info:
                info["procedure_details"] = proc_info

        return info

    def _generate_drug_note(
        self,
        drug_name: str,
        drug_coverage: Dict,
        data_source: Optional[str] = None
    ) -> str:
        """Generate drug-specific coverage note from database fields (no hardcoded policy text)."""
        if not drug_name:
            return ""

        if not isinstance(drug_coverage, dict) or not drug_coverage:
            return f"For {drug_name}: Drug coverage details vary by scheme. Please refer to scheme documents."

        preferred_keys = [
            "during_hospitalization",
            "outpatient_medicines",
            "pre_hospitalization",
            "post_hospitalization",
            "generic_medicines",
            "branded_medicines",
            "non_formulary_drugs",
            "jan_aushadhi",
        ]

        parts: List[str] = []
        for key in preferred_keys:
            value = drug_coverage.get(key)
            if isinstance(value, str) and value.strip():
                parts.append(f"{key.replace('_', ' ').title()}: {value.strip()}")

        if not parts:
            # Fallback: include first few scalar entries
            for key, value in list(drug_coverage.items())[:6]:
                if isinstance(value, str) and value.strip():
                    parts.append(f"{key.replace('_', ' ').title()}: {value.strip()}")

        note = f"For {drug_name}: " + "; ".join(parts[:4]) + "."
        if data_source:
            note += f" (Source: {data_source})"
        return note

    def _find_procedure_rate(
        self,
        scheme_id: str,
        procedure: str,
        auth_token: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """Find PM-JAY package rate for a procedure from database."""
        if not scheme_id:
            return None

        pattern = self._procedure_search_pattern(procedure)
        if not pattern:
            return None

        rates = self._fetch_package_rates(
            scheme_id=scheme_id,
            procedure_search=pattern,
            limit=10,
            auth_token=auth_token
        )

        if rates:
            def _fmt(r: Dict[str, Any]) -> Dict[str, Any]:
                rate_value = r.get('rate_inr', 0)
                rate_display = r.get("rate_display") or f"₹{rate_value:,}"
                return {
                    "matched_procedure": r.get("procedure_name"),
                    "pmjay_rate": rate_value,
                    "rate_display": rate_display,
                    "rate_display_bold": f"**{rate_display}**",  # For markdown formatting
                    "package_code": r.get("package_code"),
                    "category": r.get("category"),
                    "sub_category": r.get("sub_category"),
                    "includes_implants": r.get("includes_implants", False),
                    "special_conditions": r.get("special_conditions"),
                }

            matches = [_fmt(r) for r in rates[:10]]
            best = matches[0]
            best.update({
                "procedure": procedure,
                "match_count": len(rates),
                "other_matches": matches[1:],
                # Source hidden as per user request
                "note": "Package rate from HBP master. Verify eligibility, documents, and hospital empanelment before claims."
            })
            return best
        return None

    def _generate_comparison(self, schemes: List[Dict[str, Any]]) -> str:
        """Generate comparison between schemes using database fields (no hardcoded stats)."""
        if not schemes:
            return ""

        lines = ["\n[Scheme Comparison - From Database]"]
        for scheme in schemes:
            short = scheme.get("scheme_short") or scheme.get("scheme_name") or "Unknown"
            scheme_type = scheme.get("scheme_type") or "N/A"
            coverage = scheme.get("coverage_limit") or "Varies"

            elig = scheme.get("eligibility")
            elig_first = ""
            if isinstance(elig, list) and elig:
                elig_first = elig[0]
            elif isinstance(elig, str) and elig.strip():
                elig_first = elig.strip()

            drug_cov = scheme.get("drug_coverage") or {}
            highlights = []
            if isinstance(drug_cov, dict):
                for key in ["during_hospitalization", "outpatient_medicines", "generic_medicines", "branded_medicines"]:
                    val = drug_cov.get(key)
                    if isinstance(val, str) and val.strip():
                        highlights.append(f"{key.replace('_', ' ').title()}: {val.strip()}")

            line = f"- {short} ({scheme_type}): Coverage: {coverage}"
            if elig_first:
                line += f"; Eligibility: {elig_first}"
            if highlights:
                line += f"; Drug coverage: " + "; ".join(highlights[:2])
            lines.append(line)

        lines.append("[Note: Data from official documents stored in Supabase. No public API exists.]")
        return "\n".join(lines)

    def get_procedure_rates(
        self,
        category: Optional[str] = None,
        limit: int = 50,
        auth_token: Optional[str] = None
    ) -> Dict[str, Any]:
        """Get PM-JAY package rates for procedures from database."""
        # Get PM-JAY scheme ID
        schemes = self._fetch_schemes("PMJAY", auth_token=auth_token)
        if not schemes:
            return {"error": "PM-JAY scheme not found in database"}

        scheme_id = schemes[0].get("id")

        client = self._get_client(auth_token)
        if not client:
            return {"error": "Database connection not available"}

        try:
            query = client.table("insurance_package_rates").select("*").eq("scheme_id", scheme_id)

            if category:
                query = query.ilike("category", f"%{category}%")

            result = query.order("category").limit(limit).execute()

            # Group by category
            categorized = {}
            for rate in (result.data or []):
                cat = rate.get("category", "Other")
                if cat not in categorized:
                    categorized[cat] = []
                categorized[cat].append({
                    "procedure": rate.get("procedure_name"),
                    "code": rate.get("package_code"),
                    "rate": rate.get("rate_display") or f"Rs. {rate.get('rate_inr', 0):,}",
                    "sub_category": rate.get("sub_category"),
                    "includes_implants": rate.get("includes_implants", False)
                })

            return {
                "scheme": "PM-JAY",
                "categories": categorized,
                "total_procedures": sum(len(v) for v in categorized.values()),
                "data_source": "NHA HBP 2.2 Manual",
                "note": "Package rates include all hospitalization expenses"
            }
        except Exception as e:
            logger.error(f"Failed to fetch procedure rates: {e}")
            return {"error": str(e)}

    def format_for_llm(self, coverage_data: Dict) -> str:
        """Format coverage data for LLM context."""
        lines = ["\n[Insurance/Reimbursement Information]"]

        if coverage_data.get("error"):
            lines.append(f"Error: {coverage_data['error']}")
            return "\n".join(lines)

        for scheme in coverage_data.get("schemes", []):
            lines.append(f"\n{scheme.get('scheme_name', 'Unknown Scheme')}:")

            if scheme.get("coverage_limit"):
                lines.append(f"  Coverage: {scheme['coverage_limit']}")

            if scheme.get("eligibility"):
                elig = scheme["eligibility"]
                if isinstance(elig, list) and elig:
                    lines.append(f"  Eligibility: {elig[0]}")
                elif isinstance(elig, str):
                    lines.append(f"  Eligibility: {elig}")

            if scheme.get("drug_note"):
                lines.append(f"  Drug Coverage: {scheme['drug_note']}")

            if scheme.get("procedure_details"):
                proc = scheme["procedure_details"]
                rate = proc.get("rate_display_bold") or proc.get("rate_display") or proc.get("pmjay_rate", "N/A")
                matched = proc.get("matched_procedure") or ""
                code = proc.get("package_code") or ""
                lines.append(f"  **Procedure Rate: {rate}** (Code: {code})")
                if matched:
                    lines.append(f"  Matched: {matched}")
                if proc.get("special_conditions"):
                    lines.append(f"  Notes: {proc.get('special_conditions')}")
                if proc.get("other_matches"):
                    lines.append("  Other matches:")
                    for m in proc.get("other_matches", [])[:2]:
                        lines.append(f"   - {m.get('matched_procedure')} ({m.get('package_code')}): {m.get('pmjay_rate')}")

            if scheme.get("helpline"):
                lines.append(f"  Helpline: {scheme['helpline']}")

            if scheme.get("data_source"):
                lines.append(f"  Source: {scheme['data_source']}")

        if coverage_data.get("comparison"):
            lines.append(coverage_data["comparison"])

        lines.append("\n[Note: Data from official govt documents - no public API exists for Indian health insurance]")

        return "\n".join(lines)


# Singleton instance
insurance_service = InsuranceService()


def get_coverage(
    drug_name: Optional[str] = None,
    procedure: Optional[str] = None,
    scheme: Optional[str] = None
) -> Dict[str, Any]:
    """Convenience function to get coverage info."""
    return insurance_service.get_coverage_info(drug_name, procedure, scheme)
