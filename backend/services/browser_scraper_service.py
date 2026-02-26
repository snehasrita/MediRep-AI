"""
Browser-based scraping service using Playwright.
Handles bot-protected sites that block TLS fingerprinting.
"""
import asyncio
import logging
import json
import re
from typing import Dict, List, Optional, Any
from urllib.parse import quote

logger = logging.getLogger(__name__)

# Check Playwright availability
try:
    from playwright.async_api import async_playwright, Browser, Page
    PLAYWRIGHT_AVAILABLE = True
except ImportError:
    PLAYWRIGHT_AVAILABLE = False
    logger.warning("Playwright not installed. Browser scraping unavailable.")
    Browser = Any
    Page = Any

# Fallback to requests if Playwright not available
try:
    import requests
    REQUESTS_AVAILABLE = True
except ImportError:
    REQUESTS_AVAILABLE = False
    logger.warning("Requests not installed. Fallback scraping unavailable.")


class BrowserScraperService:
    """
    Playwright-based scraper for bot-protected pharmacy sites.
    Uses real browser automation to bypass WAF/bot detection.
    """

    def __init__(self):
        self._browser: Optional[Browser] = None
        self._playwright = None
        self._lock = asyncio.Lock()

    async def _get_browser(self) -> Browser:
        """Get or create browser instance."""
        async with self._lock:
            if self._browser is None or not self._browser.is_connected():
                self._playwright = await async_playwright().start()
                self._browser = await self._playwright.chromium.launch(
                    headless=True,
                    args=[
                        '--disable-blink-features=AutomationControlled',
                        '--disable-dev-shm-usage',
                        '--no-sandbox',
                    ]
                )
            return self._browser

    async def _create_context(self):
        """Create a new browser context with realistic settings."""
        browser = await self._get_browser()
        context = await browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            locale='en-IN',
            timezone_id='Asia/Kolkata',
            geolocation={'latitude': 28.6139, 'longitude': 77.2090},  # Delhi
            permissions=['geolocation'],
        )

        # Add stealth scripts
        await context.add_init_script("""
            // Remove webdriver flag
            Object.defineProperty(navigator, 'webdriver', {get: () => undefined});

            // Mock plugins
            Object.defineProperty(navigator, 'plugins', {
                get: () => [1, 2, 3, 4, 5]
            });

            // Mock languages
            Object.defineProperty(navigator, 'languages', {
                get: () => ['en-US', 'en', 'hi']
            });
        """)

        return context

    async def scrape_1mg(self, drug_name: str) -> List[Dict]:
        """Scrape 1mg using browser automation."""
        if not PLAYWRIGHT_AVAILABLE:
            logger.warning("Playwright not available, using fallback")
            return await self._fallback_scrape_1mg(drug_name)

        results = []
        context = None

        try:
            context = await self._create_context()
            page = await context.new_page()

            # Set location cookie
            await context.add_cookies([
                {'name': 'city', 'value': 'new delhi', 'domain': '.1mg.com', 'path': '/'},
                {'name': 'pincode', 'value': '110001', 'domain': '.1mg.com', 'path': '/'},
            ])

            # Navigate to search page
            url = f'https://www.1mg.com/search/all?name={quote(drug_name)}'
            logger.info(f"[1mg] Navigating to {url}")

            await page.goto(url, wait_until='networkidle', timeout=30000)

            # Wait for products - use the correct selector
            await page.wait_for_selector('a[href*="/drugs/"], a[href*="/otc/"]', timeout=15000)

            # Wait a bit more for dynamic content
            await asyncio.sleep(1)

            # Extract product data from links
            products = await page.evaluate('''() => {
                const items = [];
                const links = document.querySelectorAll('a[href*="/drugs/"], a[href*="/otc/"]');

                links.forEach(link => {
                    try {
                        const href = link.href;
                        const text = link.textContent || '';

                        // Skip if no price info or too short
                        if (!text.includes('₹') || text.length < 20) return;

                        // Split by newlines and filter
                        const lines = text.split(/\\n/).map(l => l.trim()).filter(l => l);

                        // First meaningful line is usually the name
                        let name = '';
                        for (const line of lines) {
                            // Skip badges/labels
                            if (/^(Bestseller|Ad|Generic alternative|\\d+%\\s*CHEAPER)/i.test(line)) continue;
                            // Found the name
                            name = line;
                            break;
                        }

                        // Clean name further
                        name = name.replace(/^(Bestseller|Ad)/i, '').trim();

                        // Extract prices (first is discounted, second is MRP)
                        const prices = text.match(/₹([\\d.]+)/g) || [];
                        const discountedPrice = prices[0] || '';
                        const originalPrice = prices[1] || discountedPrice;

                        // Extract discount percentage
                        const discountMatch = text.match(/(\\d+)%/);
                        const discount = discountMatch ? discountMatch[1] + '%' : '';

                        if (name && discountedPrice && name.length > 3) {
                            items.push({
                                name: name.substring(0, 80),
                                price: discountedPrice,
                                mrp: originalPrice,
                                discount: discount,
                                url: href,
                            });
                        }
                    } catch (e) {}
                });

                // Remove duplicates by URL
                const seen = new Set();
                return items.filter(item => {
                    if (seen.has(item.url)) return false;
                    seen.add(item.url);
                    return true;
                });
            }''')

            for p in products[:15]:
                results.append({
                    'name': p.get('name', ''),
                    'price': p.get('price', ''),
                    'mrp': p.get('mrp', ''),
                    'discount': p.get('discount', ''),
                    'source': '1mg',
                    'url': p.get('url', url),
                    'rating': None,
                })

            logger.info(f"[1mg] Found {len(results)} products")

        except Exception as e:
            logger.error(f"[1mg] Browser scrape failed: {e}")
        finally:
            if context:
                await context.close()

        return results

    async def scrape_netmeds(self, drug_name: str) -> List[Dict]:
        """Scrape Netmeds using browser automation."""
        if not PLAYWRIGHT_AVAILABLE:
            logger.warning("Playwright not available, using fallback")
            return await self._fallback_scrape_netmeds(drug_name)

        results = []
        context = None

        try:
            context = await self._create_context()
            page = await context.new_page()

            # Set pincode cookie
            await context.add_cookies([
                {'name': 'nms_mzl', 'value': '110001', 'domain': '.netmeds.com', 'path': '/'},
            ])

            # Correct URL format
            url = f'https://www.netmeds.com/products?q={quote(drug_name)}'
            logger.info(f"[Netmeds] Navigating to {url}")

            await page.goto(url, wait_until='networkidle', timeout=30000)
            await asyncio.sleep(2)

            # Extract products using the correct structure
            products = await page.evaluate('''() => {
                const items = [];
                const cards = document.querySelectorAll('.product-card-container-child-one');

                cards.forEach(card => {
                    try {
                        const text = card.innerText || '';
                        const link = card.querySelector('a');

                        // Parse the text content
                        const lines = text.split('\\n').filter(l => l.trim());
                        if (lines.length >= 3) {
                            const name = lines[0].trim();
                            const details = lines[1].trim();
                            const manufacturer = lines[2].replace('By ', '').trim();

                            // Find price
                            const priceMatch = text.match(/₹([\\d.]+)/);
                            const price = priceMatch ? '₹' + priceMatch[1] : '';

                            // Check stock status
                            const outOfStock = text.toLowerCase().includes('out of stock');

                            if (name && price) {
                                items.push({
                                    name: name,
                                    details: details,
                                    manufacturer: manufacturer,
                                    price: price,
                                    in_stock: !outOfStock,
                                    url: link ? link.href : ''
                                });
                            }
                        }
                    } catch (e) {}
                });

                // Remove duplicates
                const seen = new Set();
                return items.filter(item => {
                    if (seen.has(item.name)) return false;
                    seen.add(item.name);
                    return true;
                });
            }''')

            for p in products[:15]:
                if p.get('name'):
                    results.append({
                        'name': p['name'],
                        'price': p.get('price', 'N/A'),
                        'manufacturer': p.get('manufacturer', ''),
                        'in_stock': p.get('in_stock', True),
                        'source': 'Netmeds',
                        'url': p.get('url', url),
                        'rating': None,
                    })

            logger.info(f"[Netmeds] Found {len(results)} products")

        except Exception as e:
            logger.error(f"[Netmeds] Browser scrape failed: {e}")
        finally:
            if context:
                await context.close()

        return results

    async def scrape_apollo(self, drug_name: str) -> List[Dict]:
        """Scrape Apollo Pharmacy using browser automation."""
        if not PLAYWRIGHT_AVAILABLE:
            logger.warning("Playwright not available, using fallback")
            return await self._fallback_scrape_apollo(drug_name)

        results = []
        context = None

        try:
            context = await self._create_context()
            page = await context.new_page()

            # Set pincode
            await context.add_cookies([
                {'name': 'pincode', 'value': '110001', 'domain': '.apollopharmacy.in', 'path': '/'},
            ])

            url = f'https://www.apollopharmacy.in/search-medicines/{quote(drug_name)}'
            logger.info(f"[Apollo] Navigating to {url}")

            await page.goto(url, wait_until='networkidle', timeout=30000)
            await asyncio.sleep(2)

            # Extract products from links - Apollo uses /medicine/ URLs
            products = await page.evaluate('''() => {
                const items = [];
                const links = document.querySelectorAll('a');

                links.forEach(a => {
                    const href = a.href || '';
                    const text = a.innerText || '';

                    // Apollo uses /medicine/ or /otc/ URLs for products
                    if ((href.includes('apollopharmacy.in/medicine/') || href.includes('apollopharmacy.in/otc/'))
                        && text.length > 10 && text.length < 300) {
                        // Parse text content
                        const lines = text.split('\\n').filter(l => l.trim());

                        // Find the product name (skip prefixes)
                        let name = '';
                        for (const line of lines) {
                            const trimmed = line.trim();
                            // Skip common prefixes
                            if (/^(Rx|Generic Alternate|Apollo Trusted|Add to cart|\\d+% off)/i.test(trimmed)) continue;
                            if (trimmed.length > 5 && trimmed.length < 100) {
                                name = trimmed;
                                break;
                            }
                        }

                        // Find price in text (₹ followed by number)
                        const priceMatch = text.match(/₹\\s*(\\d+(?:\\.\\d+)?)/);
                        const price = priceMatch ? '₹' + priceMatch[1] : '';

                        // Get quantity/details
                        const quantityMatch = text.match(/(\\d+\\s*(?:Tablet|ml|gm|mg|Capsule|Strip|Syrup|Drops)s?)/i);
                        const quantity = quantityMatch ? quantityMatch[1] : '';

                        if (name && name.length > 3) {
                            items.push({
                                name: name,
                                quantity: quantity,
                                price: price,
                                url: href.split('?')[0]  // Remove tracking params
                            });
                        }
                    }
                });

                // Dedupe by URL
                const seen = new Set();
                return items.filter(i => {
                    if (seen.has(i.url)) return false;
                    seen.add(i.url);
                    return true;
                });
            }''')

            for p in products[:15]:
                if p.get('name'):
                    results.append({
                        'name': p['name'],
                        'price': p.get('price', 'N/A'),
                        'quantity': p.get('quantity', ''),
                        'source': 'Apollo',
                        'url': p.get('url', url),
                        'rating': None,
                    })

            logger.info(f"[Apollo] Found {len(results)} products")

        except Exception as e:
            logger.error(f"[Apollo] Browser scrape failed: {e}")
        finally:
            if context:
                await context.close()

        return results

    async def scrape_truemeds(self, drug_name: str) -> List[Dict]:
        """
        Scrape Truemeds using browser automation.
        NOTE: Currently disabled - Truemeds has aggressive CloudFront WAF that blocks all automated access.
        """
        # Truemeds blocks with CloudFront 403 - disabled for now
        logger.info("[Truemeds] Skipped - CloudFront WAF blocking")
        return []

    async def scrape_zeelab(self, drug_name: str) -> List[Dict]:
        """
        Scrape Zeelab Pharmacy.
        NOTE: Disabled - Zeelab's search returns random/featured products instead of actual search results.
        """
        logger.info("[Zeelab] Skipped - Search returns irrelevant results")
        return []

    async def scrape_all(self, drug_name: str) -> Dict[str, List[Dict]]:
        """Scrape all providers in parallel."""
        tasks = [
            self.scrape_1mg(drug_name),
            self.scrape_netmeds(drug_name),
            self.scrape_apollo(drug_name),
            self.scrape_zeelab(drug_name),
            self.scrape_truemeds(drug_name),
        ]

        results = await asyncio.gather(*tasks, return_exceptions=True)

        return {
            '1mg': results[0] if not isinstance(results[0], Exception) else [],
            'Netmeds': results[1] if not isinstance(results[1], Exception) else [],
            'Apollo': results[2] if not isinstance(results[2], Exception) else [],
            'Zeelab': results[3] if not isinstance(results[3], Exception) else [],
            'Truemeds': results[4] if not isinstance(results[4], Exception) else [],
        }

    async def _fallback_scrape_1mg(self, drug_name: str) -> List[Dict]:
        """Fallback scrape using requests."""
        if not REQUESTS_AVAILABLE:
            return []
        
        try:
            url = f'https://www.1mg.com/search/all?name={quote(drug_name)}'
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
            }
            
            response = requests.get(url, headers=headers, timeout=10)
            if response.status_code == 200:
                # Simple parsing - this will be limited but better than nothing
                return [{
                    'name': drug_name,
                    'price': 'N/A (Fallback)',
                    'source': '1mg',
                    'url': url,
                    'rating': None,
                }]
        except Exception as e:
            logger.error(f"Fallback scrape failed for 1mg: {e}")
        
        return []

    async def _fallback_scrape_netmeds(self, drug_name: str) -> List[Dict]:
        """Fallback scrape using requests."""
        if not REQUESTS_AVAILABLE:
            return []
        
        try:
            url = f'https://www.netmeds.com/catalogsearch/result?q={quote(drug_name)}'
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
            }
            
            response = requests.get(url, headers=headers, timeout=10)
            if response.status_code == 200:
                return [{
                    'name': drug_name,
                    'price': 'N/A (Fallback)',
                    'source': 'Netmeds',
                    'url': url,
                    'rating': None,
                }]
        except Exception as e:
            logger.error(f"Fallback scrape failed for Netmeds: {e}")
        
        return []

    async def _fallback_scrape_apollo(self, drug_name: str) -> List[Dict]:
        """Fallback scrape using requests."""
        if not REQUESTS_AVAILABLE:
            return []
        
        try:
            url = f'https://www.apollopharmacy.in/search-medicines/{quote(drug_name)}'
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
            }
            
            response = requests.get(url, headers=headers, timeout=10)
            if response.status_code == 200:
                return [{
                    'name': drug_name,
                    'price': 'N/A (Fallback)',
                    'source': 'Apollo',
                    'url': url,
                    'rating': None,
                }]
        except Exception as e:
            logger.error(f"Fallback scrape failed for Apollo: {e}")
        
        return []

    async def close(self):
        """Close browser instance."""
        if self._browser:
            await self._browser.close()
        if self._playwright:
            await self._playwright.stop()


# Singleton
browser_scraper = BrowserScraperService()
