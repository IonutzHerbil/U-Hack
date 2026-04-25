import re
import urllib.parse
from typing import Optional
from concurrent.futures import ThreadPoolExecutor, as_completed

from fastapi import APIRouter, Query, HTTPException

from ttg_api.services.transfermarkt import RequestHelper, BASE_URL

router = APIRouter(prefix="/api", tags=["Scraping"])

TARGET_LEAGUES = [
    "https://www.transfermarkt.com/liga-2/marktwerte/wettbewerb/RO2", # Romanian League 2
    "https://www.transfermarkt.com/primavera-1/marktwerte/wettbewerb/IT19",  # Italy U19
    "https://www.transfermarkt.com/divisions-regionales-under-19/marktwerte/wettbewerb/ES19", # Spain U19 
    "https://www.transfermarkt.com/u18-premier-league/marktwerte/wettbewerb/GB18", # UK U18
    "https://www.transfermarkt.com/a-junioren-bundesliga-west/marktwerte/wettbewerb/DE1W", # Germany U19
    "https://www.transfermarkt.com/mls-next-pro/marktwerte/wettbewerb/USNP", # USA/Canada Next Pro
    "https://www.transfermarkt.com/championnat-national-u19/marktwerte/wettbewerb/FR19", # France U19
    "https://www.transfermarkt.com/o18-divisie-1/marktwerte/wettbewerb/NL21", # Netherlands youth
    "https://www.transfermarkt.com/u21-pro-league-1/marktwerte/wettbewerb/BE21", # Belgium youth
    "https://www.transfermarkt.com/ofb-jugendliga-u18/marktwerte/wettbewerb/AT18" # Austria youth
]

def scrape_league_table(url: str):
    """
    Rapidly scrapes the player table data directly off a League's page.
    This skips the slow process of opening individual player records!
    """
    players = []
    soup = RequestHelper.get_soup(url)
    if not soup:
        return players
        
    table = soup.find("table", class_="items")
    if not table:
        return players
        
    tbody = table.find("tbody")
    if not tbody:
        return players
        
    for row in tbody.find_all("tr", recursive=False):
        # 1. Name
        name = "Unknown"
        name_tag = row.find("td", class_="hauptlink")
        if name_tag and name_tag.find("a"):
            name = name_tag.find("a").get_text(strip=True)
            
        # 2. Position
        pos = "Unknown"
        inline = row.find("table", class_="inline-table")
        if inline:
            pos_tds = inline.find_all("td")
            if len(pos_tds) > 1:
                pos = pos_tds[1].get_text(strip=True)
                
        # 3. Age
        age = "Unknown"
        zentriert_tds = row.find_all("td", class_="Zentriert")
        for td in zentriert_tds:
            text = td.get_text(strip=True)
            # Find the strict digit which represents age
            if text.isdigit() and 14 <= int(text) <= 45:
                age = text
                break
                
        # 4. Club
        club = "Unknown"
        # Check title text of the tiny shield image
        club_img = row.find("img", class_="tiny_wappen")
        if club_img:
            club = club_img.get("title") or club_img.get("alt") or "Unknown"
        else:
            club_a = row.find("a", href=lambda h: h and "/startseite/verein/" in h)
            if club_a:
                club = club_a.get("title") or club_a.get_text(strip=True)
                
        # 5. Market Value
        mv = "Unknown"
        mv_td = row.find("td", class_="rechts hauptlink")
        if mv_td:
            mv = mv_td.get_text(strip=True)
            
        players.append({
            "name": name,
            "age": age,
            "club": club,
            "market_value": mv,
            "position": pos
        })
        
    return players


@router.get("/players")
async def search_players_dynamic(
    age: Optional[str] = Query(None, description="Age of the player (e.g. 23)"),
    club: Optional[str] = Query(None, description="Current club name (e.g. Arsenal)"),
    market_value: Optional[str] = Query(None, description="Market value (e.g. €50k or 50)"),
    position: Optional[str] = Query(None, description="Player position (e.g. Forward or Midfield)")
):
    """
    Dynamically fetches players STRICTLY from the targeted secondary/youth leagues.
    Outputs ONLY the properties: age, club, market value, position.
    """
    all_players = []
    
    # Fire off 10 concurrent requests to scrape the tables in under 3 seconds
    with ThreadPoolExecutor(max_workers=10) as executor:
        future_to_url = {executor.submit(scrape_league_table, url): url for url in TARGET_LEAGUES}
        for future in as_completed(future_to_url):
            try:
                res = future.result()
                if res:
                    all_players.extend(res)
            except Exception:
                pass
                
    # Filter the aggregated league players according to parameters
    results = []
    for p in all_players:
        match = True
        
        if position and position.lower() not in str(p.get("position", "")).lower():
            match = False
            
        if market_value and market_value.lower() not in str(p.get("market_value", "")).lower():
            match = False
            
        if age is not None and str(p.get("age")) != str(age):
            match = False
            
        if club and club.lower() not in str(p.get("club", "")).lower():
            match = False
                
        if match:
            # Reformat to output exactly what the user requested
            results.append({
                "age": p.get("age", "Unknown"),
                "club": p.get("club", "Unknown"),
                "market_value": p.get("market_value", "Unknown"),
                "position": p.get("position", "Unknown")
            })
            
    # Optional Deduplication by mapping stringified dict temporarily 
    unique_results = [dict(t) for t in {tuple(d.items()) for d in results}]
    
    return unique_results
