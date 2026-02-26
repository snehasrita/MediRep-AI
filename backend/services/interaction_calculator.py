"""
Drug Interaction Calculator Service (AI-Powered)

Dynamically analyzes drug interactions using Generative AI (Gemini) to estimate
pharmacokinetic parameters and calculate AUC ratios.

NO HARDCODED DATA - Handles any drug pair by querying the LLM for chemical
and clinical parameters.
"""

import logging
import json
import threading
import asyncio
from typing import Optional, Dict, Any, Tuple
import re

import google.generativeai as genai
from config import GEMINI_API_KEY, GEMINI_MODEL
from models import (
    DrugChemistry,
    InteractionMathematics,
    MetabolicPathway,
    ClinicalImpact,
    EnhancedInteractionResponse,
    PatientContext,
    ReactionImage
)
from services.image_generation_service import generate_reaction_image
from datetime import datetime

logger = logging.getLogger(__name__)

# Lazy initialization
_model = None
_configured = False
_lock = threading.Lock()

def _get_model():
    global _model, _configured
    if not GEMINI_API_KEY:
        logger.warning("GEMINI_API_KEY not set. Cannot perform AI interaction analysis.")
        return None
        
    if _model:
        return _model
        
    with _lock:
        if _model:
            return _model
        if not _configured:
            genai.configure(api_key=GEMINI_API_KEY)
            _configured = True
        _model = genai.GenerativeModel(GEMINI_MODEL)
    return _model

def _to_subscript(formula: str) -> str:
    """Convert chemical formula numbers to Unicode subscript."""
    subscript_map = str.maketrans("0123456789", "₀₁₂₃₄₅₆₇₈₉")
    return formula.translate(subscript_map)

# Prompt for AI Analysis
KEY_PROMPT = """
You are a clinical pharmacology expert. Perform a precision pharmacokinetic analysis for the interaction between:
Drug 1 (Victim/Inducer/Inhibitor): {drug1}
Drug 2 (Victim/Inducer/Inhibitor): {drug2}

{context_str}

If there is NO significant interaction (pharmacokinetic or pharmacodynamic), return null.

If there IS an interaction, you must estimate the relevant pharmacokinetic parameters based on typical therapeutic dosages and standard medical literature.

Provide the analysis as a valid JSON object with the following structure:

{{
  "victim_drug": {{
    "name": "Name of the victim drug",
    "formula": "Chemical formula (e.g. C9H8O4)",
    "smiles": "SMILES string",
    "molecular_weight": 123.45,
    "metabolism": "Major metabolizing enzymes (e.g. CYP2C9)"
  }},
  "perpetrator_drug": {{
    "name": "Name of the perpetrator drug",
    "formula": "Chemical formula",
    "smiles": "SMILES string",
    "molecular_weight": 123.45,
    "metabolism": "Metabolizing enzymes"
  }},
  "interaction_params": {{
    "mechanism": "Brief mechanism (e.g. 'Inhibits CYP2C9')",
    "affected_enzyme": "Enzyme name (e.g. 'CYP2C9')",
    "ki_value_um": 1.5,  # Estimated inhibition constant (Ki) in micromolar. Non-zero number.
    "inhibitor_concentration_um": 10.0, # Estimated peak plasma concentration [I] in micromolar.
    "severity_classification": "major" | "moderate" | "minor"
  }},
  "metabolic_pathway": {{
    "victim_normal": "Description of normal pathway (e.g. 'Warfarin -> CYP2C9 -> 7-OH-Warfarin')",
    "victim_inhibited": "Description of inhibited state",
    "result": "Clinical result (e.g. 'Accumulation of Warfarin')",
    "affected_metabolite_name": "Name of the specific metabolite blocked/not formed",
    "affected_metabolite_formula": "Chemical formula of that metabolite",
    "affected_metabolite_smiles": "SMILES string of the metabolite"
  }},
  "clinical_impact": {{
    "description": "Short clinical summary",
    "recommendation": "Actionable advice",
    "severity": "major" | "moderate" | "minor"
  }}
}}

CRITICAL: Return ONLY valid JSON. Do not include markdown formatting.
"""

def extract_json(text: str) -> Optional[dict]:
    """Robust JSON extraction from LLM response."""
    try:
        # Try direct parse
        return json.loads(text)
    except json.JSONDecodeError:
        # Try finding the JSON block
        match = re.search(r'\{.*\}', text, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(0))
            except:
                pass
    return None

class DrugInteractionCalculator:
    """
    AI-Powered Calculator for drug-drug interactions.
    """

    @staticmethod
    def calculate_auc_ratio(inhibitor_concentration: float, ki_value: float) -> float:
        """Calculate R = 1 + ([I] / Ki)"""
        if ki_value <= 0.0001: # Prevent division by zero
            return 1.0
        return 1 + (inhibitor_concentration / ki_value)

    @staticmethod
    def classify_severity(auc_ratio: float) -> str:
        """Classify based on AUC ratio R."""
        if auc_ratio >= 5.0: return "major"
        elif auc_ratio >= 2.0: return "moderate"
        elif auc_ratio >= 1.25: return "minor"
        else: return "none"

    @classmethod
    async def analyze_interaction(
        cls,
        drug1: str,
        drug2: str,
        patient_context: Optional[PatientContext] = None
    ) -> Optional[EnhancedInteractionResponse]:
        """
        Analyze interaction using Gemini to get parameters, then calculate math.
        """
        model = _get_model()
        if not model:
            return None

        # Build context string
        context_str = ""
        if patient_context:
            parts = []
            if patient_context.pre_existing_diseases: parts.append(f"Pre-existing Diseases: {', '.join(patient_context.pre_existing_diseases)}")
            if patient_context.age: parts.append(f"Age: {patient_context.age}")
            if parts: context_str = "Patient Context: " + "; ".join(parts)

        prompt = KEY_PROMPT.format(drug1=drug1, drug2=drug2, context_str=context_str)
        
        try:
            # Generate content
            response = await asyncio.to_thread(
                model.generate_content, 
                prompt,
                generation_config={"response_mime_type": "application/json"}
            )
            
            text = response.text
            if not text or text.lower().strip() == "null":
                return None
                
            data = extract_json(text)
            if not data:
                return None
                
            # Process Data & Validate Math
            params = data.get("interaction_params", {})
            ki = float(params.get("ki_value_um", 1.0))
            conc = float(params.get("inhibitor_concentration_um", 0.0))
            
            # Recalculate R to ensure consistency
            auc_ratio = cls.calculate_auc_ratio(conc, ki)
            
            # Use calculated severity or AI's suggestion if close
            severity = cls.classify_severity(auc_ratio)
            
            # Build Response Models
            victim = data.get("victim_drug", {})
            perpetrator = data.get("perpetrator_drug", {})
            pathway = data.get("metabolic_pathway", {})
            impact = data.get("clinical_impact", {})
            
            victim_chem = DrugChemistry(
                name=victim.get("name", drug1),
                formula=victim.get("formula", ""),
                formula_display=_to_subscript(victim.get("formula", "")),
                smiles=victim.get("smiles", ""),
                molecular_weight=float(victim.get("molecular_weight", 0)),
                metabolism=victim.get("metabolism", "")
            )
            
            perp_chem = DrugChemistry(
                name=perpetrator.get("name", drug2),
                formula=perpetrator.get("formula", ""),
                formula_display=_to_subscript(perpetrator.get("formula", "")),
                smiles=perpetrator.get("smiles", ""),
                molecular_weight=float(perpetrator.get("molecular_weight", 0)),
                metabolism=perpetrator.get("metabolism", "")
            )
            
            math_model = InteractionMathematics(
                auc_ratio_r=round(auc_ratio, 2),
                inhibitor_concentration_um=conc,
                ki_value_um=ki,
                formula="R = 1 + ([I] / Ki)",
                calculation=f"R = 1 + ({conc} / {ki}) = {auc_ratio:.2f}",
                severity=severity,
                mechanism=params.get("mechanism", ""),
                affected_enzyme=params.get("affected_enzyme", "")
            )
            
            pathway_model = MetabolicPathway(
                victim_normal=pathway.get("victim_normal", ""),
                victim_inhibited=pathway.get("victim_inhibited", ""),
                result=pathway.get("result", ""),
                affected_metabolite_name=pathway.get("affected_metabolite_name"),
                affected_metabolite_formula=pathway.get("affected_metabolite_formula"),
                affected_metabolite_smiles=pathway.get("affected_metabolite_smiles")
            )
            
            clinical_model = ClinicalImpact(
                description=impact.get("description", ""),
                recommendation=impact.get("recommendation", ""),
                severity=severity
            )

            # Generate reaction image using Freepik
            reaction_image_url = await generate_reaction_image(
                drug1=victim_chem.name,
                drug2=perp_chem.name,
                drug1_formula=victim_chem.formula,
                drug2_formula=perp_chem.formula,
                mechanism=params.get("mechanism", "")
            )

            reaction_image = None
            if reaction_image_url:
                reaction_image = ReactionImage(
                    url=reaction_image_url,
                    prompt=f"Chemical reaction between {victim_chem.name} and {perp_chem.name}",
                    generated_at=datetime.utcnow()
                )

            return EnhancedInteractionResponse(
                victim_drug=victim_chem,
                perpetrator_drug=perp_chem,
                interaction_mathematics=math_model,
                metabolic_pathway=pathway_model,
                clinical_impact=clinical_model,
                reaction_image=reaction_image
            )
            
        except Exception as e:
            logger.error(f"Error in AI interaction analysis: {e}")
            return None

# Export singleton-style function
async def get_enhanced_interaction(
    drug1: str,
    drug2: str,
    patient_context: Optional[PatientContext] = None
) -> Optional[EnhancedInteractionResponse]:
    return await DrugInteractionCalculator.analyze_interaction(drug1, drug2, patient_context)
