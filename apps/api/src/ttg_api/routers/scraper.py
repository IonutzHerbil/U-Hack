"""
routers/scraper.py — Live Transfermarkt scraper endpoint.

Uses Async Playwright to scrape Transfermarkt without getting blocked.

Endpoints:
  GET /api/scraper/leagues              — list supported league keys
  GET /api/scraper/players              — search players in league tables
  GET /api/scraper/player/{tm_id}       — full scouting profile for one player
"""

from __future__ import annotations

import re
import asyncio
from typing import Optional

from fastapi import APIRouter, Query, HTTPException
from bs4 import BeautifulSoup, Tag

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
        "name": "Primera Federación (Spain)",
        "url": "https://www.transfermarkt.com/primera-federacion/marktwerte/wettbewerb/ES3/plus/?saison_id=2024",
    },
    "germany_u23": {
        "name": "Regionalliga West (Germany)",
        "url": "https://www.transfermarkt.com/regionalliga-west/marktwerte/wettbewerb/RLW/plus/?saison_id=2024",
    },
    "italy_u23": {
        "name": "Serie C Group A (Italy)",
        "url": "https://www.transfermarkt.com/serie-c-a/marktwerte/wettbewerb/IT3A/plus/?saison_id=2024",
    },
    "netherlands_u21": {
        "name": "Eerste Divisie (Jong teams)",
        "url": "https://www.transfermarkt.com/eerste-divisie/marktwerte/wettbewerb/NL2/plus/?saison_id=2024",
    },
    "belgium_u21": {
        "name": "Challenger Pro League (Belgium)",
        "url": "https://www.transfermarkt.com/challenger-pro-league/marktwerte/wettbewerb/BE2/plus/?saison_id=2024",
    },
    "france_u23": {
        "name": "Championnat National 2 (France)",
        "url": "https://www.transfermarkt.com/championnat-national-2/marktwerte/wettbewerb/FR4/plus/?saison_id=2024",
    },
    "portugal_u23": {
        "name": "Liga Revelação U23",
        "url": "https://www.transfermarkt.com/liga-revelacao-u23/marktwerte/wettbewerb/PT23/plus/?saison_id=2024",
    },
    "austria_u23": {
        "name": "2. Liga Austria",
        "url": "https://www.transfermarkt.com/2-liga/marktwerte/wettbewerb/A2/plus/?saison_id=2024",
    },
    "usa_u23": {
        "name": "MLS Next Pro",
        "url": "https://www.transfermarkt.com/mls-next-pro/marktwerte/wettbewerb/MLS2/plus/?saison_id=2024",
    },
}

# ── Helpers ──────────────────────────────────────────────────────────────────

def _mv_to_float(mv_str: str) -> Optional[float]:
    """Convert '€500k', '€1.50m' etc. to a float number of euros."""
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


def _extract_tm_id(href: str) -> Optional[str]:
    """Pull the numeric Transfermarkt player ID from a profile URL."""
    m = re.search(r"/spieler/(\d+)", href or "")
    return m.group(1) if m else None


def _text(tag: Optional[Tag]) -> str:
    return tag.get_text(strip=True) if tag else ""


# ── League table scraping ────────────────────────────────────────────────────

async def _scrape_league_table_async(league_key: str, url: str) -> list[dict]:
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

        # Name + TM profile link
        name = "Unknown"
        tm_url = None
        tm_id = None
        name_cell = row.find("td", class_="hauptlink")
        if name_cell:
            a = name_cell.find("a", href=True)
            if a:
                name = a.get_text(strip=True)
                href = a["href"]
                tm_id = _extract_tm_id(href)
                if tm_id:
                    tm_url = f"{BASE_URL}{href}" if href.startswith("/") else href

        # Position (inside the inline-table sub-element)
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

        # Nationality (flag image title)
        nationality = "Unknown"
        flag_img = row.find("img", class_=re.compile(r"flaggenrahmen", re.I))
        if flag_img:
            candidate = (flag_img.get("title") or flag_img.get("alt") or "").strip()
            if candidate:
                nationality = candidate
        else:
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
            "tm_id": tm_id,
            "tm_url": tm_url,
            "age": age,
            "nationality": nationality,
            "position": position,
            "club": club,
            "league_key": league_key,
            "league_name": league_name,
            "market_value": market_value,
            "market_value_numeric": _mv_to_float(market_value),
        })

    return players


# ── Player profile scraping ──────────────────────────────────────────────────

async def _scrape_player_profile(tm_id: str) -> dict:
    """
    Scrape the physical & contractual data from a player's Transfermarkt profile page.
    Returns a dict with keys: height_cm, weight_kg, foot, agent, contract_until,
    citizenship, full_name, date_of_birth, place_of_birth, market_value, tm_url.
    """
    url = f"{BASE_URL}/player/profil/spieler/{tm_id}"
    soup = await AsyncPlaywrightHelper.get_soup(url)

    result: dict = {
        "tm_id": tm_id,
        "tm_url": url,
        "full_name": None,
        "date_of_birth": None,
        "place_of_birth": None,
        "age": None,
        "height_cm": None,
        "weight_kg": None,
        "foot": None,
        "citizenship": None,
        "position": None,
        "agent": None,
        "contract_until": None,
        "current_club": None,
        "market_value": None,
        "market_value_numeric": None,
    }

    if not soup:
        return result

    # Header name
    h1 = soup.find("h1", class_=re.compile(r"data-header__headline"))
    if not h1:
        h1 = soup.find("h1")
    if h1:
        result["full_name"] = h1.get_text(strip=True)

    # Market value from header
    mv_div = soup.find("div", class_=re.compile(r"data-header__market-value-wrapper"))
    if mv_div:
        mv_text = mv_div.get_text(strip=True).split("Last")[0].strip()
        result["market_value"] = mv_text
        result["market_value_numeric"] = _mv_to_float(mv_text)

    # Data table on left sidebar — key/value pairs
    info_table = soup.find("div", class_=re.compile(r"info-table|spielerdaten", re.I))
    if not info_table:
        info_table = soup.find("div", class_="data-header__details")

    def _find_value_after_label(label_text: str) -> Optional[str]:
        """Find a <span> value that follows a label containing the given text."""
        for span in soup.find_all("span", class_=re.compile(r"info-table__content--bold|hauptlink", re.I)):
            prev = span.find_previous_sibling()
            if not prev:
                prev = span.parent.find_previous_sibling() if span.parent else None
            text_before = ""
            for sib in span.parent.children if span.parent else []:
                if sib == span:
                    break
                if hasattr(sib, "get_text"):
                    text_before += sib.get_text()
                else:
                    text_before += str(sib)
            if label_text.lower() in text_before.lower():
                return span.get_text(strip=True)
        return None

    # Iterate all <li> items in the profile info section
    for li in soup.find_all("li", class_=re.compile(r"data-header__label|info-table__content", re.I)):
        text = li.get_text(" ", strip=True)
        low = text.lower()
        if "date of birth" in low or "born" in low:
            result["date_of_birth"] = text.split(":", 1)[-1].strip()
        elif "place of birth" in low:
            result["place_of_birth"] = text.split(":", 1)[-1].strip()
        elif "height" in low:
            m = re.search(r"(\d[,\.]\d{2})\s*m", text)
            if m:
                try:
                    result["height_cm"] = int(float(m.group(1).replace(",", ".")) * 100)
                except Exception:
                    pass
        elif "foot" in low:
            for foot in ("right", "left", "both"):
                if foot in low:
                    result["foot"] = foot.capitalize()
                    break
        elif "citizenship" in low or "nationality" in low:
            imgs = li.find_all("img")
            if imgs:
                result["citizenship"] = ", ".join(
                    (img.get("title") or img.get("alt") or "").strip()
                    for img in imgs if img.get("title") or img.get("alt")
                )
        elif "player agent" in low or "agent" in low:
            a = li.find("a")
            result["agent"] = a.get_text(strip=True) if a else text.split(":", 1)[-1].strip()
        elif "contract until" in low or "contract expires" in low:
            result["contract_until"] = text.split(":", 1)[-1].strip()
        elif "position" in low and not result["position"]:
            result["position"] = text.split(":", 1)[-1].strip()
        elif "current club" in low or "club" in low:
            a = li.find("a")
            if a:
                result["current_club"] = a.get_text(strip=True)

    # Fallback: parse the info table spans directly
    spans = soup.find_all("span", class_=re.compile(r"info-table__content"))
    for i, span in enumerate(spans):
        label = span.get_text(strip=True).lower().rstrip(":")
        val_span = spans[i + 1] if i + 1 < len(spans) else None
        val = val_span.get_text(strip=True) if val_span else ""
        if "height" in label and not result["height_cm"]:
            m = re.search(r"(\d[,\.]\d{2})\s*m", val)
            if m:
                try:
                    result["height_cm"] = int(float(m.group(1).replace(",", ".")) * 100)
                except Exception:
                    pass
        elif "foot" in label and not result["foot"]:
            for foot in ("right", "left", "both"):
                if foot in val.lower():
                    result["foot"] = foot.capitalize()
                    break
        elif "agent" in label and not result["agent"]:
            result["agent"] = val or None
        elif "contract" in label and not result["contract_until"]:
            result["contract_until"] = val or None

    return result


async def _scrape_player_stats(tm_id: str, name_slug: str = "player") -> dict:
    """
    Scrape goals, assists, appearances, clean sheets from the player's stats page.
    Returns season-by-season stats and career totals.
    """
    url = f"{BASE_URL}/{name_slug}/leistungsdaten/spieler/{tm_id}/plus/0?saison=ges"
    soup = await AsyncPlaywrightHelper.get_soup(url)

    totals = {
        "appearances": 0,
        "goals": 0,
        "assists": 0,
        "yellow_cards": 0,
        "red_cards": 0,
        "minutes_played": 0,
        "clean_sheets": 0,
    }
    seasons: list[dict] = []

    if not soup:
        return {"totals": totals, "seasons": seasons}

    # Find the stats table
    table = soup.find("table", class_=re.compile(r"items"))
    if not table:
        return {"totals": totals, "seasons": seasons}

    # Parse header to find column indices
    headers = [th.get_text(strip=True).lower() for th in table.find_all("th")]

    def _col(keywords: list[str]) -> Optional[int]:
        for kw in keywords:
            for i, h in enumerate(headers):
                if kw in h:
                    return i
        return None

    col_season    = _col(["season", "saison"])
    col_club      = _col(["club", "verein"])
    col_apps      = _col(["appearances", "games", "einsätze", "app"])
    col_goals     = _col(["goals", "tore"])
    col_assists   = _col(["assists", "vorlagen"])
    col_yellow    = _col(["yellow", "gelb"])
    col_red       = _col(["red card", "rote"])
    col_minutes   = _col(["minutes", "minuten"])
    col_clean     = _col(["clean", "ohne"])

    tbody = table.find("tbody")
    if not tbody:
        return {"totals": totals, "seasons": seasons}

    def _cell_text(cells: list, idx: Optional[int]) -> str:
        if idx is None or idx >= len(cells):
            return "-"
        return cells[idx].get_text(strip=True)

    def _int(val: str) -> int:
        try:
            return int(val.replace(".", "").replace(",", "").replace("'", ""))
        except Exception:
            return 0

    for row in tbody.find_all("tr"):
        if "total" in " ".join(row.get("class", [])).lower():
            continue
        cells = row.find_all("td")
        if len(cells) < 3:
            continue
        season  = _cell_text(cells, col_season)
        club    = _cell_text(cells, col_club)
        apps    = _int(_cell_text(cells, col_apps))
        goals   = _int(_cell_text(cells, col_goals))
        assists = _int(_cell_text(cells, col_assists))
        yellow  = _int(_cell_text(cells, col_yellow))
        red     = _int(_cell_text(cells, col_red))
        mins    = _int(_cell_text(cells, col_minutes).replace("'", ""))
        clean   = _int(_cell_text(cells, col_clean))

        if season and season != "-":
            seasons.append({
                "season": season,
                "club": club,
                "appearances": apps,
                "goals": goals,
                "assists": assists,
                "yellow_cards": yellow,
                "red_cards": red,
                "minutes_played": mins,
                "clean_sheets": clean,
            })
            totals["appearances"]   += apps
            totals["goals"]         += goals
            totals["assists"]       += assists
            totals["yellow_cards"]  += yellow
            totals["red_cards"]     += red
            totals["minutes_played"] += mins
            totals["clean_sheets"]  += clean

    return {"totals": totals, "seasons": seasons}


# ── Filter helpers ────────────────────────────────────────────────────────────

def _matches_value_filter(player: dict, value_filter: str) -> bool:
    raw = value_filter.strip()
    numeric_filter = _mv_to_float(raw)
    pv = player.get("market_value_numeric")
    if numeric_filter is not None and pv is not None:
        return abs(pv - numeric_filter) / max(numeric_filter, 1) <= 0.10
    return raw.lower() in str(player.get("market_value", "")).lower()


# ── Endpoints ─────────────────────────────────────────────────────────────────

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

    tasks = [_scrape_league_table_async(k, v["url"]) for k, v in targets.items()]
    results_list = await asyncio.gather(*tasks, return_exceptions=True)

    all_players: list[dict] = []
    for res in results_list:
        if isinstance(res, list):
            all_players.extend(res)

    filtered = []
    for p in all_players:
        if age is not None and str(p.get("age", "")) != str(age).strip():
            continue
        if nationality and nationality.lower() not in p.get("nationality", "").lower():
            continue
        if position and position.lower() not in p.get("position", "").lower():
            continue
        if value and not _matches_value_filter(p, value):
            continue
        filtered.append(p)

    seen: set = set()
    unique: list[dict] = []
    for p in filtered:
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


@router.get("/player/{tm_id}")
async def player_full_profile(tm_id: str):
    """
    Full scouting profile for a single player by their Transfermarkt ID.
    Combines physical data, contractual info, agent, and career stats
    (goals, assists, appearances, cards, minutes).

    Example: GET /api/scraper/player/28003
    """
    if not re.fullmatch(r"\d+", tm_id):
        raise HTTPException(status_code=400, detail="tm_id must be numeric")

    profile, stats = await asyncio.gather(
        _scrape_player_profile(tm_id),
        _scrape_player_stats(tm_id),
    )

    return {
        "tm_id": tm_id,
        "tm_url": f"{BASE_URL}/player/profil/spieler/{tm_id}",
        # Identity
        "full_name":      profile.get("full_name"),
        "date_of_birth":  profile.get("date_of_birth"),
        "place_of_birth": profile.get("place_of_birth"),
        "age":            profile.get("age"),
        "citizenship":    profile.get("citizenship"),
        "nationality":    profile.get("citizenship"),
        # Physical
        "height_cm":  profile.get("height_cm"),
        "weight_kg":  profile.get("weight_kg"),
        "foot":       profile.get("foot"),
        # Tactical
        "position":   profile.get("position"),
        # Club & contract
        "current_club":    profile.get("current_club"),
        "contract_until":  profile.get("contract_until"),
        "agent":           profile.get("agent"),
        # Value
        "market_value":         profile.get("market_value"),
        "market_value_numeric": profile.get("market_value_numeric"),
        # Career stats
        "career_totals": stats.get("totals"),
        "season_stats":  stats.get("seasons"),
    }
