"""
routers/scraper.py — Live Transfermarkt scraper endpoint.

Uses Async Playwright to scrape Transfermarkt without getting blocked.
"""

from __future__ import annotations

import re
import asyncio
from typing import Optional

from fastapi import APIRouter, Query
from bs4 import BeautifulSoup

from ttg_api.services.transfermarkt import AsyncPlaywrightHelper, BASE_URL

router = APIRouter(prefix="/api/scraper", tags=["Transfermarkt Scraper"])

# ── Supported leagues ────────────────────────────────────────────────────────
LEAGUES: dict[str, dict] = {
    "romania2": {
        "name": "Romanian Liga 2",
        "url": "https://www.transfermarkt.com/liga-2/marktwerte/wettbewerb/RO2",
    },
    "england_u21": {
        "name": "Premier League 2 (U21)",
        "url": "https://www.transfermarkt.com/premier-league-2/marktwerte/wettbewerb/GB21/plus/?saison_id=2024",
    },
    "spain_u21": {
        "name": "Primera Federación (Spain - reserves heavy)",
        "url": "https://www.transfermarkt.com/primera-federacion/marktwerte/wettbewerb/ES3/plus/?saison_id=2024",
    },
    "germany_u23": {
        "name": "Regionalliga West (Germany - U23 teams)",
        "url": "https://www.transfermarkt.com/regionalliga-west/marktwerte/wettbewerb/RLW/plus/?saison_id=2024",
    },
    "italy_u23": {
        "name": "Serie C Group A (Juventus Next Gen, etc.)",
        "url": "https://www.transfermarkt.com/serie-c-a/marktwerte/wettbewerb/IT3A/plus/?saison_id=2024",
    },
    "netherlands_u21": {
        "name": "Eerste Divisie (Jong teams)",
        "url": "https://www.transfermarkt.com/eerste-divisie/marktwerte/wettbewerb/NL2/plus/?saison_id=2024",
    },
    "belgium_u21": {
        "name": "Challenger Pro League (Belgium reserves)",
        "url": "https://www.transfermarkt.com/challenger-pro-league/marktwerte/wettbewerb/BE2/plus/?saison_id=2024",
    },
    "france_u23": {
        "name": "Championnat National 2 (France reserves)",
        "url": "https://www.transfermarkt.com/championnat-national-2/marktwerte/wettbewerb/FR4/plus/?saison_id=2024",
    },
    "portugal_u23": {
        "name": "Liga Revelação U23",
        "url": "https://www.transfermarkt.com/liga-revelacao-u23/marktwerte/wettbewerb/PT23/plus/?saison_id=2024",
    },
    "austria_u23": {
        "name": "2. Liga (Austria reserves)",
        "url": "https://www.transfermarkt.com/2-liga/marktwerte/wettbewerb/A2/plus/?saison_id=2024",
    },
    "usa_u23": {
        "name": "MLS Next Pro",
        "url": "https://www.transfermarkt.com/mls-next-pro/marktwerte/wettbewerb/MLS2/plus/?saison_id=2024",
    },
}

def _mv_to_float(mv_str: str) -> Optional[float]:
    """Convert '€500k', '€1.50m' etc. to float euros."""
    if not mv_str or mv_str in ("-", "Unknown", "N/A", ""):
        return None
    s = mv_str.replace("\xa0", "").replace(" ", "")
    s = re.sub(r"[€£$]", "", s).strip()
    multiplier = 1.0
    if s.lower().endswith("m"):
        multiplier = 1_000_000
        s = s[:-1]
    elif "k" in s.lower() or "th." in s.lower():
        multiplier = 1_000
        s = re.sub(r"(?i)k|th\.", "", s)
    try:
        return round(float(s.replace(",", ".")) * multiplier)
    except ValueError:
        return None

async def _scrape_league_table_async(league_key: str, url: str) -> list[dict]:
    """
    Asynchronously scrape the player table using Playwright.
    """
    players: list[dict] = []
    soup = await AsyncPlaywrightHelper.get_soup(url)
    if not soup:
        return players

    table = soup.find("table", class_="items")
    if not table:
        return players

    tbody = table.find("tbody")
    if not tbody:
        return players

    league_name = LEAGUES.get(league_key, {}).get("name", league_key)

    for row in tbody.find_all("tr", class_=re.compile(r"^(odd|even)$")):
        cells = row.find_all("td", recursive=False)
        if len(cells) < 5:
            continue

        # Name
        name = "Unknown"
        name_cell = row.find("td", class_="hauptlink")
        if name_cell:
            a = name_cell.find("a")
            if a:
                name = a.get_text(strip=True)

        # Position
        position = "Unknown"
        inline = row.find("table", class_="inline-table")
        if inline:
            tds = inline.find_all("td")
            if len(tds) > 1:
                position = tds[1].get_text(strip=True)

        # Age
        age = "Unknown"
        for td in row.find_all("td", class_=re.compile(r"zentriert", re.I)):
            text = td.get_text(strip=True)
            if text.isdigit() and 14 <= int(text) <= 45:
                age = text
                break

        # Nationality
        nationality = "Unknown"
        # Flags on Transfermarkt usually have the class "flaggenrahmen"
        flag_img = row.find("img", class_=re.compile(r"flaggenrahmen", re.I))
        if flag_img:
            candidate = (flag_img.get("title") or flag_img.get("alt") or "").strip()
            if candidate:
                nationality = candidate
        else:
            # Fallback if flaggenrahmen isn't present
            for img in row.find_all("img"):
                classes = " ".join(img.get("class") or [])
                if "wappen" in classes.lower() or "bilderrahmen" in classes.lower():
                    continue
                candidate = (img.get("title") or img.get("alt") or "").strip()
                if candidate and len(candidate) < 50 and not any(
                    x in candidate.lower() for x in ["fc ", "sc ", "sv ", "bv ", " cf", " ac"]
                ) and candidate != name:
                    nationality = candidate
                    break

        # Club
        club = "Unknown"
        club_img = row.find("img", class_="tiny_wappen")
        if club_img:
            club = club_img.get("title") or club_img.get("alt") or "Unknown"
        else:
            club_a = row.find("a", href=lambda h: h and "/startseite/verein/" in h)
            if club_a:
                club = club_a.get("title") or club_a.get_text(strip=True)

        # Market value
        market_value = "Unknown"
        mv_td = row.find("td", class_=re.compile(r"rechts.*hauptlink|hauptlink.*rechts", re.I))
        if mv_td:
            a = mv_td.find("a")
            market_value = (a or mv_td).get_text(strip=True)

        if name == "Unknown":
            continue

        players.append({
            "name": name,
            "age": age,
            "nationality": nationality,
            "position": position,
            "market_value": market_value,
            "market_value_numeric": _mv_to_float(market_value),
            "club": club,
            "league_key": league_key,
            "league_name": league_name,
        })

    return players

def _matches_value_filter(player: dict, value_filter: str) -> bool:
    raw = value_filter.strip()
    numeric_filter = _mv_to_float(raw)
    pv = player.get("market_value_numeric")
    if numeric_filter is not None and pv is not None:
        return abs(pv - numeric_filter) / max(numeric_filter, 1) <= 0.10
    return raw.lower() in str(player.get("market_value", "")).lower()

# ── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/leagues")
def list_leagues() -> list[dict]:
    return [{"key": k, "name": v["name"], "url": v["url"]} for k, v in LEAGUES.items()]

@router.get("/players")
async def search_players(
    age: Optional[str] = Query(None, description="Exact player age, e.g. 20"),
    nationality: Optional[str] = Query(None, description="Partial nationality, e.g. Romania"),
    position: Optional[str] = Query(None, description="Partial position, e.g. Forward"),
    value: Optional[str] = Query(None, description="Market-value filter, e.g. €500k"),
    league: Optional[str] = Query(None, description="League key (e.g. romania2)"),
):
    if league:
        key = league.strip().lower()
        targets = {k: v for k, v in LEAGUES.items() if k == key}
        if not targets:
            targets = {k: v for k, v in LEAGUES.items() if key in k or key in v["name"].lower()}
        if not targets:
            targets = LEAGUES
    else:
        targets = LEAGUES

    # Fire all league scraping tasks concurrently via asyncio
    tasks = [
        _scrape_league_table_async(k, v["url"]) for k, v in targets.items()
    ]
    results_list = await asyncio.gather(*tasks, return_exceptions=True)

    all_players = []
    for res in results_list:
        if isinstance(res, list):
            all_players.extend(res)

    results = []
    for p in all_players:
        if age is not None and str(p.get("age", "")) != str(age).strip():
            continue
        if nationality and nationality.lower() not in p.get("nationality", "").lower():
            continue
        if position and position.lower() not in p.get("position", "").lower():
            continue
        if value and not _matches_value_filter(p, value):
            continue
        results.append(p)

    seen = set()
    unique = []
    for p in results:
        key_tuple = (p.get("name"), p.get("club"), p.get("league_key"))
        if key_tuple not in seen:
            seen.add(key_tuple)
            unique.append(p)

    return {
        "total": len(unique),
        "filters_applied": {
            "age": age,
            "nationality": nationality,
            "position": position,
            "value": value,
            "league": league,
        },
        "players": unique,
    }
