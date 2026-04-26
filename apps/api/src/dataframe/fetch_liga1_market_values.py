from __future__ import annotations

import asyncio
import csv
import json
import re
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote_plus

BASE_DIR = Path(__file__).resolve().parent
SRC_DIR = BASE_DIR.parent
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from ttg_api.services.transfermarkt import AsyncPlaywrightHelper, BASE_URL


REST_CSV = BASE_DIR / "baza_date_restul_jucatorilor.csv"
UCLUJ_CSV = BASE_DIR / "ucluj_detalii_jucatori.csv"
OUTPUT_JSON = BASE_DIR / "liga1_market_values.json"
OUTPUT_CSV = BASE_DIR / "liga1_market_values.csv"
PLAYER_META_CANDIDATES = [
    BASE_DIR.parents[3] / "analytics" / "Data" / "Date - meciuri" / "players (1).json",
    BASE_DIR.parents[3] / "Data" / "Date - meciuri" / "players (1).json",
    BASE_DIR.parents[3] / "Date-meciuri" / "players (1).json",
]


def _load_fullname_by_player_id() -> dict[int, str]:
    for path in PLAYER_META_CANDIDATES:
        if not path.exists():
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            players = data.get("players", []) if isinstance(data, dict) else data
            out: dict[int, str] = {}
            for p in players:
                wy_id = p.get("wyId")
                if wy_id is None:
                    continue
                first = (p.get("firstName") or "").strip()
                last = (p.get("lastName") or "").strip()
                full = f"{first} {last}".strip()
                if full:
                    out[int(wy_id)] = full
            return out
        except Exception:
            continue
    return {}


def _extract_unique_name_records() -> list[dict[str, str]]:
    """
    Returns records like:
      { "display_name": <name from CSV>, "query_name": <prefer full name> }
    """
    full_by_id = _load_fullname_by_player_id()
    records: list[dict[str, str]] = []
    seen: set[str] = set()

    for path in (REST_CSV, UCLUJ_CSV):
        if not path.exists():
            continue
        with path.open("r", encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle)
            for row in reader:
                display_name = (row.get("name") or "").strip()
                if not display_name:
                    continue
                pid_raw = (row.get("player_id") or "").strip()
                query_name = display_name
                if pid_raw.isdigit():
                    query_name = full_by_id.get(int(pid_raw), display_name)

                key = query_name.lower()
                if key in seen:
                    continue
                seen.add(key)
                records.append({
                    "display_name": display_name,
                    "query_name": query_name,
                })
    return records


def _extract_tm_id(href: str) -> str | None:
    match = re.search(r"/spieler/(\d+)", href or "")
    return match.group(1) if match else None


def _normalize_text(value: str) -> str:
    value = unicodedata.normalize("NFKD", value or "")
    value = "".join(ch for ch in value if not unicodedata.combining(ch))
    value = value.lower()
    value = re.sub(r"[^a-z0-9\s]", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def _load_abbrev_map() -> dict[str, list[str]]:
    for path in PLAYER_META_CANDIDATES:
        if not path.exists():
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            players = data.get("players", []) if isinstance(data, dict) else data
            abbrev_map: dict[str, list[str]] = {}
            for p in players:
                first = (p.get("firstName") or "").strip()
                last = (p.get("lastName") or "").strip()
                if not first or not last:
                    continue
                full = f"{first} {last}".strip()
                abbrev = f"{first[0]}. {last}"
                key = _normalize_text(abbrev)
                abbrev_map.setdefault(key, []).append(full)
            return abbrev_map
        except Exception:
            continue
    return {}


def _query_variants(name: str, abbrev_map: dict[str, list[str]]) -> list[str]:
    variants: list[str] = []
    seen: set[str] = set()

    def add(v: str) -> None:
        key = _normalize_text(v)
        if not key or key in seen:
            return
        seen.add(key)
        variants.append(v.strip())

    add(name)
    add(name.replace(".", ""))

    for full in abbrev_map.get(_normalize_text(name), []):
        add(full)

    return variants


def _pick_candidate_row(table, expected_name: str):
    rows = table.find_all("tr", class_=re.compile(r"^(odd|even)$"))
    if not rows:
        return None
    expected_norm = _normalize_text(expected_name)
    expected_tokens = expected_norm.split()
    surname = expected_tokens[-1] if expected_tokens else ""

    best = None
    best_score = -1
    for row in rows[:10]:
        cell = row.find("td", class_="hauptlink")
        if not cell:
            continue
        a = cell.find("a")
        if not a:
            continue
        tm_name = a.get_text(strip=True)
        tm_norm = _normalize_text(tm_name)
        score = 0
        if surname and surname in tm_norm:
            score += 2
        if tm_norm == expected_norm:
            score += 3
        if expected_tokens and expected_tokens[0] and tm_norm.startswith(expected_tokens[0]):
            score += 1
        if score > best_score:
            best = row
            best_score = score
    return best or rows[0]


async def _fetch_one(display_name: str, query_name: str, abbrev_map: dict[str, list[str]]) -> dict:
    for query in _query_variants(query_name, abbrev_map):
        search_url = f"{BASE_URL}/schnellsuche/ergebnis/schnellsuche?query={quote_plus(query)}"
        soup = await AsyncPlaywrightHelper.get_soup(search_url)
        if not soup:
            continue

        table = soup.find("table", class_="items")
        if not table:
            continue

        row = _pick_candidate_row(table, query_name)
        if not row:
            continue

        # profile link + id
        tm_id = None
        tm_url = None
        name_cell = row.find("td", class_="hauptlink")
        if name_cell:
            a = name_cell.find("a", href=True)
            if a:
                href = a["href"]
                tm_id = _extract_tm_id(href)
                tm_url = f"{BASE_URL}{href}" if href.startswith("/") else href

        # market value
        mv_td = row.find("td", class_=re.compile(r"rechts.*hauptlink|hauptlink.*rechts", re.I))
        market_value = "-"
        if mv_td:
            market_value = (mv_td.find("a") or mv_td).get_text(strip=True) or "-"

        if market_value not in {"-", "", "Unknown", "N/A"}:
            return {
                "name": display_name,
                "query_name": query_name,
                "market_value": market_value,
                "tm_id": tm_id,
                "tm_url": tm_url,
                "query_used": query,
            }

    # fallback if nothing matched
    soup = await AsyncPlaywrightHelper.get_soup(
        f"{BASE_URL}/schnellsuche/ergebnis/schnellsuche?query={quote_plus(query_name)}"
    )
    if not soup:
        return {"name": display_name, "query_name": query_name, "market_value": "-", "tm_id": None, "tm_url": None}

    table = soup.find("table", class_="items")
    if not table:
        return {"name": display_name, "query_name": query_name, "market_value": "-", "tm_id": None, "tm_url": None}

    row = table.find("tr", class_=re.compile(r"^(odd|even)$"))
    if not row:
        return {"name": display_name, "query_name": query_name, "market_value": "-", "tm_id": None, "tm_url": None}

    # profile link + id
    tm_id = None
    tm_url = None
    name_cell = row.find("td", class_="hauptlink")
    if name_cell:
        a = name_cell.find("a", href=True)
        if a:
            href = a["href"]
            tm_id = _extract_tm_id(href)
            tm_url = f"{BASE_URL}{href}" if href.startswith("/") else href

    # market value
    mv_td = row.find("td", class_=re.compile(r"rechts.*hauptlink|hauptlink.*rechts", re.I))
    market_value = "-"
    if mv_td:
        market_value = (mv_td.find("a") or mv_td).get_text(strip=True) or "-"

    return {
        "name": display_name,
        "query_name": query_name,
        "market_value": market_value if market_value not in {"Unknown", "N/A"} else "-",
        "tm_id": tm_id,
        "tm_url": tm_url,
        "query_used": query_name,
    }


async def main() -> None:
    records = _extract_unique_name_records()
    if not records:
        print("No players found in CSV files.")
        return

    abbrev_map = _load_abbrev_map()
    semaphore = asyncio.Semaphore(8)

    async def worker(record: dict[str, str]) -> dict:
        async with semaphore:
            return await _fetch_one(record["display_name"], record["query_name"], abbrev_map)

    results = await asyncio.gather(*(worker(record) for record in records), return_exceptions=True)

    players: list[dict] = []
    by_name: dict[str, str] = {}
    failed = 0

    for item in results:
        if isinstance(item, Exception):
            failed += 1
            continue
        players.append(item)
        by_name[item["name"]] = item["market_value"]

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total_players": len(players),
        "failed_requests": failed,
        "players": players,
        "by_name": by_name,
    }
    OUTPUT_JSON.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    with OUTPUT_CSV.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=["name", "query_name", "market_value", "tm_id", "tm_url", "query_used"])
        writer.writeheader()
        writer.writerows(players)
    print(f"Wrote {OUTPUT_JSON} with {len(players)} players ({failed} failed requests).")
    print(f"Wrote {OUTPUT_CSV} with {len(players)} players.")

    await AsyncPlaywrightHelper.close_browser()


if __name__ == "__main__":
    asyncio.run(main())
