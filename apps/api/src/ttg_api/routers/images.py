"""
routers/images.py — Player image scraper.

Searches for a player and returns their profile picture directly.
"""

from __future__ import annotations

import re
from typing import Optional

import requests
from fastapi import APIRouter, Query, HTTPException, Response
from fastapi.responses import RedirectResponse
from ttg_api.services.transfermarkt import AsyncPlaywrightHelper, BASE_URL

router = APIRouter(prefix="/api/images", tags=["Player Images"])

@router.get("/player")
async def get_player_photo(
    name: str = Query(..., description="Full player name, e.g. 'Lionel Messi'")
):
    """
    Search for a player by name and return their profile picture directly.
    """
    search_url = f"{BASE_URL}/schnellsuche/ergebnis/schnellsuche?query={name.replace(' ', '+')}"
    soup = await AsyncPlaywrightHelper.get_soup(search_url)
    if not soup:
        raise HTTPException(status_code=503, detail="Transfermarkt search failed or blocked")

    img_url = None

    # 1. Check if we were redirected directly to a profile page
    header_container = soup.find("div", class_="data-header__profile-container")
    if header_container:
        img_tag = header_container.find("img")
        if img_tag and img_tag.get("src"):
            img_url = img_tag.get("src")

    # 2. Otherwise, look for the first player result in search table
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
                            portrait_img = (
                                profile_soup.find("div", class_="data-header__profile-container")
                                and profile_soup.find("div", class_="data-header__profile-container").find("img")
                            ) or profile_soup.find("img", class_="data-header__profile-image")
                            if portrait_img and portrait_img.get("src"):
                                img_url = portrait_img.get("src")

                # Fallback to search result thumbnail if profile fetch failed
                if not img_url:
                    small_img = first_row.find("img")
                    if small_img and small_img.get("src"):
                        img_url = small_img.get("src")

    if not img_url:
        raise HTTPException(status_code=404, detail=f"No player/photo found for '{name}'")

    # Proxy the image through our server to avoid CORS/Hotlinking issues
    try:
        # Transfermarkt CDN usually doesn't block simple requests if the URL is precise
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Referer": "https://www.transfermarkt.com/"
        }
        img_res = requests.get(img_url, headers=headers, timeout=10)
        img_res.raise_for_status()
        
        content_type = img_res.headers.get("Content-Type", "image/jpeg")
        return Response(content=img_res.content, media_type=content_type)
        
    except Exception as e:
        # If proxying fails, try one last time with a direct redirect (unlikely to work if we are here)
        return RedirectResponse(img_url)
