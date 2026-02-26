import random
import logging
import asyncio
from typing import Optional, Dict, List

# Check if curl_cffi is available
try:
    from curl_cffi import requests
    CURL_CFFI_AVAILABLE = True
except ImportError:
    CURL_CFFI_AVAILABLE = False
    logger = logging.getLogger(__name__)
    logger.warning("curl_cffi not installed. TLS service will use fallback requests")
    
    # Fallback to standard requests
    import requests as fallback_requests

logger = logging.getLogger(__name__)

class TLSService:
    """
    Custom TLS Fingerprint Impersonation Service.
    Uses curl_cffi to spoof browser TLS signatures (JA3) and bypass WAFs (Cloudflare/Akamai).
    """

    # Pool of modern User-Agents to rotate
    USER_AGENTS = [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
    ]

    async def fetch(self, url: str, headers: Dict = None) -> Optional[str]:
        """
        Fetch URL using TLS impersonation.
        Run in executor to keep loop non-blocking.
        """
        return await asyncio.to_thread(self._sync_fetch, url, headers)

    def _sync_fetch(self, url: str, headers: Dict = None) -> Optional[str]:
        try:
            # Prepare headers
            final_headers = {
                "User-Agent": random.choice(self.USER_AGENTS),
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
                "Accept-Encoding": "gzip, deflate, br",
                "Referer": "https://www.google.com/",
                "Upgrade-Insecure-Requests": "1"
            }
            if headers:
                final_headers.update(headers)

            # Perform Request with appropriate method
            if CURL_CFFI_AVAILABLE:
                # Use curl_cffi with Chrome 120 Impersonation (chrome110 not supported)
                try:
                    response = requests.get(
                        url,
                        impersonate="chrome120",
                        headers=final_headers,
                        timeout=30
                    )
                except Exception as e:
                    logger.warning(f"Chrome120 impersonation failed, trying chrome110: {e}")
                    try:
                        response = requests.get(
                            url,
                            impersonate="chrome110",
                            headers=final_headers,
                            timeout=30
                        )
                    except Exception as e2:
                        logger.warning(f"Chrome110 impersonation failed, using standard: {e2}")
                        response = requests.get(
                            url,
                            headers=final_headers,
                            timeout=30
                        )
            else:
                # Fallback to standard requests
                response = fallback_requests.get(
                    url,
                    headers=final_headers,
                    timeout=30
                )

            if response.status_code == 200:
                return response.text
            else:
                logger.warning(f"TLSService block/error for {url} - Status: {response.status_code}")
                return None

        except Exception as e:
            logger.error(f"TLSService failed for {url}: {e}")
            return None

tls_service = TLSService()
