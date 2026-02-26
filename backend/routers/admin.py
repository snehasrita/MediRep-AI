from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import List, Dict, Any, Optional
from datetime import datetime, date, timedelta
from pydantic import BaseModel, Field
import logging
import re
import uuid
from urllib.parse import urlsplit, urlunsplit

from dependencies import get_current_admin
from services.supabase_service import SupabaseService
from services.email_service import EmailService
from models import PharmacistProfile


# ============================================================================
# PAYOUT MODELS
# ============================================================================

class PayoutCreate(BaseModel):
    """Request to create a payout for a pharmacist."""
    pharmacist_id: str
    period_start: date
    period_end: date
    payout_method: str = Field(default="manual_upi", pattern="^(razorpay_payout|manual_upi|manual_bank)$")
    notes: Optional[str] = None


class PayoutUpdate(BaseModel):
    """Request to update payout status."""
    status: str = Field(..., pattern="^(processing|completed|failed)$")
    transfer_reference: Optional[str] = None  # UTR number for manual transfers
    notes: Optional[str] = None


class UserUpdate(BaseModel):
    """Request to update user status."""
    is_suspended: Optional[bool] = None
    notes: Optional[str] = None

logger = logging.getLogger(__name__)

# Admin endpoints must bypass RLS to see pending/rejected profiles (RLS only exposes
# approved profiles publicly and "own profile" to the owner). Use the service-role
# key server-side for admin operations.
def _get_admin_db_client():
    client = SupabaseService.get_service_client()
    if not client:
        raise HTTPException(
            status_code=503,
            detail="Admin database client unavailable (missing SUPABASE_SERVICE_ROLE_KEY)"
        )
    return client

def _normalize_public_url(url: str) -> str:
    """
    Normalize stored public URLs to avoid double-slash path issues like:
      https://<ref>.supabase.co//storage/v1/object/public/...
    """
    if not url:
        return url
    try:
        parts = urlsplit(url)
        # Collapse repeated slashes in the path only (keep scheme:// intact).
        path = re.sub(r"/{2,}", "/", parts.path)
        return urlunsplit((parts.scheme, parts.netloc, path, parts.query, parts.fragment))
    except Exception:
        return url

def _license_ref_to_admin_url(client, value: str) -> str:
    """
    Convert a stored license reference into an admin-viewable URL.
    Current storage format: "private_documents:<path>" or legacy public URL.
    """
    if not value:
        return value
    value = value.strip()

    # Legacy: public URL stored.
    if value.startswith("http"):
        return _normalize_public_url(value)

    # New: "bucket:path"
    if ":" in value:
        bucket, path = value.split(":", 1)
        bucket = bucket.strip()
        path = path.strip().lstrip("/")
        try:
            res = client.storage.from_(bucket).create_signed_url(path, 3600)
            # supabase-py returns {"signedURL": "..."} (or similar) depending on version.
            if isinstance(res, dict):
                return res.get("signedURL") or res.get("signedUrl") or res.get("signed_url") or value
            return value
        except Exception:
            return value

    # Fallback: treat as path in private_documents.
    try:
        res = client.storage.from_("private_documents").create_signed_url(value.lstrip("/"), 3600)
        if isinstance(res, dict):
            return res.get("signedURL") or res.get("signedUrl") or res.get("signed_url") or value
    except Exception:
        pass
    return value

# NOTE: Do NOT set a router-level prefix here.
# `backend/main.py` mounts this router at `/api/admin`, so adding `prefix="/admin"`
# would create `/api/admin/admin/...` and break the frontend.
router = APIRouter(tags=["Admin"], dependencies=[Depends(get_current_admin)])

@router.get("/stats")
async def get_admin_stats():
    """Get system-wide statistics for the admin dashboard."""
    client = _get_admin_db_client()
    
    try:
        # We can run parallel queries or separate ones. 
        # For simplicity, separate ones for now.
        
        # 1. Total users
        users_res = client.table("user_profiles").select("id", count="exact").execute()
        total_users = users_res.count if users_res.count is not None else 0
        
        # 2. Total pharmacists
        pharm_res = client.table("pharmacist_profiles").select("id", count="exact").execute()
        total_pharmacists = pharm_res.count if pharm_res.count is not None else 0
        
        # 3. Pending verifications
        pending_res = client.table("pharmacist_profiles").select("id", count="exact").eq("verification_status", "pending").execute()
        pending_count = pending_res.count if pending_res.count is not None else 0
        
        # 4. Consultations (only paid ones)
        consult_res = client.table("consultations").select("id", count="exact").eq(
            "payment_status", "captured"
        ).execute()
        total_consultations = consult_res.count if consult_res.count is not None else 0

        # 5. Revenue (platform_fee from captured payments)
        revenue_res = client.table("consultations").select("platform_fee").eq(
            "payment_status", "captured"
        ).execute()
        total_revenue = sum(c.get("platform_fee", 0) or 0 for c in (revenue_res.data or []))

        return {
            "total_users": total_users,
            "total_pharmacists": total_pharmacists,
            "pending_verifications": pending_count,
            "total_consultations": total_consultations,
            "total_revenue": total_revenue
        }
    except Exception as e:
        logger.error("Admin stats failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch admin stats")


@router.get("/pharmacists/pending")
async def get_pending_pharmacists():
    """Get list of pharmacists waiting for verification."""
    client = _get_admin_db_client()
    
    try:
        # Fetch profiles with pending status
        # We also need the email which is in auth.users, but Supabase-py 
        # access to auth.users is restricted. 
        # However, pharmacist_profiles has user_id, and we can't easily join auth.users via client
        # Strategy: Return profile data. Email might be missing unless we store it in profile.
        # Actually, user_profiles usually has email or we can use admin api (service role) to get user emails if needed.
        # For now, let's return profile data.
        
        response = client.table("pharmacist_profiles")\
            .select("*")\
            .eq("verification_status", "pending")\
            .order("created_at", desc=True)\
            .execute()

        data = response.data or []
        for row in data:
            if isinstance(row, dict) and "license_image_url" in row:
                row["license_image_url"] = _license_ref_to_admin_url(client, row.get("license_image_url") or "")
        return data
    except Exception as e:
        logger.error("Pending pharmacists fetch failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch pending pharmacists")


@router.post("/pharmacists/{pharmacist_id}/verify")
async def verify_pharmacist(
    pharmacist_id: str, 
    payload: Dict[str, Any],
    admin: dict = Depends(get_current_admin)
):
    """
    Approve or Reject a pharmacist application.
    Payload: {"status": "approved" | "rejected", "notes": "..."}
    """
    status_val = payload.get("status")
    notes = payload.get("notes")
    
    if status_val not in ["approved", "rejected"]:
        raise HTTPException(status_code=400, detail="Invalid status")
        
    client = _get_admin_db_client()
    
    try:
        update_data = {
            "verification_status": status_val,
            "verification_notes": notes,
            "verified_at": datetime.now().isoformat(),
            "verified_by": admin["id"]
        }
        
        if status_val == "approved":
            # Also set them as available by default? Optional.
            # update_data["is_available"] = True 
            pass
            
        response = client.table("pharmacist_profiles")\
            .update(update_data)\
            .eq("id", pharmacist_id)\
            .execute()
            
        if not response.data:
            raise HTTPException(status_code=404, detail="Pharmacist not found")

        pharmacist_data = response.data[0]

        # Get pharmacist's email from auth.users via user_id
        try:
            user_id = pharmacist_data.get("user_id")
            if user_id:
                # Use service client to get user email + current app_metadata for role updates.
                user_response = client.auth.admin.get_user_by_id(user_id)
                if user_response and user_response.user:
                    pharmacist_email = user_response.user.email
                    pharmacist_name = pharmacist_data.get("full_name", "Pharmacist")

                    # Update app_metadata.role based on verification result (server-controlled).
                    try:
                        current_app_meta = user_response.user.app_metadata or {}
                        new_role = "pharmacist" if status_val == "approved" else "pharmacist_rejected"
                        merged_app_meta = dict(current_app_meta)
                        merged_app_meta["role"] = new_role
                        client.auth.admin.update_user_by_id(user_id, {"app_metadata": merged_app_meta})
                    except Exception as role_err:
                        logger.error("Failed to update user app_metadata role: %s", role_err, exc_info=True)

                    # Send email notification to pharmacist
                    await EmailService.notify_pharmacist_verification(
                        email=pharmacist_email,
                        name=pharmacist_name,
                        status=status_val,
                        notes=notes
                    )
        except Exception as email_error:
            # Don't fail verification if email fails
            logger.error("Failed to send pharmacist notification email: %s", email_error)

        return {"success": True, "data": pharmacist_data}
    except Exception as e:
        logger.error("Pharmacist verification failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to update pharmacist verification status")


# ============================================================================
# PAYOUT MANAGEMENT ENDPOINTS
# ============================================================================

@router.get("/payouts")
async def list_payouts(
    status: Optional[str] = Query(None, pattern="^(pending|processing|completed|failed)$"),
    pharmacist_id: Optional[str] = None,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0)
):
    """List all payouts with optional filters."""
    client = _get_admin_db_client()

    try:
        query = client.table("pharmacist_payouts").select(
            "*, pharmacist:pharmacist_profiles(id, full_name, user_id)"
        ).order("created_at", desc=True)

        if status:
            query = query.eq("status", status)
        if pharmacist_id:
            query = query.eq("pharmacist_id", pharmacist_id)

        result = query.range(offset, offset + limit - 1).execute()

        return {
            "payouts": result.data or [],
            "count": len(result.data or [])
        }
    except Exception as e:
        logger.error("Failed to list payouts: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch payouts")


@router.get("/payouts/pending-earnings")
async def get_pending_earnings():
    """Get pharmacists with unpaid earnings (completed consultations not yet paid out)."""
    client = _get_admin_db_client()

    try:
        # Try RPC function first (if it exists)
        try:
            result = client.rpc("get_pending_pharmacist_earnings").execute()
            if result.data:
                return {"pending_earnings": result.data}
        except Exception:
            # RPC function doesn't exist, fall back to manual calculation
            pass

        # Manual calculation: Get all approved pharmacists
        pharmacists = client.table("pharmacist_profiles").select(
            "id, full_name, user_id"
        ).eq("verification_status", "approved").execute()

        pending_earnings = []

        for pharm in (pharmacists.data or []):
            # Get completed consultations not yet in a payout
            earnings = client.table("consultations").select(
                "id, pharmacist_earning, ended_at"
            ).eq("pharmacist_id", pharm["id"]).eq(
                "status", "completed"
            ).eq("payment_status", "captured").is_(
                "payout_id", "null"
            ).execute()

            total = sum(c.get("pharmacist_earning", 0) or 0 for c in (earnings.data or []))
            count = len(earnings.data or [])

            if total > 0:
                pending_earnings.append({
                    "pharmacist_id": pharm["id"],
                    "pharmacist_name": pharm["full_name"],
                    "pending_amount": total,
                    "consultation_count": count
                })

        return {"pending_earnings": pending_earnings}
    except Exception as e:
        logger.error("Failed to get pending earnings: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch pending earnings")


@router.post("/payouts")
async def create_payout(payload: PayoutCreate, admin: dict = Depends(get_current_admin)):
    """Create a new payout record for a pharmacist."""
    client = _get_admin_db_client()

    try:
        # Verify pharmacist exists
        pharm = client.table("pharmacist_profiles").select("id, full_name, user_id").eq(
            "id", payload.pharmacist_id
        ).single().execute()

        if not pharm.data:
            raise HTTPException(status_code=404, detail="Pharmacist not found")

        # Calculate earnings for the period
        consultations = client.table("consultations").select(
            "id, pharmacist_earning, platform_fee, amount"
        ).eq("pharmacist_id", payload.pharmacist_id).eq(
            "status", "completed"
        ).eq("payment_status", "captured").is_(
            "payout_id", "null"
        ).gte("ended_at", payload.period_start.isoformat()).lte(
            "ended_at", payload.period_end.isoformat()
        ).execute()

        if not consultations.data:
            raise HTTPException(status_code=400, detail="No unpaid consultations found for this period")

        gross_amount = sum(c.get("pharmacist_earning", 0) or 0 for c in consultations.data)
        platform_fee_total = sum(c.get("platform_fee", 0) or 0 for c in consultations.data)

        # Apply TDS if applicable (2% for payments > 20000 annually - simplified)
        tds_deducted = 0
        net_amount = gross_amount - tds_deducted

        # Create payout record
        payout_data = {
            "id": str(uuid.uuid4()),
            "pharmacist_id": payload.pharmacist_id,
            "period_start": payload.period_start.isoformat(),
            "period_end": payload.period_end.isoformat(),
            "gross_amount": gross_amount,
            "platform_fee_total": platform_fee_total,
            "tds_deducted": tds_deducted,
            "net_amount": net_amount,
            "consultation_count": len(consultations.data),
            "status": "pending",
            "payout_method": payload.payout_method,
            "created_at": datetime.now().isoformat()
        }

        result = client.table("pharmacist_payouts").insert(payout_data).execute()

        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to create payout")

        payout_id = result.data[0]["id"]

        # Link consultations to this payout
        consultation_ids = [c["id"] for c in consultations.data]
        client.table("consultations").update({"payout_id": payout_id}).in_(
            "id", consultation_ids
        ).execute()

        return {"success": True, "payout": result.data[0]}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to create payout: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to create payout")


@router.patch("/payouts/{payout_id}")
async def update_payout(
    payout_id: str,
    payload: PayoutUpdate,
    admin: dict = Depends(get_current_admin)
):
    """Update payout status (mark as processing, completed, or failed)."""
    client = _get_admin_db_client()

    try:
        # Get current payout
        current = client.table("pharmacist_payouts").select("*").eq("id", payout_id).single().execute()

        if not current.data:
            raise HTTPException(status_code=404, detail="Payout not found")

        update_data = {
            "status": payload.status,
            "updated_at": datetime.now().isoformat()
        }

        if payload.transfer_reference:
            update_data["transfer_reference"] = payload.transfer_reference
        if payload.notes:
            update_data["notes"] = payload.notes
        if payload.status == "completed":
            update_data["processed_at"] = datetime.now().isoformat()

        result = client.table("pharmacist_payouts").update(update_data).eq("id", payout_id).execute()

        return {"success": True, "payout": result.data[0] if result.data else None}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to update payout: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to update payout")


@router.get("/payouts/{payout_id}")
async def get_payout_details(payout_id: str):
    """Get detailed payout information including linked consultations."""
    client = _get_admin_db_client()

    try:
        # Get payout with pharmacist info
        payout = client.table("pharmacist_payouts").select(
            "*, pharmacist:pharmacist_profiles(id, full_name, user_id, upi_id)"
        ).eq("id", payout_id).single().execute()

        if not payout.data:
            raise HTTPException(status_code=404, detail="Payout not found")

        # Get linked consultations
        consultations = client.table("consultations").select(
            "id, amount, pharmacist_earning, platform_fee, ended_at"
        ).eq("payout_id", payout_id).execute()

        return {
            "payout": payout.data,
            "consultations": consultations.data or []
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to get payout details: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch payout details")


# ============================================================================
# USER MANAGEMENT ENDPOINTS
# ============================================================================

@router.get("/users")
async def list_users(
    search: Optional[str] = None,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0)
):
    """List all users with search capability."""
    client = _get_admin_db_client()

    try:
        query = client.table("user_profiles").select(
            "id, display_name, avatar_url, created_at, updated_at"
        ).order("created_at", desc=True)

        if search:
            query = query.ilike("display_name", f"%{search}%")

        result = query.range(offset, offset + limit - 1).execute()

        # Get user emails from auth.users
        users_with_email = []
        for user in (result.data or []):
            try:
                auth_user = client.auth.admin.get_user_by_id(user["id"])
                if auth_user and auth_user.user:
                    user["email"] = auth_user.user.email
                    user["is_suspended"] = auth_user.user.app_metadata.get("is_suspended", False) if auth_user.user.app_metadata else False
                    user["role"] = auth_user.user.app_metadata.get("role", "user") if auth_user.user.app_metadata else "user"
            except Exception:
                user["email"] = None
                user["is_suspended"] = False
                user["role"] = "user"
            users_with_email.append(user)

        # Get total count
        count_result = client.table("user_profiles").select("id", count="exact").execute()

        return {
            "users": users_with_email,
            "total": count_result.count or 0
        }
    except Exception as e:
        logger.error("Failed to list users: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch users")


@router.get("/users/{user_id}")
async def get_user_details(user_id: str):
    """Get detailed user information."""
    client = _get_admin_db_client()

    try:
        # Get user profile
        profile = client.table("user_profiles").select("*").eq("id", user_id).single().execute()

        if not profile.data:
            raise HTTPException(status_code=404, detail="User not found")

        # Get auth info
        auth_user = client.auth.admin.get_user_by_id(user_id)

        user_data = profile.data
        if auth_user and auth_user.user:
            user_data["email"] = auth_user.user.email
            user_data["is_suspended"] = auth_user.user.app_metadata.get("is_suspended", False) if auth_user.user.app_metadata else False
            user_data["role"] = auth_user.user.app_metadata.get("role", "user") if auth_user.user.app_metadata else "user"
            user_data["last_sign_in"] = auth_user.user.last_sign_in_at

        # Get consultation count
        consultations = client.table("consultations").select("id", count="exact").eq(
            "patient_id", user_id
        ).execute()
        user_data["consultation_count"] = consultations.count or 0

        # Check if user is also a pharmacist
        pharmacist = client.table("pharmacist_profiles").select("id, verification_status").eq(
            "user_id", user_id
        ).execute()
        user_data["is_pharmacist"] = len(pharmacist.data or []) > 0
        if pharmacist.data:
            user_data["pharmacist_status"] = pharmacist.data[0].get("verification_status")

        return {"user": user_data}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to get user details: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch user details")


@router.patch("/users/{user_id}")
async def update_user(
    user_id: str,
    payload: UserUpdate,
    admin: dict = Depends(get_current_admin)
):
    """Update user status (suspend/unsuspend)."""
    client = _get_admin_db_client()

    try:
        # Get current user
        auth_user = client.auth.admin.get_user_by_id(user_id)

        if not auth_user or not auth_user.user:
            raise HTTPException(status_code=404, detail="User not found")

        current_meta = auth_user.user.app_metadata or {}

        if payload.is_suspended is not None:
            current_meta["is_suspended"] = payload.is_suspended
            current_meta["suspended_at"] = datetime.now().isoformat() if payload.is_suspended else None
            current_meta["suspended_by"] = admin["id"] if payload.is_suspended else None
            current_meta["suspension_notes"] = payload.notes if payload.is_suspended else None

        # Update app_metadata
        client.auth.admin.update_user_by_id(user_id, {"app_metadata": current_meta})

        return {"success": True, "is_suspended": current_meta.get("is_suspended", False)}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to update user: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to update user")
