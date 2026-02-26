"""
Web Search Service - Real-time web search for medical information.

Supports multiple providers with fallback chain:
1. LangSearch (FREE, unlimited, LLM-optimized)
2. Serper.dev (Google Search, 2,500 free/month)
3. Brave Search (Privacy-focused, 2,000 free/month)
"""
import logging
import os
import httpx
from typing import List, Optional
from pydantic import BaseModel
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

# API Configuration
LANGSEARCH_API_KEY = os.getenv("LANGSEARCH_API_KEY")
SERPER_API_KEY = os.getenv("SERPER_API_KEY")
BRAVE_API_KEY = os.getenv("BRAVE_API_KEY")

LANGSEARCH_URL = "https://api.langsearch.com/v1/web-search"
SERPER_URL = "https://google.serper.dev/search"
BRAVE_URL = "https://api.search.brave.com/res/v1/web/search"


class WebSearchResult(BaseModel):
    """Single web search result."""
    title: str
    url: str
    snippet: str
    source: str  # Domain name


async def search_langsearch(query: str, num_results: int = 5) -> List[WebSearchResult]:
    """Search using LangSearch API (LLM-optimized, free unlimited)."""
    if not LANGSEARCH_API_KEY:
        logger.debug("LANGSEARCH_API_KEY not configured")
        return []

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                LANGSEARCH_URL,
                headers={
                    "Authorization": f"Bearer {LANGSEARCH_API_KEY}",
                    "Content-Type": "application/json"
                },
                json={
                    "query": query,
                    "freshness": "noLimit",
                    "summary": True,
                    "count": num_results
                }
            )
            response.raise_for_status()
            data = response.json()

            results = []
            for item in data.get("data", {}).get("webPages", {}).get("value", [])[:num_results]:
                url = item.get("url", "")
                source = url.split("/")[2] if "/" in url else url

                results.append(WebSearchResult(
                    title=item.get("name", ""),
                    url=url,
                    snippet=item.get("snippet", ""),
                    source=source
                ))

            logger.info("LangSearch returned %d results for: %s", len(results), query[:50])
            return results

    except Exception as e:
        logger.warning("LangSearch failed: %s", e)
        return []


async def search_serper(query: str, num_results: int = 5) -> List[WebSearchResult]:
    """Search using Serper.dev (Google Search API)."""
    if not SERPER_API_KEY:
        logger.debug("SERPER_API_KEY not configured")
        return []

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                SERPER_URL,
                headers={
                    "X-API-KEY": SERPER_API_KEY,
                    "Content-Type": "application/json"
                },
                json={
                    "q": query,
                    "num": num_results,
                    "gl": "in",  # India
                    "hl": "en"
                }
            )
            response.raise_for_status()
            data = response.json()

            results = []
            for item in data.get("organic", [])[:num_results]:
                url = item.get("link", "")
                source = url.split("/")[2] if "/" in url else url

                results.append(WebSearchResult(
                    title=item.get("title", ""),
                    url=url,
                    snippet=item.get("snippet", ""),
                    source=source
                ))

            logger.info("Serper search returned %d results for: %s", len(results), query[:50])
            return results

    except Exception as e:
        logger.warning("Serper search failed: %s", e)
        return []


async def search_brave(query: str, num_results: int = 5) -> List[WebSearchResult]:
    """Fallback: Search using Brave Search API."""
    if not BRAVE_API_KEY:
        logger.debug("BRAVE_API_KEY not configured")
        return []

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                BRAVE_URL,
                headers={
                    "Accept": "application/json",
                    "X-Subscription-Token": BRAVE_API_KEY
                },
                params={
                    "q": query,
                    "count": num_results,
                    "country": "IN"
                }
            )
            response.raise_for_status()
            data = response.json()

            results = []
            for item in data.get("web", {}).get("results", [])[:num_results]:
                url = item.get("url", "")
                source = url.split("/")[2] if "/" in url else url

                results.append(WebSearchResult(
                    title=item.get("title", ""),
                    url=url,
                    snippet=item.get("description", ""),
                    source=source
                ))

            logger.info("Brave search returned %d results for: %s", len(results), query[:50])
            return results

    except Exception as e:
        logger.warning("Brave search failed: %s", e)
        return []


async def search_web(query: str, num_results: int = 5) -> List[WebSearchResult]:
    """
    Main entry point for web search.
    
    Fallback chain: LangSearch -> Serper -> Brave
    Returns empty list if all fail.
    """
    # Try LangSearch first (free, unlimited, LLM-optimized)
    results = await search_langsearch(query, num_results)
    if results:
        return results

    # Fallback to Serper (Google)
    results = await search_serper(query, num_results)
    if results:
        return results

    # Final fallback to Brave
    results = await search_brave(query, num_results)
    if results:
        return results

    logger.warning("All web search providers failed for: %s", query[:50])
    return []


def _normalize_domain(domain_or_url: str) -> str:
    """Normalize a domain/url to hostname without www."""
    raw = (domain_or_url or "").strip().lower()
    if not raw:
        return ""
    if raw.startswith("http://") or raw.startswith("https://"):
        try:
            raw = urlparse(raw).hostname or ""
        except Exception:
            raw = ""
    raw = raw.replace("www.", "")
    return raw


async def search_medical(
    query: str,
    num_results: int = 5,
    extra_trusted_domains: Optional[List[str]] = None
) -> List[WebSearchResult]:
    """
    Medical-focused web search.
    
    Appends medical context to query for better results.
    Filters for trusted medical sources when possible.
    """
    query_lower = (query or "").lower()
    freshness_markers = (
        "latest", "current", "today", "this year", "as of",
        "guideline", "recommendation", "update", "advisory",
    )
    # For guideline/update asks, avoid forcing "India medicine drug" terms.
    if any(m in query_lower for m in freshness_markers):
        enhanced_query = f"{query} official guidance recommendation"
    else:
        enhanced_query = f"{query} medicine drug India"
    
    results = await search_web(enhanced_query, num_results * 2)  # Get extra, filter later
    
    # Prioritize trusted medical sources
    trusted_domains = {
        "1mg.com", "pharmeasy.in", "netmeds.com", "apollopharmacy.in",
        "webmd.com", "mayoclinic.org", "nih.gov", "medscape.com",
        "drugs.com", "rxlist.com", "healthline.com", "dailymed.nlm.nih.gov",
        "cdc.gov", "who.int", "fda.gov", "aap.org",
        "mohfw.gov.in", "nha.gov.in", "icmr.gov.in", "cdsco.gov.in"
    }
    for d in extra_trusted_domains or []:
        nd = _normalize_domain(d)
        if nd:
            trusted_domains.add(nd)

    def is_trusted(result: WebSearchResult) -> bool:
        try:
            host = (urlparse(result.url).hostname or result.source or "").lower()
        except Exception:
            host = (result.source or "").lower()
        return any(host == d or host.endswith(f".{d}") for d in trusted_domains)

    # Strict filter: do not return unknown domains for medical context.
    trusted_results = [r for r in results if is_trusted(r)]

    # Keep order from providers; trim to requested size.
    return trusted_results[:num_results]


def format_web_results_for_llm(results: List[WebSearchResult]) -> str:
    """
    Format web search results as context for LLM.
    
    Returns a string that can be injected into the prompt.
    """
    if not results:
        return ""

    parts = ["[Web Search Results]"]
    for i, result in enumerate(results, 1):
        parts.append(f"{i}. **{result.title}** ({result.source})")
        parts.append(f"   {result.snippet}")
        parts.append(f"   URL: {result.url}")
        parts.append("")

    return "\n".join(parts)
