"""
Medicine Search Service - Working Version
Uses browser automation for 1mg, Netmeds, Apollo + PharmEasy API.
"""
import asyncio
import logging
import re
import json
from typing import List, Dict, Optional, Any
from datetime import datetime
from urllib.parse import quote

logger = logging.getLogger(__name__)

# Import browser scraper (the actual working service)
try:
    from services.browser_scraper_service import browser_scraper
except ImportError:
    browser_scraper = None
    logger.warning("Browser scraper service not available")

# Import TLS service for PharmEasy API
try:
    from services.tls_service import tls_service
except ImportError:
    tls_service = None
    logger.warning("TLS service not available")

# Redis (optional caching)
try:
    import redis
    redis_client = redis.Redis(host='localhost', port=6379, db=0)
    redis_client.ping()
except Exception:
    redis_client = None


class MedicineSearchService:
    """
    Medicine search service that actually works.
    Uses browser automation for bot-protected sites + PharmEasy API.
    """

    PHARMEASY_API = "https://pharmeasy.in/api/search/search/?q={query}&limit=15"

    def _parse_query(self, query: str) -> List[str]:
        """Simple split by 'and', ',' to support multi-drug search."""
        q = query.lower().replace("search for", "").replace("price of", "").replace("find", "")
        tokens = re.split(r'\s+and\s+|\s*,\s*', q)
        return [t.strip() for t in tokens if t.strip()]

    async def search_medicines(self, user_query: str) -> Dict[str, Any]:
        """
        Main entry point - searches all providers.
        """
        start_time = datetime.now()
        drugs = self._parse_query(user_query)
        logger.info(f"Searching for drugs: {drugs}")

        all_results = []
        errors = []

        # For each drug, scrape all providers
        for drug in drugs:
            drug_results = await self._search_single_drug(drug)
            all_results.extend(drug_results)

        # Sort by price (cheapest first)
        all_results.sort(key=lambda x: self._parse_price(x.get('price', '')))

        # Determine best price
        best_price = all_results[0] if all_results else None

        # Determine active providers
        active_providers = list(set([r['source'] for r in all_results]))

        return {
            "query": user_query,
            "timestamp": start_time.isoformat(),
            "results": all_results,
            "best_price": best_price,
            "active_providers": active_providers,
            "best_by_source": self._calculate_best_by_source(all_results),
            "errors": errors,
            "duration_seconds": (datetime.now() - start_time).total_seconds()
        }

    def _calculate_best_by_source(self, results: List[Dict]) -> Dict[str, Dict]:
        """Calculate best price for each source."""
        best_by_source = {}
        for result in results:
            source = result['source']
            if source not in best_by_source:
                best_by_source[source] = result
            else:
                current_price = self._parse_price(result.get('price', ''))
                best_price = self._parse_price(best_by_source[source].get('price', ''))
                if current_price < best_price:
                    best_by_source[source] = result
        return best_by_source

    async def _search_single_drug(self, drug_name: str) -> List[Dict]:
        """
        Search all providers for a single drug.
        """
        final_results = []

        # Run all scrapers in parallel
        tasks = []

        # 1. PharmEasy API (fast, reliable)
        tasks.append(self._search_pharmeasy(drug_name))

        # 2. Browser automation for 1mg, Netmeds, Apollo
        if browser_scraper:
            tasks.append(self._search_browser_providers(drug_name))

        # Gather all results
        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Combine results
        for result in results:
            if isinstance(result, list):
                final_results.extend(result)
            elif isinstance(result, Exception):
                logger.error(f"Provider search failed: {result}")

        logger.info(f"Total results for '{drug_name}': {len(final_results)}")
        return final_results

    async def _search_browser_providers(self, drug_name: str) -> List[Dict]:
        """Use browser automation to scrape 1mg, Netmeds, Apollo."""
        results = []

        try:
            logger.info(f"[Browser] Scraping providers for '{drug_name}'...")
            scraped_data = await browser_scraper.scrape_all(drug_name)

            # Process results from each provider
            for provider, items in scraped_data.items():
                for item in items:
                    results.append({
                        'name': str(item.get('name', drug_name)),
                        'price': str(item.get('price', 'N/A')),
                        'mrp': str(item.get('mrp', '')),
                        'discount': str(item.get('discount', '')),
                        'source': str(provider),
                        'url': str(item.get('url', '')),
                        'rating': float(item.get('rating')) if item.get('rating') else None,
                        'rating_count': 0,
                        'manufacturer': str(item.get('manufacturer', '')),
                        'image': str(item.get('image', '')),
                        'in_stock': item.get('in_stock', True),
                        'quantity': str(item.get('quantity', ''))
                    })

            logger.info(f"[Browser] Got {len(results)} products from browser scraping")

        except Exception as e:
            logger.error(f"[Browser] Scraping failed: {e}")

        return results

    async def _search_pharmeasy(self, drug_name: str) -> List[Dict]:
        """Search PharmEasy via their API."""
        results = []

        try:
            url = self.PHARMEASY_API.format(query=quote(drug_name))
            logger.info(f"[PharmEasy] Fetching API: {url}")

            # Use TLS service if available, otherwise direct request
            if tls_service:
                response_text = await tls_service.fetch(url, headers={
                    "Accept": "application/json",
                    "Referer": "https://pharmeasy.in/",
                    "Origin": "https://pharmeasy.in",
                })
            else:
                # Fallback to direct request
                import aiohttp
                async with aiohttp.ClientSession() as session:
                    headers = {
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                        "Accept": "application/json",
                        "Referer": "https://pharmeasy.in/",
                    }
                    async with session.get(url, headers=headers, timeout=15) as resp:
                        if resp.status == 200:
                            response_text = await resp.text()
                        else:
                            response_text = None

            if response_text:
                data = json.loads(response_text)
                products = data.get('data', {}).get('products', [])

                for product in products[:15]:
                    name = product.get('name', '')
                    # Ensure price/mrp are floats
                    try:
                        price = float(product.get('salePriceDecimal', 0) or product.get('mrpDecimal', 0) or 0)
                        mrp = float(product.get('mrpDecimal', 0) or 0)
                    except (ValueError, TypeError):
                        price = 0
                        mrp = 0

                    # Calculate discount
                    discount = ''
                    if mrp > 0 and price > 0 and mrp > price:
                        discount_pct = round((1 - price / mrp) * 100)
                        discount = f"{discount_pct}%"

                    # PharmEasy blocks external referrers with JS overlay
                    # Link to homepage - user can search from there
                    # The price data is still valuable for comparison
                    pharmeasy_url = "https://pharmeasy.in/"

                    results.append({
                        'name': name,
                        'price': f"₹{price}" if price else 'N/A',
                        'mrp': f"₹{mrp}" if mrp else '',
                        'discount': discount,
                        'source': 'PharmEasy',
                        'url': pharmeasy_url,
                        'rating': None,
                        'rating_count': 0,
                        'manufacturer': product.get('manufacturer', ''),
                        'image': product.get('productImageUrl', ''),
                        'in_stock': product.get('isInStock', True),
                        'quantity': product.get('packSize', '')
                    })

                logger.info(f"[PharmEasy] Found {len(results)} products")
            else:
                logger.warning("[PharmEasy] No response from API")

        except Exception as e:
            logger.error(f"[PharmEasy] API failed: {e}")

        return results

    def _parse_price(self, price_str: str) -> float:
        """Parse price string for comparison."""
        try:
            clean_str = str(price_str).replace('₹', '').replace(',', '').strip()
            return float(clean_str) if clean_str and clean_str != 'N/A' else float('inf')
        except:
            return float('inf')


# Singleton
medicine_search_service = MedicineSearchService()
