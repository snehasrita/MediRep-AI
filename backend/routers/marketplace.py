"""
Marketplace Router - Public pharmacist discovery and search.

Endpoints:
- GET /pharmacists - Search available pharmacists
- GET /pharmacists/{id} - Get pharmacist profile
- GET /pharmacists/{id}/schedule - Get pharmacist availability
- GET /pharmacists/{id}/reviews - Get pharmacist reviews
"""
import logging
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Query

from models import PharmacistSearchResult, PharmacistPublicProfile, PharmacistScheduleSlot
from services.supabase_service import SupabaseService

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/pharmacists", response_model=List[PharmacistSearchResult])
async def search_pharmacists(
    specialization: Optional[str] = Query(None, description="Filter by specialization"),
    available_only: bool = Query(True, description="Only show available pharmacists"),
    min_rating: Optional[float] = Query(None, ge=0, le=5, description="Minimum rating"),
    max_rate: Optional[int] = Query(None, description="Maximum consultation rate"),
    language: Optional[str] = Query(None, description="Filter by language"),
    sort_by: str = Query("rating", description="Sort by: rating, rate, experience"),
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0)
):
    """
    Search for pharmacists.

    Public endpoint - no auth required.
    Only returns verified, approved pharmacists.
    """
    # Public marketplace endpoints are served by the backend; use service role to
    # bypass RLS and avoid exposing DB access directly.
    client = SupabaseService.get_service_client()
    if not client:
        raise HTTPException(status_code=503, detail="Database unavailable")

    try:
        # Build query
        query = client.table("pharmacist_profiles").select(
            "id, full_name, bio, profile_image_url, specializations, "
            "experience_years, languages, rate, duration_minutes, "
            "rating_avg, rating_count, is_available"
        ).eq("verification_status", "approved")

        # Apply filters
        if available_only:
            query = query.eq("is_available", True)

        if min_rating is not None:
            query = query.gte("rating_avg", min_rating)

        if max_rate is not None:
            query = query.lte("rate", max_rate)

        if specialization:
            query = query.contains("specializations", [specialization])

        if language:
            query = query.contains("languages", [language])

        # Sorting
        if sort_by == "rating":
            query = query.order("rating_avg", desc=True)
        elif sort_by == "rate":
            query = query.order("rate", desc=False)
        elif sort_by == "experience":
            query = query.order("experience_years", desc=True)
        else:
            query = query.order("rating_avg", desc=True)

        # Pagination
        query = query.range(offset, offset + limit - 1)

        result = query.execute()

        return [PharmacistSearchResult(**p) for p in result.data]

    except Exception as e:
        logger.error("Failed to search pharmacists: %s", e)
        raise HTTPException(status_code=500, detail="Failed to search pharmacists")


@router.get("/pharmacists/{pharmacist_id}", response_model=PharmacistPublicProfile)
async def get_pharmacist_profile(pharmacist_id: str):
    """
    Get detailed pharmacist profile.

    Public endpoint - no auth required.
    Only returns verified, approved pharmacists.
    """
    client = SupabaseService.get_service_client()
    if not client:
        raise HTTPException(status_code=503, detail="Database unavailable")

    try:
        result = client.table("pharmacist_profiles").select(
            "id, full_name, bio, profile_image_url, specializations, "
            "experience_years, languages, education, rate, duration_minutes, "
            "rating_avg, rating_count, completed_consultations, is_available"
        ).eq("id", pharmacist_id).eq("verification_status", "approved").maybe_single().execute()

        if not result.data:
            raise HTTPException(status_code=404, detail="Pharmacist not found")

        return PharmacistPublicProfile(**result.data)

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to get pharmacist profile: %s", e)
        raise HTTPException(status_code=500, detail="Failed to get pharmacist profile")


@router.get("/pharmacists/{pharmacist_id}/schedule", response_model=List[PharmacistScheduleSlot])
async def get_pharmacist_schedule(pharmacist_id: str):
    """
    Get pharmacist's weekly availability schedule.

    Returns recurring slots (day_of_week, start_time, end_time).
    """
    client = SupabaseService.get_service_client()
    if not client:
        raise HTTPException(status_code=503, detail="Database unavailable")

    try:
        # Verify pharmacist exists and is approved
        pharmacist = client.table("pharmacist_profiles").select("id").eq(
            "id", pharmacist_id
        ).eq("verification_status", "approved").maybe_single().execute()

        if not pharmacist.data:
            raise HTTPException(status_code=404, detail="Pharmacist not found")

        # Get schedule slots
        result = client.table("pharmacist_schedules").select(
            "id, day_of_week, start_time, end_time, is_active"
        ).eq("pharmacist_id", pharmacist_id).eq("is_active", True).order(
            "day_of_week"
        ).order("start_time").execute()

        return [PharmacistScheduleSlot(**s) for s in result.data]

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to get pharmacist schedule: %s", e)
        raise HTTPException(status_code=500, detail="Failed to get schedule")


@router.get("/pharmacists/{pharmacist_id}/reviews")
async def get_pharmacist_reviews(
    pharmacist_id: str,
    limit: int = Query(10, ge=1, le=50),
    offset: int = Query(0, ge=0)
):
    """
    Get pharmacist's public reviews.
    """
    client = SupabaseService.get_service_client()
    if not client:
        raise HTTPException(status_code=503, detail="Database unavailable")

    try:
        # Verify pharmacist exists
        pharmacist = client.table("pharmacist_profiles").select("id, full_name").eq(
            "id", pharmacist_id
        ).eq("verification_status", "approved").maybe_single().execute()

        if not pharmacist.data:
            raise HTTPException(status_code=404, detail="Pharmacist not found")

        # Get reviews
        result = client.table("consultation_reviews").select(
            "id, rating, review, created_at, pharmacist_response, responded_at",
            count="exact"
        ).eq("pharmacist_id", pharmacist_id).eq("is_public", True).eq(
            "is_flagged", False
        ).order("created_at", desc=True).range(offset, offset + limit - 1).execute()

        return {
            "pharmacist_id": pharmacist_id,
            "pharmacist_name": pharmacist.data["full_name"],
            "reviews": result.data,
            "total": result.count or 0
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to get pharmacist reviews: %s", e)
        raise HTTPException(status_code=500, detail="Failed to get reviews")


@router.get("/specializations")
async def get_specializations():
    """
    Get list of available specializations for filtering.
    """
    # Static list for now - could be dynamic from DB
    return {
        "specializations": [
            "General",
            "Diabetes",
            "Cardiology",
            "Dermatology",
            "Pediatrics",
            "Geriatrics",
            "Women's Health",
            "Mental Health",
            "Nutrition",
            "Pain Management"
        ]
    }


@router.get("/languages")
async def get_languages():
    """
    Get list of available languages for filtering.
    """
    return {
        "languages": [
            "English",
            "Hindi",
            "Bengali",
            "Telugu",
            "Marathi",
            "Tamil",
            "Gujarati",
            "Kannada",
            "Malayalam",
            "Punjabi"
        ]
    }
