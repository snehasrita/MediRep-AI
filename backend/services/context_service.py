"""
Context Compression Service - Efficient conversation memory for chat sessions.

Instead of sending all messages to LLM (expensive, slow, token limits),
we compress the conversation into a summary after each exchange.

Flow:
1. Load: context_summary + last 2 exchanges
2. Process message with LLM
3. Update context_summary with new information (async)

The summary contains:
- Key topics discussed
- Drugs/medications mentioned
- Patient concerns and conditions
- Recommendations given
- Important decisions made
"""
import logging
import asyncio
from typing import Optional, List, Dict, Any

from services.supabase_service import SupabaseService

logger = logging.getLogger(__name__)

# How many recent exchanges to keep in full (in addition to summary)
# Raised to reduce "last-message-only" drift between summary updates.
RECENT_EXCHANGES_TO_KEEP = 12

# Compression prompt - instructs LLM to create/update summary
COMPRESSION_PROMPT = """You are a medical conversation summarizer. Your job is to maintain a compressed context summary of an ongoing medical consultation.

CURRENT SUMMARY (may be empty if new conversation):
{current_summary}

NEW EXCHANGE TO INCORPORATE:
User: {user_message}
Assistant: {assistant_response}

INSTRUCTIONS:
1. If current summary is empty, create a new summary from this exchange
2. If summary exists, UPDATE it to include new information
3. Keep summary concise (max 200 words) but informative
4. Always preserve:
   - Drugs/medications discussed (names, dosages)
   - Patient conditions, allergies, concerns mentioned
   - Key recommendations or warnings given
   - Any decisions or conclusions reached
5. Use past tense ("User asked about...", "Discussed...")
6. Remove redundant or outdated information

OUTPUT FORMAT (plain text, no headers):
Write a flowing paragraph that captures the essential context. Start with main topic, then key details.

UPDATED SUMMARY:"""

_MAX_STORED_SUMMARY_CHARS = 2000


def _heuristic_merge_summary(
    current_summary: Optional[str],
    user_message: str,
    assistant_response: str,
) -> str:
    """
    Deterministic fallback when LLM summarization fails (quota/outage).

    This is intentionally simple: keep prior summary (if any) and append the
    latest exchange, then truncate from the front to fit storage.
    """
    parts = []
    if current_summary:
        parts.append(current_summary.strip())
    parts.append(f"User asked: {user_message.strip()[:800]}")
    parts.append(f"Assistant replied: {assistant_response.strip()[:1200]}")
    merged = "\n".join(p for p in parts if p)
    if len(merged) > _MAX_STORED_SUMMARY_CHARS:
        merged = merged[-_MAX_STORED_SUMMARY_CHARS:]
    return merged.strip()



async def load_session_context(
    session_id: str,
    auth_token: str,
    summary: Optional[str] = None,
    message_count: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Load compressed context for a session.

    Returns:
        {
            "summary": str or None,
            "recent_history": List[{role, content}],  # Last 2 exchanges
            "message_count": int
        }
    """
    client = SupabaseService.get_auth_client(auth_token)
    if not client:
        return {"summary": None, "recent_history": [], "message_count": 0}

    try:
        # Avoid redundant DB fetch if caller already has summary/count.
        if summary is None or message_count is None:
            session = await asyncio.to_thread(
                lambda: client.table("chat_sessions").select(
                    "context_summary, message_count"
                ).eq("id", session_id).limit(1).execute()
            )

            if not session or not session.data:
                return {"summary": None, "recent_history": [], "message_count": 0}

            summary = session.data[0].get("context_summary")
            message_count = session.data[0].get("message_count", 0)

        # Get last N exchanges (non-blocking)
        history_result = await asyncio.to_thread(
            lambda: client.table("chat_history").select(
                "message, response"
            ).eq("session_id", session_id).order(
                "sequence_num", desc=True
            ).limit(RECENT_EXCHANGES_TO_KEEP).execute()
        )

        # Convert to role/content format, reverse to chronological order
        recent_history = []
        for row in reversed(history_result.data):
            recent_history.append({"role": "user", "content": row["message"]})
            recent_history.append({"role": "assistant", "content": row["response"]})

        return {
            "summary": summary,
            "recent_history": recent_history,
            "message_count": int(message_count or 0)
        }

    except Exception as e:
        logger.error("Failed to load session context: %s", e)
        return {"summary": None, "recent_history": [], "message_count": 0}


async def compress_and_update_context(
    session_id: str,
    user_message: str,
    assistant_response: str,
    auth_token: str,
    current_summary: Optional[str] = None
) -> None:
    """
    Compress the new exchange and update session context.

    Called in background after each chat response.
    Uses LLM to intelligently merge new info into existing summary.
    """
    try:
        prompt = COMPRESSION_PROMPT.format(
            current_summary=current_summary or "(No previous summary - this is the start of conversation)",
            user_message=user_message[:1000],  # Limit size
            assistant_response=assistant_response[:1500],
        )

        new_summary = ""

        # 1) Try Gemini (primary).
        try:
            # Import here to avoid circular dependency
            from services.gemini_service import _get_model
            import google.generativeai as genai

            model = _get_model()
            response = await asyncio.to_thread(
                lambda: model.generate_content(
                    prompt,
                    generation_config=genai.types.GenerationConfig(
                        temperature=0.3,  # Low temp for consistent summaries
                        max_output_tokens=300,
                    ),
                )
            )
            new_summary = (response.text or "").strip()
        except Exception as e:
            logger.warning("Gemini compression unavailable for session %s: %s", session_id[:8], e)

        # 2) Fallback to Groq summarization (keeps memory working when Gemini is rate-limited).
        if not new_summary:
            try:
                from services.gemini_service import _call_groq_api

                groq_summary = await _call_groq_api(
                    messages=[{"role": "user", "content": prompt}],
                    system_prompt="You are a medical conversation summarizer. Output only the updated summary text.",
                    temperature=0.2,
                )
                new_summary = (groq_summary or "").strip()
            except Exception as e:
                logger.warning("Groq compression unavailable for session %s: %s", session_id[:8], e)

        # 3) Deterministic fallback (never fails).
        if not new_summary:
            new_summary = _heuristic_merge_summary(current_summary, user_message, assistant_response)

        # Update session with new summary (non-blocking)
        # Use auth client to satisfy RLS
        client = SupabaseService.get_auth_client(auth_token)
        if client:
            await asyncio.to_thread(
                lambda: client.table("chat_sessions").update({
                    "context_summary": new_summary[:_MAX_STORED_SUMMARY_CHARS],  # Limit storage
                }).eq("id", session_id).execute()
            )

            logger.info("Context compressed for session %s (%d chars)",
                       session_id[:8], len(new_summary))

    except Exception as e:
        # Don't fail the chat if compression fails
        logger.error("Context compression failed for session %s: %s", session_id[:8], e)


def build_context_for_llm(
    summary: Optional[str],
    recent_history: List[Dict[str, str]],
    patient_context_str: Optional[str] = None
) -> str:
    """
    Build the context string to prepend to user's message for LLM.

    Returns a formatted context block that gives LLM full conversation awareness.
    """
    parts = []

    # Add compressed summary if exists
    if summary:
        parts.append(f"[Conversation Context]\n{summary}")

    # Add patient context if exists
    if patient_context_str:
        parts.append(patient_context_str)

    # Note about recent messages (they'll be in history)
    if recent_history:
        parts.append(f"[Recent messages follow in conversation history]")

    return "\n\n".join(parts) if parts else ""


# ============================================================================
# SESSION HELPERS (used by chat router)
# ============================================================================

async def get_or_create_session(user_id: str, auth_token: str, session_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Get existing session or create new one.

    Returns session dict with id, context_summary, message_count.
    """
    import re

    # Use Auth Client for RLS
    client = SupabaseService.get_auth_client(auth_token)
    if not client:
        raise Exception("Database unavailable")

    if session_id:
        # Validate UUID format (prevents injection)
        if not re.match(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
                       session_id, re.IGNORECASE):
            raise ValueError("Invalid session_id format")

        # Fetch existing session (non-blocking)
        result = await asyncio.to_thread(
            lambda: client.table("chat_sessions").select(
                "id, context_summary, message_count, is_archived"
            ).eq("id", session_id).limit(1).execute()
        )

        if not result or not result.data:
            raise ValueError("Session not found")

        session_row = result.data[0]

        if session_row.get("is_archived"):
            raise ValueError("Cannot send messages to archived session")

        return session_row

    # Create new session (non-blocking)
    result = await asyncio.to_thread(
        lambda: client.table("chat_sessions").insert({
            "user_id": user_id,
            "title": "New Chat",
            "message_count": 0,
            "is_archived": False,
        }).execute()
    )

    if not result.data:
        raise Exception("Failed to create session")

    logger.info("Created session %s for user %s", result.data[0]["id"][:8], user_id[:8])
    return result.data[0]


async def save_message_to_session(
    user_id: str,
    session_id: str,
    message: str,
    response: str,
    auth_token: str,
    patient_context: Optional[dict] = None,
    citations: Optional[list] = None
) -> bool:
    """
    Save message-response pair to session.

    Uses RPC function for atomic sequence numbering (prevents race conditions).
    """
    # Use Auth Client for RLS
    client = SupabaseService.get_auth_client(auth_token)
    if not client:
        return False

    try:
        # Preferred: atomic insert via DB function (handles sequence numbering safely).
        try:
            rpc_payload = {
                "p_user_id": user_id,
                "p_session_id": session_id,
                "p_message": message[:4000],
                "p_response": response[:8000],
                "p_patient_context": patient_context,
                "p_citations": citations,
            }
            rpc_result = await asyncio.to_thread(
                lambda: client.rpc("insert_chat_message", rpc_payload).execute()
            )
            if rpc_result.data:
                logger.info("Message saved to session %s (rpc)", session_id[:8])
                return True
        except Exception as rpc_err:
            # Fallback to direct insert if RPC is unavailable/misconfigured.
            logger.warning("insert_chat_message RPC failed; falling back to direct insert: %s", rpc_err)

        # Fallback: direct insert (non-atomic sequence; best-effort).
        seq_result = await asyncio.to_thread(
            lambda: client.table("chat_history")
                .select("sequence_num")
                .eq("session_id", session_id)
                .order("sequence_num", desc=True)
                .limit(1)
                .execute()
        )
        next_seq = (seq_result.data[0]["sequence_num"] + 1) if seq_result.data else 1

        insert_data = {
            "session_id": session_id,
            "message": message[:4000],
            "response": response[:8000],
            "sequence_num": next_seq,
            "patient_context": patient_context,
            "citations": citations,
            "user_id": user_id,
        }

        await asyncio.to_thread(lambda: client.table("chat_history").insert(insert_data).execute())

        logger.info("Message saved to session %s (fallback seq %d)", session_id[:8], next_seq)
        return True

    except Exception as e:
        logger.error("Failed to save message to session %s: %s", session_id[:8], e)
        return False
