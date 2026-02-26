from fastapi import APIRouter, HTTPException, UploadFile, File
import logging

from models import PillScanResponse
from services.vision_service import identify_pill
from config import MAX_UPLOAD_SIZE, MAX_UPLOAD_SIZE_MB

logger = logging.getLogger(__name__)
router = APIRouter()

# Chunk size for reading uploads
CHUNK_SIZE = 1024 * 64  # 64KB chunks


@router.post("/identify-pill", response_model=PillScanResponse)
async def identify_pill_endpoint(image: UploadFile = File(...)):
    """Identify a pill from an uploaded image"""
    
    # Validate content type - only JPEG and PNG supported
    if image.content_type not in ["image/jpeg", "image/png"]:
        raise HTTPException(
            status_code=400,
            detail="File must be a JPEG or PNG image"
        )
    
    # Read file in chunks to prevent memory exhaustion
    try:
        chunks = []
        total_size = 0
        
        while True:
            chunk = await image.read(CHUNK_SIZE)
            if not chunk:
                break
            total_size += len(chunk)
            if total_size > MAX_UPLOAD_SIZE:
                raise HTTPException(
                    status_code=400,
                    detail=f"File too large. Maximum size is {MAX_UPLOAD_SIZE_MB}MB"
                )
            chunks.append(chunk)
        
        image_bytes = b"".join(chunks)
    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to read image file")
        raise HTTPException(status_code=400, detail="Failed to read image file")
    
    # Validate magic bytes for JPEG/PNG only
    if not (image_bytes[:2] == b'\xff\xd8' or  # JPEG
            image_bytes[:8] == b'\x89PNG\r\n\x1a\n'):  # PNG
        raise HTTPException(
            status_code=400,
            detail="Invalid image format. Only JPEG and PNG are supported"
        )
    
    # Identify the pill
    try:
        result = await identify_pill(image_bytes, image.content_type)
        return result
    except ValueError as e:
        # Common case: missing AI provider config (e.g., GEMINI_API_KEY not set).
        logger.warning("Vision unavailable (misconfigured AI provider): %s", e)
        raise HTTPException(status_code=503, detail="AI service not configured")
