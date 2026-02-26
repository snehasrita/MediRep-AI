from slowapi import Limiter
import os
from slowapi.util import get_remote_address

def get_client_ip(request) -> str:
    """
    Rate-limit key function.

    In production behind a proxy (Railway), enable TRUST_PROXY=true to use
    X-Forwarded-For. Otherwise, fall back to request.client.host.
    """
    if os.getenv("TRUST_PROXY", "false").lower() == "true":
        xff = request.headers.get("x-forwarded-for")
        if xff:
            # First IP is the original client in standard XFF format.
            return xff.split(",")[0].strip()
    return get_remote_address(request)

# Shared limiter instance
limiter = Limiter(key_func=get_client_ip)
