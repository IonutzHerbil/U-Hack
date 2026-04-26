"""
services/transfermarkt.py — Async Playwright Scraper for Transfermarkt.
Bypasses the "Consent Wall" by pretending to accept cookies 
and operating as a real chromium browser engine via Playwright.
"""

import logging
from bs4 import BeautifulSoup
from bs4 import FeatureNotFound
from playwright.async_api import async_playwright, Browser, BrowserContext

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

BASE_URL = "https://www.transfermarkt.com"

# The GDPR cookies needed to bypass Transfermarkt's popup
CONSENT_COOKIES = [
    {
        "name": "FCCDCF",
        "value": "%5Bnull%2Cnull%2Cnull%2C%5B%22BY09%22%2C%221~%22%5D%5D",
        "domain": ".transfermarkt.com",
        "path": "/"
    },
    {
        "name": "FCNEC",
        "value": "%5B%5B%22AKsRol8jHJyuFORh4KXaUHsMvDSVsW6G3cDfHLOL2u8t0KaMXHVTbOsQJx5QG_9uW7K1EiVqJJtQGkZRyRFsmOqxPq1d3gBr6_yoP5sIQlzKEjryTSmPFdmJRrpMPSasPHHG5AGYIKyTBJ7iJO6UWDAF-x8rJscMYcOvIPfWiONAKEWLM-N8JzqhiPi0FwHeSs6d0gRTJJB5kIZD1PnA%3D%3D%22%5D%5D",
        "domain": ".transfermarkt.com",
        "path": "/"
    },
    {
        "name": "euconsent-v2",
        "value": "CQJ9aMAQJ9aMABcABBENBeFgAAAAAAAAAAAAAAAAAAAA.YAAAAAAAAAAA",
        "domain": ".transfermarkt.com",
        "path": "/"
    },
    {
        "name": "tmcid",
        "value": "1",
        "domain": ".transfermarkt.com",
        "path": "/"
    },
    {
        "name": "tmtp",
        "value": "Y29uc2VudA%3D%3D",
        "domain": ".transfermarkt.com",
        "path": "/"
    }
]

class AsyncPlaywrightHelper:
    """Manages a singleton Playwright browser context to execute scrapes efficiently."""
    _playwright = None
    _browser: Browser = None
    _context: BrowserContext = None

    @classmethod
    async def init_browser(cls):
        """Initializes the browser and assigns the GDPR cookies."""
        if not cls._browser:
            logger.info("Initializing Playwright Chromium Browser...")
            cls._playwright = await async_playwright().start()
            cls._browser = await cls._playwright.chromium.launch(headless=True)
            cls._context = await cls._browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            )
            # Add GDPR cookies to automatically skip the consent pop-up
            await cls._context.add_cookies(CONSENT_COOKIES)

    @classmethod
    async def close_browser(cls):
        """Clean shutdown of the playwright engine."""
        if cls._context:
            await cls._context.close()
        if cls._browser:
            await cls._browser.close()
        if cls._playwright:
            await cls._playwright.stop()
        cls._browser, cls._playwright, cls._context = None, None, None

    @classmethod
    async def get_soup(cls, url: str) -> BeautifulSoup | None:
        """Loads a Transfermarkt page asynchronously with JS execution and returns a parsed BeautifulSoup."""
        await cls.init_browser()
        
        # We start a new tab per request
        page = await cls._context.new_page()
        try:
            # We intercept resources like tracking scripts, images, and fonts to speed up the page load if desired.
            # But sometimes leaving images is safer to not trigger bot detection. We let it load normally.
            
            logger.info(f"Playwright navigating to: {url}")
            await page.goto(url, wait_until="domcontentloaded", timeout=45000)
            
            # Wait for the players table to show up in the DOM so we know the page didn't hang
            try:
                await page.wait_for_selector("table.items", timeout=10000)
            except Exception:
                logger.warning(f"[Timeout] Could not find 'table.items' on {url} in 10s. Continuing anyway to capture DOM.")
                
            content = await page.content()
            try:
                return BeautifulSoup(content, "lxml")
            except FeatureNotFound:
                # Fallback for environments where lxml isn't installed.
                return BeautifulSoup(content, "html.parser")
        except Exception as e:
            logger.error(f"Failed to scrape {url} with Playwright: {e}")
            return None
        finally:
            await page.close()
