import os
import asyncio
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import logging
import time
import uvicorn
# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Force reload hook



from config import ALLOWED_ORIGINS, PORT, RESEND_API_KEY, ADMIN_EMAILS, GEMINI_API_KEY
from routers import chat, drugs, vision, user, marketplace, pharmacist, consultations, admin, voice

# Rate Limiting
from limiter import limiter
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from services.socket_service import sio
import socketio

app = FastAPI(
    title="MediRep AI",
    description="AI-powered medical representative backend",
    version="1.0.0"
)

# Attach limiter to app state
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Environment detection
IS_PRODUCTION = os.getenv("ENV", "development").lower() == "production"


def _unique_preserve_order(values: list[str]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for v in values:
        if v in seen:
            continue
        out.append(v)
        seen.add(v)
    return out


# CORS Configuration - environment-aware
#
# IMPORTANT:
# - Browsers send a CORS preflight (OPTIONS) when using Authorization headers.
# - If the Origin isn't allowed, Starlette returns 400 and your app looks "broken".
#
# Configure in production via either:
# - ALLOWED_ORIGINS (comma-separated), OR
# - FRONTEND_URL (single origin).
cors_origins: list[str] = []
cors_origin_regex = os.getenv("ALLOWED_ORIGIN_REGEX")  # optional

frontend_url = os.getenv("FRONTEND_URL")

if IS_PRODUCTION:
    if ALLOWED_ORIGINS:
        cors_origins = ALLOWED_ORIGINS
        logger.info("CORS: Production mode - allowing ALLOWED_ORIGINS=%s", ",".join(cors_origins))
    else:
        cors_origins = [frontend_url or "https://medirep-ai.vercel.app"]
        logger.info("CORS: Production mode - allowing FRONTEND_URL=%s", cors_origins[0])
else:
    # Development: Allow localhost + any configured origins for convenience
    cors_origins = _unique_preserve_order(
        [
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            *(ALLOWED_ORIGINS or []),
            frontend_url or "http://localhost:3000",
        ]
    )
    logger.info("CORS: Development mode - allowing %s", ",".join(cors_origins))

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_origin_regex=cors_origin_regex,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "Origin", "X-Requested-With"],
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log requests with high-resolution timing information."""
    start_time = time.perf_counter()
    response = await call_next(request)
    elapsed_ms = (time.perf_counter() - start_time) * 1000
    logger.info(
        "%s %s - %d (%.2fms)",
        request.method,
        request.url.path,
        response.status_code,
        elapsed_ms
    )
    return response


@app.on_event("startup")
async def startup_event():
    """Log important configuration status at startup."""
    logger.info("=" * 60)
    logger.info("MediRep AI Backend Starting...")
    logger.info("=" * 60)

    # Email configuration status
    if RESEND_API_KEY:
        logger.info("[EMAIL] Resend API Key: CONFIGURED")
    else:
        logger.warning("[EMAIL] Resend API Key: NOT CONFIGURED - Email notifications DISABLED")

    if ADMIN_EMAILS:
        logger.info("[EMAIL] Admin emails: %s", ", ".join(ADMIN_EMAILS))
    else:
        logger.warning("[EMAIL] Admin emails: NOT CONFIGURED - Admin notifications DISABLED")

    # AI configuration status
    if GEMINI_API_KEY:
        logger.info("[AI] Gemini: CONFIGURED")
    else:
        logger.warning("[AI] Gemini: NOT CONFIGURED - Chat/Vision will return 503")

    # Warm up slow singletons so the first chat request doesn't pay the cost.
    # This trades a small startup hit for much faster first-response latency.
    try:
        from services import turso_service, qdrant_service
        await asyncio.to_thread(turso_service.get_connection)
        await asyncio.to_thread(qdrant_service.get_client)
        await asyncio.to_thread(qdrant_service.get_embedding_model)
        logger.info("[WARMUP] Turso/Qdrant/Embeddings: READY")
    except Exception as e:
        logger.warning("[WARMUP] Skipped/failed: %s", e)

    logger.info("=" * 60)


@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "MediRep AI"}


# Mount routers
app.include_router(chat.router, prefix="/api", tags=["Chat"])
app.include_router(voice.router, prefix="/api/voice", tags=["Voice"])
app.include_router(drugs.router, prefix="/api/drugs", tags=["Drugs"])
app.include_router(vision.router, prefix="/api/vision", tags=["Vision"])
app.include_router(user.router, prefix="/api/user", tags=["User"])
app.include_router(admin.router, prefix="/api/admin", tags=["Admin"])

# Marketplace routers
app.include_router(marketplace.router, prefix="/api/marketplace", tags=["Marketplace"])
app.include_router(pharmacist.router, prefix="/api/pharmacist", tags=["Pharmacist"])
app.include_router(consultations.router, prefix="/api/consultations", tags=["Consultations"])

# Sessions router (chat session management)
from routers import sessions
app.include_router(sessions.router, prefix="/api/sessions", tags=["Sessions"])

# Prices router (medicine price comparison)
from routers import prices
app.include_router(prices.router, prefix="/api/prices", tags=["Prices"])

# Context router (patient context analysis)
from routers import context
app.include_router(context.router, prefix="/api/context", tags=["Context"])


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Handle uncaught exceptions with proper response."""
    logger.exception("Unhandled exception for %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"}
    )


if __name__ == "__main__":
    # Use string import path for reload to work
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=True)

# Wrap FastAPI with Socket.IO
app = socketio.ASGIApp(sio, app)
