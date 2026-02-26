import os
import logging
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)


def get_env_str(key: str, default: str = "") -> str:
    """Get string env var with default."""
    return os.getenv(key, default)


def get_env_int(key: str, default: int) -> int:
    """Get int env var with validation. Treats empty string as default."""
    value = os.getenv(key)
    if value is None or value.strip() == "":
        return default
    try:
        return int(value)
    except ValueError:
        raise ValueError(f"Environment variable {key} must be an integer, got: {value}")


def get_env_float(key: str, default: float) -> float:
    """Get float env var with validation. Treats empty string as default."""
    value = os.getenv(key)
    if value is None or value.strip() == "":
        return default
    try:
        return float(value)
    except ValueError:
        raise ValueError(f"Environment variable {key} must be a float, got: {value}")


# AI API Keys
#
# IMPORTANT: Don't hard-fail app startup if Gemini is not configured.
# In real deployments (Railway/Render/etc.) env vars are easy to misconfigure and
# crashing at import time makes the service undeployable. Instead, we treat the
# key as feature-gating: AI endpoints should return 503 when missing.
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    logger.warning("GEMINI_API_KEY not set. AI features (chat/vision/interactions) will be disabled.")


# AI Configuration
GEMINI_MODEL = get_env_str("GEMINI_MODEL", "gemini-3-flash-preview")

# Supabase Configuration (Required for full functionality)
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

# Log warning if Supabase not configured
if not SUPABASE_URL or not SUPABASE_KEY:
    logger.warning(
        "SUPABASE_URL or SUPABASE_KEY not set. "
        "Database features (RAG, chat history, saved drugs) will be disabled."
    )

# API Configuration with validation
API_TIMEOUT = get_env_float("API_TIMEOUT", 15.0)
if API_TIMEOUT <= 0:
    raise ValueError(f"API_TIMEOUT must be positive, got: {API_TIMEOUT}")

CACHE_TTL_DRUG = get_env_int("CACHE_TTL_DRUG", 3600)
if CACHE_TTL_DRUG < 0:
    raise ValueError(f"CACHE_TTL_DRUG must be non-negative, got: {CACHE_TTL_DRUG}")

CACHE_TTL_ALERT = get_env_int("CACHE_TTL_ALERT", 7200)
if CACHE_TTL_ALERT < 0:
    raise ValueError(f"CACHE_TTL_ALERT must be non-negative, got: {CACHE_TTL_ALERT}")

# Auth timeout with positive validation
AUTH_TIMEOUT = get_env_float("AUTH_TIMEOUT", 30.0)
if AUTH_TIMEOUT <= 0:
    raise ValueError(f"AUTH_TIMEOUT must be positive, got: {AUTH_TIMEOUT}")

# Server Configuration
PORT = get_env_int("PORT", 8000)

# Parse and trim ALLOWED_ORIGINS
_origins_raw = os.getenv(
    "ALLOWED_ORIGINS",
    "https://medirep-ai.vercel.app,http://localhost:3000,http://127.0.0.1:3000",
)
ALLOWED_ORIGINS = [origin.strip() for origin in _origins_raw.split(",") if origin.strip()]

# Limits with positive validation
MAX_UPLOAD_SIZE_MB = get_env_int("MAX_UPLOAD_SIZE_MB", 10)
if MAX_UPLOAD_SIZE_MB <= 0:
    raise ValueError(f"MAX_UPLOAD_SIZE_MB must be positive, got: {MAX_UPLOAD_SIZE_MB}")
MAX_UPLOAD_SIZE = MAX_UPLOAD_SIZE_MB * 1024 * 1024

MAX_HISTORY_MESSAGES = get_env_int("MAX_HISTORY_MESSAGES", 10)
if MAX_HISTORY_MESSAGES <= 0:
    raise ValueError(f"MAX_HISTORY_MESSAGES must be positive, got: {MAX_HISTORY_MESSAGES}")

MAX_RESPONSE_LENGTH = get_env_int("MAX_RESPONSE_LENGTH", 2000)
if MAX_RESPONSE_LENGTH <= 0:
    raise ValueError(f"MAX_RESPONSE_LENGTH must be positive, got: {MAX_RESPONSE_LENGTH}")

# External API base URLs (override via env for testing/mocking)
OPENFDA_LABEL_URL = get_env_str("OPENFDA_LABEL_URL", "https://api.fda.gov/drug/label.json")
OPENFDA_ENFORCEMENT_URL = get_env_str("OPENFDA_ENFORCEMENT_URL", "https://api.fda.gov/drug/enforcement.json")
RXCLASS_BASE_URL = get_env_str("RXCLASS_BASE_URL", "https://rxnav.nlm.nih.gov/REST/rxclass")
RXNORM_BASE_URL = get_env_str("RXNORM_BASE_URL", "https://rxnav.nlm.nih.gov/REST")
PUBCHEM_BASE_URL = get_env_str("PUBCHEM_BASE_URL", "https://pubchem.ncbi.nlm.nih.gov/rest/pug")
PUBCHEM_VIEW_BASE_URL = get_env_str("PUBCHEM_VIEW_BASE_URL", "https://pubchem.ncbi.nlm.nih.gov/rest/pug_view")

# Turso Configuration (Drug Data Storage)
TURSO_DATABASE_URL = os.getenv("TURSO_DATABASE_URL")
TURSO_AUTH_TOKEN = os.getenv("TURSO_AUTH_TOKEN")

if not TURSO_DATABASE_URL or not TURSO_AUTH_TOKEN:
    logger.warning(
        "TURSO_DATABASE_URL or TURSO_AUTH_TOKEN not set. "
        "Drug database features will fall back to Supabase or static data."
    )

# Qdrant Configuration (Vector Embeddings)
QDRANT_URL = os.getenv("QDRANT_URL")
QDRANT_API_KEY = os.getenv("QDRANT_API_KEY")

if not QDRANT_URL or not QDRANT_API_KEY:
    logger.warning(
        "QDRANT_URL or QDRANT_API_KEY not set. "
        "Vector search will be disabled, falling back to text search."
    )

# Groq Configuration (Fallback for Gemini)
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
GROQ_STT_MODEL = os.getenv("GROQ_STT_MODEL", "whisper-large-v3-turbo")
GROQ_TTS_MODEL = os.getenv("GROQ_TTS_MODEL", "playai-tts")
GROQ_TTS_VOICE = os.getenv("GROQ_TTS_VOICE", "Fritz-PlayAI")
GROQ_TTS_RESPONSE_FORMAT = os.getenv("GROQ_TTS_RESPONSE_FORMAT", "wav")

if GROQ_API_KEY:
    logger.info("Groq API configured as fallback for Gemini")
else:
    logger.warning("GROQ_API_KEY not set. Groq fallback will be disabled.")

# NOTE: Speech-to-text now handled client-side via Web Speech API (no server-side API needed)

# ============================================================================
# MARKETPLACE CONFIGURATION
# ============================================================================

# Razorpay Configuration
RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID")
RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET")
RAZORPAY_WEBHOOK_SECRET = os.getenv("RAZORPAY_WEBHOOK_SECRET")

if not RAZORPAY_KEY_ID or not RAZORPAY_KEY_SECRET:
    logger.warning("RAZORPAY credentials not set. Payment features will be disabled.")
if not RAZORPAY_WEBHOOK_SECRET:
    logger.warning("RAZORPAY_WEBHOOK_SECRET not set. Webhook verification will be disabled (INSECURE).")

# Agora Configuration (Voice Calls)
AGORA_APP_ID = os.getenv("AGORA_APP_ID")
AGORA_APP_CERTIFICATE = os.getenv("AGORA_APP_CERTIFICATE")

if not AGORA_APP_ID or not AGORA_APP_CERTIFICATE:
    logger.warning("AGORA credentials not set. Voice call features will be disabled.")

# Marketplace Business Rules
PLATFORM_FEE_PERCENT = get_env_int("PLATFORM_FEE_PERCENT", 20)
if not 0 <= PLATFORM_FEE_PERCENT <= 100:
    raise ValueError("PLATFORM_FEE_PERCENT must be between 0 and 100")

MIN_CONSULTATION_RATE = get_env_int("MIN_CONSULTATION_RATE", 99)
MAX_CONSULTATION_RATE = get_env_int("MAX_CONSULTATION_RATE", 9999)
if MIN_CONSULTATION_RATE > MAX_CONSULTATION_RATE:
    raise ValueError("MIN_CONSULTATION_RATE cannot be greater than MAX_CONSULTATION_RATE")

MIN_PAYOUT_AMOUNT = get_env_int("MIN_PAYOUT_AMOUNT", 500)
if MIN_PAYOUT_AMOUNT < 0:
    raise ValueError("MIN_PAYOUT_AMOUNT cannot be negative")

CONSULTATION_DURATIONS = [15, 30, 45, 60]  # Minutes

# Agora Token Expiry
AGORA_TOKEN_EXPIRY_SECONDS = get_env_int("AGORA_TOKEN_EXPIRY_SECONDS", 3600)  # 1 hour

# ============================================================================
# EMAIL CONFIGURATION
# ============================================================================

# Resend Configuration (Email Notifications)
RESEND_API_KEY = os.getenv("RESEND_API_KEY")
EMAIL_FROM = os.getenv("EMAIL_FROM", "MediRep AI <notifications@medirep.ai>")
ADMIN_EMAILS = [e.strip() for e in os.getenv("ADMIN_EMAILS", "").split(",") if e.strip()]

if not RESEND_API_KEY:
    logger.warning("RESEND_API_KEY not set. Email notifications will be disabled.")
if not ADMIN_EMAILS:
    logger.warning("ADMIN_EMAILS not set. Admin notifications will be disabled.")
