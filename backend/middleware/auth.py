"""
Authentication Middleware - Validates Supabase JWT tokens.

Usage:
    from middleware.auth import get_current_user, get_optional_user

    @router.get("/protected")
    async def protected_route(user = Depends(get_current_user)):
        return {"user_id": user.id}

    @router.get("/public-with-optional-auth")
    async def optional_route(user = Depends(get_optional_user)):
        if user:
            return {"logged_in": True, "user_id": user.id}
        return {"logged_in": False}
"""
import logging
from typing import Optional
from dataclasses import dataclass
from fastapi import Request, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from dependencies import get_current_user as _get_current_user_dict

logger = logging.getLogger(__name__)

# Security scheme for Swagger UI
security = HTTPBearer(auto_error=False)


@dataclass
class AuthUser:
    """Authenticated user from Supabase JWT."""
    id: str
    email: Optional[str]
    role: str
    app_metadata: dict
    user_metadata: dict
    token: str


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> AuthUser:
    """
    Dependency that validates JWT and returns the current user.
    Raises 401 if not authenticated.
    """
    if not credentials:
        raise HTTPException(
            status_code=401,
            detail="Missing authentication token",
            headers={"WWW-Authenticate": "Bearer"}
        )
    
    try:
        user_dict = await _get_current_user_dict(credentials)
        return AuthUser(
            id=user_dict["id"],
            email=user_dict.get("email"),
            role=user_dict.get("role") or "user",
            app_metadata=user_dict.get("app_metadata") or {},
            user_metadata=user_dict.get("metadata") or {},
            token=user_dict["token"]
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Auth error: %s", e)
        raise HTTPException(
            status_code=401,
            detail="Authentication failed",
            headers={"WWW-Authenticate": "Bearer"}
        )


async def get_optional_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> Optional[AuthUser]:
    """
    Dependency that optionally returns the current user.
    Returns None if not authenticated (doesn't raise error).
    """
    if not credentials:
        return None
    
    try:
        return await get_current_user(credentials)
    except HTTPException:
        return None
