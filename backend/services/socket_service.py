import socketio
import logging
import os
import asyncio
import re
from urllib.parse import parse_qs

logger = logging.getLogger(__name__)

UUID_PATTERN = re.compile(
    r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
    re.IGNORECASE
)

def _socket_allowed_origins():
    is_production = os.getenv("ENV", "development").lower() == "production"
    if is_production:
        return [os.getenv("FRONTEND_URL", "https://medirep-ai.vercel.app")]
    return [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        os.getenv("FRONTEND_URL", "https://medirep-ai.vercel.app"),
    ]

# Initialize Socket.IO server (ASGI)
# CORS + auth are enforced here for the socket connection.
sio = socketio.AsyncServer(
    async_mode='asgi',
    cors_allowed_origins=_socket_allowed_origins(),
)

def _extract_bearer_token(environ) -> str | None:
    """
    Extract Bearer token from ASGI scope headers or query string.
    Supports:
      - Authorization: Bearer <token>
      - ?token=<jwt>
    """
    scope = environ.get("asgi.scope") or {}
    headers = scope.get("headers") or []

    auth_header = None
    for k, v in headers:
        if k and k.lower() == b"authorization":
            auth_header = (v or b"").decode("utf-8", errors="ignore")
            break

    if auth_header and auth_header.lower().startswith("bearer "):
        return auth_header.split(" ", 1)[1].strip() or None

    # Query string fallback (useful if client library can't set headers easily).
    qs_raw = scope.get("query_string") or b""
    try:
        qs = parse_qs(qs_raw.decode("utf-8", errors="ignore"))
        token = (qs.get("token") or [None])[0]
        return token.strip() if token else None
    except Exception:
        return None

async def _authenticate_socket(token: str) -> dict | None:
    """Validate JWT against Supabase and return user dict."""
    from services.supabase_service import SupabaseService
    from config import AUTH_TIMEOUT

    client = SupabaseService.get_client()
    if not client:
        return None

    try:
        user_response = await asyncio.wait_for(
            asyncio.to_thread(client.auth.get_user, token),
            timeout=AUTH_TIMEOUT,
        )
        if not user_response or not user_response.user:
            return None
        return {"id": user_response.user.id, "email": user_response.user.email, "token": token}
    except Exception:
        return None


@sio.event
async def connect(sid, environ):
    token = _extract_bearer_token(environ)
    if not token:
        logger.warning("Socket connect rejected (missing token): %s", sid)
        return False

    user = await _authenticate_socket(token)
    if not user:
        logger.warning("Socket connect rejected (invalid token): %s", sid)
        return False

    await sio.save_session(sid, {"user_id": user["id"], "token": token})
    logger.info("Socket connected: %s user=%s", sid, user["id"])

@sio.event
async def disconnect(sid):
    logger.info("Socket disconnected: %s", sid)

@sio.event
async def join_room(sid, data):
    """
    Join a consultation room.

    Client may send:
      {"consultation_id": "<uuid>"}  (preferred)
    or legacy:
      {"room": "consultation_<uuid>"}
    """
    sess = await sio.get_session(sid)
    user_id = (sess or {}).get("user_id")
    if not user_id:
        logger.warning("join_room without authenticated session: %s", sid)
        return

    consultation_id = None
    if isinstance(data, dict):
        consultation_id = data.get("consultation_id")
        room = data.get("room")
        if not consultation_id and isinstance(room, str) and room.startswith("consultation_"):
            consultation_id = room.split("consultation_", 1)[1]

    if not consultation_id or not UUID_PATTERN.match(str(consultation_id)):
        logger.warning("join_room invalid consultation id: sid=%s user=%s data=%s", sid, user_id, data)
        return

    # Authorize room join (participant check).
    from services.supabase_service import SupabaseService
    client = SupabaseService.get_service_client()
    if not client:
        logger.error("Socket authorization failed: missing SUPABASE_SERVICE_ROLE_KEY")
        return

    try:
        consult = client.table("consultations").select(
            "patient_id, pharmacist_profiles!inner(user_id)"
        ).eq("id", str(consultation_id)).single().execute()
        if not consult.data:
            return

        patient_id = consult.data.get("patient_id")
        pharmacist_user_id = (consult.data.get("pharmacist_profiles") or {}).get("user_id")
        if user_id not in {patient_id, pharmacist_user_id}:
            logger.warning("Socket room join forbidden: sid=%s user=%s consult=%s", sid, user_id, consultation_id)
            return

        room_name = f"consultation_{consultation_id}"
        await sio.enter_room(sid, room_name)
        logger.info("Socket %s joined room %s", sid, room_name)
    except Exception as e:
        logger.error("Socket room join error: %s", e, exc_info=True)
