"""
Therapeutic Comparison Service - Find and compare drugs in the same class.

This addresses Track 2 requirement:
"how it differentiates from existing therapies"

Data Sources:
- Turso DB (local): therapeutic_class field, price comparison
- RxClass API (FREE): Drug classification, class members

"""
import asyncio
import logging
import httpx
import time
from typing import Optional, Dict, Any, List, Tuple

from config import RXCLASS_BASE_URL
from services import turso_service

logger = logging.getLogger(__name__)

# Cache TTL in seconds (1 hour)
_CACHE_TTL = 3600

# Mapping from common drug class names to RxClass API names
# RxClass requires specific names - this maps user-friendly to API-compatible
CLASS_NAME_MAP = {
    # Cardiovascular
    "ace inhibitor": "Angiotensin-converting Enzyme Inhibitors",
    "ace inhibitors": "Angiotensin-converting Enzyme Inhibitors",
    "arb": "Angiotensin 2 Receptor Blockers",
    "arbs": "Angiotensin 2 Receptor Blockers",
    "angiotensin receptor blocker": "Angiotensin 2 Receptor Blockers",
    "beta blocker": "Beta-Adrenergic Blocking Agents",
    "beta blockers": "Beta-Adrenergic Blocking Agents",
    "calcium channel blocker": "Calcium Channel Blocking Agents",
    "ccb": "Calcium Channel Blocking Agents",
    "statin": "HMG-CoA Reductase Inhibitors",
    "statins": "HMG-CoA Reductase Inhibitors",
    "diuretic": "Diuretics",
    "diuretics": "Diuretics",
    "anticoagulant": "Anticoagulants",
    "anticoagulants": "Anticoagulants",
    "antiplatelet": "Platelet Aggregation Inhibitors",
    "antiplatelets": "Platelet Aggregation Inhibitors",
    # Diabetes
    "biguanide": "Biguanides",
    "biguanides": "Biguanides",
    "sulfonylurea": "Sulfonylureas",
    "sulfonylureas": "Sulfonylureas",
    "sglt2 inhibitor": "Sodium-Glucose Transporter 2 Inhibitors",
    "dpp-4 inhibitor": "Dipeptidyl Peptidase 4 Inhibitors",
    "glp-1 agonist": "Glucagon-like Peptide-1 Agonists",
    # CNS
    "ssri": "Serotonin Reuptake Inhibitors",
    "ssris": "Serotonin Reuptake Inhibitors",
    "snri": "Serotonin and Norepinephrine Reuptake Inhibitors",
    "snris": "Serotonin and Norepinephrine Reuptake Inhibitors",
    "antidepressant": "Antidepressants",
    "antidepressants": "Antidepressants",
    "antipsychotic": "Antipsychotics",
    "antipsychotics": "Antipsychotics",
    "benzodiazepine": "Benzodiazepines",
    "benzodiazepines": "Benzodiazepines",
    "anticonvulsant": "Anticonvulsants",
    "anticonvulsants": "Anticonvulsants",
    # Pain/Inflammation
    "nsaid": "Nonsteroidal Anti-inflammatory Drugs",
    "nsaids": "Nonsteroidal Anti-inflammatory Drugs",
    "opioid": "Opioid Agonists",
    "opioids": "Opioid Agonists",
    "corticosteroid": "Corticosteroids",
    "corticosteroids": "Corticosteroids",
    # Anti-infective
    "antibiotic": "Antibiotics",
    "antibiotics": "Antibiotics",
    "fluoroquinolone": "Fluoroquinolones",
    "fluoroquinolones": "Fluoroquinolones",
    "macrolide": "Macrolides",
    "macrolides": "Macrolides",
    "penicillin": "Penicillins",
    "penicillins": "Penicillins",
    "cephalosporin": "Cephalosporins",
    "cephalosporins": "Cephalosporins",
    # Respiratory
    "bronchodilator": "Bronchodilators",
    "bronchodilators": "Bronchodilators",
    "antihistamine": "Histamine-1 Receptor Antagonists",
    "antihistamines": "Histamine-1 Receptor Antagonists",
    # GI
    "ppi": "Proton Pump Inhibitors",
    "ppis": "Proton Pump Inhibitors",
    "proton pump inhibitor": "Proton Pump Inhibitors",
    "h2 blocker": "Histamine-2 Receptor Antagonists",
    "h2 blockers": "Histamine-2 Receptor Antagonists",
}


class TherapeuticComparisonService:
    """Service for comparing drugs within therapeutic classes."""

    def __init__(self):
        # Cache format: {key: (timestamp, data)}
        self._cache: Dict[str, Tuple[float, Any]] = {}

    def _get_cached(self, key: str) -> Optional[Any]:
        """Get cached value if not expired."""
        if key in self._cache:
            timestamp, data = self._cache[key]
            if time.time() - timestamp < _CACHE_TTL:
                return data
            # Expired, remove it
            del self._cache[key]
        return None

    def _set_cached(self, key: str, data: Any) -> None:
        """Set cached value with timestamp."""
        self._cache[key] = (time.time(), data)

    async def get_therapeutic_alternatives(
        self,
        drug_name: str,
        limit: int = 5
    ) -> Dict[str, Any]:
        """
        Find drugs in the same therapeutic class for comparison.

        Args:
            drug_name: Name of the drug to find alternatives for
            limit: Maximum number of alternatives to return

        Returns:
            Dict with original drug info, alternatives, and comparison factors
        """
        if not drug_name:
            return {"error": "Drug name required"}

        cache_key = f"comparison:{drug_name.lower()}:{limit}"
        cached = self._get_cached(cache_key)
        if cached:
            return cached

        results = {
            "original_drug": drug_name,
            "therapeutic_class": "",
            "original_price": None,
            "original_generic": "",
            "alternatives": [],
            "comparison_factors": [],
            "sources": []
        }

        # 1. Get original drug info from Turso
        try:
            drug_data = await asyncio.to_thread(
                turso_service.get_drug_by_name, drug_name
            )
            if drug_data:
                results["therapeutic_class"] = drug_data.get("therapeutic_class", "")
                results["original_price"] = drug_data.get("price")
                results["original_generic"] = drug_data.get("generic_name", "")
                results["original_manufacturer"] = drug_data.get("manufacturer", "")
        except Exception as e:
            logger.warning(f"Failed to get drug data from Turso: {e}")

        # 2. Find alternatives from same class in Turso (local, fast)
        if results["therapeutic_class"]:
            local_alts = await self._find_local_alternatives(
                results["therapeutic_class"],
                drug_name,
                results.get("original_generic", ""),
                limit
            )
            results["alternatives"].extend(local_alts)
            if local_alts:
                results["sources"].append("Database")

        # 3. Supplement with RxClass data (external API)
        if len(results["alternatives"]) < limit:
            rxclass_alts = await self._find_rxclass_alternatives(
                drug_name,
                limit - len(results["alternatives"])
            )
            # Avoid duplicates
            existing_names = {a["name"].lower() for a in results["alternatives"]}
            for alt in rxclass_alts:
                if alt["name"].lower() not in existing_names:
                    results["alternatives"].append(alt)
                    existing_names.add(alt["name"].lower())

            if rxclass_alts:
                results["sources"].append("RxClass")

        # 4. Generate comparison factors with ACTUAL data
        results["comparison_factors"] = self._generate_comparison_factors(
            drug_name,
            results["alternatives"],
            results.get("original_price")
        )

        # Cache results (with TTL)
        if results["alternatives"]:
            self._set_cached(cache_key, results)

        return results

    async def _find_local_alternatives(
        self,
        therapeutic_class: str,
        exclude_drug: str,
        generic_name: str,
        limit: int
    ) -> List[Dict[str, Any]]:
        """Find alternatives from Turso database."""
        try:
            conn = turso_service.get_connection()
            if not conn:
                return []

            # Strategy 1: Same therapeutic class, different drug
            # Use LIKE for case-insensitive and partial matching
            rs = conn.execute(
                """
                SELECT name, generic_name, manufacturer, price, therapeutic_class
                FROM drugs
                WHERE LOWER(therapeutic_class) LIKE LOWER(?)
                  AND LOWER(name) != LOWER(?)
                  AND price IS NOT NULL
                ORDER BY price ASC
                LIMIT ?
                """,
                (f"%{therapeutic_class}%", exclude_drug, limit)
            )

            alternatives = []
            for row in rs.rows:
                alternatives.append({
                    "name": row[0],
                    "generic_name": row[1],
                    "manufacturer": row[2],
                    "price": row[3],
                    "therapeutic_class": row[4],
                    "source": "Database",
                    "comparison_type": "Same therapeutic class"
                })

            # Strategy 2: If we have generic name, find same generic different brand
            if len(alternatives) < limit and generic_name:
                rs2 = conn.execute(
                    """
                    SELECT name, generic_name, manufacturer, price, therapeutic_class
                    FROM drugs
                    WHERE LOWER(generic_name) = LOWER(?)
                      AND LOWER(name) != LOWER(?)
                      AND price IS NOT NULL
                    ORDER BY price ASC
                    LIMIT ?
                    """,
                    (generic_name, exclude_drug, limit - len(alternatives))
                )

                seen_names = {a["name"].lower() for a in alternatives}
                for row in rs2.rows:
                    if row[0].lower() not in seen_names:
                        alternatives.append({
                            "name": row[0],
                            "generic_name": row[1],
                            "manufacturer": row[2],
                            "price": row[3],
                            "therapeutic_class": row[4],
                            "source": "Database",
                            "comparison_type": "Same generic (different brand)"
                        })
                        seen_names.add(row[0].lower())

            return alternatives[:limit]

        except Exception as e:
            logger.warning(f"Local alternatives search failed: {e}")
            return []

    async def _find_rxclass_alternatives(
        self,
        drug_name: str,
        limit: int
    ) -> List[Dict[str, Any]]:
        """Find alternatives from RxClass API (FREE, no license)."""
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                # Get drug's therapeutic class from RxClass
                class_response = await client.get(
                    f"{RXCLASS_BASE_URL}/class/byDrugName.json",
                    params={
                        "drugName": drug_name,
                        "relaSource": "ATC"  # ATC gives therapeutic classification
                    }
                )

                if class_response.status_code != 200:
                    return []

                class_data = class_response.json()
                classes = class_data.get("rxclassDrugInfoList", {}).get("rxclassDrugInfo", [])

                if not classes:
                    # Try MEDRT as fallback
                    class_response = await client.get(
                        f"{RXCLASS_BASE_URL}/class/byDrugName.json",
                        params={
                            "drugName": drug_name,
                            "relaSource": "MEDRT"
                        }
                    )
                    if class_response.status_code == 200:
                        class_data = class_response.json()
                        classes = class_data.get("rxclassDrugInfoList", {}).get("rxclassDrugInfo", [])

                if not classes:
                    return []

                # Get first class ID
                class_info = classes[0].get("rxclassMinConceptItem", {})
                class_id = class_info.get("classId")
                class_name = class_info.get("className", "")

                if not class_id:
                    return []

                # Get class members (drugs in same class)
                members_response = await client.get(
                    f"{RXCLASS_BASE_URL}/classMembers.json",
                    params={
                        "classId": class_id,
                        "relaSource": "ATC"
                    }
                )

                if members_response.status_code != 200:
                    return []

                members_data = members_response.json()
                members = members_data.get("drugMemberGroup", {}).get("drugMember", [])

                alternatives = []
                drug_lower = drug_name.lower()

                for member in members:
                    member_name = member.get("minConcept", {}).get("name", "")
                    if member_name and member_name.lower() != drug_lower:
                        alternatives.append({
                            "name": member_name,
                            "generic_name": member_name,  # RxNorm uses generic names
                            "therapeutic_class": class_name,
                            "source": "RxClass",
                            "comparison_type": f"Same class: {class_name}"
                        })

                        if len(alternatives) >= limit:
                            break

                return alternatives

        except Exception as e:
            logger.warning(f"RxClass alternatives search failed: {e}")
            return []

    def _generate_comparison_factors(
        self,
        original_drug: str,
        alternatives: List[Dict],
        original_price: Optional[float] = None
    ) -> List[Dict[str, Any]]:
        """
        Generate ACTUAL comparison factors based on the data we have.

        This now uses the alternatives data to provide real comparisons,
        not just generic guidance.
        """
        factors = []

        # 1. PRICE COMPARISON - This we can actually calculate
        if original_price and alternatives:
            prices_with_data = [a for a in alternatives if a.get("price")]
            if prices_with_data:
                cheapest = min(prices_with_data, key=lambda x: x["price"])
                most_expensive = max(prices_with_data, key=lambda x: x["price"])

                if cheapest["price"] < original_price:
                    savings_pct = round((1 - cheapest["price"] / original_price) * 100)
                    factors.append({
                        "factor": "Cost Savings Available",
                        "description": f"{cheapest['name']} is {savings_pct}% cheaper (Rs. {cheapest['price']} vs Rs. {original_price})",
                        "actionable": True,
                        "alternative": cheapest["name"],
                        "savings_percent": savings_pct
                    })
                elif original_price < cheapest["price"]:
                    factors.append({
                        "factor": "Cost",
                        "description": f"{original_drug} is already the most affordable option in this class",
                        "actionable": False
                    })

        # 2. GENERIC AVAILABILITY
        generics = [a for a in alternatives if a.get("comparison_type") == "Same generic (different brand)"]
        if generics:
            cheapest_generic = min(generics, key=lambda x: x.get("price", float("inf")))
            factors.append({
                "factor": "Generic Alternatives",
                "description": f"{len(generics)} same-generic alternatives found. Cheapest: {cheapest_generic['name']} (Rs. {cheapest_generic.get('price', 'N/A')})",
                "actionable": True,
                "count": len(generics)
            })

        # 3. MANUFACTURER DIVERSITY
        manufacturers = set(a.get("manufacturer") for a in alternatives if a.get("manufacturer"))
        if len(manufacturers) > 1:
            factors.append({
                "factor": "Multiple Manufacturers",
                "description": f"Available from {len(manufacturers)} different manufacturers: {', '.join(list(manufacturers)[:3])}{'...' if len(manufacturers) > 3 else ''}",
                "actionable": False,
                "count": len(manufacturers)
            })

        # 4. Standard guidance factors (only if we couldn't generate specific ones)
        if len(factors) < 2:
            factors.extend([
                {
                    "factor": "Efficacy",
                    "description": "Compare clinical trial outcomes between alternatives",
                    "actionable": False,
                    "how_to_evaluate": "Check published studies, meta-analyses"
                },
                {
                    "factor": "Safety Profile",
                    "description": "Review side effect frequency and severity",
                    "actionable": False,
                    "how_to_evaluate": "Check adverse event data, black box warnings"
                }
            ])

        return factors

    async def get_class_members(self, class_name: str, limit: int = 10) -> List[Dict[str, Any]]:
        """
        Get all drugs in a therapeutic class.

        Uses RxClass API with automatic mapping from common names
        (e.g., "ACE inhibitors") to API names.

        Strategy:
        1. Map user's class name to API-compatible name
        2. Search for class in multiple sources (VA, ATC, MEDRT)
        3. Get members with the correct relaSource
        """
        try:
            # Map common name to API-compatible name
            api_class_name = CLASS_NAME_MAP.get(class_name.lower(), class_name)
            logger.info(f"Looking up class: '{class_name}' -> '{api_class_name}'")

            async with httpx.AsyncClient(timeout=15.0) as client:
                # Try multiple class sources - VA classes have good drug membership
                sources_to_try = [
                    ("VA", None),  # VA drug classifications
                    ("ATC", "ATC"),  # ATC therapeutic classification
                    ("MEDRT", "MEDRT"),  # MEDRT mechanisms
                ]

                for rela_source, member_source in sources_to_try:
                    # Search for class by name
                    search_response = await client.get(
                        f"{RXCLASS_BASE_URL}/class/byName.json",
                        params={"className": api_class_name}
                    )

                    if search_response.status_code != 200:
                        continue

                    search_data = search_response.json()
                    classes = search_data.get("rxclassMinConceptList", {}).get("rxclassMinConcept", [])

                    # Find class matching our preferred source
                    class_info = None
                    for cls in classes:
                        if cls.get("classType") == rela_source or not class_info:
                            class_info = cls
                            if cls.get("classType") == rela_source:
                                break

                    if not class_info:
                        continue

                    class_id = class_info.get("classId")
                    class_type = class_info.get("classType")

                    # Get members with appropriate relaSource
                    params = {"classId": class_id}
                    if member_source:
                        params["relaSource"] = member_source

                    members_response = await client.get(
                        f"{RXCLASS_BASE_URL}/classMembers.json",
                        params=params
                    )

                    if members_response.status_code != 200:
                        continue

                    members_data = members_response.json()
                    members = members_data.get("drugMemberGroup", {}).get("drugMember", [])

                    if members:
                        # Deduplicate by extracting unique drug names (not formulations)
                        seen_drugs = set()
                        unique_members = []
                        for m in members:
                            name = m.get("minConcept", {}).get("name", "")
                            # Extract base drug name (before dosage/formulation)
                            base_name = name.split()[0].lower() if name else ""
                            if base_name and base_name not in seen_drugs:
                                seen_drugs.add(base_name)
                                unique_members.append({
                                    "name": name.split()[0] if " " in name else name,  # Just drug name
                                    "full_name": name,
                                    "rxcui": m.get("minConcept", {}).get("rxcui", ""),
                                    "source": class_type
                                })
                                if len(unique_members) >= limit:
                                    break

                        if unique_members:
                            logger.info(f"Found {len(unique_members)} drugs in class {api_class_name}")
                            return unique_members

                # If direct class search fails, try finding class through a known example drug
                example_drugs = self._get_example_drug_for_class(class_name.lower())
                for drug in example_drugs:
                    members = await self._get_class_via_drug(client, drug, limit)
                    if members:
                        return members

                return []

        except Exception as e:
            logger.warning(f"Failed to get class members: {e}")
            return []

    def _get_example_drug_for_class(self, class_name: str) -> List[str]:
        """Get example drugs for a class to use as lookup helpers."""
        examples = {
            "ace inhibitor": ["lisinopril", "enalapril", "ramipril"],
            "ace inhibitors": ["lisinopril", "enalapril", "ramipril"],
            "statin": ["atorvastatin", "simvastatin", "rosuvastatin"],
            "statins": ["atorvastatin", "simvastatin", "rosuvastatin"],
            "beta blocker": ["metoprolol", "atenolol", "propranolol"],
            "beta blockers": ["metoprolol", "atenolol", "propranolol"],
            "ssri": ["sertraline", "fluoxetine", "escitalopram"],
            "ssris": ["sertraline", "fluoxetine", "escitalopram"],
            "nsaid": ["ibuprofen", "naproxen", "diclofenac"],
            "nsaids": ["ibuprofen", "naproxen", "diclofenac"],
            "ppi": ["omeprazole", "pantoprazole", "esomeprazole"],
            "ppis": ["omeprazole", "pantoprazole", "esomeprazole"],
            "arb": ["losartan", "valsartan", "irbesartan"],
            "arbs": ["losartan", "valsartan", "irbesartan"],
        }
        return examples.get(class_name, [])

    async def _get_class_via_drug(
        self,
        client: httpx.AsyncClient,
        drug_name: str,
        limit: int
    ) -> List[Dict[str, Any]]:
        """Get class members by first finding the class through a known drug."""
        try:
            # Get drug's class
            response = await client.get(
                f"{RXCLASS_BASE_URL}/class/byDrugName.json",
                params={"drugName": drug_name, "relaSource": "ATC"}
            )

            if response.status_code != 200:
                return []

            data = response.json()
            classes = data.get("rxclassDrugInfoList", {}).get("rxclassDrugInfo", [])

            if not classes:
                return []

            # Get the class ID
            class_info = classes[0].get("rxclassMinConceptItem", {})
            class_id = class_info.get("classId")
            class_name = class_info.get("className", "")

            if not class_id:
                return []

            # Get class members
            members_response = await client.get(
                f"{RXCLASS_BASE_URL}/classMembers.json",
                params={"classId": class_id, "relaSource": "ATC"}
            )

            if members_response.status_code != 200:
                return []

            members_data = members_response.json()
            members = members_data.get("drugMemberGroup", {}).get("drugMember", [])

            # Deduplicate
            seen = set()
            unique = []
            for m in members:
                name = m.get("minConcept", {}).get("name", "")
                if name and name.lower() not in seen:
                    seen.add(name.lower())
                    unique.append({
                        "name": name,
                        "rxcui": m.get("minConcept", {}).get("rxcui", ""),
                        "source": "ATC"
                    })
                    if len(unique) >= limit:
                        break

            return unique

        except Exception as e:
            logger.warning(f"Failed to get class via drug {drug_name}: {e}")
            return []

    def format_for_llm(self, comparison_data: Dict) -> str:
        """Format comparison data for LLM context."""
        if not comparison_data or comparison_data.get("error"):
            return ""

        lines = [
            f"\n[Therapeutic Comparison: {comparison_data['original_drug']}]",
            f"Therapeutic Class: {comparison_data.get('therapeutic_class', 'Unknown')}",
            f"Generic Name: {comparison_data.get('original_generic', 'N/A')}",
        ]

        if comparison_data.get("original_price"):
            lines.append(f"Original Price: Rs. {comparison_data['original_price']}")

        alternatives = comparison_data.get("alternatives", [])
        if alternatives:
            lines.append("\nAlternatives in same class:")
            for alt in alternatives[:5]:
                price_str = f"Rs. {alt['price']}" if alt.get('price') else "Price N/A"
                lines.append(
                    f"- {alt['name']} ({alt.get('generic_name', 'N/A')}) - {price_str} "
                    f"[{alt.get('comparison_type', 'Same class')}]"
                )

        # Show actionable insights first, then general factors
        factors = comparison_data.get("comparison_factors", [])
        actionable = [f for f in factors if f.get("actionable")]
        general = [f for f in factors if not f.get("actionable")]

        if actionable:
            lines.append("\nKey Insights:")
            for factor in actionable:
                if factor.get("savings_percent"):
                    lines.append(f"  * SAVINGS: {factor['description']}")
                else:
                    lines.append(f"  * {factor['factor']}: {factor['description']}")

        if general:
            lines.append("\nConsiderations:")
            for factor in general[:3]:
                lines.append(f"  - {factor['factor']}: {factor['description']}")

        sources = comparison_data.get("sources", [])
        if sources:
            lines.append(f"\n(Sources: {', '.join(sources)})")

        return "\n".join(lines)

    def format_class_members_for_llm(self, class_name: str, members: List[Dict]) -> str:
        """Format class members list for LLM context."""
        if not members:
            return ""

        lines = [
            f"\n[Drugs in Class: {class_name}]",
            f"Found {len(members)} drugs in this therapeutic class:",
        ]

        for m in members[:15]:  # Limit to 15 in context
            name = m.get("name", "Unknown")
            rxcui = m.get("rxcui", "")
            lines.append(f"  - {name}" + (f" (RxCUI: {rxcui})" if rxcui else ""))

        if len(members) > 15:
            lines.append(f"  ... and {len(members) - 15} more")

        lines.append("\n(Source: RxClass API - US drug names)")

        return "\n".join(lines)


# Singleton instance
therapeutic_comparison_service = TherapeuticComparisonService()


async def get_alternatives(drug_name: str, limit: int = 5) -> Dict[str, Any]:
    """Convenience function to get therapeutic alternatives."""
    return await therapeutic_comparison_service.get_therapeutic_alternatives(drug_name, limit)
