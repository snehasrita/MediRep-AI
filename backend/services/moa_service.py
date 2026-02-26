"""
Mechanism of Action Service - Fetches pharmacology data from multiple sources.

Data Sources:
- openFDA: mechanism_of_action, pharmacodynamics, clinical_pharmacology
- RxClass: Drug class (MoA categories)
- PubChem: Drug targets and pathways
"""
import asyncio
import logging
import httpx
from typing import Optional, Dict, Any, List

from config import OPENFDA_LABEL_URL, RXCLASS_BASE_URL, PUBCHEM_BASE_URL, PUBCHEM_VIEW_BASE_URL

logger = logging.getLogger(__name__)


class MoAService:
    """Service for fetching Mechanism of Action data."""

    def __init__(self):
        self._cache: Dict[str, Any] = {}

    async def get_mechanism_of_action(self, drug_name: str) -> Dict[str, Any]:
        """
        Get comprehensive MOA data for a drug.
        Combines data from openFDA, RxClass, and PubChem.
        """
        if not drug_name:
            return {}

        cache_key = f"moa:{drug_name.lower()}"
        if cache_key in self._cache:
            return self._cache[cache_key]

        # Fetch from all sources in parallel
        results = await asyncio.gather(
            self._fetch_openfda_moa(drug_name),
            self._fetch_rxclass_moa(drug_name),
            self._fetch_pubchem_pharmacology(drug_name),
            return_exceptions=True
        )

        openfda_data = results[0] if not isinstance(results[0], Exception) else {}
        rxclass_data = results[1] if not isinstance(results[1], Exception) else {}
        pubchem_data = results[2] if not isinstance(results[2], Exception) else {}

        # Build drug_classes list from RxClass data
        drug_classes = []
        if rxclass_data.get("class_name"):
            drug_classes.append(rxclass_data["class_name"])
        drug_classes.extend(rxclass_data.get("additional_classes", []))

        # Build sources list
        sources = []
        if openfda_data:
            sources.append("openFDA Drug Labels")
        if rxclass_data:
            sources.append("NIH RxClass")
        if pubchem_data.get("targets") or pubchem_data.get("pathways"):
            sources.append("PubChem")

        moa_data = {
            "drug_name": drug_name,
            "mechanism_of_action": openfda_data.get("mechanism_of_action", ""),
            "pharmacodynamics": openfda_data.get("pharmacodynamics", ""),
            "clinical_pharmacology": openfda_data.get("clinical_pharmacology", ""),
            "drug_class": rxclass_data.get("class_name", ""),
            "drug_classes": drug_classes,  # Plural for compatibility
            "class_type": rxclass_data.get("class_type", ""),
            "targets": pubchem_data.get("targets", []),
            "pathways": pubchem_data.get("pathways", []),
            "sources": sources,  # Plural for compatibility
            "source": "openFDA + RxClass + PubChem"
        }

        # Only cache if we got meaningful data
        if moa_data["mechanism_of_action"] or drug_classes:
            self._cache[cache_key] = moa_data

        return moa_data

    async def _fetch_openfda_moa(self, drug_name: str) -> Dict[str, Any]:
        """Fetch MOA from openFDA drug labels."""
        try:
            # Validate input
            if not drug_name or not drug_name.strip():
                return {}
            
            # Use longer timeout - openFDA can be slow
            timeout = httpx.Timeout(30.0, connect=10.0)
            async with httpx.AsyncClient(timeout=timeout) as client:
                # Clean drug name - remove dosage info and special chars
                parts = drug_name.strip().split()
                if not parts:
                    return {}
                clean_name = parts[0].lower()  # Take first word
                clean_name = ''.join(c for c in clean_name if c.isalnum())
                
                if not clean_name:
                    return {}
                
                # Try multiple search strategies
                search_queries = [
                    f'openfda.generic_name:"{clean_name}"',
                    f'openfda.brand_name:"{clean_name}"',
                    f'openfda.substance_name:"{clean_name}"',
                    clean_name,  # Fallback to simple search
                ]
                
                for query in search_queries:
                    try:
                        response = await client.get(
                            OPENFDA_LABEL_URL,
                            params={
                                "search": query,
                                "limit": 5  # Get more results to find best match
                            }
                        )

                        if response.status_code == 200:
                            data = response.json()
                            results = data.get("results", [])
                            
                            # Find result that matches our drug AND has mechanism_of_action
                            for result in results:
                                # Verify this result is for our drug
                                openfda = result.get("openfda", {})
                                generic_names = [n.lower() for n in openfda.get("generic_name", [])]
                                brand_names = [n.lower() for n in openfda.get("brand_name", [])]
                                substance_names = [n.lower() for n in openfda.get("substance_name", [])]
                                
                                # Also check active_ingredient if available
                                active_ingredients = result.get("active_ingredient", [""])
                                active_text = " ".join(active_ingredients).lower() if active_ingredients else ""
                                
                                # Get MOA text to verify drug is mentioned there
                                moa_text = result.get("mechanism_of_action", [""])[0].lower() if result.get("mechanism_of_action") else ""
                                
                                all_names = generic_names + brand_names + substance_names
                                
                                # Check if our drug is mentioned in names, active ingredients, or MOA text
                                drug_matches = (
                                    any(clean_name in name for name in all_names) or
                                    clean_name in active_text or
                                    clean_name in moa_text
                                )
                                
                                if not drug_matches:
                                    continue  # Skip if drug doesn't match
                                
                                moa = result.get("mechanism_of_action", [""])
                                if moa and moa[0]:
                                    return {
                                        "mechanism_of_action": self._clean_text(moa[0]),
                                        "pharmacodynamics": self._clean_text(
                                            result.get("pharmacodynamics", [""])[0]
                                        ),
                                        "clinical_pharmacology": self._clean_text(
                                            result.get("clinical_pharmacology", [""])[0]
                                        )
                                    }
                    except httpx.TimeoutException:
                        logger.warning(f"openFDA timeout for query: {query[:50]}")
                        continue
                    except Exception as e:
                        logger.debug(f"openFDA query failed: {e}")
                        continue
                        
        except Exception as e:
            logger.warning(f"openFDA MOA fetch failed for {drug_name}: {e}")
        return {}

    async def _fetch_rxclass_moa(self, drug_name: str) -> Dict[str, Any]:
        """Fetch drug class from RxClass API (FREE, no license needed)."""
        # Validate input
        if not drug_name or not drug_name.strip():
            return {}
            
        # Relationship types to EXCLUDE (not useful for MOA)
        EXCLUDED_RELA = {'ci_with', 'has_contraindication', 'may_diagnose', 'may_prevent'}
        
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                # Clean drug name
                parts = drug_name.strip().split()
                if not parts:
                    return {}
                clean_name = parts[0].strip()
                
                # Get drug classes directly by drug name
                class_response = await client.get(
                    f"{RXCLASS_BASE_URL}/class/byDrugName.json",
                    params={
                        "drugName": clean_name,
                        "relaSource": "MEDRT"
                    }
                )

                moa_classes = []
                pe_classes = []
                other_classes = []
                primary_class = None
                class_type = ""

                if class_response.status_code == 200:
                    class_data = class_response.json()
                    classes = class_data.get("rxclassDrugInfoList", {}).get("rxclassDrugInfo", [])

                    for cls in classes:
                        rela = cls.get("rela", "")
                        # Skip contraindications and irrelevant relationships
                        if rela in EXCLUDED_RELA:
                            continue
                            
                        class_info = cls.get("rxclassMinConceptItem", {})
                        class_name = class_info.get("className", "")
                        
                        if "[MoA]" in class_name:
                            moa_classes.append(class_name)
                        elif "[PE]" in class_name:
                            pe_classes.append(class_name)
                        elif "[EPC]" in class_name or "[TC]" in class_name:
                            other_classes.append(class_name)

                    # Priority: MoA > PE > Other
                    if moa_classes:
                        primary_class = moa_classes[0]
                        class_type = "Mechanism of Action"
                    elif pe_classes:
                        primary_class = pe_classes[0]
                        class_type = "Physiologic Effect"
                    elif other_classes:
                        primary_class = other_classes[0]
                        class_type = "Therapeutic Class"

                # Try ATC classification as fallback
                if not primary_class:
                    atc_response = await client.get(
                        f"{RXCLASS_BASE_URL}/class/byDrugName.json",
                        params={
                            "drugName": clean_name,
                            "relaSource": "ATC"
                        }
                    )

                    if atc_response.status_code == 200:
                        atc_data = atc_response.json()
                        atc_classes = atc_data.get("rxclassDrugInfoList", {}).get("rxclassDrugInfo", [])
                        for cls in atc_classes:
                            class_info = cls.get("rxclassMinConceptItem", {})
                            class_name = class_info.get("className", "")
                            if class_name:
                                if not primary_class:
                                    primary_class = class_name
                                    class_type = "ATC Classification"
                                other_classes.append(class_name)

                return {
                    "class_name": primary_class or "",
                    "class_type": class_type,
                    "additional_classes": list(set(moa_classes + pe_classes + other_classes[:3]))[:5]
                }

        except Exception as e:
            logger.warning(f"RxClass fetch failed for {drug_name}: {e}")
        return {}

    async def _fetch_pubchem_pharmacology(self, drug_name: str) -> Dict[str, Any]:
        """Fetch pharmacology data from PubChem (FREE)."""
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                # Search for compound by name
                search_response = await client.get(
                    f"{PUBCHEM_BASE_URL}/compound/name/{drug_name}/cids/JSON"
                )

                if search_response.status_code == 200:
                    cid_data = search_response.json()
                    cids = cid_data.get("IdentifierList", {}).get("CID", [])

                    if cids:
                        cid = cids[0]

                        # Get pharmacology annotations
                        annot_response = await client.get(
                            f"{PUBCHEM_VIEW_BASE_URL}/data/compound/{cid}/JSON",
                            params={"heading": "Pharmacology and Biochemistry"}
                        )

                        if annot_response.status_code == 200:
                            annot_data = annot_response.json()
                            return {
                                "targets": self._extract_targets(annot_data),
                                "pathways": self._extract_pathways(annot_data)
                            }
        except Exception as e:
            logger.warning(f"PubChem fetch failed for {drug_name}: {e}")
        return {}

    def _extract_targets(self, pubchem_data: Dict) -> List[str]:
        """Extract drug targets from PubChem data."""
        targets = []
        try:
            sections = pubchem_data.get("Record", {}).get("Section", [])
            for section in sections:
                heading = section.get("TOCHeading", "")
                if "Target" in heading or "Mechanism" in heading:
                    for subsection in section.get("Section", []):
                        info = subsection.get("Information", [])
                        for item in info[:5]:
                            value = item.get("Value", {})
                            string_markup = value.get("StringWithMarkup", [{}])
                            if string_markup:
                                text = string_markup[0].get("String", "")
                                if text and len(text) < 200:
                                    targets.append(text)
        except Exception:
            pass
        return targets[:5]

    def _extract_pathways(self, pubchem_data: Dict) -> List[str]:
        """Extract pathways from PubChem data."""
        pathways = []
        try:
            sections = pubchem_data.get("Record", {}).get("Section", [])
            for section in sections:
                heading = section.get("TOCHeading", "")
                if "Pathway" in heading or "Pharmacodynamics" in heading:
                    for subsection in section.get("Section", []):
                        info = subsection.get("Information", [])
                        for item in info[:5]:
                            value = item.get("Value", {})
                            string_markup = value.get("StringWithMarkup", [{}])
                            if string_markup:
                                text = string_markup[0].get("String", "")
                                if text and len(text) < 200:
                                    pathways.append(text)
        except Exception:
            pass
        return pathways[:5]

    def _clean_text(self, text: str) -> str:
        """Clean and truncate text."""
        if not text:
            return ""
        # Remove excessive whitespace
        text = " ".join(text.split())
        # Truncate to 500 chars
        if len(text) > 500:
            text = text[:497] + "..."
        return text

    def format_for_llm(self, moa_data: Dict) -> str:
        """Format MOA data for LLM context."""
        if not moa_data or not moa_data.get("drug_name"):
            return ""

        lines = [f"\n[Mechanism of Action: {moa_data['drug_name']}]"]

        if moa_data.get("mechanism_of_action"):
            lines.append(f"MOA: {moa_data['mechanism_of_action']}")

        if moa_data.get("drug_class"):
            lines.append(f"Drug Class: {moa_data['drug_class']} ({moa_data.get('class_type', '')})")

        if moa_data.get("pharmacodynamics"):
            lines.append(f"Pharmacodynamics: {moa_data['pharmacodynamics']}")

        if moa_data.get("targets"):
            lines.append(f"Targets: {', '.join(moa_data['targets'][:3])}")

        lines.append("(Source: openFDA + RxClass + PubChem)")

        return "\n".join(lines)


# Singleton instance
moa_service = MoAService()


async def get_moa(drug_name: str) -> Dict[str, Any]:
    """Convenience function to get MOA data."""
    return await moa_service.get_mechanism_of_action(drug_name)
