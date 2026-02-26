from pydantic import BaseModel, Field, EmailStr, validator, model_validator, field_validator
from typing import List, Optional, Literal
from datetime import datetime


class PatientContext(BaseModel):
    age: Optional[int] = Field(None, ge=0, le=150)
    sex: Optional[Literal["male", "female", "other"]] = None
    weight: Optional[float] = Field(None, ge=0, le=1000)
    pre_existing_diseases: List[str] = Field(default_factory=list, alias="preExistingDiseases")
    current_meds: List[str] = Field(default_factory=list, alias="currentMeds")

    class Config:
        populate_by_name = True


class Message(BaseModel):
    role: Literal["user", "assistant"]
    content: str


# Alias for compatibility
ChatMessage = Message


class Citation(BaseModel):
    title: str
    url: str
    source: str


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000)
    patient_context: Optional[PatientContext] = None
    history: List[Message] = Field(default_factory=list)
    session_id: Optional[str] = Field(None, description="Session ID to continue conversation")
    web_search_mode: bool = Field(False, description="Force web search for this query")
    images: List[str] = Field(default_factory=list, description="List of base64 encoded images")
    language: str = Field("auto", description="Language code (en, hi, ta, te, bn, mr, gu, pa, kn, ml, or) or 'auto' for detection")
    voice_mode: bool = Field(False)
    chat_mode: Optional[str] = Field("normal", description="Chat mode: normal, insurance, moa, rep, rep:Company")


class WebSearchResult(BaseModel):
    """Web search result from external search API."""
    title: str
    url: str
    snippet: str
    source: str


# ============================================================================
# TRACK 2 RESPONSE MODELS (Digital Medical Representative)
# ============================================================================

class InsuranceProcedureMatch(BaseModel):
    """Single matched procedure from PM-JAY HBP."""
    package_code: str
    procedure_name: str
    rate_inr: int
    rate_display: str
    category: Optional[str] = None
    sub_category: Optional[str] = None
    includes_implants: bool = False
    special_conditions: Optional[str] = None
    data_source: Optional[str] = None


class InsuranceSchemeInfo(BaseModel):
    """Insurance scheme metadata."""
    scheme_code: str
    scheme_name: str
    source_url: Optional[str] = None
    last_verified_at: Optional[str] = None


class InsuranceContext(BaseModel):
    """Insurance/reimbursement context for Track 2."""
    query: Optional[str] = None
    scheme: Optional[InsuranceSchemeInfo] = None
    matched_procedure: Optional[InsuranceProcedureMatch] = None
    other_matches: List[InsuranceProcedureMatch] = Field(default_factory=list)
    no_match_reason: Optional[str] = None
    note: Optional[str] = None


class MoAContext(BaseModel):
    """Mechanism of Action context for Track 2."""
    drug_name: str
    mechanism: Optional[str] = None
    drug_class: Optional[str] = None
    pharmacodynamics: Optional[str] = None
    targets: List[str] = Field(default_factory=list)
    # Optional one-line "arrow chain" the UI can display when present.
    pathway_equation: Optional[str] = None
    sources: List[str] = Field(default_factory=list)


class CompareAlternative(BaseModel):
    """Alternative drug for comparison."""
    name: str
    generic_name: Optional[str] = None
    therapeutic_class: Optional[str] = None
    price_raw: Optional[str] = None


class CompareContext(BaseModel):
    """Therapeutic comparison context for Track 2."""
    drug_name: str
    therapeutic_class: Optional[str] = None
    alternatives: List[CompareAlternative] = Field(default_factory=list)
    comparison_factors: List[str] = Field(default_factory=list)
    sources: List[str] = Field(default_factory=list)


class RepModeContext(BaseModel):
    """Pharma rep mode context for Track 2."""
    active: bool = False
    company_key: Optional[str] = None
    company_name: Optional[str] = None
    company_id: Optional[str] = None


class Track2Data(BaseModel):
    """
    Structured Track 2 data for frontend rendering.
    
    Track 2 (Digital Medical Representative) provides:
    - Scientific: MoA, therapeutic differentiation
    - Administrative: insurance/reimbursement, package rates
    """
    insurance: Optional[InsuranceContext] = None
    moa: Optional[MoAContext] = None
    compare: Optional[CompareContext] = None
    rep_mode: Optional[RepModeContext] = None
    needs_web_search: bool = Field(False, description="If True, web search fallback is recommended for better results")
    web_search_query: Optional[str] = Field(None, description="Suggested web search query when DB lookup fails")


class ChatResponse(BaseModel):
    response: str
    citations: List[Citation] = Field(default_factory=list)
    suggestions: List[str] = Field(default_factory=list)
    session_id: str = Field(..., description="Session ID for this conversation")
    web_sources: List[WebSearchResult] = Field(default_factory=list, description="Web search results used")
    track2: Optional[Track2Data] = Field(None, description="Structured Track 2 context (insurance, MoA, comparison, rep mode)")


# ============================================================================
# VOICE MODELS
# ============================================================================

class VoiceTranscribeResponse(BaseModel):
    text: str = Field(default="")


class VoiceTtsRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=400)
    voice: Optional[str] = None
    response_format: Literal["wav", "mp3"] = "wav"


# ============================================================================
# CHAT SESSION MODELS
# ============================================================================

class SessionCreate(BaseModel):
    """Request to create a new chat session."""
    title: Optional[str] = Field(None, max_length=100)
    patient_context: Optional[PatientContext] = None


class SessionUpdate(BaseModel):
    """Request to update session metadata."""
    title: Optional[str] = Field(None, min_length=1, max_length=100)
    is_archived: Optional[bool] = None


class SessionSummary(BaseModel):
    """Session summary for listing."""
    id: str
    title: str
    message_count: int = 0
    is_archived: bool = False
    created_at: datetime
    updated_at: datetime
    last_message_at: datetime


class SessionMessage(BaseModel):
    """Single message in a session."""
    id: str
    role: Literal["user", "assistant"]
    content: str
    created_at: datetime


class SessionDetail(BaseModel):
    """Full session with messages."""
    id: str
    title: str
    message_count: int
    is_archived: bool
    created_at: datetime
    updated_at: datetime
    last_message_at: datetime
    messages: List[SessionMessage] = Field(default_factory=list)
    patient_context: Optional[PatientContext] = None


class SessionShareLink(BaseModel):
    """Share-link metadata for a session."""
    session_id: str
    share_token: str
    share_path: str
    created_at: Optional[datetime] = None


class SharedSessionDetail(BaseModel):
    """Public read-only view of a shared session."""
    share_token: str
    title: str
    message_count: int
    created_at: datetime
    updated_at: datetime
    last_message_at: datetime
    messages: List[SessionMessage] = Field(default_factory=list)
    is_view_only: bool = True
    can_continue: bool = True


class SharedSessionContinueResponse(BaseModel):
    """Response returned after forking a shared session."""
    session_id: str
    title: str
    message_count: int


class DrugInfo(BaseModel):
    name: str
    generic_name: Optional[str] = None
    manufacturer: Optional[str] = None
    indications: List[str] = Field(default_factory=list)
    dosage: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    contraindications: List[str] = Field(default_factory=list)
    side_effects: List[str] = Field(default_factory=list)
    interactions: List[str] = Field(default_factory=list)
    
    # Chemical Info
    formula: Optional[str] = None
    smiles: Optional[str] = None
    
    # India-specific fields
    indian_brands: List[str] = Field(default_factory=list)
    substitutes: List[str] = Field(default_factory=list)
    mrp_range: Optional[str] = None
    price_raw: Optional[str] = None
    price: Optional[float] = None
    jan_aushadhi_price: Optional[str] = None
    pack_size: Optional[str] = None
    nlem_status: bool = False
    dpco_controlled: bool = False
    schedule: Optional[str] = None
    therapeutic_class: Optional[str] = None
    action_class: Optional[str] = None


class DrugSearchResult(BaseModel):
    name: str
    generic_name: Optional[str] = None
    manufacturer: Optional[str] = None


class DrugInteraction(BaseModel):
    drug1: str
    drug2: str
    severity: Literal["minor", "moderate", "major"]
    description: str
    recommendation: str


class InteractionRequest(BaseModel):
    drugs: List[str] = Field(..., min_length=1, max_length=10)
    patient_context: Optional[PatientContext] = None


class InteractionResponse(BaseModel):
    interactions: List[DrugInteraction]


# ============================================================================
# ENHANCED DRUG INTERACTION MODELS (AUC-based Mathematics)
# ============================================================================

class DrugChemistry(BaseModel):
    """Chemical information for a drug."""
    name: str
    formula: str  # e.g., "C9H8O4" for Aspirin
    formula_display: str  # Unicode subscript format: "C₉H₈O₄"
    smiles: str  # SMILES notation for structure
    molecular_weight: float
    metabolism: str  # e.g., "CYP2C9, hydrolysis"


class InteractionMathematics(BaseModel):
    """Mathematical parameters for drug interaction calculation."""
    auc_ratio_r: float  # R = 1 + ([I] / Ki)
    inhibitor_concentration_um: float  # [I] in μM
    ki_value_um: float  # Ki in μM
    formula: str  # "R = 1 + ([I] / Ki)"
    calculation: str  # Full calculation string
    severity: Literal["none", "minor", "moderate", "major"]
    mechanism: str  # e.g., "Aspirin inhibits CYP2C9 metabolism of Warfarin"
    affected_enzyme: str  # e.g., "CYP2C9"


class MetabolicPathway(BaseModel):
    """Metabolic pathway change visualization."""
    victim_normal: str  # Normal metabolism pathway
    victim_inhibited: str  # Inhibited pathway
    result: str  # Clinical result
    affected_metabolite_name: Optional[str] = None
    affected_metabolite_formula: Optional[str] = None
    affected_metabolite_smiles: Optional[str] = None


class ReactionImage(BaseModel):
    """Chemical reaction visualization image."""
    url: str
    prompt: str
    generated_at: Optional[datetime] = None


class ClinicalImpact(BaseModel):
    """Clinical impact summary."""
    description: str
    recommendation: str
    severity: str


class EnhancedInteractionRequest(BaseModel):
    """Request for enhanced drug interaction analysis."""
    drug1: str = Field(..., min_length=1, max_length=100)
    drug2: str = Field(..., min_length=1, max_length=100)
    patient_context: Optional[PatientContext] = None


class EnhancedInteractionResponse(BaseModel):
    """Full enhanced interaction response with chemistry and mathematics."""
    victim_drug: DrugChemistry
    perpetrator_drug: DrugChemistry
    interaction_mathematics: InteractionMathematics
    metabolic_pathway: MetabolicPathway
    clinical_impact: ClinicalImpact
    reaction_image: Optional[ReactionImage] = None


class PillIdentification(BaseModel):
    name: str
    confidence: float = Field(..., ge=0.0, le=1.0)
    description: str
    color: Optional[str] = None
    shape: Optional[str] = None
    imprint: Optional[str] = None


class PillDrugMatch(BaseModel):
    name: str
    generic_name: Optional[str] = None
    manufacturer: Optional[str] = None
    price_raw: Optional[str] = None
    description: Optional[str] = None
    match_score: float = Field(..., ge=0.0, le=1.0)
    match_reason: str


class PillScanResponse(PillIdentification):
    """Extended pill scan response with structured DB matches + enriched drug info."""

    ocr_confidence: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    matches: List[PillDrugMatch] = Field(default_factory=list)
    drug_info: Optional[DrugInfo] = None
    drug_info_source: Optional[Literal["database", "llm"]] = None
    drug_info_disclaimer: Optional[str] = None


class SavedDrug(BaseModel):
    drug_name: str
    notes: Optional[str] = None
    created_at: Optional[datetime] = None


# ============================================================================
# MARKETPLACE MODELS
# ============================================================================

class PharmacistRegistration(BaseModel):
    """Request model for pharmacist registration."""
    full_name: str = Field(..., min_length=2, max_length=100)
    phone: str = Field(..., pattern=r"^\+?[0-9]{10,15}$")
    license_number: str = Field(..., min_length=5, max_length=50)
    license_image_url: str  # URL from frontend upload
    license_state: Optional[str] = None
    specializations: List[str] = Field(default_factory=list)
    experience_years: int = Field(default=0, ge=0, le=50)
    languages: List[str] = Field(default=["English", "Hindi"])
    education: Optional[str] = None
    bio: Optional[str] = Field(None, max_length=500)
    rate: int = Field(default=299, ge=1, le=100000)
    duration_minutes: int = Field(default=15)
    upi_id: Optional[str] = None

    @field_validator("duration_minutes")
    @classmethod
    def validate_duration(cls, v):
        if v not in [15, 30, 45, 60]:
            raise ValueError("Duration must be 15, 30, 45, or 60 minutes")
        return v


class PharmacistProfile(BaseModel):
    """Response model for pharmacist profile."""
    id: str
    user_id: str
    full_name: str
    bio: Optional[str] = None
    profile_image_url: Optional[str] = None
    specializations: List[str] = Field(default_factory=list)
    experience_years: int = 0
    languages: List[str] = Field(default_factory=list)
    education: Optional[str] = None
    rate: int
    duration_minutes: int
    rating_avg: float = 0.0
    rating_count: int = 0
    completed_consultations: int = 0
    is_available: bool = False
    verification_status: str = "pending"

class PharmacistPublicProfile(BaseModel):
    """Public-safe pharmacist profile (no user_id, no license fields)."""
    id: str
    full_name: str
    bio: Optional[str] = None
    profile_image_url: Optional[str] = None
    specializations: List[str] = Field(default_factory=list)
    experience_years: int = 0
    languages: List[str] = Field(default_factory=list)
    education: Optional[str] = None
    rate: int
    duration_minutes: int
    rating_avg: float = 0.0
    rating_count: int = 0
    completed_consultations: int = 0
    is_available: bool = False


class PharmacistSearchResult(BaseModel):
    """Simplified pharmacist for search results."""
    id: str
    full_name: str
    bio: Optional[str] = None
    profile_image_url: Optional[str] = None
    specializations: List[str] = Field(default_factory=list)
    experience_years: int = 0
    languages: List[str] = Field(default_factory=list)
    rate: int
    duration_minutes: int
    rating_avg: float = 0.0
    rating_count: int = 0
    is_available: bool = False


class PharmacistScheduleSlot(BaseModel):
    """Single availability slot."""
    id: Optional[str] = None
    day_of_week: int = Field(..., ge=0, le=6)  # 0=Sunday
    start_time: str = Field(..., pattern=r"^\d{2}:\d{2}$")  # HH:MM
    end_time: str = Field(..., pattern=r"^\d{2}:\d{2}$")
    is_active: bool = True

    @model_validator(mode='after')
    def validate_times(self) -> 'PharmacistScheduleSlot':
        try:
            start_h, start_m = map(int, self.start_time.split(':'))
            end_h, end_m = map(int, self.end_time.split(':'))
        except ValueError:
            raise ValueError("Time must be in HH:MM format")

        if not (0 <= start_h <= 23 and 0 <= start_m <= 59):
            raise ValueError("Start time invalid")
        if not (0 <= end_h <= 23 and 0 <= end_m <= 59):
            raise ValueError("End time invalid")
        
        start_mins = start_h * 60 + start_m
        end_mins = end_h * 60 + end_m
        
        if start_mins >= end_mins:
            raise ValueError("Start time must be strictly before end time")
            
        return self


class BookingRequest(BaseModel):
    """Request to book a consultation."""
    pharmacist_id: str
    scheduled_at: datetime
    patient_concern: Optional[str] = Field(None, max_length=500)


class BookingResponse(BaseModel):
    """Response after creating a booking."""
    consultation_id: str
    razorpay_order_id: str
    amount: int
    currency: str = "INR"
    pharmacist_name: str
    scheduled_at: datetime


class ConsultationStatus(BaseModel):
    """Consultation status for patient/pharmacist."""
    id: str
    patient_id: str
    pharmacist_id: str
    pharmacist_name: str
    scheduled_at: datetime
    duration_minutes: int
    status: str
    amount: int
    payment_status: str
    patient_concern: Optional[str] = None
    rating: Optional[int] = None
    review: Optional[str] = None
    agora_channel: Optional[str] = None
    created_at: datetime


class JoinCallResponse(BaseModel):
    """Response with Agora token to join call."""
    agora_channel: str
    agora_token: str
    agora_app_id: str
    uid: int
    consultation_id: str
    expires_at: datetime


class ReviewRequest(BaseModel):
    """Request to submit a review."""
    consultation_id: str
    rating: int = Field(..., ge=1, le=5)
    review: Optional[str] = Field(None, max_length=1000)


class PharmacistDashboardStats(BaseModel):
    """Stats for pharmacist dashboard."""
    total_earnings: int = 0
    pending_payout: int = 0
    completed_consultations: int = 0
    upcoming_consultations: int = 0
    rating_avg: float = 0.0
    rating_count: int = 0


class PayoutSummary(BaseModel):
    """Payout record for pharmacist."""
    id: str
    period_start: datetime
    period_end: datetime
    gross_amount: int
    net_amount: int
    consultation_count: int
    status: str
    processed_at: Optional[datetime] = None


class RazorpayWebhookPayload(BaseModel):
    """Razorpay webhook payload (partial, key fields)."""
    event: str
    payload: dict


class LicenseExtractionResult(BaseModel):
    """AI-extracted license data."""
    full_name: Optional[str] = None
    license_number: Optional[str] = None
    license_state: Optional[str] = None
    expiry_date: Optional[str] = None
    confidence_score: float = 0.0
    is_valid: bool = False
    rejection_reason: Optional[str] = None
