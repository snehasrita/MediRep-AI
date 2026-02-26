"""
Pharmacist Router - Registration, dashboard, and profile management.

Endpoints:
- POST /register - Register as pharmacist (requires auth, supports file upload)
- GET /profile - Get own pharmacist profile
- PUT /profile - Update profile
- GET /dashboard - Get dashboard stats
- PUT /availability - Toggle availability
- POST /schedule - Set availability schedule
- GET /consultations - List upcoming/past consultations
"""
import logging
import json
import uuid
import re
from urllib.parse import urlsplit, urlunsplit
from typing import List, Optional
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Depends, Query, UploadFile, File, Form
from pydantic import BaseModel

from dependencies import get_current_user, get_current_pharmacist
from models import (
    PharmacistRegistration,
    PharmacistProfile,
    PharmacistScheduleSlot,
    PharmacistDashboardStats,
    ConsultationStatus,
)
from services.supabase_service import SupabaseService
from services.email_service import EmailService
from config import MAX_UPLOAD_SIZE, MAX_UPLOAD_SIZE_MB, SUPABASE_URL

logger = logging.getLogger(__name__)
router = APIRouter()

def _normalize_public_url(url: str) -> str:
    """Normalize stored public URLs to avoid accidental double-slash paths."""
    if not url:
        return url
    try:
        parts = urlsplit(url)
        path = re.sub(r"/{2,}", "/", parts.path)
        return urlunsplit((parts.scheme, parts.netloc, path, parts.query, parts.fragment))
    except Exception:
        return url


def _extract_supabase_storage_path(value: str) -> Optional[tuple[str, str]]:
    """
    Accept either a raw storage object path (e.g. 'licenses/x.png') or a Supabase
    Storage URL to this project's SUPABASE_URL and extract (bucket, path).
    Returns None if it is not a valid project-owned Storage URL/path.
    """
    if not value:
        return None

    value = value.strip()

    # Raw path format we store in DB: "private_documents:licenses/...."
    if value.startswith("private_documents:"):
        return ("private_documents", value.split("private_documents:", 1)[1].lstrip("/"))

    # Raw object path (default bucket is private_documents for licenses).
    if not value.startswith("http"):
        return ("private_documents", value.lstrip("/"))

    try:
        parts = urlsplit(value)
        if not SUPABASE_URL:
            return None
        supabase_host = urlsplit(SUPABASE_URL).netloc
        if parts.netloc != supabase_host:
            return None

        # Supported patterns:
        # /storage/v1/object/public/<bucket>/<path>
        # /storage/v1/object/<bucket>/<path>
        seg = [s for s in parts.path.split("/") if s]
        if len(seg) < 5 or seg[0] != "storage" or seg[1] != "v1" or seg[2] != "object":
            return None

        idx = 3
        if seg[3] == "public":
            idx = 4
        if len(seg) <= idx:
            return None

        bucket = seg[idx]
        obj_path = "/".join(seg[idx + 1 :])
        if not bucket or not obj_path:
            return None
        return (bucket, obj_path)
    except Exception:
        return None


def _validate_license_upload(content_type: str, data: bytes) -> None:
    allowed = {"image/jpeg", "image/png", "application/pdf"}
    if content_type not in allowed:
        raise HTTPException(status_code=400, detail="License file must be JPEG, PNG, or PDF")

    # Magic-byte checks.
    if content_type == "image/jpeg" and not data.startswith(b"\xff\xd8"):
        raise HTTPException(status_code=400, detail="Invalid JPEG file")
    if content_type == "image/png" and not data.startswith(b"\x89PNG\r\n\x1a\n"):
        raise HTTPException(status_code=400, detail="Invalid PNG file")
    if content_type == "application/pdf" and not data.startswith(b"%PDF-"):
        raise HTTPException(status_code=400, detail="Invalid PDF file")


@router.post("/register", response_model=PharmacistProfile)
async def register_pharmacist(
    data: str = Form(...),
    license_file: Optional[UploadFile] = File(None),
    current_user: dict = Depends(get_current_user)
):
    """
    Register current user as a pharmacist.

    Requires authenticated user. Creates pending verification profile.
    Accepts FormData with JSON data and optional license file.
    """
    # Get authenticated client using the user's token (Required for RLS policies)
    auth_client = SupabaseService.get_auth_client(current_user["token"])
    # Get service role client for admin operations (like updating user metadata)
    service_client = SupabaseService.get_service_client()
    
    if not auth_client:
        raise HTTPException(status_code=503, detail="Database unavailable")

    user_id = current_user["id"]

    try:
        # Parse registration data from JSON string
        registration_data = json.loads(data)

        # Check if already registered
        existing = auth_client.table("pharmacist_profiles").select("id").eq(
            "user_id", user_id
        ).execute()

        if existing.data:
            raise HTTPException(
                status_code=400,
                detail="Already registered as pharmacist"
            )

        # Upload license doc (preferred) or validate provided storage reference.
        # IMPORTANT: never accept arbitrary external URLs here.
        license_ref = None
        if license_file:
            try:
                # Read file in chunks to prevent memory exhaustion.
                chunks = []
                total_size = 0
                while True:
                    chunk = await license_file.read(64 * 1024)
                    if not chunk:
                        break
                    total_size += len(chunk)
                    if total_size > MAX_UPLOAD_SIZE:
                        raise HTTPException(
                            status_code=400,
                            detail=f"License file too large. Maximum size is {MAX_UPLOAD_SIZE_MB}MB",
                        )
                    chunks.append(chunk)

                file_content = b"".join(chunks)
                _validate_license_upload(license_file.content_type or "application/octet-stream", file_content)

                # Normalize extension (do not trust filename).
                ext = "bin"
                if license_file.content_type == "image/jpeg":
                    ext = "jpg"
                elif license_file.content_type == "image/png":
                    ext = "png"
                elif license_file.content_type == "application/pdf":
                    ext = "pdf"

                file_name = f"licenses/{user_id}_{uuid.uuid4().hex[:8]}.{ext}"

                # Upload to a private bucket. Store the object path only; admins fetch via signed URLs.
                auth_client.storage.from_("private_documents").upload(
                    file_name,
                    file_content,
                    file_options={"content-type": license_file.content_type or "application/octet-stream"},
                )
                license_ref = f"private_documents:{file_name}"
                logger.info("License uploaded: %s", file_name)
            except HTTPException:
                raise
            except Exception as upload_error:
                logger.error("License upload failed: %s", upload_error, exc_info=True)
                raise HTTPException(status_code=500, detail="Failed to upload license file")
        else:
            # Legacy/alternate flow: accept only a project-owned Supabase Storage reference.
            provided = (registration_data.get("license_image_url") or "").strip()
            extracted = _extract_supabase_storage_path(provided)
            if extracted is None:
                raise HTTPException(
                    status_code=400,
                    detail="License file is required (or provide a valid Supabase Storage URL/path)",
                )
            bucket, obj_path = extracted
            if bucket != "private_documents":
                raise HTTPException(status_code=400, detail="License must be stored in private_documents bucket")
            license_ref = f"private_documents:{obj_path}"

        # Create pharmacist profile
        profile_data = {
            "user_id": user_id,
            "full_name": registration_data.get("full_name", ""),
            "phone": registration_data.get("phone", ""),
            "license_number": registration_data.get("license_number", ""),
            # Stored as "private_documents:<path>" (not a public URL).
            "license_image_url": license_ref,
            "license_state": registration_data.get("license_state", ""),
            "specializations": registration_data.get("specializations", []),
            "experience_years": registration_data.get("experience_years", 0),
            "languages": registration_data.get("languages", ["English"]),
            "education": registration_data.get("education", ""),
            "bio": registration_data.get("bio", ""),
            "rate": registration_data.get("rate", 299),
            "duration_minutes": registration_data.get("duration_minutes", 15),
            "upi_id": registration_data.get("upi_id", ""),
            "verification_status": "pending",
            "is_available": False,
        }

        # Validate constraints to avoid DB errors
        if not (99 <= profile_data["rate"] <= 9999):
             raise HTTPException(status_code=400, detail="Rate must be between 99 and 9999")
        
        if profile_data["duration_minutes"] not in [15, 30, 45, 60]:
             raise HTTPException(status_code=400, detail="Duration must be 15, 30, 45, or 60")

        result = auth_client.table("pharmacist_profiles").insert(
            profile_data
        ).execute()

        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to create profile")

        # Update app_metadata.role using service client (server-controlled).
        try:
            if service_client:
                user_response = service_client.auth.admin.get_user_by_id(user_id)
                current_app_meta = (user_response.user.app_metadata if user_response and user_response.user else {}) or {}
                merged_app_meta = dict(current_app_meta)
                merged_app_meta["role"] = "pharmacist_pending"
                service_client.auth.admin.update_user_by_id(user_id, {"app_metadata": merged_app_meta})
                logger.info("Updated user app_metadata role to pharmacist_pending: %s", user_id)
            else:
                 logger.warning("Service client unavailable, skipping role update")
        except Exception as role_error:
             # Log error but don't fail registration
            logger.error("Failed to update user app_metadata role: %s", role_error, exc_info=True)

        logger.info("Pharmacist registered: user_id=%s", user_id)

        # Send email notification to admins
        try:
            logger.info("Sending admin notification for new pharmacist registration: %s", profile_data["full_name"])
            email_sent = await EmailService.notify_admins_new_pharmacist(
                pharmacist_name=profile_data["full_name"],
                license_number=profile_data["license_number"],
                email=current_user.get("email")
            )
            if email_sent:
                logger.info("Admin notification email sent successfully")
            else:
                logger.warning("Admin notification email was not sent (check RESEND_API_KEY and ADMIN_EMAILS config)")
        except Exception as email_error:
            # Don't fail registration if email fails
            logger.error("Failed to send admin notification email: %s", email_error, exc_info=True)

        return PharmacistProfile(**result.data[0])

    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid registration data format")
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to register pharmacist: %s", e)
        raise HTTPException(status_code=500, detail="Registration failed")


@router.get("/profile", response_model=PharmacistProfile)
async def get_own_profile(current_user: dict = Depends(get_current_pharmacist)):
    """Get current user's pharmacist profile."""
    # Use authenticated client so RLS policies can verify auth.uid()
    try:
        client = SupabaseService.get_auth_client(current_user["token"])
    except Exception as e:
        logger.error("Failed to create auth client: %s", e)
        raise HTTPException(status_code=503, detail="Database unavailable")

    try:
        # Use limit(1) instead of maybe_single() to avoid 406 errors
        result = client.table("pharmacist_profiles").select("*").eq(
            "user_id", current_user["id"]
        ).limit(1).execute()

        if not result.data or len(result.data) == 0:
            raise HTTPException(status_code=404, detail="Not registered as pharmacist")

        return PharmacistProfile(**result.data[0])

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to get pharmacist profile: %s", e)
        raise HTTPException(status_code=500, detail="Failed to get profile")


class PharmacistProfileUpdate(BaseModel):
    """Request model for updating pharmacist profile."""
    bio: Optional[str] = None
    profile_image_url: Optional[str] = None
    specializations: Optional[List[str]] = None
    languages: Optional[List[str]] = None
    education: Optional[str] = None
    rate: Optional[int] = None
    duration_minutes: Optional[int] = None
    upi_id: Optional[str] = None


@router.put("/profile", response_model=PharmacistProfile)
async def update_profile(
    update_data: PharmacistProfileUpdate,
    current_user: dict = Depends(get_current_pharmacist)
):
    """Update pharmacist profile. Only non-null fields are updated."""
    try:
        logger.info("Update profile request for user=%s", current_user.get("id"))
        client = SupabaseService.get_auth_client(current_user["token"])
    except Exception as e:
        logger.error("Failed to create auth client: %s", e)
        raise HTTPException(status_code=503, detail="Database unavailable")

    try:
        # Build update dict with only provided fields
        updates = {}
        if update_data.bio is not None:
            updates["bio"] = update_data.bio
        if update_data.profile_image_url is not None:
            updates["profile_image_url"] = update_data.profile_image_url
        if update_data.specializations is not None:
            updates["specializations"] = update_data.specializations
        if update_data.languages is not None:
            updates["languages"] = update_data.languages
        if update_data.education is not None:
            updates["education"] = update_data.education
        if update_data.rate is not None:
            if update_data.rate < 1 or update_data.rate > 100000:
                raise HTTPException(status_code=400, detail="Rate must be between 1 and 100000")
            updates["rate"] = update_data.rate
        if update_data.duration_minutes is not None:
            if update_data.duration_minutes not in [15, 30, 45, 60]:
                raise HTTPException(status_code=400, detail="Duration must be 15, 30, 45, or 60")
            updates["duration_minutes"] = update_data.duration_minutes
        if update_data.upi_id is not None:
            updates["upi_id"] = update_data.upi_id

        if not updates:
            raise HTTPException(status_code=400, detail="No fields to update")

        updates["updated_at"] = datetime.utcnow().isoformat()

        result = client.table("pharmacist_profiles").update(updates).eq(
            "user_id", current_user["id"]
        ).execute()

        if not result.data:
            raise HTTPException(status_code=404, detail="Profile not found")

        return PharmacistProfile(**result.data[0])

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to update profile: %s", e)
        raise HTTPException(status_code=500, detail="Failed to update profile")


@router.get("/dashboard", response_model=PharmacistDashboardStats)
async def get_dashboard_stats(current_user: dict = Depends(get_current_pharmacist)):
    """Get pharmacist dashboard statistics."""
    # Use authenticated client for RLS
    try:
        client = SupabaseService.get_auth_client(current_user["token"])
    except Exception as e:
        logger.error("Failed to create auth client: %s", e)
        raise HTTPException(status_code=503, detail="Database unavailable")

    try:
        # Get pharmacist profile first
        profile = client.table("pharmacist_profiles").select(
            "id, rating_avg, rating_count, completed_consultations"
        ).eq("user_id", current_user["id"]).limit(1).execute()

        if not profile.data or len(profile.data) == 0:
            raise HTTPException(status_code=404, detail="Not registered as pharmacist")

        pharmacist_id = profile.data[0]["id"]

        # Get earnings from all paid consultations (confirmed, in_progress, completed)
        earnings_result = client.table("consultations").select(
            "pharmacist_earning"
        ).eq("pharmacist_id", pharmacist_id).in_(
            "status", ["confirmed", "in_progress", "completed"]
        ).eq("payment_status", "captured").execute()

        total_earnings = sum(c["pharmacist_earning"] or 0 for c in earnings_result.data)

        # Get pending payouts
        pending_result = client.table("pharmacist_payouts").select(
            "net_amount"
        ).eq("pharmacist_id", pharmacist_id).eq("status", "pending").execute()

        pending_payout = sum(p["net_amount"] or 0 for p in pending_result.data)

        # Get upcoming consultations count
        now = datetime.utcnow().isoformat()
        upcoming_result = client.table("consultations").select(
            "id", count="exact"
        ).eq("pharmacist_id", pharmacist_id).in_(
            "status", ["confirmed", "in_progress"]
        ).gte("scheduled_at", now).execute()

        return PharmacistDashboardStats(
            total_earnings=total_earnings,
            pending_payout=pending_payout,
            completed_consultations=profile.data[0]["completed_consultations"],
            upcoming_consultations=upcoming_result.count or 0,
            rating_avg=profile.data[0]["rating_avg"],
            rating_count=profile.data[0]["rating_count"],
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to get dashboard stats: %s", e)
        raise HTTPException(status_code=500, detail="Failed to get dashboard")


@router.put("/availability")
async def toggle_availability(
    is_available: bool,
    current_user: dict = Depends(get_current_pharmacist)
):
    """Toggle pharmacist availability status."""
    # Use authenticated client for RLS
    try:
        client = SupabaseService.get_auth_client(current_user["token"])
    except Exception as e:
        logger.error("Failed to create auth client: %s", e)
        raise HTTPException(status_code=503, detail="Database unavailable")

    try:
        # Only approved pharmacists can go available
        profile = client.table("pharmacist_profiles").select(
            "id, verification_status"
        ).eq("user_id", current_user["id"]).limit(1).execute()

        if not profile.data or len(profile.data) == 0:
            raise HTTPException(status_code=404, detail="Not registered as pharmacist")

        if is_available and profile.data[0]["verification_status"] != "approved":
            raise HTTPException(
                status_code=400,
                detail="Cannot go available until verification is approved"
            )

        result = client.table("pharmacist_profiles").update({
            "is_available": is_available,
            "updated_at": datetime.utcnow().isoformat()
        }).eq("user_id", current_user["id"]).execute()

        if not result.data:
            logger.error(f"Availability update failed for user {current_user.get('id')}. Potential RLS mismatch.")
            raise HTTPException(status_code=500, detail="Failed to persist availability status")

        return {"is_available": is_available}

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to toggle availability: %s", e)
        raise HTTPException(status_code=500, detail="Failed to update availability")


@router.post("/schedule", response_model=List[PharmacistScheduleSlot])
async def set_schedule(
    slots: List[PharmacistScheduleSlot],
    current_user: dict = Depends(get_current_pharmacist)
):
    """
    Set weekly availability schedule.

    Replaces all existing slots with new ones.
    """
    try:
        client = SupabaseService.get_auth_client(current_user["token"])
    except Exception as e:
        logger.error("Failed to create auth client: %s", e)
        raise HTTPException(status_code=503, detail="Database unavailable")

    try:
        pharmacist_id = current_user.get("pharmacist_profile_id")
        if not pharmacist_id:
            profile = client.table("pharmacist_profiles").select("id").eq(
                "user_id", current_user["id"]
            ).limit(1).execute()
            if not profile.data:
                raise HTTPException(status_code=404, detail="Not registered as pharmacist")
            pharmacist_id = profile.data[0]["id"]

        # Validate Overlaps (Application-side enforcement)
        if slots:
            sorted_slots = sorted(slots, key=lambda x: (x.day_of_week, x.start_time))
            for i in range(len(sorted_slots) - 1):
                curr = sorted_slots[i]
                next_slot = sorted_slots[i + 1]
                
                if curr.day_of_week == next_slot.day_of_week:
                    if curr.end_time > next_slot.start_time:
                        raise HTTPException(
                            status_code=400, 
                            detail=f"Overlapping slots detected on day {curr.day_of_week}"
                        )

        # Atomic replacement via DELETE -> INSERT
        # Current strategy: Delete all slots for this pharmacist -> Insert new ones.
        # This is safe enough for now but true atomicity requires a DB migration or RPC.
        # TODO: Implement atomic update using batch_id and RPC once schema migration is feasible.
        
        client.table("pharmacist_schedules").delete().eq(
            "pharmacist_id", pharmacist_id
        ).execute()
        
        # Insert new slots
        if slots:
            slot_data = [
                {
                    "pharmacist_id": pharmacist_id,
                    "day_of_week": slot.day_of_week,
                    "start_time": slot.start_time,
                    "end_time": slot.end_time,
                    "is_active": slot.is_active,
                }
                for slot in slots
            ]
            
            result = client.table("pharmacist_schedules").insert(slot_data).execute()
            return [PharmacistScheduleSlot(**s) for s in result.data]

        return []

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to set schedule: %s", e)
        raise HTTPException(status_code=500, detail="Failed to update schedule")


@router.get("/schedule", response_model=List[PharmacistScheduleSlot])
async def get_schedule(current_user: dict = Depends(get_current_pharmacist)):
    """Get own availability schedule."""
    try:
        client = SupabaseService.get_auth_client(current_user["token"])
    except Exception as e:
        logger.error("Failed to create auth client: %s", e)
        raise HTTPException(status_code=503, detail="Database unavailable")

    try:
        profile = client.table("pharmacist_profiles").select("id").eq(
            "user_id", current_user["id"]
        ).limit(1).execute()

        if not profile.data or len(profile.data) == 0:
            raise HTTPException(status_code=404, detail="Not registered as pharmacist")

        result = client.table("pharmacist_schedules").select("*").eq(
            "pharmacist_id", profile.data[0]["id"]
        ).order("day_of_week").order("start_time").execute()

        return [PharmacistScheduleSlot(**s) for s in result.data]

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to get schedule: %s", e)
        raise HTTPException(status_code=500, detail="Failed to get schedule")


class PharmacistConsultationSummary(BaseModel):
    id: str
    patient_id: str
    patient_name: Optional[str] = None
    scheduled_at: datetime
    duration_minutes: int
    status: str
    amount: int
    pharmacist_earning: int
    payment_status: Optional[str] = None
    razorpay_order_id: Optional[str] = None
    patient_concern: Optional[str] = None


@router.get("/consultations", response_model=List[PharmacistConsultationSummary])
async def get_pharmacist_consultations(
    status_filter: Optional[str] = Query(None, description="Filter: upcoming, past, all"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: dict = Depends(get_current_pharmacist)
):
    """Get pharmacist's consultations with patient names."""
    try:
        client = SupabaseService.get_auth_client(current_user["token"])
    except Exception as e:
        logger.error("Failed to create auth client: %s", e)
        raise HTTPException(status_code=503, detail="Database unavailable")

    try:
        profile = client.table("pharmacist_profiles").select("id").eq(
            "user_id", current_user["id"]
        ).limit(1).execute()

        if not profile.data or len(profile.data) == 0:
            raise HTTPException(status_code=404, detail="Not registered as pharmacist")

        pharmacist_id = profile.data[0]["id"]

        # Query consultations (no join)
        logger.info(f"Fetching consultations for pharmacist {pharmacist_id}, filter={status_filter}")
        query = client.table("consultations").select(
            "id, patient_id, scheduled_at, duration_minutes, status, amount, pharmacist_earning, payment_status, razorpay_order_id, patient_concern"
        ).eq("pharmacist_id", pharmacist_id)

        now = datetime.utcnow().isoformat()
        if status_filter == "upcoming":
            # Include confirmed/in_progress consultations regardless of time
            # (they may have just been booked or scheduled for now)
            query = query.in_("status", ["confirmed", "in_progress"])
        elif status_filter == "past":
            # Past includes completed, cancelled, refunded, no_show
            # Also include confirmed consultations that are past their scheduled time (missed?)
            query = query.in_("status", ["completed", "cancelled", "refunded", "no_show"])

        query = query.order("scheduled_at", desc=True).range(offset, offset + limit - 1)
        
        start_time = datetime.utcnow()
        result = query.execute()
        duration = (datetime.utcnow() - start_time).total_seconds()
        logger.info(f"Consultations fetch took {duration}s. Found {len(result.data) if result.data else 0} records")

        if not result.data:
            return []

        # Manually fetch patient names using Admin Client (Bypass RLS)
        patient_ids = list(set([c["patient_id"] for c in result.data if c.get("patient_id")]))
        
        patient_map = {}
        if patient_ids:
            try:
                # Use Service Role client to bypass RLS
                admin_client = SupabaseService.get_service_client()
                if admin_client:
                    # 1. Try user_profiles
                    logger.info(f"Fetching {len(patient_ids)} user profiles (Admin)")
                    profiles = admin_client.table("user_profiles").select("*").in_("id", patient_ids).execute()
                    
                    for p in profiles.data:
                        name = p.get("full_name") or p.get("display_name") or p.get("username")
                        try:
                            if not name and p.get("first_name"):
                                name = f"{p.get('first_name')} {p.get('last_name', '')}".strip()
                        except:
                            pass
                        if name:
                            patient_map[p["id"]] = name

                    # 2. Fallback to Auth Admin for missing IDs
                    missing_ids = [pid for pid in patient_ids if pid not in patient_map]
                    if missing_ids:
                        logger.info(f"Fetching {len(missing_ids)} users from Auth Admin")
                        for pid in missing_ids:
                            try:
                                user_response = admin_client.auth.admin.get_user_by_id(pid)
                                if user_response and user_response.user:
                                    meta = user_response.user.user_metadata or {}
                                    name = meta.get("full_name") or meta.get("name") or user_response.user.email
                                    if name:
                                        patient_map[pid] = name
                            except Exception as ex:
                                logger.warning(f"Failed to fetch user {pid} from auth: {ex}")
                else:
                    logger.error("Service Role client unavailable - check SUPABASE_SERVICE_ROLE_KEY")
                
            except Exception as e:
                logger.error("Failed to fetch patient names: %s", e, exc_info=True)

        # Transform data
        consultations = []
        try:
            for i, c in enumerate(result.data):
                patient_name = patient_map.get(c["patient_id"], "Unknown Patient")
                
                consultations.append(PharmacistConsultationSummary(
                    id=c["id"],
                    patient_id=c["patient_id"],
                    patient_name=patient_name,
                    scheduled_at=c["scheduled_at"],
                    duration_minutes=c["duration_minutes"],
                    status=c["status"],
                    amount=c["amount"],
                    pharmacist_earning=c.get("pharmacist_earning", 0),
                    payment_status=c.get("payment_status"),
                    razorpay_order_id=c.get("razorpay_order_id"),
                    patient_concern=c.get("patient_concern")
                ))
        except Exception as e:
            logger.error(f"Data transformation failed at index {i}: {e}. Data: {c}")
            raise HTTPException(status_code=500, detail=f"Data processing error: {str(e)}")

        return consultations

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to get consultations (Unhandled): %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to load consultations")


@router.get("/consultations/{consultation_id}", response_model=PharmacistConsultationSummary)
async def get_consultation_detail(
    consultation_id: str,
    current_user: dict = Depends(get_current_pharmacist)
):
    """Get single consultation details."""
    try:
        client = SupabaseService.get_auth_client(current_user["token"])
    except Exception as e:
        logger.error("Failed to create auth client: %s", e)
        raise HTTPException(status_code=503, detail="Database unavailable")

    try:
        # Get pharmacist ID
        profile = client.table("pharmacist_profiles").select("id").eq(
            "user_id", current_user["id"]
        ).limit(1).execute()
        
        if not profile.data:
            raise HTTPException(status_code=404, detail="Not registered as pharmacist")
        
        pharmacist_id = profile.data[0]["id"]
        
        # Fetch consultation
        result = client.table("consultations").select(
             "id, patient_id, scheduled_at, duration_minutes, status, amount, pharmacist_earning, payment_status, razorpay_order_id, patient_concern"
        ).eq("id", consultation_id).eq("pharmacist_id", pharmacist_id).single().execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail="Consultation not found")
            
        c = result.data
        patient_name = "Unknown Patient"
        
        # Resolve Patient Name (Admin Client)
        # Resolve Patient Name (Admin Client)
        try:
             admin_client = SupabaseService.get_service_client()
             if admin_client and c.get("patient_id"):
                 # 1. Profile
                 try:
                     p_res = admin_client.table("user_profiles").select("*").eq("id", c["patient_id"]).single().execute()
                     if p_res.data:
                         p = p_res.data
                         name = p.get("full_name") or p.get("display_name")
                         if not name and p.get("first_name"):
                             name = f"{p.get('first_name')} {p.get('last_name', '')}".strip()
                         if name:
                             patient_name = name
                 except:
                     pass
                 
                 # 2. Auth Fallback
                 if patient_name == "Unknown Patient":
                     user_res = admin_client.auth.admin.get_user_by_id(c["patient_id"])
                     if user_res and user_res.user:
                         meta = user_res.user.user_metadata or {}
                         patient_name = meta.get("full_name") or meta.get("name") or user_res.user.email or "Unknown Patient"
        except Exception as e:
            logger.error(f"Failed to resolve name for {c.get('patient_id')}: {e}")

        return PharmacistConsultationSummary(
                    id=c["id"],
                    patient_id=c["patient_id"],
                    patient_name=patient_name,
                    scheduled_at=c["scheduled_at"],
                    duration_minutes=c["duration_minutes"],
                    status=c["status"],
                    amount=c["amount"],
                    pharmacist_earning=c.get("pharmacist_earning", 0),
                    payment_status=c.get("payment_status"),
                    razorpay_order_id=c.get("razorpay_order_id"),
                    patient_concern=c.get("patient_concern")
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to get consultation detail: %s", e)
        raise HTTPException(status_code=500, detail="Failed to load consultation")


# ============================================================================
# PAYOUT HISTORY ENDPOINTS
# ============================================================================

class PayoutSummary(BaseModel):
    """Payout record for pharmacist view."""
    id: str
    period_start: str
    period_end: str
    gross_amount: int
    tds_deducted: int = 0
    net_amount: int
    consultation_count: int
    status: str
    payout_method: Optional[str] = None
    transfer_reference: Optional[str] = None
    processed_at: Optional[datetime] = None
    created_at: datetime


@router.get("/payouts", response_model=List[PayoutSummary])
async def get_payout_history(
    status_filter: Optional[str] = Query(None, pattern="^(pending|processing|completed|failed)$"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: dict = Depends(get_current_pharmacist)
):
    """Get pharmacist's payout history."""
    try:
        client = SupabaseService.get_auth_client(current_user["token"])
    except Exception as e:
        logger.error("Failed to create auth client: %s", e)
        raise HTTPException(status_code=503, detail="Database unavailable")

    try:
        # Get pharmacist ID
        profile = client.table("pharmacist_profiles").select("id").eq(
            "user_id", current_user["id"]
        ).limit(1).execute()

        if not profile.data or len(profile.data) == 0:
            raise HTTPException(status_code=404, detail="Not registered as pharmacist")

        pharmacist_id = profile.data[0]["id"]

        # Build query
        query = client.table("pharmacist_payouts").select("*").eq(
            "pharmacist_id", pharmacist_id
        ).order("created_at", desc=True)

        if status_filter:
            query = query.eq("status", status_filter)

        result = query.range(offset, offset + limit - 1).execute()

        if not result.data:
            return []

        return [PayoutSummary(
            id=p["id"],
            period_start=p["period_start"],
            period_end=p["period_end"],
            gross_amount=p.get("gross_amount", 0),
            tds_deducted=p.get("tds_deducted", 0),
            net_amount=p.get("net_amount", 0),
            consultation_count=p.get("consultation_count", 0),
            status=p["status"],
            payout_method=p.get("payout_method"),
            transfer_reference=p.get("transfer_reference"),
            processed_at=p.get("processed_at"),
            created_at=p["created_at"]
        ) for p in result.data]

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to get payout history: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to load payout history")


@router.get("/payouts/stats")
async def get_payout_stats(current_user: dict = Depends(get_current_pharmacist)):
    """Get summary stats for payouts (total earned, pending, last payout)."""
    try:
        client = SupabaseService.get_auth_client(current_user["token"])
    except Exception as e:
        logger.error("Failed to create auth client: %s", e)
        raise HTTPException(status_code=503, detail="Database unavailable")

    try:
        # Get pharmacist ID
        profile = client.table("pharmacist_profiles").select("id").eq(
            "user_id", current_user["id"]
        ).limit(1).execute()

        if not profile.data or len(profile.data) == 0:
            raise HTTPException(status_code=404, detail="Not registered as pharmacist")

        pharmacist_id = profile.data[0]["id"]

        # Get all payouts
        payouts = client.table("pharmacist_payouts").select("*").eq(
            "pharmacist_id", pharmacist_id
        ).execute()

        total_paid = 0
        total_pending = 0
        last_payout = None

        for p in (payouts.data or []):
            if p["status"] == "completed":
                total_paid += p.get("net_amount", 0)
                if not last_payout or p["processed_at"] > last_payout["processed_at"]:
                    last_payout = p
            elif p["status"] in ["pending", "processing"]:
                total_pending += p.get("net_amount", 0)

        # Get unpaid earnings (completed consultations not yet in a payout)
        unpaid = client.table("consultations").select(
            "pharmacist_earning"
        ).eq("pharmacist_id", pharmacist_id).eq(
            "status", "completed"
        ).eq("payment_status", "captured").is_(
            "payout_id", "null"
        ).execute()

        unpaid_amount = sum(c.get("pharmacist_earning", 0) or 0 for c in (unpaid.data or []))

        return {
            "total_paid": total_paid,
            "pending_payout": total_pending,
            "unpaid_earnings": unpaid_amount,
            "last_payout": {
                "amount": last_payout.get("net_amount", 0) if last_payout else 0,
                "date": last_payout.get("processed_at") if last_payout else None
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to get payout stats: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to load payout stats")
