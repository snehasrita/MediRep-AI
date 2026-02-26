from fastapi import APIRouter, HTTPException, Depends, Path, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import List, Optional
import asyncio
import logging

from models import DrugInfo, DrugSearchResult, InteractionRequest, InteractionResponse, SavedDrug, EnhancedInteractionRequest, EnhancedInteractionResponse
from pydantic import BaseModel, Field
from services.drug_service import search_drugs, get_drug_info, find_cheaper_substitutes
from services.interaction_service import check_interactions
from services.interaction_calculator import get_enhanced_interaction
from services.image_generation_service import generate_reaction_image
from services.supabase_service import SupabaseService
from middleware.auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter()
security = HTTPBearer()


# Request/Response models for reaction image
class ReactionImageRequest(BaseModel):
    drug1: str = Field(..., min_length=1, max_length=100)
    drug2: str = Field(..., min_length=1, max_length=100)
    drug1_formula: Optional[str] = None
    drug2_formula: Optional[str] = None
    mechanism: Optional[str] = None


class ReactionImageResponse(BaseModel):
    url: Optional[str] = None
    error: Optional[str] = None


@router.get("/search", response_model=List[DrugSearchResult])
async def search_drugs_endpoint(
    q: str = Query(..., min_length=2, description="Search query (min 2 characters)")
):
    """Search for drugs by name"""
    results = await search_drugs(q)
    return results


@router.get("/substitutes", response_model=List[DrugInfo])
async def find_substitutes(
    drug_name: str = Query(..., min_length=2, description="Drug name to find substitutes for")
):
    """Find cheaper generic substitutes for a drug."""
    results = await find_cheaper_substitutes(drug_name)
    return results


@router.get("/info", response_model=DrugInfo)
async def get_drug_info_endpoint(
    name: str = Query(..., min_length=1, description="Drug name"),
    user = Depends(get_current_user)
):
    """Get detailed info for a drug, including chemical data."""
    info = await get_drug_info(name, enrich=True)
    if not info:
        raise HTTPException(status_code=404, detail="Drug not found")
    return info


# FIXED: /saved routes BEFORE /{drug_name} to prevent route shadowing
@router.post("/saved", response_model=bool)
async def save_drug(
    drug: SavedDrug, 
    user = Depends(get_current_user),
    creds: HTTPAuthorizationCredentials = Depends(security)
):
    """Save a drug to user's list"""
    try:
        client = SupabaseService.get_auth_client(creds.credentials)
        
        user_id = user.id
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid user")
        
        drug_name = drug.drug_name
        notes = drug.notes
        
        # Upsert to handle duplicates - check if exists first
        existing = await asyncio.to_thread(
            lambda uid=user_id, dname=drug_name: client.table("saved_drugs")
                .select("id")
                .eq("user_id", uid)
                .eq("drug_name", dname)
                .execute()
        )
        
        if existing.data:
            # Update existing
            await asyncio.to_thread(
                lambda uid=user_id, dname=drug_name, n=notes: client.table("saved_drugs")
                    .update({"notes": n})
                    .eq("user_id", uid)
                    .eq("drug_name", dname)
                    .execute()
            )
        else:
            # Insert new
            await asyncio.to_thread(
                lambda uid=user_id, dname=drug_name, n=notes: client.table("saved_drugs")
                    .insert({"user_id": uid, "drug_name": dname, "notes": n})
                    .execute()
            )
        return True
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to save drug")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/saved", response_model=List[SavedDrug])
async def get_saved_drugs(
    user = Depends(get_current_user),
    creds: HTTPAuthorizationCredentials = Depends(security)
):
    """Get user's saved drugs"""
    try:
        client = SupabaseService.get_auth_client(creds.credentials)
        
        user_id = user.id
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid user")
        
        response = await asyncio.to_thread(
            lambda uid=user_id: client.table("saved_drugs").select("*").eq("user_id", uid).execute()
        )
        return [SavedDrug(**item) for item in response.data]
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to get saved drugs")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/interactions/enhanced", response_model=EnhancedInteractionResponse)
async def enhanced_interaction_endpoint(request: EnhancedInteractionRequest):
    """Get enhanced drug interaction analysis with AUC mathematics.
    
    Returns detailed pharmacokinetic analysis including:
    - Chemical formulas and molecular data
    - AUC ratio calculation (R = 1 + [I]/Ki)
    - Metabolic pathway changes
    - Clinical recommendations
    """
    result = await get_enhanced_interaction(
        request.drug1,
        request.drug2,
        request.patient_context
    )
    
    if not result:
        raise HTTPException(
            status_code=404,
            detail=f"No enhanced interaction data available for {request.drug1} and {request.drug2}. Try the standard /interactions endpoint."
        )
    
    return result


@router.post("/interactions", response_model=InteractionResponse)
async def check_interactions_endpoint(request: InteractionRequest):
    """Check drug-drug interactions AND drug-patient interactions.
    
    Validation is handled by Pydantic.
    """
    interactions = await check_interactions(request.drugs, request.patient_context)
    return InteractionResponse(interactions=interactions)


@router.post("/reaction-image", response_model=ReactionImageResponse)
async def generate_reaction_image_endpoint(request: ReactionImageRequest):
    """Generate a chemical reaction image for drug interaction using Freepik AI.
    
    This endpoint generates a visual representation of the chemical interaction
    between two drugs using the Freepik AI image generation API.
    
    Returns:
        ReactionImageResponse with the generated image URL or error message.
    """
    try:
        logger.info(f"Generating reaction image for {request.drug1} + {request.drug2}")
        
        url = await generate_reaction_image(
            drug1=request.drug1,
            drug2=request.drug2,
            drug1_formula=request.drug1_formula or "",
            drug2_formula=request.drug2_formula or "",
            mechanism=request.mechanism
        )
        
        if url:
            logger.info(f"Successfully generated reaction image: {url[:100]}...")
            return ReactionImageResponse(url=url)
        else:
            logger.warning("Freepik API returned no image URL")
            return ReactionImageResponse(error="Failed to generate image. Check FREEPIK_API_KEY configuration.")
            
    except Exception as e:
        logger.exception(f"Error generating reaction image: {e}")
        return ReactionImageResponse(error=str(e))


@router.get("/{drug_name}", response_model=DrugInfo)
async def get_drug_info_endpoint(
    drug_name: str = Path(..., min_length=1, max_length=200, description="Drug name")
):
    """Get detailed drug information from openFDA.
    
    Note: drug_name validation is lenient here; the service handles sanitization.
    """
    info = await get_drug_info(drug_name)
    if not info:
        raise HTTPException(status_code=404, detail="Drug not found")
    return info
