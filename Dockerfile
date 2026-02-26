FROM mcr.microsoft.com/playwright/python:v1.45.0-jammy

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Install Python dependencies first for better Docker layer caching.
COPY backend/requirements.txt backend/requirements.txt
# Install CPU-only PyTorch (much smaller) and other dependencies
RUN pip install --upgrade pip && \
    pip install torch --index-url https://download.pytorch.org/whl/cpu && \
    pip install -r backend/requirements.txt

# Note: The base image mcr.microsoft.com/playwright/python already includes 
# Chromium and all necessary system dependencies. We do NOT need to run 
# 'playwright install' again. This saves significantly on build time.
RUN python -m playwright install --with-deps chromium

COPY backend /app/backend
WORKDIR /app/backend

ENV PORT=8000
EXPOSE 8000

# NOTE: Socket.IO does not work correctly with multiple workers unless you
# configure a shared message queue; keep workers=1.
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1 --log-level info"]

