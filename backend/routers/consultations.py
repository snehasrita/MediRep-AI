"""
Consultations Router - Booking, payments, voice calls, and real-time chat.

Endpoints:
- POST /book - Book a consultation (patient)
- POST /webhook/razorpay - Payment webhook
- POST /{id}/confirm - Confirm consultation (pharmacist)
- POST /{id}/join - Get Agora token for voice call
- POST /{id}/message - Send chat message
- GET /{id}/messages - Get chat history
- POST /{id}/complete - Mark consultation complete
- POST /{id}/cancel - Cancel consultation
- POST /{id}/review - Submit review (patient)
"""
import logging
import hashlib
import hmac
import secrets
from typing import Optional, List
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, HTTPException, Depends, Header, Request
from pydantic import BaseModel, Field

from limiter import limiter

from dependencies import get_current_user, get_current_patient, get_current_pharmacist
from models import (
    BookingRequest,
    BookingResponse,
    ConsultationStatus,
    JoinCallResponse,
    ReviewRequest,
)
from services.supabase_service import SupabaseService
from config import (
    RAZORPAY_KEY_ID,
    RAZORPAY_KEY_SECRET,
    RAZORPAY_WEBHOOK_SECRET,
    AGORA_APP_ID,
    AGORA_APP_CERTIFICATE,
    AGORA_TOKEN_EXPIRY_SECONDS,
    PLATFORM_FEE_PERCENT,
)
from services.socket_service import sio

logger = logging.getLogger(__name__)
router = APIRouter()

# We use the service-role client for consultation/payment state transitions.
# RLS (as defined in `backend/sql/marketplace_schema.sql`) does NOT allow patients
# to update consultation rows (payment fields, cancellation, etc.), so attempting
# to do this with an anon/auth client will fail.
def _get_db():
    client = SupabaseService.get_service_client()
    if not client:
        raise HTTPException(
            status_code=503,
            detail="Database unavailable (missing SUPABASE_SERVICE_ROLE_KEY)"
        )
    return client

def _now_utc() -> datetime:
    return datetime.now(timezone.utc)

def _as_aware_utc(dt: datetime) -> datetime:
    # Pydantic may give aware datetimes; if it's naive, we treat it as UTC.
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)

# Lazy import razorpay to avoid startup errors if not configured
_razorpay_client = None


def get_razorpay_client():
    """Get or create Razorpay client."""
    global _razorpay_client
    if _razorpay_client is None:
        if not RAZORPAY_KEY_ID or not RAZORPAY_KEY_SECRET:
            raise HTTPException(status_code=503, detail="Payment service not configured")
        import razorpay
        _razorpay_client = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))
    return _razorpay_client


from services.agora_service import AgoraService

def generate_agora_token(channel_name: str, uid: int, expiry_seconds: int = 3600) -> str:
    """Generate Agora RTC token for voice call."""
    return AgoraService.generate_token(channel_name, uid, 1) # 1 = Broadcaster


@router.get("/payment/config")
async def get_payment_config():
    """
    Public config endpoint used by the frontend Razorpay checkout.

    Brutal truth: the frontend MUST have the Razorpay Key ID to open checkout.
    Key ID is not secret; Key Secret stays server-side in `backend/.env`.
    """
    if not RAZORPAY_KEY_ID:
        return {"enabled": False, "razorpay_key_id": None}
    return {"enabled": True, "razorpay_key_id": RAZORPAY_KEY_ID}

@router.post("/book", response_model=BookingResponse)
@limiter.limit("5/minute")
async def book_consultation(
    request: Request,  # Required for slowapi
    booking: BookingRequest,
    current_user: dict = Depends(get_current_patient)
):
    """
    Book a consultation with a pharmacist.

    Creates a pending consultation and Razorpay order.
    """
    client = _get_db()

    razorpay = get_razorpay_client()
    patient_id = current_user["id"]

    try:
        # Get pharmacist details
        pharmacist = client.table("pharmacist_profiles").select(
            "id, user_id, full_name, rate, duration_minutes, is_available, verification_status"
        ).eq("id", booking.pharmacist_id).single().execute()

        if not pharmacist.data:
            raise HTTPException(status_code=404, detail="Pharmacist not found")

        if pharmacist.data["verification_status"] != "approved":
            raise HTTPException(status_code=400, detail="Pharmacist not available")

        if not pharmacist.data["is_available"]:
            raise HTTPException(status_code=400, detail="Pharmacist is currently unavailable")

        # Prevent booking with self
        if pharmacist.data["user_id"] == patient_id:
            raise HTTPException(status_code=400, detail="Cannot book consultation with yourself")

        # Check scheduled time is in future (UTC)
        scheduled_at = _as_aware_utc(booking.scheduled_at)
        # Allow 2 minutes grace period for network latency/clock skew
        if scheduled_at < _now_utc() - timedelta(minutes=2):
            raise HTTPException(status_code=400, detail="Scheduled time must be in the future")

        amount = pharmacist.data["rate"]
        platform_fee = int(amount * PLATFORM_FEE_PERCENT / 100)
        pharmacist_earning = amount - platform_fee

        # Create Razorpay order
        # STRATEGY: Insert consultation first as "pending_payment" with NULL razorpay_order_id.
        # This prevents orphaned Razorpay orders if DB insert fails.
        
        # Generate unique channel name for voice call
        channel_name = f"consult_{secrets.token_hex(8)}"

        consultation_data = {
            "patient_id": patient_id,
            "pharmacist_id": booking.pharmacist_id,
            "scheduled_at": scheduled_at.isoformat(),
            "duration_minutes": pharmacist.data["duration_minutes"],
            "amount": amount,
            "platform_fee": platform_fee,
            "pharmacist_earning": pharmacist_earning,
            "patient_concern": booking.patient_concern,
            "status": "pending_payment",
            "payment_status": "pending",
            "agora_channel": channel_name,
        }

        # 1. Insert Consultation (Pending)
        result = client.table("consultations").insert(consultation_data).execute()
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to create consultation record")
        
        consultation_id = result.data[0]["id"]

        try:
            # 2. Create Razorpay Order
            order_data = {
                "amount": amount * 100,  # Razorpay uses paise
                "currency": "INR",
                "receipt": consultation_id, # Use actual ID for receipt
                "notes": {
                    "pharmacist_id": booking.pharmacist_id,
                    "patient_id": patient_id,
                    "consultation_id": consultation_id
                }
            }
            rz_order = razorpay.order.create(data=order_data)
            
            # 3. Update Consultation with Order ID
            # Safe update: if this fails, we must rollback the order
            try:
                client.table("consultations").update({
                    "razorpay_order_id": rz_order["id"]
                }).eq("id", consultation_id).execute()
            except Exception as db_err:
                # Log orphaned Razorpay order for reconciliation
                logger.error(
                    "Orphaned Razorpay Order: %s generated for consultation %s but DB update failed: %s", 
                    rz_order["id"], consultation_id, db_err
                )
                raise db_err

        except Exception as rz_error:
            # Compensation: If order creation or DB update fails, delete the pending consultation
            logger.error("Booking process failed: %s. Rolling back consultation %s", rz_error, consultation_id)
            client.table("consultations").delete().eq("id", consultation_id).execute()
            raise HTTPException(status_code=502, detail="Payment gateway error")

        logger.info("Consultation booked: %s", consultation_id)

        return BookingResponse(
            consultation_id=consultation_id,
            razorpay_order_id=rz_order["id"],
            amount=amount,
            currency="INR",
            pharmacist_name=pharmacist.data["full_name"],
            scheduled_at=scheduled_at,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to book consultation: %s", e)
        raise HTTPException(status_code=500, detail="Booking failed")


@router.post("/webhook/razorpay")
@limiter.limit("120/minute")
async def razorpay_webhook(
    request: Request,  # Required for slowapi
    x_razorpay_signature: str = Header(None)
):
    """
    Handle Razorpay payment webhooks.

    Verifies signature and updates consultation status.
    """
    if not RAZORPAY_WEBHOOK_SECRET:
        raise HTTPException(status_code=503, detail="Webhook not configured")

    body = await request.body()

    # Verify signature
    expected_signature = hmac.new(
        RAZORPAY_WEBHOOK_SECRET.encode(),
        body,
        hashlib.sha256
    ).hexdigest()

    if not hmac.compare_digest(expected_signature, x_razorpay_signature or ""):
        logger.warning("Invalid Razorpay webhook signature")
        raise HTTPException(status_code=400, detail="Invalid signature")

    client = _get_db()

    try:
        import json
        payload = json.loads(body)
        event = payload.get("event")

        if event == "payment.captured":
            payment = payload["payload"]["payment"]["entity"]
            order_id = payment.get("order_id")
            payment_id = payment.get("id")
            payment_method = payment.get("method")
            amount_paise = payment.get("amount")

            if order_id:
                # Idempotency check: verify current status
                existing = client.table("consultations").select(
                    "id, amount, status, payment_status"
                ).eq("razorpay_order_id", order_id).single().execute()
                
                if existing.data and existing.data.get("payment_status") == "captured":
                    logger.info("Payment already captured for order %s (Idempotent)", order_id)
                    return {"status": "ok"}

                if existing.data and existing.data.get("status") in ("cancelled", "refunded", "completed", "no_show"):
                    logger.warning("Webhook received for non-payable consultation state (order_id=%s, status=%s)", order_id, existing.data.get("status"))
                    return {"status": "ok"}

                # Basic amount sanity check (paise vs rupees)
                if existing.data and amount_paise is not None:
                    try:
                        if int(amount_paise) != int(existing.data["amount"]) * 100:
                            logger.warning("Webhook amount mismatch for order_id=%s (got=%s, expected=%s)", order_id, amount_paise, int(existing.data["amount"]) * 100)
                            raise HTTPException(status_code=400, detail="Amount mismatch")
                    except ValueError:
                        raise HTTPException(status_code=400, detail="Invalid amount")

                # Update consultation
                update_result = client.table("consultations").update({
                    "payment_status": "captured",
                    "razorpay_payment_id": payment_id,
                    "payment_method": payment_method,
                    # Schema truth: payment success moves consultation to `confirmed`.
                    "status": "confirmed",
                    "updated_at": _now_utc().isoformat(),
                }).eq("razorpay_order_id", order_id).execute()

                if not update_result.data:
                    logger.warning("Webhook: No consultation found for order_id %s", order_id)
                    # Return ok to stop retries if data is missing, or error to retry?
                    # Returning error to force retry logic if it's a race condition
                    raise HTTPException(status_code=404, detail="Order not found")

                logger.info("Payment captured for order: %s", order_id)

        elif event == "payment.failed":
            payment = payload["payload"]["payment"]["entity"]
            order_id = payment.get("order_id")

            if order_id:
                client.table("consultations").update({
                    "payment_status": "failed",
                    # Keep `pending_payment` so the patient can retry payment.
                    "status": "pending_payment",
                    "updated_at": _now_utc().isoformat(),
                }).eq("razorpay_order_id", order_id).execute()

                logger.info("Payment failed for order: %s", order_id)

        return {"status": "ok"}

    except Exception as e:
        logger.error("Webhook processing error: %s", e)
        raise HTTPException(status_code=500, detail="Webhook processing failed")


class VerifyPaymentRequest(BaseModel):
    razorpay_payment_id: str = Field(..., min_length=5)
    razorpay_order_id: str = Field(..., min_length=5)
    razorpay_signature: str = Field(..., min_length=5)


@router.post("/{consultation_id}/verify-payment")
@limiter.limit("10/minute")
async def verify_payment(
    request: Request,  # Required for slowapi
    consultation_id: str,
    body: VerifyPaymentRequest,
    current_user: dict = Depends(get_current_patient),
):
    """
    Verify a Razorpay payment after Checkout success and finalize the booking.

    Why this exists:
    - Webhooks are great in prod, but local/dev (and even hackathon demos) often don't have a
      reachable public URL for Razorpay to hit.
    - Without this, the frontend can "think" payment succeeded while the DB still shows
      `pending_payment`, and chat/call won't work.
    """
    if not RAZORPAY_KEY_SECRET:
        raise HTTPException(status_code=503, detail="Payment service not configured")

    client = _get_db()
    razorpay = get_razorpay_client()

    # 1) Load consultation and enforce ownership
    consultation = client.table("consultations").select(
        "id, patient_id, razorpay_order_id, amount, status, payment_status, razorpay_payment_id"
    ).eq("id", consultation_id).single().execute()

    if not consultation.data:
        raise HTTPException(status_code=404, detail="Consultation not found")

    data = consultation.data
    if data["patient_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    # Hard-stop: don't allow "reviving" a finished/terminated consultation.
    if data.get("status") in ("cancelled", "refunded", "completed", "no_show"):
        raise HTTPException(status_code=400, detail="Consultation is not payable in its current state")

    if not data.get("razorpay_order_id"):
        raise HTTPException(status_code=400, detail="Missing Razorpay order for this consultation")

    if data["razorpay_order_id"] != body.razorpay_order_id:
        raise HTTPException(status_code=400, detail="Order ID mismatch")

    # Idempotency: if we already recorded this payment, just return.
    if data.get("razorpay_payment_id") == body.razorpay_payment_id and data.get("payment_status") in ("captured", "authorized"):
        return {"status": "ok", "consultation_id": consultation_id, "payment_status": data.get("payment_status")}

    # Suspicious: payment already attached but caller is trying a different payment id.
    if data.get("razorpay_payment_id") and data.get("razorpay_payment_id") != body.razorpay_payment_id:
        raise HTTPException(status_code=409, detail="A payment is already attached to this consultation")

    # 2) Verify signature (server-side, using Key Secret)
    message = f"{body.razorpay_order_id}|{body.razorpay_payment_id}".encode()
    expected = hmac.new(RAZORPAY_KEY_SECRET.encode(), message, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, body.razorpay_signature):
        raise HTTPException(status_code=400, detail="Invalid payment signature")

    # 3) (Optional but recommended) Fetch payment from Razorpay for extra validation
    # Brutal truth: this relies on outbound network access from the backend host.
    payment_status = "captured"
    payment_method = None
    try:
        payment = razorpay.payment.fetch(body.razorpay_payment_id)
        if payment and payment.get("order_id") and payment["order_id"] != body.razorpay_order_id:
            raise HTTPException(status_code=400, detail="Payment does not belong to this order")

        # Amount is in paise
        if payment and payment.get("amount") and int(payment["amount"]) != int(data["amount"]) * 100:
            raise HTTPException(status_code=400, detail="Payment amount mismatch")

        payment_method = payment.get("method")
        # Razorpay may return "authorized" depending on capture settings.
        # Our schema allows it, but chat/call should require captured.
        payment_status = payment.get("status") or "captured"
    except HTTPException:
        raise
    except Exception as e:
        logger.warning("Razorpay fetch failed (continuing with signature-only verification): %s", e)

    if payment_status not in ("captured", "authorized"):
        raise HTTPException(status_code=402, detail=f"Payment not completed (status={payment_status})")

    # 4) Persist + transition state
    # We transition to `confirmed` so chat/call can start immediately after payment.
    update = {
        "razorpay_payment_id": body.razorpay_payment_id,
        "razorpay_signature": body.razorpay_signature,
        "payment_status": payment_status,
        "payment_method": payment_method,
        "status": "confirmed",
        "updated_at": _now_utc().isoformat(),
    }

    client.table("consultations").update(update).eq("id", consultation_id).execute()

    return {"status": "ok", "consultation_id": consultation_id, "payment_status": payment_status}


@router.post("/{consultation_id}/confirm")
@limiter.limit("10/minute")
async def confirm_consultation(
    request: Request,  # Required for slowapi
    consultation_id: str,
    current_user: dict = Depends(get_current_pharmacist)
):
    """Pharmacist confirms the consultation."""
    client = _get_db()

    try:
        # Get pharmacist profile
        profile = client.table("pharmacist_profiles").select("id").eq(
            "user_id", current_user["id"]
        ).single().execute()

        if not profile.data:
            raise HTTPException(status_code=404, detail="Pharmacist profile not found")

        consultation = client.table("consultations").select("*").eq(
            "id", consultation_id
        ).eq("pharmacist_id", profile.data["id"]).single().execute()

        if not consultation.data:
            raise HTTPException(status_code=404, detail="Consultation not found")

        status = consultation.data.get("status")
        payment_status = consultation.data.get("payment_status")

        # If payment is done, the only valid "confirmed" state is `confirmed`.
        if status == "confirmed":
            return {"status": "confirmed"}

        if status != "pending_payment":
            raise HTTPException(status_code=400, detail="Cannot confirm this consultation")

        if payment_status not in ("captured", "authorized"):
            raise HTTPException(status_code=400, detail="Payment not completed")

        client.table("consultations").update({
            "status": "confirmed",
            "updated_at": _now_utc().isoformat(),
        }).eq("id", consultation_id).execute()

        return {"status": "confirmed"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to confirm consultation: %s", e)
        raise HTTPException(status_code=500, detail="Confirmation failed")


@router.post("/{consultation_id}/join", response_model=JoinCallResponse)
@limiter.limit("10/minute")
async def join_voice_call(
    request: Request,  # Required for slowapi
    consultation_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Get Agora token to join voice call.

    Both patient and pharmacist can join.
    """
    client = _get_db()

    try:
        consultation = client.table("consultations").select(
            "*, pharmacist_profiles!inner(user_id)"
        ).eq("id", consultation_id).single().execute()

        if not consultation.data:
            raise HTTPException(status_code=404, detail="Consultation not found")

        data = consultation.data
        user_id = current_user["id"]
        pharmacist_user_id = data["pharmacist_profiles"]["user_id"]

        # Verify user is participant
        is_patient = data["patient_id"] == user_id
        is_pharmacist = pharmacist_user_id == user_id

        if not is_patient and not is_pharmacist:
            raise HTTPException(status_code=403, detail="Not authorized for this consultation")

        # Check consultation status
        if data["status"] not in ["confirmed", "in_progress"]:
            raise HTTPException(status_code=400, detail="Consultation not ready for call")

        # Voice call is allowed only after payment capture.
        if data["payment_status"] != "captured":
            raise HTTPException(status_code=400, detail="Payment not captured")

        # Check time window
        scheduled_at = datetime.fromisoformat(data["scheduled_at"].replace("Z", "+00:00"))
        duration = data.get("duration_minutes", 60)
        now = datetime.now(timezone.utc)
        
        start_window = scheduled_at - timedelta(minutes=15)
        end_window = scheduled_at + timedelta(minutes=duration + 15) # Buffer

        # Allow joining if status is in_progress (already started) OR within window
        if data["status"] != "in_progress":
            if now < start_window:
                raise HTTPException(status_code=400, detail="Too early to join (15 mins before start)")
            if now > end_window:
                raise HTTPException(status_code=400, detail="Consultation time has passed")

        # Generate unique UID (patient=1, pharmacist=2)
        uid = 1 if is_patient else 2
        channel = data["agora_channel"]

        token = generate_agora_token(channel, uid, AGORA_TOKEN_EXPIRY_SECONDS)

        # Update status to in_progress if first join
        if data["status"] == "confirmed":
            client.table("consultations").update({
                "status": "in_progress",
                "started_at": _now_utc().isoformat(),
                "updated_at": _now_utc().isoformat(),
            }).eq("id", consultation_id).execute()

        expires_at = _now_utc() + timedelta(seconds=AGORA_TOKEN_EXPIRY_SECONDS)

        return JoinCallResponse(
            agora_channel=channel,
            agora_token=token,
            agora_app_id=AGORA_APP_ID,
            uid=uid,
            consultation_id=consultation_id,
            expires_at=expires_at,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to join call: %s", e)
        raise HTTPException(status_code=500, detail="Failed to join call")


class MessageContent(BaseModel):
    content: str = Field(..., max_length=2000)

@router.post("/{consultation_id}/message")
@limiter.limit("30/minute")
async def send_message(
    request: Request,  # Required for slowapi
    consultation_id: str,
    body: MessageContent,
    current_user: dict = Depends(get_current_user)
):
    """Send a chat message in consultation."""
    content = body.content
    client = _get_db()

    try:
        # Verify user is participant
        consultation = client.table("consultations").select(
            "patient_id, pharmacist_id, status, payment_status"
        ).eq("id", consultation_id).single().execute()

        if not consultation.data:
            raise HTTPException(status_code=404, detail="Consultation not found")

        data = consultation.data
        user_id = current_user["id"]

        # Get pharmacist's user_id
        pharmacist = client.table("pharmacist_profiles").select("user_id").eq(
            "id", data["pharmacist_id"]
        ).single().execute()

        is_patient = data["patient_id"] == user_id
        is_pharmacist = pharmacist.data and pharmacist.data["user_id"] == user_id

        if not is_patient and not is_pharmacist:
            raise HTTPException(status_code=403, detail="Not authorized")

        if data["status"] not in ["confirmed", "in_progress"]:
            raise HTTPException(status_code=400, detail="Consultation not active")

        # Don't allow chat before payment is at least authorized.
        if data.get("payment_status") not in ("captured", "authorized"):
            raise HTTPException(status_code=400, detail="Payment not completed")

        # Insert message
        message_data = {
            "consultation_id": consultation_id,
            "sender_id": user_id,
            "sender_type": "patient" if is_patient else "pharmacist",
            "content": content[:2000],  # Limit message length
        }

        result = client.table("consultation_messages").insert(message_data).execute()
        # Broadcast via Socket.IO
        await sio.emit('new_message', result.data[0], room=f"consultation_{consultation_id}")
        return result.data[0]

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to send message: %s", e)
        raise HTTPException(status_code=500, detail="Failed to send message")


@router.get("/{consultation_id}/messages")
@limiter.limit("60/minute")
async def get_messages(
    request: Request,  # Required for slowapi
    consultation_id: str,
    limit: int = 50,
    before: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get chat messages for consultation."""
    # Clamp limit to prevent abuse
    MAX_LIMIT = 100
    if limit > MAX_LIMIT:
        limit = MAX_LIMIT
    if limit < 1:
        limit = 50
    client = _get_db()

    try:
        # Verify user is participant
        consultation = client.table("consultations").select(
            "patient_id, pharmacist_id"
        ).eq("id", consultation_id).single().execute()

        if not consultation.data:
            raise HTTPException(status_code=404, detail="Consultation not found")

        data = consultation.data
        user_id = current_user["id"]

        pharmacist = client.table("pharmacist_profiles").select("user_id").eq(
            "id", data["pharmacist_id"]
        ).single().execute()

        is_patient = data["patient_id"] == user_id
        is_pharmacist = pharmacist.data and pharmacist.data["user_id"] == user_id

        if not is_patient and not is_pharmacist:
            raise HTTPException(status_code=403, detail="Not authorized")

        # Fetch messages
        query = client.table("consultation_messages").select("*").eq(
            "consultation_id", consultation_id
        ).order("created_at", desc=True).limit(limit)

        if before:
            query = query.lt("created_at", before)

        result = query.execute()

        return {"messages": list(reversed(result.data))}

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to get messages: %s", e)
        raise HTTPException(status_code=500, detail="Failed to get messages")


class CompleteRequest(BaseModel):
    notes: Optional[str] = Field(None, max_length=2000)


@router.post("/{consultation_id}/complete")
@limiter.limit("10/minute")
async def complete_consultation(
    request: Request,  # Required for slowapi
    consultation_id: str,
    body: CompleteRequest,
    current_user: dict = Depends(get_current_pharmacist)
):
    """Mark consultation as completed (pharmacist only)."""
    client = _get_db()

    try:
        profile = client.table("pharmacist_profiles").select("id").eq(
            "user_id", current_user["id"]
        ).single().execute()

        if not profile.data:
            raise HTTPException(status_code=404, detail="Pharmacist profile not found")

        consultation = client.table("consultations").select("status").eq(
            "id", consultation_id
        ).eq("pharmacist_id", profile.data["id"]).single().execute()

        if not consultation.data:
            raise HTTPException(status_code=404, detail="Consultation not found")

        if consultation.data["status"] != "in_progress":
            raise HTTPException(status_code=400, detail="Consultation not in progress")

        update_data = {
            "status": "completed",
            "ended_at": _now_utc().isoformat(),
            "updated_at": _now_utc().isoformat(),
        }
        if body.notes:
            update_data["pharmacist_notes"] = body.notes[:2000]

        client.table("consultations").update(update_data).eq("id", consultation_id).execute()

        return {"status": "completed"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to complete consultation: %s", e)
        raise HTTPException(status_code=500, detail="Failed to complete")


class CancelRequest(BaseModel):
    reason: Optional[str] = Field(None, max_length=500)


@router.post("/{consultation_id}/cancel")
@limiter.limit("5/minute")
async def cancel_consultation(
    request: Request,  # Required for slowapi
    consultation_id: str,
    body: CancelRequest,
    current_user: dict = Depends(get_current_user)
):
    """Cancel a consultation (patient or pharmacist)."""
    client = _get_db()

    try:
        consultation = client.table("consultations").select(
            "patient_id, pharmacist_id, status, payment_status, razorpay_payment_id"
        ).eq("id", consultation_id).single().execute()

        if not consultation.data:
            raise HTTPException(status_code=404, detail="Consultation not found")

        data = consultation.data
        user_id = current_user["id"]

        # Check authorization
        pharmacist = client.table("pharmacist_profiles").select("user_id").eq(
            "id", data["pharmacist_id"]
        ).single().execute()

        is_patient = data["patient_id"] == user_id
        is_pharmacist = pharmacist.data and pharmacist.data["user_id"] == user_id

        if not is_patient and not is_pharmacist:
            raise HTTPException(status_code=403, detail="Not authorized")

        if data["status"] in ["completed", "cancelled"]:
            raise HTTPException(status_code=400, detail="Cannot cancel this consultation")

        # Process refund if payment was captured
        new_payment_status = data["payment_status"]
        new_status = "cancelled"
        if data["payment_status"] == "captured" and data["razorpay_payment_id"]:
            try:
                razorpay = get_razorpay_client()
                # Razorpay refund creation is synchronous, settlement is async.
                # We mark as refunded for MVP; production should reconcile via webhook.
                razorpay.payment.refund(data["razorpay_payment_id"], {})
                new_payment_status = "refunded"
                new_status = "refunded"
            except Exception as e:
                logger.error("Refund failed for consultation %s: %s", consultation_id, e)
                # CRITICAL: Do not cancel the consultation if refund fails.
                # Must ensure money is returned before cancelling service.
                raise HTTPException(
                    status_code=502, 
                    detail=f"Cancellation failed: Could not process refund. Please try again or contact support."
                )

        client.table("consultations").update({
            "status": new_status,
            "cancelled_by": "patient" if is_patient else "pharmacist",
            "cancellation_reason": body.reason,
            "payment_status": new_payment_status,
            "cancelled_at": _now_utc().isoformat(),
            "updated_at": _now_utc().isoformat(),
        }).eq("id", consultation_id).execute()

        return {"status": new_status, "payment_status": new_payment_status}

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to cancel consultation: %s", e)
        raise HTTPException(status_code=500, detail="Cancellation failed")


@router.post("/{consultation_id}/review")
async def submit_review(
    consultation_id: str,
    review: ReviewRequest,
    current_user: dict = Depends(get_current_patient)
):
    """Submit a review for completed consultation (patient only)."""
    client = _get_db()

    try:
        consultation = client.table("consultations").select(
            "patient_id, pharmacist_id, status"
        ).eq("id", consultation_id).single().execute()

        if not consultation.data:
            raise HTTPException(status_code=404, detail="Consultation not found")

        if consultation.data["patient_id"] != current_user["id"]:
            raise HTTPException(status_code=403, detail="Only patient can review")

        if consultation.data["status"] != "completed":
            raise HTTPException(status_code=400, detail="Can only review completed consultations")

        # Try to insert review (Atomic / Race-condition safe)
        # Relies on unique constraint on (consultation_id) in DB or business logic logic
        
        review_data = {
            "consultation_id": consultation_id,
            "patient_id": current_user["id"],
            "pharmacist_id": consultation.data["pharmacist_id"],
            "rating": review.rating,
            "review": review.review,
            "is_public": True,
        }

        try:
            client.table("consultation_reviews").insert(review_data).execute()
        except Exception as e:
            # Check if it's a unique constraint violation (Supabase/Postgres error)
            error_str = str(e).lower()
            if "duplicate" in error_str or "unique" in error_str or "23505" in error_str:
                logger.warning("Review submission failed (duplicate): %s", e)
                raise HTTPException(status_code=400, detail="Review already submitted")
            
            # Real DB error
            logger.error("Review submission failed (DB error): %s", e)
            raise HTTPException(status_code=500, detail="Failed to submit review")

        # Update consultation
        client.table("consultations").update({
            "rating": review.rating,
            "review": review.review,
            "reviewed_at": _now_utc().isoformat(),
            "updated_at": _now_utc().isoformat(),
        }).eq("id", consultation_id).execute()

        return {"status": "review_submitted"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to submit review: %s", e)
        raise HTTPException(status_code=500, detail="Failed to submit review")


@router.get("/{consultation_id}", response_model=ConsultationStatus)
@limiter.limit("60/minute")
async def get_consultation(
    request: Request,  # Required for slowapi
    consultation_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get consultation details."""
    client = _get_db()

    try:
        consultation = client.table("consultations").select(
            "*, pharmacist_profiles!inner(user_id, full_name)"
        ).eq("id", consultation_id).single().execute()

        if not consultation.data:
            raise HTTPException(status_code=404, detail="Consultation not found")

        data = consultation.data
        user_id = current_user["id"]

        is_patient = data["patient_id"] == user_id
        is_pharmacist = data["pharmacist_profiles"]["user_id"] == user_id

        if not is_patient and not is_pharmacist:
            raise HTTPException(status_code=403, detail="Not authorized")

        return ConsultationStatus(
            pharmacist_name=data["pharmacist_profiles"]["full_name"],
            id=data["id"],
            patient_id=data["patient_id"],
            pharmacist_id=data["pharmacist_id"],
            scheduled_at=data["scheduled_at"],
            duration_minutes=data["duration_minutes"],
            status=data["status"],
            amount=data["amount"],
            payment_status=data["payment_status"],
            patient_concern=data.get("patient_concern"),
            rating=data.get("rating"),
            review=data.get("review"),
            agora_channel=data.get("agora_channel"),
            created_at=data["created_at"],
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to get consultation: %s", e)
        raise HTTPException(status_code=500, detail="Failed to get consultation")
