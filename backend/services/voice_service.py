import logging
from typing import Optional

import httpx

from config import (
    GROQ_API_KEY,
    GROQ_STT_MODEL,
    GROQ_TTS_MODEL,
    GROQ_TTS_VOICE,
    GROQ_TTS_RESPONSE_FORMAT,
)
from services.gemini_service import transcribe_audio as gemini_transcribe_audio

logger = logging.getLogger(__name__)

GROQ_API_BASE = "https://api.groq.com/openai/v1"
GROQ_STT_URL = f"{GROQ_API_BASE}/audio/transcriptions"
GROQ_TTS_URL = f"{GROQ_API_BASE}/audio/speech"
MAX_TTS_INPUT_LEN = 350


_MIME_TO_EXT = {
    "audio/webm": "webm",
    "audio/ogg": "ogg",
    "audio/mp4": "mp4",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/flac": "flac",
    "audio/m4a": "m4a",
    "audio/x-m4a": "m4a",
}


def _ext_from_mime(mime: str) -> str:
    """Derive file extension from MIME type, stripping codec params."""
    base = mime.split(";")[0].strip().lower()
    return _MIME_TO_EXT.get(base, "webm")


async def transcribe_audio_bytes(
    audio_bytes: bytes,
    mime_type: str = "audio/webm",
    language: Optional[str] = None,
) -> str:
    """Transcribe voice audio using Groq Whisper with Gemini fallback."""
    if not audio_bytes:
        return ""

    # Normalise MIME: strip codec params like "audio/webm;codecs=opus"
    clean_mime = (mime_type or "audio/webm").split(";")[0].strip().lower()
    ext = _ext_from_mime(clean_mime)

    if GROQ_API_KEY:
        try:
            data = {
                "model": GROQ_STT_MODEL,
                "response_format": "verbose_json",
                "temperature": "0.0",
                "prompt": "Medical consultation about drugs, medications, and healthcare in India.",
            }
            if language and language != "auto":
                data["language"] = language

            files = {
                "file": (f"voice_input.{ext}", audio_bytes, clean_mime),
            }

            async with httpx.AsyncClient(timeout=45.0) as client:
                response = await client.post(
                    GROQ_STT_URL,
                    headers={"Authorization": f"Bearer {GROQ_API_KEY}"},
                    data=data,
                    files=files,
                )
                response.raise_for_status()
                payload = response.json()

                # Filter Whisper hallucinations: reject if no_speech_prob is high
                segments = payload.get("segments") or []
                if segments:
                    avg_no_speech = sum(s.get("no_speech_prob", 0) for s in segments) / len(segments)
                    if avg_no_speech > 0.7:
                        logger.info("Whisper detected no speech (avg_no_speech_prob=%.2f), skipping", avg_no_speech)
                        return ""

                text = (payload.get("text") or "").strip()
                if text:
                    return text
        except Exception as exc:
            logger.warning("Groq STT failed, falling back to Gemini: %s", exc)

    return (await gemini_transcribe_audio(audio_bytes, clean_mime)).strip()


async def synthesize_speech_bytes(
    text: str,
    voice: Optional[str] = None,
    response_format: Optional[str] = None,
) -> bytes:
    """Generate speech audio using Groq TTS API."""
    normalized = (text or "").strip()
    if not normalized:
        raise ValueError("Text is required for synthesis.")
    if len(normalized) > MAX_TTS_INPUT_LEN:
        raise ValueError(f"TTS input too long ({len(normalized)} chars). Keep each chunk <= {MAX_TTS_INPUT_LEN}.")
    if not GROQ_API_KEY:
        raise ValueError("GROQ_API_KEY is not configured.")

    requested_format = (response_format or GROQ_TTS_RESPONSE_FORMAT or "wav").lower()
    if requested_format not in {"wav", "mp3"}:
        requested_format = "wav"

    payload = {
        "model": GROQ_TTS_MODEL,
        "voice": voice or GROQ_TTS_VOICE,
        "input": normalized,
        "response_format": requested_format,
    }

    async with httpx.AsyncClient(timeout=45.0) as client:
        response = await client.post(
            GROQ_TTS_URL,
            headers={
                "Authorization": f"Bearer {GROQ_API_KEY}",
                "Content-Type": "application/json",
            },
            json=payload,
        )

    if response.status_code >= 400:
        detail = response.text[:500]
        raise ValueError(f"TTS request failed ({response.status_code}): {detail}")

    if not response.content:
        raise ValueError("TTS response returned empty audio.")

    return response.content
