"""
Chemical Structure Image Generation Service.

Generates professional chemical reaction diagrams with:
- Real molecular structures from PubChem
- Chemical reaction equations with proper subscripts
- Theoretical product formulas
- Professional chemistry notation
"""
import logging
import asyncio
import base64
import httpx
import re
from typing import Optional, Tuple, Dict, List
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class MoleculeData:
    """Data for a molecule from PubChem."""
    name: str
    formula: str
    smiles: str = ""
    cid: int = 0
    molecular_weight: float = 0.0
    iupac_name: str = ""
    elements: Dict[str, int] = None  # Element counts
    
    def __post_init__(self):
        if self.elements is None:
            self.elements = self._parse_formula(self.formula)
    
    @staticmethod
    def _parse_formula(formula: str) -> Dict[str, int]:
        """Parse chemical formula into element counts."""
        pattern = r'([A-Z][a-z]?)(\d*)'
        matches = re.findall(pattern, formula)
        elements = {}
        for element, count in matches:
            if element:
                elements[element] = elements.get(element, 0) + (int(count) if count else 1)
        return elements


class ChemicalDiagramService:
    """Service for generating chemical reaction diagrams."""
    
    PUBCHEM_BASE = "https://pubchem.ncbi.nlm.nih.gov/rest/pug"
    
    @classmethod
    async def get_molecule_data(cls, drug_name: str) -> Optional[MoleculeData]:
        """Fetch molecule data from PubChem API."""
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                # Search for compound by name
                search_url = f"{cls.PUBCHEM_BASE}/compound/name/{drug_name}/JSON"
                response = await client.get(search_url)
                
                if response.status_code != 200:
                    logger.warning(f"PubChem search failed for {drug_name}: {response.status_code}")
                    return None
                
                data = response.json()
                compounds = data.get("PC_Compounds", [])
                
                if not compounds:
                    return None
                
                compound = compounds[0]
                cid = compound.get("id", {}).get("id", {}).get("cid", 0)
                
                # Extract properties
                props = compound.get("props", [])
                formula = ""
                iupac_name = ""
                smiles = ""
                molecular_weight = 0.0
                
                for prop in props:
                    urn = prop.get("urn", {})
                    label = urn.get("label", "")
                    value = prop.get("value", {})
                    
                    if label == "Molecular Formula":
                        formula = value.get("sval", "")
                    elif label == "IUPAC Name" and urn.get("name") == "Preferred":
                        iupac_name = value.get("sval", "")
                    elif label == "SMILES" and urn.get("name") == "Canonical":
                        smiles = value.get("sval", "")
                    elif label == "Molecular Weight":
                        molecular_weight = float(value.get("fval", 0) or value.get("sval", 0) or 0)
                
                return MoleculeData(
                    name=drug_name.title(),
                    formula=formula,
                    smiles=smiles,
                    cid=cid,
                    molecular_weight=molecular_weight,
                    iupac_name=iupac_name
                )
                
        except Exception as e:
            logger.error(f"Error fetching PubChem data for {drug_name}: {e}")
            return None

    @classmethod
    async def get_structure_image_base64(cls, cid: int, size: int = 250) -> Optional[str]:
        """Get the 2D structure image from PubChem as base64."""
        try:
            url = f"https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/{cid}/PNG?image_size={size}x{size}"
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.get(url)
                if response.status_code == 200:
                    return base64.b64encode(response.content).decode('utf-8')
        except Exception as e:
            logger.error(f"Error fetching structure image for CID {cid}: {e}")
        return None

    @classmethod
    def calculate_product_formula(cls, mol1: MoleculeData, mol2: MoleculeData) -> Tuple[str, str]:
        """
        Calculate theoretical product formula from esterification reaction.
        Drug1-COOH + Drug2-OH → Drug1-COO-Drug2 + H2O
        
        Returns: (product_formula, byproduct_formula)
        """
        if not mol1.elements or not mol2.elements:
            return ("Product", "H₂O")
        
        # Combine elements and subtract H2O for esterification
        combined = {}
        for elem, count in mol1.elements.items():
            combined[elem] = combined.get(elem, 0) + count
        for elem, count in mol2.elements.items():
            combined[elem] = combined.get(elem, 0) + count
        
        # Subtract H2O (esterification releases water)
        combined['H'] = combined.get('H', 0) - 2
        combined['O'] = combined.get('O', 0) - 1
        
        # Format product formula (C first, then H, then alphabetical)
        product_parts = []
        if 'C' in combined:
            product_parts.append(f"C{combined['C']}" if combined['C'] > 1 else "C")
            del combined['C']
        if 'H' in combined:
            product_parts.append(f"H{combined['H']}" if combined['H'] > 1 else "H")
            del combined['H']
        
        for elem in sorted(combined.keys()):
            if combined[elem] > 0:
                product_parts.append(f"{elem}{combined[elem]}" if combined[elem] > 1 else elem)
        
        product_formula = "".join(product_parts)
        
        return (product_formula, "H2O")

    @classmethod
    def format_formula_svg(cls, formula: str, x: float, y: float, font_size: int = 18, color: str = "#1e293b") -> str:
        """Convert chemical formula to SVG text with subscript numbers."""
        svg_parts = []
        current_x = x
        
        # Parse formula into elements and numbers
        pattern = r'([A-Z][a-z]?)(\d*)'
        matches = re.findall(pattern, formula)
        
        for element, count in matches:
            if element:
                # Element symbol (normal)
                svg_parts.append(
                    f'<tspan x="{current_x}" y="{y}" font-size="{font_size}" fill="{color}">{element}</tspan>'
                )
                current_x += font_size * 0.6 * len(element)
                
                if count:
                    # Subscript number
                    sub_size = int(font_size * 0.7)
                    svg_parts.append(
                        f'<tspan x="{current_x}" y="{y + font_size * 0.3}" font-size="{sub_size}" fill="{color}">{count}</tspan>'
                    )
                    current_x += sub_size * 0.5 * len(count)
        
        return f'<text>{"".join(svg_parts)}</text>'

    @classmethod
    async def generate_reaction_diagram(
        cls,
        drug1: str,
        drug2: str,
        drug1_formula: str = "",
        drug2_formula: str = "",
        mechanism: Optional[str] = None,
    ) -> Optional[str]:
        """Generate a professional chemical reaction diagram with equation."""
        logger.info(f"Generating chemical reaction diagram for {drug1} + {drug2}")
        
        # Fetch molecule data from PubChem
        mol1_task = cls.get_molecule_data(drug1)
        mol2_task = cls.get_molecule_data(drug2)
        
        mol1, mol2 = await asyncio.gather(mol1_task, mol2_task)
        
        # Use provided formulas as fallback
        if mol1:
            formula1 = mol1.formula or drug1_formula or "Unknown"
        else:
            formula1 = drug1_formula or "Unknown"
            mol1 = MoleculeData(name=drug1.title(), formula=formula1)
            
        if mol2:
            formula2 = mol2.formula or drug2_formula or "Unknown"
        else:
            formula2 = drug2_formula or "Unknown"
            mol2 = MoleculeData(name=drug2.title(), formula=formula2)
        
        # Calculate product formula
        product_formula, byproduct = cls.calculate_product_formula(mol1, mol2)
        
        # Get structure images if available
        img1_base64 = None
        img2_base64 = None
        
        if mol1.cid:
            img1_base64 = await cls.get_structure_image_base64(mol1.cid, 160)
        if mol2.cid:
            img2_base64 = await cls.get_structure_image_base64(mol2.cid, 160)
        
        # Generate the SVG
        svg = cls._create_reaction_svg(
            drug1=drug1,
            drug2=drug2,
            formula1=formula1,
            formula2=formula2,
            product_formula=product_formula,
            byproduct=byproduct,
            img1_base64=img1_base64,
            img2_base64=img2_base64,
            mechanism=mechanism,
            mw1=mol1.molecular_weight if mol1 else None,
            mw2=mol2.molecular_weight if mol2 else None
        )
        
        # Convert to data URL
        svg_base64 = base64.b64encode(svg.encode('utf-8')).decode('utf-8')
        return f"data:image/svg+xml;base64,{svg_base64}"

    @classmethod
    def _subscript_formula(cls, formula: str) -> str:
        """Convert formula numbers to Unicode subscripts for SVG display."""
        subscripts = {'0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', 
                     '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉'}
        result = ""
        for char in formula:
            result += subscripts.get(char, char)
        return result

    @classmethod
    def _create_reaction_svg(
        cls,
        drug1: str,
        drug2: str,
        formula1: str,
        formula2: str,
        product_formula: str,
        byproduct: str,
        img1_base64: Optional[str],
        img2_base64: Optional[str],
        mechanism: Optional[str],
        mw1: Optional[float],
        mw2: Optional[float]
    ) -> str:
        """Create a professional chemistry reaction SVG with equation."""
        
        # Convert formulas to Unicode subscripts
        f1_sub = cls._subscript_formula(formula1)
        f2_sub = cls._subscript_formula(formula2)
        product_sub = cls._subscript_formula(product_formula)
        byproduct_sub = cls._subscript_formula(byproduct)
        
        # Structure image or placeholder
        drug1_img = ""
        drug2_img = ""
        
        if img1_base64:
            drug1_img = f'<image href="data:image/png;base64,{img1_base64}" x="25" y="95" width="150" height="150" />'
        else:
            drug1_img = cls._create_placeholder(100, 170, "#0891b2", drug1[:8])
        
        if img2_base64:
            drug2_img = f'<image href="data:image/png;base64,{img2_base64}" x="525" y="95" width="150" height="150" />'
        else:
            drug2_img = cls._create_placeholder(600, 170, "#7c3aed", drug2[:8])
        
        # MW info
        mw1_text = f"MW: {mw1:.2f}" if mw1 else ""
        mw2_text = f"MW: {mw2:.2f}" if mw2 else ""
        
        svg = f'''<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 700 450" style="background: #ffffff;">
  <defs>
    <linearGradient id="headerGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:#0f172a"/>
      <stop offset="100%" style="stop-color:#1e293b"/>
    </linearGradient>
    <linearGradient id="arrowGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:#dc2626"/>
      <stop offset="100%" style="stop-color:#b91c1c"/>
    </linearGradient>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="1" dy="2" stdDeviation="2" flood-opacity="0.1"/>
    </filter>
    <marker id="arrowhead" markerWidth="12" markerHeight="8" refX="10" refY="4" orient="auto" fill="#dc2626">
      <polygon points="0 0, 12 4, 0 8"/>
    </marker>
  </defs>
  
  <!-- Header Bar -->
  <rect x="0" y="0" width="700" height="50" fill="url(#headerGrad)"/>
  <text x="350" y="32" text-anchor="middle" fill="white" font-family="Georgia, serif" font-size="18" font-weight="bold">Chemical Reaction Equation</text>
  
  <!-- Main Equation Box -->
  <rect x="20" y="60" width="660" height="35" rx="6" fill="#fef3c7" stroke="#fbbf24" stroke-width="1"/>
  
  <!-- Reaction Equation: Drug1 + Drug2 → Product + H₂O -->
  <text x="350" y="84" text-anchor="middle" font-family="Times New Roman, serif" font-size="16" fill="#92400e">
    <tspan font-weight="bold">{f1_sub}</tspan>
    <tspan dx="8">+</tspan>
    <tspan dx="8" font-weight="bold">{f2_sub}</tspan>
    <tspan dx="12" font-size="20">→</tspan>
    <tspan dx="12" font-weight="bold" fill="#15803d">{product_sub}</tspan>
    <tspan dx="8">+</tspan>
    <tspan dx="8" fill="#0369a1">{byproduct_sub}</tspan>
  </text>
  
  <!-- Drug 1 Card -->
  <rect x="15" y="105" width="170" height="230" rx="10" fill="#f0f9ff" stroke="#0ea5e9" stroke-width="2" filter="url(#shadow)"/>
  <rect x="15" y="105" width="170" height="35" rx="10" fill="#0ea5e9"/>
  <rect x="15" y="125" width="170" height="15" fill="#0ea5e9"/>
  <text x="100" y="130" text-anchor="middle" fill="white" font-family="Arial, sans-serif" font-size="14" font-weight="bold">{drug1.title()[:14]}</text>
  
  <!-- Drug 1 Structure -->
  {drug1_img}
  
  <!-- Drug 1 Info -->
  <text x="100" y="270" text-anchor="middle" fill="#0c4a6e" font-family="Courier New, monospace" font-size="13" font-weight="bold">{f1_sub}</text>
  <text x="100" y="290" text-anchor="middle" fill="#64748b" font-family="Arial, sans-serif" font-size="10">{mw1_text}</text>
  <rect x="40" y="300" width="120" height="24" rx="12" fill="#0ea5e9" opacity="0.1"/>
  <text x="100" y="317" text-anchor="middle" fill="#0369a1" font-family="Arial, sans-serif" font-size="11" font-weight="500">Reactant 1</text>
  
  <!-- Plus Sign -->
  <circle cx="350" cy="200" r="20" fill="#fef3c7" stroke="#f59e0b" stroke-width="2"/>
  <text x="350" y="208" text-anchor="middle" fill="#d97706" font-family="Arial, sans-serif" font-size="28" font-weight="bold">+</text>
  
  <!-- Drug 2 Card -->
  <rect x="515" y="105" width="170" height="230" rx="10" fill="#faf5ff" stroke="#a855f7" stroke-width="2" filter="url(#shadow)"/>
  <rect x="515" y="105" width="170" height="35" rx="10" fill="#a855f7"/>
  <rect x="515" y="125" width="170" height="15" fill="#a855f7"/>
  <text x="600" y="130" text-anchor="middle" fill="white" font-family="Arial, sans-serif" font-size="14" font-weight="bold">{drug2.title()[:14]}</text>
  
  <!-- Drug 2 Structure -->
  {drug2_img}
  
  <!-- Drug 2 Info -->
  <text x="600" y="270" text-anchor="middle" fill="#581c87" font-family="Courier New, monospace" font-size="13" font-weight="bold">{f2_sub}</text>
  <text x="600" y="290" text-anchor="middle" fill="#64748b" font-family="Arial, sans-serif" font-size="10">{mw2_text}</text>
  <rect x="540" y="300" width="120" height="24" rx="12" fill="#a855f7" opacity="0.1"/>
  <text x="600" y="317" text-anchor="middle" fill="#7c3aed" font-family="Arial, sans-serif" font-size="11" font-weight="500">Reactant 2</text>
  
  <!-- Products Section -->
  <rect x="20" y="350" width="660" height="55" rx="8" fill="#f0fdf4" stroke="#86efac" stroke-width="1"/>
  <text x="30" y="375" fill="#166534" font-family="Arial, sans-serif" font-size="12" font-weight="bold">Theoretical Products:</text>
  <text x="350" y="392" text-anchor="middle" font-family="Times New Roman, serif" font-size="15" fill="#15803d">
    <tspan font-weight="bold">{product_sub}</tspan>
    <tspan fill="#64748b"> (Pro-drug Ester) </tspan>
    <tspan fill="#374151">+</tspan>
    <tspan fill="#0369a1" font-weight="bold"> {byproduct_sub}</tspan>
    <tspan fill="#64748b"> (Water)</tspan>
  </text>
  
  <!-- Footer -->
  <rect x="0" y="415" width="700" height="35" fill="#f8fafc"/>
  <text x="350" y="437" text-anchor="middle" fill="#94a3b8" font-family="Arial, sans-serif" font-size="10">Generated by MediRep-AI | Molecular Data from PubChem | Theoretical Reaction Only</text>
</svg>'''
        
        return svg

    @classmethod
    def _create_placeholder(cls, cx: float, cy: float, color: str, label: str) -> str:
        """Create a hexagonal placeholder for molecules without structure images."""
        import math
        points = []
        for i in range(6):
            angle = math.radians(60 * i - 30)
            x = cx + 50 * math.cos(angle)
            y = cy + 50 * math.sin(angle)
            points.append(f"{x},{y}")
        
        return f'''
    <polygon points="{' '.join(points)}" fill="{color}15" stroke="{color}" stroke-width="3"/>
    <circle cx="{cx}" cy="{cy}" r="30" fill="none" stroke="{color}" stroke-width="2" stroke-dasharray="5 3"/>
    <text x="{cx}" y="{cy + 5}" text-anchor="middle" fill="{color}" font-family="Arial, sans-serif" font-size="10" font-weight="bold">{label}</text>
'''


# Export convenience functions
async def generate_reaction_image(
    drug1: str,
    drug2: str,
    drug1_formula: str = "",
    drug2_formula: str = "",
    mechanism: Optional[str] = None
) -> Optional[str]:
    """Generate a chemical reaction diagram with equation."""
    return await ChemicalDiagramService.generate_reaction_diagram(
        drug1, drug2, drug1_formula, drug2_formula, mechanism
    )


async def generate_chemical_formula_image(formula: str, drug_name: str) -> Optional[str]:
    """Generate a molecule structure image."""
    mol_data = await ChemicalDiagramService.get_molecule_data(drug_name)
    if mol_data and mol_data.cid:
        img_base64 = await ChemicalDiagramService.get_structure_image_base64(mol_data.cid, 300)
        if img_base64:
            return f"data:image/png;base64,{img_base64}"
    return None
