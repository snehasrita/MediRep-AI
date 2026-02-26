"""
Prescription OCR Service using Gemini Vision

Extracts text from prescription images using Google Gemini Vision API.
Works on Railway and any cloud deployment (no local GPU needed).

Flow:
1. Gemini Vision extracts raw text from prescription image
2. Extracted text is passed to the main chat LLM for understanding
"""

import asyncio
import base64
import logging
from typing import Optional

import google.generativeai as genai

from config import GEMINI_API_KEY, GEMINI_MODEL

logger = logging.getLogger(__name__)

# Lazy initialization
_model = None
_configured = False


def _get_model():
    """Get or initialize Gemini model."""
    global _model, _configured

    if _model is not None:
        return _model

    if not GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY not configured")

    if not _configured:
        genai.configure(api_key=GEMINI_API_KEY)
        _configured = True

    _model = genai.GenerativeModel(GEMINI_MODEL)
    return _model


# OCR prompt optimized for Indian prescriptions
OCR_PROMPT = """You are an expert medical OCR system. Extract ALL text from this prescription image.

Be extremely careful with:
1. Doctor's handwriting (often cursive/unclear)
2. Medication names (Indian brands like Dolo, Crocin, Pan, Azithral)
3. Dosage (mg, ml, tablets, capsules)
4. Frequency abbreviations: OD (once daily), BD (twice daily), TDS (3x daily), SOS (as needed), HS (bedtime), AC (before meals), PC (after meals)
5. Duration (days, weeks)

Extract and return ONLY the text you see. Include:
- Doctor name and clinic/hospital
- Patient name if visible
- Date
- All medications with dosage, frequency, duration
- Any special instructions

Return the raw text exactly as written. Do not add explanations."""


async def extract_prescription_text(image_base64: str) -> dict:
    """
    Extract text from prescription image using Gemini Vision.

    Args:
        image_base64: Base64 encoded image (with or without data URL prefix)

    Returns:
        dict with 'success', 'text', and 'error' keys
    """
    try:
        model = _get_model()

        # Handle data URL format
        mime_type = "image/jpeg"
        image_data = image_base64

        if "base64," in image_base64:
            # Extract mime type and data
            header, image_data = image_base64.split("base64,")
            if "image/" in header:
                mime_type = header.split("image/")[1].split(";")[0]
                mime_type = f"image/{mime_type}"

        # Decode base64 to bytes
        try:
            image_bytes = base64.b64decode(image_data)
        except Exception as e:
            logger.error(f"Failed to decode base64 image: {e}")
            return {"success": False, "text": None, "error": "Invalid image data"}

        # Create image part for Gemini
        image_part = {
            "mime_type": mime_type,
            "data": image_bytes
        }

        # Call Gemini Vision
        response = await asyncio.wait_for(
            asyncio.to_thread(
                model.generate_content,
                [OCR_PROMPT, image_part]
            ),
            timeout=30.0
        )

        # Extract text from response
        try:
            text = (response.text or "").strip()
        except ValueError as e:
            # Response blocked by safety filters
            logger.warning(f"Gemini response blocked: {e}")
            return {"success": False, "text": None, "error": "Image blocked by safety filters"}

        if text:
            logger.info(f"OCR extracted {len(text)} characters")
            return {"success": True, "text": text, "error": None}

        return {"success": False, "text": None, "error": "No text extracted from image"}

    except asyncio.TimeoutError:
        logger.error("OCR request timed out")
        return {"success": False, "text": None, "error": "OCR request timed out"}
    except ValueError as e:
        logger.error(f"OCR config error: {e}")
        return {"success": False, "text": None, "error": str(e)}
    except Exception as e:
        logger.error(f"OCR failed: {e}")
        return {"success": False, "text": None, "error": f"OCR failed: {str(e)}"}
