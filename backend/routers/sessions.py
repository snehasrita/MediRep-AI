"""
Chat Sessions Router - Session management for persistent conversations.

Security:
- Private session endpoints require authentication
- Shared read endpoint is public and token-scoped
- Ownership validation on every operation
- Rate limiting to prevent abuse
- Input sanitization and length limits
- No session enumeration possible (UUIDs / share tokens only)

Endpoints:
- POST   /sessions           - Create new session
- GET    /sessions           - List user's sessions (paginated)
- GET    /sessions/{id}      - Get session with messages
- PATCH  /sessions/{id}      - Update session (title, archive)
- DELETE /sessions/{id}      - Delete session permanently
- POST   /sessions/{id}/share - Create/get share link for a session
- GET    /sessions/shared/{token} - Public read-only shared session
- POST   /sessions/shared/{token}/continue - Fork shared session into viewer account
"""
import logging
import re
import secrets
from typing import Optional, List
from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends, Query, Request

from middleware.auth import get_current_user
from models import (
    SessionCreate,
    SessionUpdate,
    SessionSummary,
    SessionDetail,
    SessionMessage,
    PatientContext,
    SessionShareLink,
    SharedSessionDetail,
    SharedSessionContinueResponse,
)
from services.supabase_service import SupabaseService

logger = logging.getLogger(__name__)
router = APIRouter()

# ============================================================================
# CONSTANTS & VALIDATION
# ============================================================================

MAX_SESSIONS_PER_USER = 500  # Prevent storage abuse
MAX_MESSAGES_PER_SESSION = 200  # Prevent context explosion
MAX_TITLE_LENGTH = 100
MAX_MESSAGE_FETCH = 100  # Max messages to return in single request
MAX_HISTORY_BATCH = 500  # batch size when loading full shared history
MAX_FORK_INSERT_BATCH = 100  # chunked inserts for forked sessions

# UUID validation pattern
UUID_PATTERN = re.compile(
    r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
    re.IGNORECASE
)
SHARE_TOKEN_PATTERN = re.compile(r'^[A-Za-z0-9_-]{16,128}$')


def validate_uuid(value: str, field_name: str = "ID") -> str:
    """Validate UUID format to prevent injection."""
    if not value or not UUID_PATTERN.match(value):
        raise HTTPException(status_code=400, detail=f"Invalid {field_name} format")
    return value


def sanitize_title(title: str) -> str:
    """Sanitize title to prevent XSS and injection."""
    if not title:
        return "New Chat"
    # Remove control characters and limit length
    sanitized = re.sub(r'[\x00-\x1f\x7f-\x9f]', '', title)
    return sanitized[:MAX_TITLE_LENGTH].strip() or "New Chat"


def validate_share_token(share_token: str) -> str:
    """Validate share token format."""
    token = (share_token or "").strip()
    if not token or not SHARE_TOKEN_PATTERN.match(token):
        raise HTTPException(status_code=400, detail="Invalid share token format")
    return token


def _build_session_messages(rows: List[dict]) -> List[SessionMessage]:
    """Expand chat_history rows into user/assistant message list."""
    messages: List[SessionMessage] = []
    for msg in rows:
        messages.append(SessionMessage(
            id=f"{msg['id']}_user",
            role="user",
            content=msg["message"],
            created_at=msg["created_at"],
        ))
        messages.append(SessionMessage(
            id=f"{msg['id']}_assistant",
            role="assistant",
            content=msg["response"],
            created_at=msg["created_at"],
        ))
    return messages


def _load_full_session_history_rows(client: object, session_id: str, fields: str) -> List[dict]:
    """
    Load full session history in batches to avoid response-size truncation.

    This intentionally returns all rows so shared-session viewers can see the
    full conversation exactly as requested.
    """
    rows: List[dict] = []
    offset = 0

    while True:
        result = client.table("chat_history").select(fields).eq(
            "session_id", session_id
        ).order("sequence_num", desc=False).range(offset, offset + MAX_HISTORY_BATCH - 1).execute()

        batch = result.data or []
        if not batch:
            break

        rows.extend(batch)
        if len(batch) < MAX_HISTORY_BATCH:
            break

        offset += MAX_HISTORY_BATCH

    return rows


def _handle_shared_sessions_table_error(error: Exception) -> None:
    """Map missing-table errors to actionable HTTP response."""
    msg = str(error).lower()
    if "shared_sessions" in msg and ("does not exist" in msg or "relation" in msg):
        raise HTTPException(
            status_code=503,
            detail="Shared sessions are not initialized. Apply backend/sql/shared_sessions_schema.sql first.",
        )


# ============================================================================
# ENDPOINTS
# ============================================================================

@router.post("", response_model=SessionSummary, status_code=201)
async def create_session(
    request: Request,
    body: Optional[SessionCreate] = None,
    current_user: object = Depends(get_current_user)
):
    """
    Create a new chat session.

    Returns the created session summary.
    """
    client = SupabaseService.get_auth_client(current_user.token)
    if not client:
        raise HTTPException(status_code=503, detail="Database unavailable")

    user_id = current_user.id

    try:
        # Check session limit to prevent abuse
        count_result = client.table("chat_sessions").select(
            "id", count="exact"
        ).eq("user_id", user_id).eq("is_archived", False).execute()

        if count_result.count and count_result.count >= MAX_SESSIONS_PER_USER:
            raise HTTPException(
                status_code=400,
                detail=f"Session limit reached ({MAX_SESSIONS_PER_USER}). Archive or delete old sessions."
            )

        # Create session
        title = "New Chat"
        if body and body.title:
            title = sanitize_title(body.title)

        session_data = {
            "user_id": user_id,
            "title": title,
            "message_count": 0,
            "is_archived": False,
        }

        result = client.table("chat_sessions").insert(session_data).execute()

        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to create session")

        session = result.data[0]
        logger.info("Session created: %s for user %s", session["id"][:8], user_id[:8])

        return SessionSummary(
            id=session["id"],
            title=session["title"],
            message_count=session["message_count"],
            is_archived=session["is_archived"],
            created_at=session["created_at"],
            updated_at=session["updated_at"],
            last_message_at=session["last_message_at"],
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to create session: %s", e)
        raise HTTPException(status_code=500, detail="Failed to create session")


@router.get("", response_model=List[SessionSummary])
async def list_sessions(
    request: Request,
    archived: bool = Query(False, description="Include archived sessions"),
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0),
    current_user: object = Depends(get_current_user)
):
    """
    List user's chat sessions.

    Returns sessions ordered by last_message_at (most recent first).
    """
    client = SupabaseService.get_auth_client(current_user.token)
    if not client:
        raise HTTPException(status_code=503, detail="Database unavailable")

    user_id = current_user.id

    try:
        query = client.table("chat_sessions").select(
            "id, title, message_count, is_archived, created_at, updated_at, last_message_at"
        ).eq("user_id", user_id)

        if not archived:
            query = query.eq("is_archived", False)

        query = query.order("last_message_at", desc=True).range(offset, offset + limit - 1)

        result = query.execute()

        return [
            SessionSummary(
                id=s["id"],
                title=s["title"],
                message_count=s["message_count"],
                is_archived=s["is_archived"],
                created_at=s["created_at"],
                updated_at=s["updated_at"],
                last_message_at=s["last_message_at"],
            )
            for s in result.data
        ]

    except Exception as e:
        logger.error("Failed to list sessions: %s", e)
        raise HTTPException(status_code=500, detail="Failed to list sessions")


@router.get("/{session_id}", response_model=SessionDetail)
async def get_session(
    session_id: str,
    limit: int = Query(50, ge=1, le=MAX_MESSAGE_FETCH),
    offset: int = Query(0, ge=0),
    current_user: object = Depends(get_current_user)
):
    """
    Get session details with messages.

    Messages are returned in chronological order (oldest first).
    Use offset/limit for pagination.
    """
    validate_uuid(session_id, "session_id")

    client = SupabaseService.get_auth_client(current_user.token)
    if not client:
        raise HTTPException(status_code=503, detail="Database unavailable")

    user_id = current_user.id

    try:
        # Get session (RLS ensures only owner can access)
        session_result = client.table("chat_sessions").select("*").eq(
            "id", session_id
        ).eq("user_id", user_id).limit(1).execute()

        if not session_result or not session_result.data:
            raise HTTPException(status_code=404, detail="Session not found")

        session = session_result.data[0]

        # Get messages for this session
        messages_result = client.table("chat_history").select(
            "id, message, response, patient_context, created_at, sequence_num"
        ).eq("session_id", session_id).order(
            "sequence_num", desc=False
        ).range(offset, offset + limit - 1).execute()

        # Convert to SessionMessage format (each DB row = 1 user + 1 assistant message)
        messages = []
        patient_ctx = None

        for msg in messages_result.data:
            # User message
            messages.append(SessionMessage(
                id=f"{msg['id']}_user",
                role="user",
                content=msg["message"],
                created_at=msg["created_at"],
            ))
            # Assistant response
            messages.append(SessionMessage(
                id=f"{msg['id']}_assistant",
                role="assistant",
                content=msg["response"],
                created_at=msg["created_at"],
            ))
            # Capture patient context from most recent message
            if msg.get("patient_context"):
                patient_ctx = msg["patient_context"]

        return SessionDetail(
            id=session["id"],
            title=session["title"],
            message_count=session["message_count"],
            is_archived=session["is_archived"],
            created_at=session["created_at"],
            updated_at=session["updated_at"],
            last_message_at=session["last_message_at"],
            messages=messages,
            patient_context=PatientContext(**patient_ctx) if patient_ctx else None,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to get session: %s", e)
        raise HTTPException(status_code=500, detail="Failed to get session")


@router.patch("/{session_id}", response_model=SessionSummary)
async def update_session(
    session_id: str,
    update: SessionUpdate,
    current_user: object = Depends(get_current_user)
):
    """
    Update session metadata.

    Can update title or archive status.
    """
    validate_uuid(session_id, "session_id")

    client = SupabaseService.get_auth_client(current_user.token)
    if not client:
        raise HTTPException(status_code=503, detail="Database unavailable")

    user_id = current_user.id

    try:
        # Build update dict
        updates = {"updated_at": datetime.utcnow().isoformat()}

        if update.title is not None:
            updates["title"] = sanitize_title(update.title)

        if update.is_archived is not None:
            updates["is_archived"] = update.is_archived
            if update.is_archived:
                updates["archived_at"] = datetime.utcnow().isoformat()
            else:
                updates["archived_at"] = None

        # Update with ownership check (RLS)
        result = client.table("chat_sessions").update(updates).eq(
            "id", session_id
        ).eq("user_id", user_id).execute()

        if not result.data:
            raise HTTPException(status_code=404, detail="Session not found")

        session = result.data[0]

        return SessionSummary(
            id=session["id"],
            title=session["title"],
            message_count=session["message_count"],
            is_archived=session["is_archived"],
            created_at=session["created_at"],
            updated_at=session["updated_at"],
            last_message_at=session["last_message_at"],
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to update session: %s", e)
        raise HTTPException(status_code=500, detail="Failed to update session")


@router.delete("/{session_id}", status_code=204)
async def delete_session(
    session_id: str,
    current_user: object = Depends(get_current_user)
):
    """
    Delete a session permanently.

    This also deletes all messages in the session (CASCADE).
    """
    validate_uuid(session_id, "session_id")

    client = SupabaseService.get_auth_client(current_user.token)
    if not client:
        raise HTTPException(status_code=503, detail="Database unavailable")

    user_id = current_user.id

    try:
        # Delete with ownership check (RLS)
        # explicit count='exact' ensures we know if a row was actually deleted
        result = client.table("chat_sessions").delete(count="exact").eq(
            "id", session_id
        ).eq("user_id", user_id).execute()

        # Check count of deleted rows
        if result.count is None or result.count == 0:
            logger.warning("Delete failed or no effect: session %s, user %s", session_id, user_id)
            raise HTTPException(status_code=404, detail="Session not found or already deleted")

        logger.info("Session deleted successfully: %s by user %s", session_id, user_id)
        return None

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to delete session: %s", e)
        raise HTTPException(status_code=500, detail="Failed to delete session")


@router.get("/{session_id}/messages", response_model=List[SessionMessage])
async def get_session_messages(
    session_id: str,
    limit: int = Query(50, ge=1, le=MAX_MESSAGE_FETCH),
    before_sequence: Optional[int] = Query(None, description="Get messages before this sequence number"),
    current_user: object = Depends(get_current_user)
):
    """
    Get messages from a session with cursor-based pagination.

    Use before_sequence for loading older messages (infinite scroll).
    """
    validate_uuid(session_id, "session_id")

    client = SupabaseService.get_auth_client(current_user.token)
    if not client:
        raise HTTPException(status_code=503, detail="Database unavailable")

    user_id = current_user.id

    try:
        # Verify session ownership
        session_check = client.table("chat_sessions").select("id").eq(
            "id", session_id
        ).eq("user_id", user_id).limit(1).execute()

        if not session_check or not session_check.data:
            raise HTTPException(status_code=404, detail="Session not found")

        # Build query
        query = client.table("chat_history").select(
            "id, message, response, created_at, sequence_num"
        ).eq("session_id", session_id)

        if before_sequence is not None:
            query = query.lt("sequence_num", before_sequence)

        query = query.order("sequence_num", desc=True).limit(limit)

        result = query.execute()

        # Convert and reverse to chronological order
        messages = []
        for msg in reversed(result.data):
            messages.append(SessionMessage(
                id=f"{msg['id']}_user",
                role="user",
                content=msg["message"],
                created_at=msg["created_at"],
            ))
            messages.append(SessionMessage(
                id=f"{msg['id']}_assistant",
                role="assistant",
                content=msg["response"],
                created_at=msg["created_at"],
            ))

        return messages

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to get messages: %s", e)
        raise HTTPException(status_code=500, detail="Failed to get messages")


# ============================================================================
# SHARED SESSIONS
# ============================================================================

@router.post("/{session_id}/share", response_model=SessionShareLink)
async def create_or_get_session_share_link(
    session_id: str,
    current_user: object = Depends(get_current_user),
):
    """Create (or return existing) share link for a session the user owns."""
    validate_uuid(session_id, "session_id")

    auth_client = SupabaseService.get_auth_client(current_user.token)
    service_client = SupabaseService.get_service_client()
    if not auth_client or not service_client:
        raise HTTPException(status_code=503, detail="Database unavailable")

    user_id = current_user.id

    try:
        # Ownership check (RLS + explicit filter).
        session_check = auth_client.table("chat_sessions").select("id").eq(
            "id", session_id
        ).eq("user_id", user_id).limit(1).execute()
        if not session_check or not session_check.data:
            raise HTTPException(status_code=404, detail="Session not found")

        existing = service_client.table("shared_sessions").select(
            "share_token, created_at"
        ).eq("session_id", session_id).eq("owner_user_id", user_id).eq(
            "is_active", True
        ).limit(1).execute()

        if existing and existing.data:
            share_token = existing.data[0]["share_token"]
            return SessionShareLink(
                session_id=session_id,
                share_token=share_token,
                share_path=f"/shared/{share_token}",
                created_at=existing.data[0].get("created_at"),
            )

        insert_row = None
        last_error: Optional[Exception] = None
        for _ in range(5):
            share_token = secrets.token_urlsafe(24)
            if not SHARE_TOKEN_PATTERN.match(share_token):
                continue
            try:
                insert_result = service_client.table("shared_sessions").insert({
                    "session_id": session_id,
                    "owner_user_id": user_id,
                    "share_token": share_token,
                    "is_active": True,
                }).execute()
                if insert_result and insert_result.data:
                    insert_row = insert_result.data[0]
                    break
            except Exception as e:
                # Rare token collision; retry with a new token.
                emsg = str(e).lower()
                if "duplicate key" in emsg and "share_token" in emsg:
                    last_error = e
                    continue
                raise

        if not insert_row:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to create share link{': ' + str(last_error) if last_error else ''}",
            )

        logger.info("Session share link created: session=%s owner=%s", session_id[:8], user_id[:8])
        return SessionShareLink(
            session_id=session_id,
            share_token=insert_row["share_token"],
            share_path=f"/shared/{insert_row['share_token']}",
            created_at=insert_row.get("created_at"),
        )

    except HTTPException:
        raise
    except Exception as e:
        _handle_shared_sessions_table_error(e)
        logger.error("Failed to create session share link: %s", e)
        raise HTTPException(status_code=500, detail="Failed to create share link")


@router.get("/shared/{share_token}", response_model=SharedSessionDetail)
async def get_shared_session(share_token: str):
    """Public read-only endpoint for a shared chat session."""
    token = validate_share_token(share_token)
    service_client = SupabaseService.get_service_client()
    if not service_client:
        raise HTTPException(status_code=503, detail="Database unavailable")

    try:
        share_result = service_client.table("shared_sessions").select(
            "session_id, is_active"
        ).eq("share_token", token).eq("is_active", True).limit(1).execute()
        if not share_result or not share_result.data:
            raise HTTPException(status_code=404, detail="Shared session not found")

        session_id = share_result.data[0]["session_id"]

        session_result = service_client.table("chat_sessions").select(
            "id, title, message_count, created_at, updated_at, last_message_at"
        ).eq("id", session_id).limit(1).execute()
        if not session_result or not session_result.data:
            raise HTTPException(status_code=404, detail="Shared session not found")

        session = session_result.data[0]

        history_rows = _load_full_session_history_rows(
            service_client,
            session_id,
            "id, message, response, created_at, sequence_num",
        )

        # Best-effort analytics update.
        try:
            service_client.table("shared_sessions").update({
                "last_accessed_at": datetime.utcnow().isoformat(),
                "updated_at": datetime.utcnow().isoformat(),
            }).eq("share_token", token).execute()
        except Exception:
            pass

        return SharedSessionDetail(
            share_token=token,
            title=session["title"],
            message_count=session.get("message_count", 0),
            created_at=session["created_at"],
            updated_at=session["updated_at"],
            last_message_at=session["last_message_at"],
            messages=_build_session_messages(history_rows),
            is_view_only=True,
            can_continue=True,
        )

    except HTTPException:
        raise
    except Exception as e:
        _handle_shared_sessions_table_error(e)
        logger.error("Failed to load shared session: %s", e)
        raise HTTPException(status_code=500, detail="Failed to load shared session")


@router.post("/shared/{share_token}/continue", response_model=SharedSessionContinueResponse)
async def continue_shared_session(
    share_token: str,
    current_user: object = Depends(get_current_user),
):
    """Fork a shared session into the current user's private session."""
    token = validate_share_token(share_token)

    service_client = SupabaseService.get_service_client()
    auth_client = SupabaseService.get_auth_client(current_user.token)
    if not service_client or not auth_client:
        raise HTTPException(status_code=503, detail="Database unavailable")

    user_id = current_user.id

    try:
        share_result = service_client.table("shared_sessions").select(
            "session_id, is_active"
        ).eq("share_token", token).eq("is_active", True).limit(1).execute()
        if not share_result or not share_result.data:
            raise HTTPException(status_code=404, detail="Shared session not found")

        source_session_id = share_result.data[0]["session_id"]

        source_session_result = service_client.table("chat_sessions").select(
            "id, title"
        ).eq("id", source_session_id).limit(1).execute()
        if not source_session_result or not source_session_result.data:
            raise HTTPException(status_code=404, detail="Shared session not found")

        source_title = source_session_result.data[0].get("title") or "Shared Chat"

        source_rows = _load_full_session_history_rows(
            service_client,
            source_session_id,
            "message, response, patient_context, citations, sequence_num",
        )

        new_session_title = sanitize_title(f"Shared: {source_title}")
        new_session_result = auth_client.table("chat_sessions").insert({
            "user_id": user_id,
            "title": new_session_title,
            "message_count": 0,
            "is_archived": False,
        }).execute()
        if not new_session_result or not new_session_result.data:
            raise HTTPException(status_code=500, detail="Failed to create session copy")

        new_session = new_session_result.data[0]
        new_session_id = new_session["id"]

        if source_rows:
            rows_to_insert = []
            for idx, row in enumerate(source_rows, start=1):
                rows_to_insert.append({
                    "user_id": user_id,
                    "session_id": new_session_id,
                    "message": row.get("message") or "",
                    "response": row.get("response") or "",
                    "patient_context": row.get("patient_context"),
                    "citations": row.get("citations"),
                    "sequence_num": idx,
                })

            for i in range(0, len(rows_to_insert), MAX_FORK_INSERT_BATCH):
                chunk = rows_to_insert[i:i + MAX_FORK_INSERT_BATCH]
                auth_client.table("chat_history").insert(chunk).execute()

            # Refresh from DB so message_count reflects trigger-updated value.
            refreshed = auth_client.table("chat_sessions").select(
                "id, title, message_count"
            ).eq("id", new_session_id).eq("user_id", user_id).limit(1).execute()
            if refreshed and refreshed.data:
                new_session = refreshed.data[0]

        logger.info(
            "Shared session continued: source=%s target=%s user=%s rows=%d",
            source_session_id[:8],
            new_session_id[:8],
            user_id[:8],
            len(source_rows),
        )

        return SharedSessionContinueResponse(
            session_id=new_session_id,
            title=new_session.get("title", new_session_title),
            message_count=new_session.get("message_count", len(source_rows)),
        )

    except HTTPException:
        raise
    except Exception as e:
        _handle_shared_sessions_table_error(e)
        logger.error("Failed to continue shared session: %s", e)
        raise HTTPException(status_code=500, detail="Failed to continue shared session")


# ============================================================================
# NOTE: Helper functions (get_or_create_session, save_message_to_session, etc.)
# are now in services/context_service.py for cleaner separation of concerns.
# ============================================================================
