"""
routers/images.py — Player image scraper with server-side cache.

Each unique player name is scraped at most once per server session;
subsequent requests are served instantly from the in-memory cache.
"""

from __future__ import annotations

import asyncio
import re
from typing import Optional

import requests
from fastapi import APIRouter, Query, HTTPException, Response
from fastapi.responses import RedirectResponse
from ttg_api.services.transfermarkt import AsyncPlaywrightHelper, BASE_URL

router = APIRouter(prefix="/api/images", tags=["Player Images"])

# ── Server-side cache: name (lowercased) → raw image bytes + content-type ──
_photo_cache: dict[str, tuple[bytes, str]] = {}
# In-flight lock per name so concurrent requests for the same player don't
# all fire Playwright scrapes simultaneously.
_in_flight: dict[str, asyncio.Event] = {}


async def _fetch_photo(name: str) -> Optional[tuple[bytes, str]]:
    """Scrape Transfermarkt and return (image_bytes, content_type), or None."""
    search_url = f"{BASE_URL}/schnellsuche/ergebnis/schnellsuche?query={name.replace(' ', '+')}"
    soup = await AsyncPlaywrightHelper.get_soup(search_url)
    if not soup:
        return None

    img_url: Optional[str] = None

    # Direct profile redirect
    header_container = soup.find("div", class_="data-header__profile-container")
    if header_container:
        img_tag = header_container.find("img")
        if img_tag and img_tag.get("src"):
            img_url = img_tag.get("src")

    # Search result table
    if not img_url:
        player_table = soup.find("table", class_="items")
        if player_table:
            first_row = player_table.find("tr", class_=re.compile(r"^(odd|even)$"))
            if first_row:
                link_cell = first_row.find("td", class_="hauptlink")
                if link_cell:
                    a_tag = link_cell.find("a")
                    if a_tag:
                        profile_url = f"{BASE_URL}{a_tag.get('href')}"
                        profile_soup = await AsyncPlaywrightHelper.get_soup(profile_url)
                        if profile_soup:
                            container = profile_soup.find("div", class_="data-header__profile-container")
                            portrait = (container.find("img") if container else None) or \
                                       profile_soup.find("img", class_="data-header__profile-image")
                            if portrait and portrait.get("src"):
                                img_url = portrait.get("src")
                if not img_url:
                    small = first_row.find("img")
                    if small and small.get("src"):
                        img_url = small.get("src")

    if not img_url:
        return None

    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Referer": "https://www.transfermarkt.com/",
        }
        img_res = requests.get(img_url, headers=headers, timeout=10)
        img_res.raise_for_status()
        return img_res.content, img_res.headers.get("Content-Type", "image/jpeg")
    except Exception:
        return None


@router.get("/player")
async def get_player_photo(
    name: str = Query(..., description="Full player name, e.g. 'Lionel Messi'")
):
    """
    Return a player's profile photo, served from cache after the first fetch.
    """
    key = name.strip().lower()

    # Cache hit — instant return
    if key in _photo_cache:
        data, ct = _photo_cache[key]
        return Response(content=data, media_type=ct,
                        headers={"X-Photo-Cache": "HIT"})

    # If another request for this name is already in-flight, wait for it
    if key in _in_flight:
        await _in_flight[key].wait()
        if key in _photo_cache:
            data, ct = _photo_cache[key]
            return Response(content=data, media_type=ct,
                            headers={"X-Photo-Cache": "HIT"})
        raise HTTPException(status_code=404, detail=f"No photo found for '{name}'")

    # First request for this name — scrape and populate cache
    event = asyncio.Event()
    _in_flight[key] = event
    try:
        result = await _fetch_photo(name.strip())
        if result:
            _photo_cache[key] = result
            data, ct = result
            return Response(content=data, media_type=ct,
                            headers={"X-Photo-Cache": "MISS"})
        raise HTTPException(status_code=404, detail=f"No photo found for '{name}'")
    finally:
        event.set()
        _in_flight.pop(key, None)
