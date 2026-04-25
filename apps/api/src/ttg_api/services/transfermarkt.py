import argparse
import csv
import json
import logging
import random
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, List, Optional
import urllib.parse

import requests
from bs4 import BeautifulSoup

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[
        logging.FileHandler("scraper.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Constants
BASE_URL = "https://www.transfermarkt.com"
DEFAULT_DELAY_MIN = 1
DEFAULT_DELAY_MAX = 5
MAX_RETRIES = 3
MAX_WORKERS = 3  # Kept low to respect Transfermarkt rate limiting

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    "Connection": "keep-alive"
}

class RequestHelper:
    """Helper module to handle HTTP requests with retries, backoff, and random delays."""
    
    @staticmethod
    def get_soup(url: str) -> Optional[BeautifulSoup]:
        """Fetch a URL and return a BeautifulSoup object with retries and delays."""
        # Random sleep to avoid being blocked
        delay = random.uniform(DEFAULT_DELAY_MIN, DEFAULT_DELAY_MAX)
        logger.debug(f"Sleeping for {delay:.2f}s before requesting {url}")
        time.sleep(delay)
        
        for attempt in range(MAX_RETRIES):
            try:
                response = requests.get(url, headers=HEADERS, timeout=15)
                # If hit a block (like 404 or 403), be vocal, but let's see why
                response.raise_for_status()
                return BeautifulSoup(response.content, "lxml")
            except requests.RequestException as e:
                logger.warning(f"Error fetching {url}: {e}")
                if attempt < MAX_RETRIES - 1:
                    sleep_time = (attempt + 1) * 3 + random.uniform(1, 3)
                    logger.info(f"Retrying {url} in {sleep_time:.2f}s (Attempt {attempt + 2}/{MAX_RETRIES})...")
                    time.sleep(sleep_time)
                else:
                    logger.error(f"Failed to fetch {url} after {MAX_RETRIES} attempts.")
        return None

class TransfermarktScraper:
    """Main scraper class for Extracting data from Transfermarkt."""
    
    def __init__(self, use_concurrency: bool = True):
        self.use_concurrency = use_concurrency

    def scrape_league(self, league_url: str) -> List[str]:
        """Extract all team URLs from a given league page."""
        logger.info(f"Scraping league: {league_url}")
        soup = RequestHelper.get_soup(league_url)
        if not soup:
            return []
        
        team_urls = []
        # Find the table containing the clubs (often under a box with class 'responsive-table')
        table = soup.find("table", class_="items")
        if not table:
            logger.error("Could not find teams table on the league page. Transfermarkt structure may have changed.")
            return []
            
        tbody = table.find("tbody")
        if not tbody:
            return []
            
        # Parse all rows for clubs
        for row in tbody.find_all("tr"):
            club_cell = row.find("td", class_="hauptlink")
            if club_cell and club_cell.find("a"):
                href = club_cell.find("a").get("href")
                if href and "/spielplan/" not in href:  # Focus on the club landing page
                    # Typical club url ends with /saison_id/XXXX, remove unnecessary parameters just in case
                    full_url = urllib.parse.urljoin(BASE_URL, href)
                    if full_url not in team_urls:
                        team_urls.append(full_url)
                    
        logger.info(f"Successfully extracted {len(team_urls)} teams to scrape.")
        return team_urls

    def scrape_team(self, team_url: str) -> List[str]:
        """Extract all player URLs from a team's overview page."""
        logger.info(f"Scraping team page: {team_url}")
        soup = RequestHelper.get_soup(team_url)
        if not soup:
            return []
            
        player_urls = []
        table = soup.find("table", class_="items")
        if not table:
            logger.warning(f"Could not find players table for team: {team_url}")
            return []
            
        tbody = table.find("tbody")
        if not tbody:
            return []
            
        tds = tbody.find_all("td", class_="hauptlink")
        for td in tds:
            a_tag = td.find("a")
            # Filter links to ensure they are player profiles
            if a_tag and "/profil/spieler/" in a_tag.get("href", ""):
                href = a_tag.get("href")
                full_url = urllib.parse.urljoin(BASE_URL, href)
                if full_url not in player_urls:
                    player_urls.append(full_url)
                    
        logger.info(f"Found {len(player_urls)} players for team: {team_url.split('/')[3]}")
        return player_urls

    def scrape_player_details(self, player_url: str) -> Optional[Dict]:
        """Extract structured information for a single player profile."""
        logger.info(f"Scraping player details: {player_url}")
        soup = RequestHelper.get_soup(player_url)
        if not soup:
            return None
            
        player_data = {
            "url": player_url,
            "name": "Unknown",
            "age_dob": "N/A",
            "nationality": "N/A",
            "position": "N/A",
            "current_club": "N/A",
            "market_value": "N/A",
            "height": "N/A"
        }
        
        try:
            # 1. Name
            header = soup.find("h1", class_="data-header__headline-wrapper")
            if header:
                # Remove shirt numbers if present (e.g. #10 Player Name)
                text = header.get_text(" ", strip=True)
                player_data["name"] = text.split(" ", 1)[-1].strip() if text.startswith("#") else text

            # 2. Market Value
            mv_div = soup.find("a", class_="data-header__market-value-wrapper")
            if mv_div:
                # E.g. "€50.00m Last update: Dec 19, 2023" -> Extract only the value
                raw_mv = mv_div.get_text(" ", strip=True)
                player_data["market_value"] = raw_mv.rsplit("Last update")[0].strip() if "Last update" in raw_mv else raw_mv

            # 3. Current Club
            club_el = soup.find("span", class_="data-header__club")
            if club_el and club_el.find("a"):
                player_data["current_club"] = club_el.find("a").get_text(strip=True)

            # 4. Extract other properties (DOB, Nationality, Height, Position)
            # Transfermarkt has different structures: some in `data-header__label` and others in `info-table__content`
            
            # Strategy A: Check header list elements
            for li in soup.find_all("li", class_="data-header__label"):
                label = li.get_text(strip=True)
                content_span = li.find("span", class_="data-header__content")
                if not content_span:
                    continue
                content = content_span.get_text(strip=True)
                
                if "Date of birth" in label or "Age" in label:
                    player_data["age_dob"] = content
                elif "Citizenship" in label:
                    player_data["nationality"] = content
                elif "Position" in label:
                    player_data["position"] = content
                elif "Height" in label:
                    player_data["height"] = content

            # Strategy B: Check traditional info box (in case header misses it)
            info_spans = soup.find_all(["span", "div"], class_=["info-table__content", "info-table__content--regular", "info-table__content--bold"])
            for i, span in enumerate(info_spans):
                text = span.get_text(strip=True)
                if (i + 1) < len(info_spans):
                    next_text = info_spans[i+1].get_text(strip=True)
                    if "Date of birth" in text and player_data["age_dob"] == "N/A":
                        player_data["age_dob"] = next_text
                    elif "Citizenship" in text and player_data["nationality"] == "N/A":
                        player_data["nationality"] = next_text
                    elif "Position" in text and player_data["position"] == "N/A":
                        player_data["position"] = next_text
                    elif "Height" in text and player_data["height"] == "N/A":
                        player_data["height"] = next_text
                        
        except Exception as e:
            logger.error(f"Failed to parse some details for player {player_url}: {e}")
            
        return player_data

    def run(self, league_url: str, output_prefix: str):
        """Orchestrate the full pipeline to scrape league -> teams -> players -> store data."""
        logger.info(f"--- Starting Scraper Pipeline for League ---")
        
        team_urls = self.scrape_league(league_url)
        if not team_urls:
            logger.error("No teams found. Stopping scraper.")
            return

        all_player_urls = []
        for index, team_url in enumerate(team_urls, 1):
            logger.info(f"Processing team {index}/{len(team_urls)}")
            # Random delay between teams
            time.sleep(random.uniform(2, 4))
            player_urls = self.scrape_team(team_url)
            all_player_urls.extend(player_urls)

        # De-duplicate player profiles
        all_player_urls = list(set(all_player_urls))
        logger.info(f"Total unique players to process: {len(all_player_urls)}")

        players_data = []
        
        # Load existing data to resume if necessary
        try:
            with open(f"{output_prefix}_partial.json", "r", encoding="utf-8") as f:
                players_data = json.load(f)
                scraped_urls = {p["url"] for p in players_data}
                all_player_urls = [u for u in all_player_urls if u not in scraped_urls]
                logger.info(f"Resuming progress. Skip {len(scraped_urls)} players. {len(all_player_urls)} remaining.")
        except (FileNotFoundError, json.JSONDecodeError):
            pass

        if self.use_concurrency:
            logger.info(f"Using concurrent workers (Max: {MAX_WORKERS}) to fetch player details...")
            with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
                future_to_url = {executor.submit(self.scrape_player_details, url): url for url in all_player_urls}
                
                for count, future in enumerate(as_completed(future_to_url), 1):
                    url = future_to_url[future]
                    try:
                        data = future.result()
                        if data:
                            players_data.append(data)
                            
                        # Periodically save state to protect against crashes
                        if count % 25 == 0:
                            logger.info(f"Progress checkpoint: {count}/{len(all_player_urls)} completed.")
                            self.save_data(players_data, f"{output_prefix}_partial")
                            
                    except Exception as exc:
                        logger.error(f"Player {url} caused an exception: {exc}")
        else:
            for count, url in enumerate(all_player_urls, 1):
                data = self.scrape_player_details(url)
                if data:
                    players_data.append(data)
                    
                if count % 25 == 0:
                    logger.info(f"Progress checkpoint: {count}/{len(all_player_urls)} completed.")
                    self.save_data(players_data, f"{output_prefix}_partial")

        logger.info(f"Finished scraping. Successfully retrieved {len(players_data)} player records.")
        self.save_data(players_data, output_prefix)
        logger.info("--- Scraper Finished ---")

    def save_data(self, data: List[Dict], prefix: str):
        """Export extracted data to JSON and CSV files."""
        if not data:
            return
            
        json_file = f"{prefix}.json"
        csv_file = f"{prefix}.csv"

        with open(json_file, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=4)

        keys = ["name", "age_dob", "nationality", "position", "current_club", "market_value", "height", "url"]
        with open(csv_file, "w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=keys, extrasaction="ignore")
            writer.writeheader()
            writer.writerows(data)

def main():
    parser = argparse.ArgumentParser(description="Transfermarkt Modular Web Scraper")
    parser.add_argument("--league", type=str, required=True, 
                        help="Transfermarkt league URL (e.g., https://www.transfermarkt.com/premier-league/startseite/wettbewerb/GB1)")
    parser.add_argument("--output", type=str, default="players", 
                        help="Output files prefix (default is 'players')")
    parser.add_argument("--no-concurrency", action="store_true", 
                        help="Use strict sequential scraping (Anti-blocking measure)")
    
    args = parser.parse_args()
    
    # Initialize and execute
    scraper = TransfermarktScraper(use_concurrency=not args.no_concurrency)
    scraper.run(league_url=args.league, output_prefix=args.output)

if __name__ == "__main__":
    main()
