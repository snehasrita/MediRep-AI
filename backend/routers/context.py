from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
import logging
from typing import Optional

from services.gemini_service import analyze_patient_text
from models import PatientContext
from dependencies import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter()

class TextAnalysisRequest(BaseModel):
    text: str = Field(..., max_length=10000, description="Clinical text or notes to analyze")

@router.post("/analyze", response_model=PatientContext)
async def analyze_context(
    request: TextAnalysisRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Analyze unstructured clinical text and return valid Patient Context structure.
    """
    try:
        if not request.text.strip():
            raise HTTPException(status_code=400, detail="Text cannot be empty")
            
        context = await analyze_patient_text(request.text)
        return context
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Context analysis failed: %s", e)
        raise HTTPException(status_code=500, detail="Analysis failed")
