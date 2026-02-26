"""
Pharma Rep Service - Brand-specific digital representative mode.

DATA SOURCES:
- Company metadata: Supabase `pharma_companies` table (from annual reports)
- Company products: Turso `drugs` table (REAL product lookup by manufacturer)
- Support programs: Supabase `pharma_support_programs` table

"""
import json
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

from services import turso_service
from services.supabase_service import SupabaseService

logger = logging.getLogger(__name__)


class PharmaRepService:
    """Service for brand-specific digital representative functionality."""

    def __init__(self):
        self._company_cache: Dict[str, Dict] = {}
        self._product_cache: Dict[str, List[Dict]] = {}

    def _get_supabase_client(self, auth_token: Optional[str] = None):
        """Get Supabase client for database queries."""
        if auth_token:
            try:
                return SupabaseService.get_auth_client(auth_token)
            except Exception as e:
                logger.warning("Failed to create auth client: %s", e)
        return SupabaseService.get_client()

    def _parse_json_field(self, value: Any) -> Any:
        """Parse JSON field if it's a string."""
        if isinstance(value, str):
            try:
                return json.loads(value)
            except (json.JSONDecodeError, TypeError):
                return value
        return value

    def _normalize_company_text(self, value: Optional[str]) -> str:
        """Normalize company text for robust fuzzy matching."""
        if not value:
            return ""
        cleaned = value.lower().replace("_", " ").replace("-", " ").strip()
        cleaned = " ".join(cleaned.split())
        return cleaned

    def _strip_legal_suffixes(self, value: str) -> str:
        """Remove common legal suffixes from company names for matching."""
        if not value:
            return ""
        suffixes = {
            "ltd", "limited", "inc", "corp", "corporation", "co", "company", "plc", "llc", "pvt", "private"
        }
        words = [w for w in value.split() if w not in suffixes]
        return " ".join(words).strip()

    def _build_manufacturer_aliases(self, company_key: str, company_name: str) -> List[str]:
        """Build safe aliases for manufacturer matching (avoid overly-broad tokens like 'sun')."""
        key_norm = self._normalize_company_text(company_key)
        name_norm = self._normalize_company_text(company_name)
        name_core = self._strip_legal_suffixes(name_norm)

        aliases: List[str] = []
        for candidate in (key_norm, name_norm, name_core):
            if not candidate:
                continue
            # Keep aliases that are specific enough:
            # - multi-word aliases are allowed
            # - single-word aliases must be at least 5 chars
            if (" " in candidate) or len(candidate) >= 5:
                aliases.append(candidate)

        # De-duplicate while preserving order
        seen = set()
        out: List[str] = []
        for alias in aliases:
            if alias and alias not in seen:
                seen.add(alias)
                out.append(alias)
        return out

    def _is_manufacturer_match(self, manufacturer: Optional[str], aliases: List[str]) -> bool:
        """Strict manufacturer match guardrail to prevent token-hallucinated portfolio leakage."""
        if not manufacturer:
            return False
        m = self._normalize_company_text(manufacturer)
        if not m:
            return False
        return any(alias in m for alias in aliases if alias)

    def _therapeutic_keywords(self, therapeutic_area: Optional[str]) -> List[str]:
        """Map a broad therapeutic area to robust matching keywords."""
        if not therapeutic_area:
            return []
        area = therapeutic_area.strip().lower()
        if not area:
            return []

        keyword_map = {
            "respiratory": [
                "respiratory", "pulmonary", "asthma", "copd", "bronchodilator",
                "inhaler", "inhalation", "antiasthmatic", "anti asthmatic",
                "salbutamol", "levosalbutamol", "formoterol", "budesonide",
                "fluticasone", "ipratropium", "tiotropium", "montelukast",
            ],
            "cardiovascular": [
                "cardiovascular", "cardiac", "hypertension", "antihypertensive",
                "heart", "antianginal", "statin",
            ],
            "diabetes": [
                "diabetes", "antidiabetic", "hypoglycemic", "metformin", "insulin",
            ],
            "gastro": [
                "gastro", "gi", "gastric", "acid", "ulcer", "antiulcer", "antacid",
            ],
            "pain": [
                "pain", "analgesic", "anti-inflammatory", "anti inflammatory", "nsaid",
            ],
            "anti-infective": [
                "antiinfective", "anti-infective", "antibiotic", "antifungal", "antiviral",
                "infection",
            ],
            "cns": [
                "cns", "neurology", "psychiatric", "antidepressant", "antiepileptic", "anxiolytic",
            ],
        }

        if area in keyword_map:
            base = keyword_map[area]
        else:
            base = [area]

        # Keep deterministic order while removing duplicates.
        seen = set()
        ordered = []
        for kw in [area] + base:
            k = kw.strip().lower()
            if k and k not in seen:
                seen.add(k)
                ordered.append(k)
        return ordered

    def _score_product_match(self, product: Dict[str, Any], keywords: List[str]) -> int:
        """Score relevance of a product against therapeutic-area keywords."""
        if not keywords:
            return 0
        text_parts = [
            product.get("name") or "",
            product.get("generic_name") or "",
            product.get("therapeutic_class") or "",
            product.get("action_class") or "",
            product.get("description") or "",
        ]
        blob = " ".join(text_parts).lower()
        score = 0
        for kw in keywords:
            if kw and kw in blob:
                score += 1
        return score

    def _fetch_company_from_db(
        self,
        company_key: str,
        auth_token: Optional[str] = None
    ) -> Optional[Dict]:
        """Fetch company data from Supabase by key or partial name match."""
        if not company_key:
            return None

        cache_key = company_key.lower()
        if cache_key in self._company_cache:
            return self._company_cache[cache_key]

        client = self._get_supabase_client(auth_token)
        if not client:
            logger.warning("Supabase client not available")
            return None

        try:
            # Fetch company by key
            result = client.table("pharma_companies").select(
                "*, pharma_support_programs(*)"
            ).eq("company_key", company_key.lower()).eq("is_active", True).execute()

            if result.data and len(result.data) > 0:
                company = result.data[0]
                self._company_cache[company["company_key"]] = company
                return company

            # Try partial match on company name (raw input)
            result = client.table("pharma_companies").select(
                "*, pharma_support_programs(*)"
            ).ilike("company_name", f"%{company_key}%").eq("is_active", True).execute()

            if result.data and len(result.data) > 0:
                company = result.data[0]
                self._company_cache[company["company_key"]] = company
                return company

            # Try normalized-name matching (handles inputs like "sun_pharmaceutical_industries_ltd")
            normalized = self._normalize_company_text(company_key)
            if normalized:
                result = client.table("pharma_companies").select(
                    "*, pharma_support_programs(*)"
                ).ilike("company_name", f"%{normalized}%").eq("is_active", True).execute()
                if result.data and len(result.data) > 0:
                    company = result.data[0]
                    self._company_cache[company["company_key"]] = company
                    return company

                normalized_core = self._strip_legal_suffixes(normalized)
                if normalized_core and normalized_core != normalized:
                    result = client.table("pharma_companies").select(
                        "*, pharma_support_programs(*)"
                    ).ilike("company_name", f"%{normalized_core}%").eq("is_active", True).execute()
                    if result.data and len(result.data) > 0:
                        company = result.data[0]
                        self._company_cache[company["company_key"]] = company
                        return company

            return None
        except Exception as e:
            logger.error("Failed to fetch company from Supabase: %s", e)
            return None

    def _fetch_company_by_id(
        self,
        company_id: str,
        auth_token: Optional[str] = None
    ) -> Optional[Dict]:
        """Fetch company data from Supabase by company_id."""
        if not company_id:
            return None

        # Check cache first
        for cached in self._company_cache.values():
            if cached.get("id") == company_id:
                return cached

        client = self._get_supabase_client(auth_token)
        if not client:
            return None

        try:
            result = client.table("pharma_companies").select(
                "*, pharma_support_programs(*)"
            ).eq("id", company_id).eq("is_active", True).limit(1).execute()

            if result.data:
                company = result.data[0]
                self._company_cache[company["company_key"]] = company
                return company
            return None
        except Exception as e:
            logger.error("Failed to fetch company by id: %s", e)
            return None

    def _fetch_all_companies(self, auth_token: Optional[str] = None) -> List[Dict]:
        """Fetch all active companies from Supabase."""
        client = self._get_supabase_client(auth_token)
        if not client:
            return []

        try:
            result = client.table("pharma_companies").select(
                "company_key, company_name, focus_areas"
            ).eq("is_active", True).execute()

            return result.data or []
        except Exception as e:
            logger.error("Failed to fetch companies: %s", e)
            return []

    def get_active_company_context(
        self,
        user_id: str,
        auth_token: str
    ) -> Optional[Dict[str, Any]]:
        """Get active rep-mode company context for a user from Supabase."""
        if not user_id or not auth_token:
            return None

        client = self._get_supabase_client(auth_token)
        if not client:
            return None

        try:
            result = client.table("user_rep_sessions").select(
                "id, started_at, company_id, pharma_companies(*, pharma_support_programs(*))"
            ).eq("user_id", user_id).eq("is_active", True).order(
                "started_at", desc=True
            ).limit(1).execute()

            if not result.data:
                return None

            session = result.data[0]
            company = session.get("pharma_companies")
            if company:
                self._company_cache[company.get("company_key", "")] = company
                return company

            # Fallback: fetch by company_id if join wasn't returned
            company_id = session.get("company_id")
            return self._fetch_company_by_id(company_id, auth_token=auth_token)
        except Exception as e:
            logger.error("Failed to fetch active rep session: %s", e)
            return None

    def set_company_mode(
        self,
        user_id: str,
        auth_token: str,
        company_key: str
    ) -> Dict[str, Any]:
        """
        Activate brand-specific mode for a pharma company.
        Stores per-user rep mode in Supabase `user_rep_sessions`.
        """
        if not user_id or not auth_token:
            return {"success": False, "message": "Authentication required to enable rep mode."}

        company_key_lower = (company_key or "").lower().replace(" ", "_").replace("-", "_").strip()
        if not company_key_lower:
            return {"success": False, "message": "Company name required."}

        company = self._fetch_company_from_db(company_key_lower, auth_token=auth_token)

        if company:
            client = self._get_supabase_client(auth_token)
            if not client:
                return {"success": False, "message": "Database connection not available."}

            # End any existing rep sessions for this user
            now = datetime.now(timezone.utc).isoformat()
            try:
                client.table("user_rep_sessions").update({
                    "is_active": False,
                    "ended_at": now,
                }).eq("user_id", user_id).eq("is_active", True).execute()
            except Exception as e:
                logger.warning("Failed to end previous rep sessions: %s", e)
                # Fallback: If 409 Conflict/Unique violation, it means there's a restrictive constraint
                # prohibiting multiple inactive sessions. We delete old history to fix it.
                if "409" in str(e) or "23505" in str(e) or "constraint" in str(e).lower():
                    logger.info("Applying auto-fix: cleaning up old rep session history")
                    try:
                        # Delete all inactive sessions for this user to make room
                        client.table("user_rep_sessions").delete().eq("user_id", user_id).eq("is_active", False).execute()
                        # Retry the update
                        client.table("user_rep_sessions").update({
                            "is_active": False,
                            "ended_at": now,
                        }).eq("user_id", user_id).eq("is_active", True).execute()
                    except Exception as retry_e:
                        logger.error("Auto-fix failed: %s", retry_e)

            # Start new rep session
            try:
                client.table("user_rep_sessions").insert({
                    "user_id": user_id,
                    "company_id": company.get("id"),
                    "is_active": True,
                }).execute()
            except Exception as e:
                logger.error("Failed to start rep session: %s", e)
                return {"success": False, "message": "Failed to activate rep mode. Please try again."}

            logger.info("Activated pharma rep mode for: %s", company.get('company_name'))

            focus_areas = self._parse_json_field(company.get("focus_areas", []))

            return {
                "success": True,
                "company": company.get("company_name"),
                "company_key": company.get("company_key"),
                "focus_areas": focus_areas if isinstance(focus_areas, list) else [],
                "message": f"Now representing {company.get('company_name')}. I'll prioritize their products when relevant.",
                "data_source": company.get("data_source", "Company website")
            }

        # Company not found - list available ones
        available = self._fetch_all_companies(auth_token=auth_token)
        available_keys = [c["company_key"] for c in available]

        return {
            "success": False,
            "available_companies": available_keys,
            "message": f"Company '{company_key}' not found. Available: {', '.join(available_keys)}"
        }

    def clear_company_mode(self, user_id: str, auth_token: str) -> Dict[str, Any]:
        """Deactivate brand-specific mode for a user (ends active rep session)."""
        if not user_id or not auth_token:
            return {"success": False, "message": "Authentication required to clear rep mode."}

        active_company = self.get_active_company_context(user_id, auth_token)
        company_name = active_company.get("company_name") if active_company else None

        client = self._get_supabase_client(auth_token)
        if not client:
            return {"success": False, "message": "Database connection not available."}

        now = datetime.now(timezone.utc).isoformat()
        try:
            client.table("user_rep_sessions").update({
                "is_active": False,
                "ended_at": now,
            }).eq("user_id", user_id).eq("is_active", True).execute()
        except Exception as e:
            logger.error("Failed to clear rep sessions: %s", e)
            return {"success": False, "message": "Failed to clear rep mode. Please try again."}

        if company_name:
            return {"success": True, "message": f"Deactivated {company_name} rep mode. Now in general mode."}
        return {"success": True, "message": "Already in general mode."}

    def get_available_companies(self, auth_token: str) -> List[Dict[str, str]]:
        """Get list of available companies for rep mode from database."""
        companies = self._fetch_all_companies(auth_token=auth_token)

        result = []
        for company in companies:
            focus_areas = self._parse_json_field(company.get("focus_areas", []))
            if not isinstance(focus_areas, list):
                focus_areas = []

            result.append({
                "key": company["company_key"],
                "name": company["company_name"],
                "focus": ", ".join(focus_areas[:3]) if focus_areas else "N/A"
            })

        return result

    def get_company_products(
        self,
        company_key: str,
        therapeutic_area: Optional[str] = None,
        limit: int = 15,
        auth_token: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Get REAL products from Turso database by manufacturer name.

        This actually queries the 250K drug database to find products
        made by the specified company.
        """
        if not company_key:
            return []

        # Get company data - FIXED: now passes auth_token
        company_data = self._company_cache.get(company_key) or self._fetch_company_from_db(
            company_key,
            auth_token=auth_token
        )
        if not company_data:
            logger.warning("Company not found for product lookup: %s", company_key)
            return []

        cache_key = f"{company_key}:{therapeutic_area or 'all'}"
        if cache_key in self._product_cache:
            return self._product_cache[cache_key]

        try:
            conn = turso_service.get_connection()
            if not conn:
                logger.warning("Turso connection not available for product lookup")
                return []

            # Build strict manufacturer aliases from company metadata.
            company_name = company_data.get("company_name", "")
            manufacturer_aliases = self._build_manufacturer_aliases(company_key, company_name)
            if not manufacturer_aliases:
                logger.warning("No safe manufacturer aliases for %s", company_key)
                return []

            # Query with multiple name variations.
            # Pull action_class + description so therapeutic matching can use fallback scoring.
            select_clause = """
                SELECT DISTINCT name, generic_name, therapeutic_class, action_class, description, price_raw, price, manufacturer
            """
            manufacturer_filters = " OR ".join(
                ["LOWER(COALESCE(manufacturer, '')) LIKE LOWER(?)" for _ in manufacturer_aliases]
            )
            manufacturer_where = f"""
                FROM drugs
                WHERE ({manufacturer_filters})
                AND COALESCE(is_discontinued, 0) = 0
            """
            base_params: List[Any] = [f"%{alias}%" for alias in manufacturer_aliases]

            def _rows_to_products(rows) -> List[Dict[str, Any]]:
                return [
                    {
                        "name": row[0],
                        "generic_name": row[1],
                        "therapeutic_class": row[2],
                        "action_class": row[3],
                        "description": row[4],
                        "price_raw": row[5],
                        "price": row[6],
                        "manufacturer": row[7],
                    }
                    for row in rows
                ]

            products: List[Dict[str, Any]] = []
            area_keywords = self._therapeutic_keywords(therapeutic_area)

            if area_keywords:
                # Stage 1: keyword-aware SQL matching across multiple columns.
                clause_parts = []
                filter_params: List[Any] = []
                for kw in area_keywords:
                    like = f"%{kw}%"
                    clause_parts.append(
                        "("
                        "LOWER(therapeutic_class) LIKE LOWER(?) OR "
                        "LOWER(action_class) LIKE LOWER(?) OR "
                        "LOWER(generic_name) LIKE LOWER(?) OR "
                        "LOWER(name) LIKE LOWER(?) OR "
                        "LOWER(description) LIKE LOWER(?)"
                        ")"
                    )
                    filter_params.extend([like, like, like, like, like])

                query = (
                    select_clause
                    + manufacturer_where
                    + " AND ("
                    + " OR ".join(clause_parts)
                    + ") ORDER BY name LIMIT ?"
                )
                rs = conn.execute(query, [*base_params, *filter_params, max(limit * 4, 40)])
                products = _rows_to_products(rs.rows)
                products = [p for p in products if self._is_manufacturer_match(p.get("manufacturer"), manufacturer_aliases)]
                logger.info("Product lookup stage1 (manufacturer+area) for %s: %d rows", company_key, len(products))

            if not products:
                # Stage 2 fallback: fetch broader company catalog and rank in Python.
                rs = conn.execute(
                    select_clause + manufacturer_where + " ORDER BY name LIMIT ?",
                    [*base_params, max(limit * 12, 120)]
                )
                broader = _rows_to_products(rs.rows)
                broader = [p for p in broader if self._is_manufacturer_match(p.get("manufacturer"), manufacturer_aliases)]
                logger.info("Product lookup stage2 (manufacturer broad) for %s: %d rows", company_key, len(broader))
                if area_keywords:
                    ranked = sorted(
                        (
                            (self._score_product_match(p, area_keywords), p)
                            for p in broader
                        ),
                        key=lambda x: x[0],
                        reverse=True
                    )
                    products = [p for score, p in ranked if score > 0]
                else:
                    products = broader

            if not products:
                logger.info(
                    "No manufacturer-verified products found for %s (aliases=%s)",
                    company_key,
                    manufacturer_aliases,
                )

            products = products[:limit]

            logger.info("Found %d products for %s", len(products), company_key)

            if products:
                self._product_cache[cache_key] = products

            return products

        except Exception as e:
            logger.error("Failed to fetch company products from Turso: %s", e)
            return []

    def get_support_programs(
        self,
        company_key: str,
        auth_token: Optional[str] = None
    ) -> Dict[str, Any]:
        """Get support programs from Supabase database."""
        if not company_key:
            return {"error": "Company key required"}

        company_data = self._company_cache.get(company_key) or self._fetch_company_from_db(
            company_key,
            auth_token=auth_token
        )
        if not company_data:
            return {"error": f"Company {company_key} not found in database"}

        # Programs are fetched with company data via join
        programs = company_data.get("pharma_support_programs", [])

        # Organize by type
        organized: Dict[str, List[Dict]] = {}
        for prog in programs:
            if prog.get("is_active"):
                prog_type = prog.get("program_type", "other")
                if prog_type not in organized:
                    organized[prog_type] = []
                organized[prog_type].append({
                    "name": prog.get("program_name"),
                    "description": prog.get("description"),
                    "contact": prog.get("contact_info"),
                    "website": prog.get("website"),
                    "verified": prog.get("is_verified", False),
                    "data_source": prog.get("data_source")
                })

        return {
            "company": company_data.get("company_name"),
            "programs": organized,
            "medical_affairs_contact": company_data.get("medical_affairs_email", ""),
            "total_programs": sum(len(v) for v in organized.values())
        }

    def get_company_differentiators(
        self,
        company_key: str,
        auth_token: Optional[str] = None
    ) -> List[str]:
        """Get key differentiators from database."""
        if not company_key:
            return []

        company_data = self._company_cache.get(company_key) or self._fetch_company_from_db(
            company_key,
            auth_token=auth_token
        )
        if not company_data:
            return []

        differentiators = self._parse_json_field(company_data.get("differentiators", []))
        return differentiators if isinstance(differentiators, list) else []

    def generate_rep_system_prompt(self, company: Optional[Dict[str, Any]]) -> str:
        """Generate a modified system prompt for brand mode using database data."""
        if not company:
            return ""

        # Parse JSON fields
        focus_areas = self._parse_json_field(company.get("focus_areas", []))
        differentiators = self._parse_json_field(company.get("differentiators", []))

        if not isinstance(focus_areas, list):
            focus_areas = []
        if not isinstance(differentiators, list):
            differentiators = []

        diff_str = "\n".join([f"  - {d}" for d in differentiators]) if differentiators else "  - Contact company for details"

        # Get support programs
        programs = company.get("pharma_support_programs", [])
        support_str = ""
        for prog in programs:
            if prog.get("is_active"):
                verified = "✓" if prog.get("is_verified") else "?"
                support_str += f"\n  - [{verified}] {prog.get('program_name', 'N/A')}: {prog.get('description', '')}"

        company_name = company.get('company_name', 'Unknown')

        return f"""
[BRAND MODE ACTIVE: {company_name}]

You are now acting as a digital medical representative for {company_name}.

COMPANY OVERVIEW:
{company.get('description', 'N/A')}

THERAPEUTIC FOCUS AREAS:
{', '.join(focus_areas) if focus_areas else 'N/A'}

COMPANY DIFFERENTIATORS:
{diff_str}

SUPPORT PROGRAMS:{support_str if support_str else chr(10) + '  - Contact company for available programs'}

MEDICAL AFFAIRS CONTACT: {company.get('medical_affairs_email', 'Contact local representative')}

DATA SOURCES:
- Company info: {company.get('data_source', 'Company website/Annual report')}
- Products: Turso Drug Database (250K+ Indian drugs)

INSTRUCTIONS FOR BRAND MODE:
1. When asked about drugs in {company_name}'s focus areas, prioritize their products.
2. Highlight company products when clinically appropriate.
3. MAINTAIN CLINICAL OBJECTIVITY - never oversell or make false claims.
4. Be knowledgeable about competitor products but focus on company's portfolio.
5. When asked "why should I prescribe X?", provide evidence-based differentiation.
6. Direct HCPs to company support programs when relevant.
7. For medical/scientific queries, mention contacting Medical Affairs.
8. Use ONLY facts present in the provided company/product/support context. If a fact is not in context, say it is unavailable.
9. Do not include bracket tags like [Web Result], [Source], [Company Info] in the final answer.
10. Do not pull in web-only company profile claims unless the user explicitly asks for latest web update.

Remember: You represent {company_name}, but patient safety and clinical accuracy always come first.
"""

    def format_company_context_for_llm(self, company: Optional[Dict[str, Any]]) -> str:
        """Format company context for inclusion in LLM prompt."""
        if not company:
            return ""

        focus_areas = self._parse_json_field(company.get("focus_areas", []))
        if not isinstance(focus_areas, list):
            focus_areas = []

        company_name = company.get('company_name', 'Unknown')

        lines = [
            f"\n[{company_name} - Digital Rep Mode]",
            f"Focus Areas: {', '.join(focus_areas) if focus_areas else 'N/A'}",
            f"Data Source: {company.get('data_source', 'Company records')}",
            f"Medical Affairs: {company.get('medical_affairs_email', 'Contact local rep')}"
        ]

        return "\n".join(lines)

    def format_products_for_llm(self, products: List[Dict[str, Any]], company_name: str) -> str:
        """Format product list for LLM context."""
        if not products:
            return ""

        lines = [
            f"\n[{company_name} Products from Database]",
            "[INSTRUCTION: Use ONLY the product names listed below for company portfolio answers. "
            "Do NOT add unlisted brands, competitor products, doses, or prices. "
            "These rows are manufacturer-verified.]"
        ]
        for p in products[:10]:  # Limit to 10 products in context
            price = p.get('price_raw') or f"Rs. {p.get('price', 'N/A')}"
            lines.append(
                f"- {p.get('name')}: {p.get('generic_name', 'N/A')} | "
                f"{p.get('therapeutic_class', 'N/A')} | {price} | "
                f"Manufacturer: {p.get('manufacturer', 'N/A')}"
            )

        if len(products) > 10:
            lines.append(f"  ... and {len(products) - 10} more products")

        return "\n".join(lines)

    def format_support_programs_for_llm(self, programs_data: Dict[str, Any]) -> str:
        """Format support programs for LLM context."""
        if not programs_data or programs_data.get("error"):
            return ""

        programs = programs_data.get("programs", {})
        if not programs:
            return ""

        company = programs_data.get("company", "Company")
        lines = [f"\n[{company} Support Programs]"]

        for prog_type, prog_list in programs.items():
            type_name = prog_type.replace("_", " ").title()
            for p in prog_list:
                verified = "✓" if p.get("verified") else ""
                lines.append(f"- [{type_name}] {p.get('name')}{verified}: {p.get('description', 'N/A')}")
                if p.get("contact"):
                    lines.append(f"  Contact: {p.get('contact')}")

        return "\n".join(lines)


# Singleton instance
pharma_rep_service = PharmaRepService()


# Convenience functions
def set_rep_mode(user_id: str, auth_token: str, company: str) -> Dict[str, Any]:
    """Set rep mode for a user."""
    return pharma_rep_service.set_company_mode(user_id, auth_token, company)


def clear_rep_mode(user_id: str, auth_token: str) -> Dict[str, Any]:
    """Clear rep mode for a user."""
    return pharma_rep_service.clear_company_mode(user_id, auth_token)


def get_available_companies(auth_token: str) -> List[Dict[str, str]]:
    """Get available companies."""
    return pharma_rep_service.get_available_companies(auth_token)
