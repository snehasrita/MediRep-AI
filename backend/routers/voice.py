import logging

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import Response

from config import MAX_UPLOAD_SIZE, MAX_UPLOAD_SIZE_MB
from dependencies import get_current_user
from limiter import limiter
from models import VoiceTranscribeResponse, VoiceTtsRequest
from services.voice_service import synthesize_speech_bytes, transcribe_audio_bytes

logger = logging.getLogger(__name__)
router = APIRouter()

CHUNK_SIZE = 1024 * 64


@router.post("/transcribe", response_model=VoiceTranscribeResponse)
@limiter.limit("60/minute")
async def transcribe_voice(
    request: Request,
    file: UploadFile = File(...),
    language: str = Form("auto"),
    user: dict = Depends(get_current_user),
):
    _ = user
    content_type = (file.content_type or "").lower()
    if not content_type.startswith("audio/"):
        raise HTTPException(status_code=400, detail="File must be an audio upload")

    try:
        chunks = []
        total_size = 0
        while True:
            chunk = await file.read(CHUNK_SIZE)
            if not chunk:
                break
            total_size += len(chunk)
            if total_size > MAX_UPLOAD_SIZE:
                raise HTTPException(
                    status_code=400,
                    detail=f"Audio file too large. Maximum size is {MAX_UPLOAD_SIZE_MB}MB",
                )
            chunks.append(chunk)
        audio_bytes = b"".join(chunks)
    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to read uploaded audio")
        raise HTTPException(status_code=400, detail="Failed to read uploaded audio")

    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Uploaded audio is empty")

    try:
        text = await transcribe_audio_bytes(audio_bytes, content_type, language=language)
        return VoiceTranscribeResponse(text=text)
    except Exception as exc:
        logger.exception("Voice transcription failed: %s", exc)
        raise HTTPException(status_code=503, detail="Voice transcription failed")


@router.post("/tts")
@limiter.limit("60/minute")
async def synthesize_voice(
    request: Request,
    payload: VoiceTtsRequest,
    user: dict = Depends(get_current_user),
):
    _ = user
    try:
        audio_bytes = await synthesize_speech_bytes(
            payload.text,
            voice=payload.voice,
            response_format=payload.response_format,
        )
    except ValueError as exc:
        message = str(exc)
        status = 400 if "too long" in message.lower() or "required" in message.lower() else 503
        raise HTTPException(status_code=status, detail=message)
    except Exception as exc:
        logger.exception("Voice synthesis failed: %s", exc)
        raise HTTPException(status_code=503, detail="Voice synthesis failed")

    media_type = "audio/mp3" if payload.response_format == "mp3" else "audio/wav"
    return Response(
        content=audio_bytes,
        media_type=media_type,
        headers={"Cache-Control": "no-store"},
    )
