from fastapi import APIRouter, Query, HTTPException, Depends, Request
from typing import List, Dict, Any
import logging

try:
    from services.medicine_search_service import medicine_search_service
except ImportError:
    # Fallback to old service if new one not available
    try:
        from services.medicine_search_service_old import medicine_search_service
    except ImportError:
        from services.medicine_search_service_new import medicine_search_service

logger = logging.getLogger(__name__)
router = APIRouter()

from limiter import limiter
from middleware.auth import get_current_user


@router.get("/compare")
@limiter.limit("10/minute")
async def compare_prices(
    request: Request,  # required for slowapi
    drug_name: str = Query(..., min_length=2, max_length=100, description="Drug name to search for"),
    user: object = Depends(get_current_user),  # authenticated-only: this endpoint is expensive
) -> Dict[str, Any]:
    """
    Compare medicine prices across Indian pharmacies.

    Returns a list of products sorted by price (lowest first),
    with direct links to official product pages.

    Note: Uses browser automation and TLS spoofing to bypass bot protection.
    """
    try:
        # Validate drug name
        if not drug_name or len(drug_name.strip()) < 2:
            raise HTTPException(status_code=400, detail="Drug name must be at least 2 characters")

        results = await medicine_search_service.search_medicines(drug_name)

        # Handle empty results
        if not results or not results.get("results"):
            return {
                "query": drug_name,
                "total_results": 0,
                "best_deal": None,
                "best_by_source": {},
                "results": [],
                "duration_seconds": results.get("duration_seconds", 0),
                "providers": {
                    "active": [],
                    "blocked": ["Truemeds"],  # CloudFront WAF
                },
                "error": "No results found. Try a different drug name or check if the service is available."
            }

        # Transform results for price comparison display
        comparison_data = []
        for item in results.get("results", []):
            # Ensure all required fields are present
            comparison_data.append({
                "name": str(item.get("name", "Unknown")),
                "price": str(item.get("price", "N/A")),
                "mrp": str(item.get("mrp", "")) if item.get("mrp") else "",
                "discount": str(item.get("discount", "")) if item.get("discount") else "",
                "source": str(item.get("source", "Unknown")),
                "url": str(item.get("url", "")),
                "rating": float(item.get("rating")) if item.get("rating") else None,
                "rating_count": int(item.get("rating_count", 0)),
                "manufacturer": str(item.get("manufacturer", "")),
                "image": str(item.get("image", "")),
                "in_stock": bool(item.get("in_stock", True)),
                "quantity": str(item.get("quantity", "")),
            })

        # Calculate best by source
        best_by_source = {}
        for item in comparison_data:
            source = item["source"]
            if source not in best_by_source:
                best_by_source[source] = item
            else:
                # Compare prices to find the best deal per source
                current_price = _parse_price(item["price"])
                best_price = _parse_price(best_by_source[source]["price"])
                if current_price < best_price:
                    best_by_source[source] = item

        active_providers = results.get("active_providers", [])

        return {
            "query": drug_name,
            "total_results": len(comparison_data),
            "best_deal": min(comparison_data, key=lambda x: _parse_price(x["price"])) if comparison_data else None,
            "best_by_source": best_by_source,
            "results": comparison_data,
            "duration_seconds": results.get("duration_seconds", 0),
            "providers": {
                "active": active_providers,
                "blocked": ["Truemeds"],  # CloudFront WAF
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error comparing prices for %s: %s", drug_name, e, exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch price comparison. Please try again later.")


def _parse_price(price_str: str) -> float:
    """Helper function to parse price strings for comparison."""
    try:
        # Remove currency symbols and commas
        clean_str = price_str.replace('₹', '').replace(',', '').strip()
        return float(clean_str) if clean_str else float('inf')
    except (ValueError, AttributeError):
        return float('inf')


@router.get("/providers")
async def list_providers() -> Dict[str, Any]:
    """
    List all pharmacy providers and their status.
    """
    return {
        "active_providers": ["1mg", "Netmeds", "Apollo", "PharmEasy"],
        "disabled_providers": ["Truemeds", "Zeelab", "MedPlus", "JioMart", "BigBasket"],
        "total_active": 4,
        "note": "Some providers have bot protection or broken search functionality."
    }
