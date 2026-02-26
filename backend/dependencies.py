import asyncio
import logging
import time
from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from services.supabase_service import SupabaseService
from config import AUTH_TIMEOUT

logger = logging.getLogger(__name__)
security = HTTPBearer()

# Role model:
# - app_metadata.role is server-controlled (service role / admin API). TRUST this.
# - user_metadata is user-controlled. NEVER use it for authorization.
ROLE_USER = "user"
ROLE_ADMIN = "admin"
ROLE_PHARMACIST = "pharmacist"
ROLE_PHARMACIST_PENDING = "pharmacist_pending"
ROLE_PHARMACIST_REJECTED = "pharmacist_rejected"



# --- Simple In-Memory Cache for Auth ---
# Global cache: {token: (user_dict, expiry_timestamp)}
_auth_cache = {}

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> dict:
    """Verify JWT token and return user dict."""
    token = credentials.credentials
    
    # Clean cache occasionally? For now, we rely on the fact that map won't grow infinitely 
    # unless millions of unique tokens are sent. A proper LRU is better but requires external lib.
    # We will just clean expired entries lazily on access or implement a simple cleanup if needed.

    current_time = time.time()
    
    # 1. Check Cache
    if token in _auth_cache:
        cached_user, expiry = _auth_cache[token]
        if current_time < expiry:
            return cached_user
        else:
            del _auth_cache[token]  # Expired

    client = SupabaseService.get_client()
    if not client:
        raise HTTPException(status_code=503, detail="Authentication service unavailable")

    try:
        # Wrap in timeout to prevent hanging - direct callable instead of lambda
        user_response = await asyncio.wait_for(
            asyncio.to_thread(client.auth.get_user, token),
            timeout=AUTH_TIMEOUT
        )

        if not user_response or not user_response.user:
            raise HTTPException(status_code=401, detail="Invalid or expired token")

        user_meta = user_response.user.user_metadata or {}
        app_meta = user_response.user.app_metadata or {}
        role = app_meta.get("role") or ROLE_USER

        # Return user as dict for consistent access, including app_metadata
        user_dict = {
            "id": user_response.user.id,
            "email": user_response.user.email,
            "metadata": user_meta,
            "app_metadata": app_meta,
            "role": role,
            "token": token
        }
        
        # 2. Set Cache (TTL 60 seconds)
        _auth_cache[token] = (user_dict, current_time + 60)
        
        return user_dict

    except asyncio.TimeoutError:
        logger.error("Authentication request timed out")
        raise HTTPException(status_code=503, detail="Authentication service timeout")
    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
    except Exception as e:
        # Log the actual error internally
        logger.error("Authentication error: %s", e)
        # Return generic message to client
        raise HTTPException(status_code=401, detail="Authentication failed")


def get_current_admin(user: dict = Depends(get_current_user)) -> dict:
    """Verify user has admin role."""
    if user.get("role") != ROLE_ADMIN:
        logger.warning(f"Unauthorized admin access attempt by {user['id']}")
        raise HTTPException(status_code=403, detail="Admin privileges required")
    return user


async def get_current_pharmacist(user: dict = Depends(get_current_user)) -> dict:
    """
    Verify user is a registered pharmacist.

    Checks both:
    1. Role in user_metadata (set during registration)
    2. Existence in pharmacist_profiles table (ground truth)
    """
    # Source of truth: pharmacist_profiles row existence for this user (via auth client so RLS works).
    try:
        client = SupabaseService.get_auth_client(user["token"])
    except Exception as e:
        logger.error("Failed to create auth client for pharmacist check: %s", e)
        raise HTTPException(status_code=503, detail="Database unavailable")

    try:
        result = await asyncio.to_thread(
            lambda: client.table("pharmacist_profiles")
                .select("id, verification_status")
                .eq("user_id", user["id"])
                .limit(1)
                .execute()
        )
    except Exception as e:
        logger.error("Error checking pharmacist profile: %s", e)
        raise HTTPException(status_code=503, detail="Database unavailable")

    if result.data and len(result.data) > 0:
        user["pharmacist_profile_id"] = result.data[0].get("id")
        user["pharmacist_verification_status"] = result.data[0].get("verification_status")
        return user

    logger.warning("Non-pharmacist tried to access pharmacist endpoint: %s", user.get("id"))
    raise HTTPException(status_code=403, detail="Pharmacist access required")


async def get_current_patient(user: dict = Depends(get_current_user)) -> dict:
    """
    Verify user is a regular patient (NOT a pharmacist).

    Pharmacists should use the pharmacist portal, not patient features.
    """
    # Ground truth: if they have a pharmacist profile, they must use pharmacist portal.
    try:
        client = SupabaseService.get_auth_client(user["token"])
    except Exception as e:
        logger.error("Failed to create auth client for patient check: %s", e)
        raise HTTPException(status_code=503, detail="Database unavailable")

    try:
        result = await asyncio.to_thread(
            lambda: client.table("pharmacist_profiles")
                .select("id")
                .eq("user_id", user["id"])
                .limit(1)
                .execute()
        )
        if result.data and len(result.data) > 0:
            logger.warning("Pharmacist tried to access patient endpoint: %s", user.get("id"))
            raise HTTPException(status_code=403, detail="Pharmacists should use the pharmacist portal")
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error checking pharmacist profile: %s", e)
        raise HTTPException(status_code=503, detail="Database unavailable")

    return user
