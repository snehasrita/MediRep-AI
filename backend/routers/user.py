from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from typing import Optional, List
import logging
import asyncio
from supabase import create_client
from pydantic import BaseModel

from models import PatientContext, ConsultationStatus
from config import SUPABASE_URL, SUPABASE_KEY
from dependencies import get_current_patient
from middleware.auth import get_current_user
from services.supabase_service import SupabaseService
from services.language_service import get_supported_languages_list
from services.pharma_rep_service import pharma_rep_service

logger = logging.getLogger(__name__)
router = APIRouter()
security = HTTPBearer()


class RepModeSetRequest(BaseModel):
    company: str

def get_auth_client(token: str):
    """Create a Supabase client authenticated as the user (for RLS)."""
    return SupabaseService.get_auth_client(token)

@router.get("/profile/context", response_model=Optional[PatientContext])
async def get_patient_context(
    user: dict = Depends(get_current_patient),
    creds: HTTPAuthorizationCredentials = Depends(security)
):
    """Get saved patient context for the current user."""
    try:
        user_id = user["id"]
        client = get_auth_client(creds.credentials)
        
        response = await asyncio.to_thread(
            lambda: client.table("user_profiles")
                .select("patient_context")
                .eq("id", user_id)
                .single()
                .execute()
        )
        
        if response.data and response.data.get("patient_context"):
            return PatientContext(**response.data["patient_context"])
        return None
        
    except Exception as e:
        logger.error("Failed to get patient context: %s", e)
        # Don't expose internal error, just return None (empty context)
        return None

@router.post("/profile/context", response_model=bool)
async def save_patient_context(
    context: PatientContext,
    user: dict = Depends(get_current_patient),
    creds: HTTPAuthorizationCredentials = Depends(security)
):
    """Save or update patient context."""
    logger.info("Save patient context request for user %s", user["id"])
    logger.info("Context received: %s", context.model_dump(by_alias=True))
    try:
        user_id = user["id"]
        # Use service role client to bypass potential RLS issues
        # We've already verified identity via the token in get_current_patient
        client = SupabaseService.get_service_client()
        if not client:
            logger.error("Failed to get service client")
            raise HTTPException(status_code=500, detail="Database connection error")
        
        context_data = context.model_dump(by_alias=True)
        logger.info("Context data to save for user %s: %s", user_id, context_data)
        
        # Upsert profile (using service role to ensure permissions)
        response = await asyncio.to_thread(
            lambda: client.table("user_profiles")
                .upsert({
                    "id": user_id, 
                    "patient_context": context_data
                })
                .execute()
        )
        logger.info("Supabase save response data: %s", response.data)
        return True
        
    except Exception as e:
        logger.error("Failed to save patient context: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to save context")


@router.get("/consultations", response_model=List[ConsultationStatus])
async def get_my_consultations(
    status: Optional[str] = None,
    user: dict = Depends(get_current_patient)
):
    """Get all consultations for the current patient."""
    # We use service role to safely join pharmacist profile fields without
    # reopening public SELECT policies on pharmacist_profiles.
    client = SupabaseService.get_service_client()
    if not client:
        raise HTTPException(status_code=503, detail="Database unavailable")
    try:
        user_id = user["id"]
        
        query = client.table("consultations").select(
            "id, patient_id, pharmacist_id, scheduled_at, duration_minutes, status, amount, payment_status, patient_concern, razorpay_order_id, created_at, updated_at, pharmacist_profiles(full_name)"
        ).eq("patient_id", user_id)
        
        if status:
            if status == "upcoming":
                # Active consultations (pending payment, confirmed, or in progress)
                query = query.in_("status", ["pending_payment", "confirmed", "in_progress"])
            elif status == "past":
                # Completed or terminal states
                query = query.in_("status", ["completed", "cancelled", "refunded", "no_show"])
            else:
                query = query.eq("status", status)
                
        # Order by schedule
        query = query.order("scheduled_at", desc=True)
        
        response = query.execute()
        
        # Map to model, flattened pharmacist_name
        result = []
        for c in response.data:
            c_dict = dict(c)
            # pharmacist_profiles might be a dict or list depending on join
            pharma = c_dict.get("pharmacist_profiles")
            pharma_name = "Unknown Pharmacist"
            if pharma and isinstance(pharma, dict):
                pharma_name = pharma.get("full_name", pharma_name)
            
            # Remove nested object to match flat model if needed, or mapping handles it
            c_dict["pharmacist_name"] = pharma_name
            result.append(ConsultationStatus(**c_dict))
            
        return result
        
    except Exception as e:
        logger.error("Failed to get my consultations: %s", e)
        raise HTTPException(status_code=500, detail="Failed to fetch consultations")


@router.get("/languages")
async def get_supported_languages():
    """
    Get list of supported languages for the chat interface.
    Returns language codes and BCP-47 codes for Web Speech API.
    """
    return {"languages": get_supported_languages_list()}


@router.get("/rep-mode")
async def get_rep_mode_status(
    current_user: object = Depends(get_current_user)
):
    """Get active pharma rep mode for the current user."""
    try:
        rep_company = await asyncio.to_thread(
            pharma_rep_service.get_active_company_context,
            current_user.id,
            current_user.token,
        )
        if not rep_company:
            return {"active": False}

        return {
            "active": True,
            "company_key": rep_company.get("company_key"),
            "company_name": rep_company.get("company_name"),
            "company_id": rep_company.get("id"),
        }
    except Exception as e:
        logger.error("Failed to get rep mode status: %s", e)
        raise HTTPException(status_code=500, detail="Failed to get rep mode status")


@router.post("/rep-mode/clear")
async def clear_rep_mode_status(
    current_user: object = Depends(get_current_user)
):
    """Clear active pharma rep mode for the current user."""
    try:
        result = await asyncio.to_thread(
            pharma_rep_service.clear_company_mode,
            current_user.id,
            current_user.token,
        )
        return {"success": bool(result.get("success")), "message": result.get("message")}
    except Exception as e:
        logger.error("Failed to clear rep mode status: %s", e)
        raise HTTPException(status_code=500, detail="Failed to clear rep mode")


@router.get("/rep-mode/companies")
async def get_available_companies_endpoint(
    current_user: object = Depends(get_current_user)
):
    """Get list of available pharma companies for rep mode."""
    try:
        companies = await asyncio.to_thread(
            pharma_rep_service.get_available_companies,
            current_user.token,
        )
        return {"companies": companies}
    except Exception as e:
        logger.error("Failed to get available companies: %s", e)
        raise HTTPException(status_code=500, detail="Failed to get available companies")

@router.post("/rep-mode/set")
async def set_rep_mode_status(
    body: RepModeSetRequest,
    current_user: object = Depends(get_current_user)
):
    """Set pharma rep mode for the current user."""
    company = (body.company or "").strip()
    if not company:
        raise HTTPException(status_code=400, detail="Company name is required")

    try:
        result = await asyncio.to_thread(
            pharma_rep_service.set_company_mode,
            current_user.id,
            current_user.token,
            company,
        )
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("message", "Failed to set rep mode"))

        rep_company = await asyncio.to_thread(
            pharma_rep_service.get_active_company_context,
            current_user.id,
            current_user.token,
        )

        if rep_company:
            return {
                "active": True,
                "company_key": rep_company.get("company_key"),
                "company_name": rep_company.get("company_name"),
                "company_id": rep_company.get("id"),
            }

        return {
            "active": True,
            "company_key": result.get("company_key"),
            "company_name": result.get("company"),
            "company_id": None,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to set rep mode status: %s", e)
        raise HTTPException(status_code=500, detail="Failed to set rep mode")
