"""
routers/players.py — Endpoints for player metadata and aggregated player stats.
Prefers the pre-generated all_players_except_ucluj.json; falls back to raw aggregation
from the Date-meciuri match files if that JSON is unavailable.
"""

from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/api/v1/players", tags=["players"])

ROOT = Path(__file__).resolve().parents[5]

# Pre-generated snapshot produced by generate_liga1_analyses.py
PREBUILT_JSON = Path(__file__).resolve().parents[3] / "team_analyses" / "all_players_except_ucluj.json"


def _resolve_data_dir() -> Path:
    candidates = [
        ROOT / "analytics" / "Data" / "Date - meciuri",
        ROOT / "Date-meciuri",
        ROOT / "Data" / "Date - meciuri",
    ]
    for candidate in candidates:
        if candidate.exists() and candidate.is_dir():
            return candidate
    return candidates[0]


DATA_DIR = _resolve_data_dir()
META_FILE = DATA_DIR / "players (1).json"

PLAYER_FILE_PATTERN = "*_players_stats.json"


def _load_json(path: Path) -> Any:
    if not path.exists():
        raise FileNotFoundError(f"Missing data file: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def parse_filename(name: str) -> dict | None:
    name = re.sub(r"_\d{7}_players_stats\.json$", "_players_stats.json", name)
    name = name.replace("_players_stats.json", "")
    parts = name.split(", ", 1)
    if len(parts) < 2:
        return None
    teams_str, score_str = parts
    team_parts = teams_str.split(" - ", 1)
    if len(team_parts) != 2:
        return None
    m = re.match(r"(\d+)-(\d+)$", score_str)
    if not m:
        return None
    return {
        "home": team_parts[0].strip(),
        "away": team_parts[1].strip(),
        "home_score": int(m.group(1)),
        "away_score": int(m.group(2)),
    }


def load_player_meta() -> dict[int, dict[str, Any]]:
    data = _load_json(META_FILE)
    result: dict[int, dict[str, Any]] = {}
    for player in data.get("players", []):
        wy_id = player.get("wyId")
        if wy_id is None:
            continue
        dob = player.get("birthDate")
        age = None
        if dob:
            try:
                from datetime import datetime

                age = (datetime.now() - datetime.strptime(dob, "%Y-%m-%d")).days // 365
            except Exception:
                age = None
        result[int(wy_id)] = {
            "player_id": int(wy_id),
            "name": f"{player.get('firstName', '')} {player.get('lastName', '')}".strip(),
            "short_name": player.get("shortName", ""),
            "nationality": player.get("birthArea", {}).get("name", ""),
            "birth_date": dob,
            "age": age,
            "position_meta": player.get("role", {}).get("code2", "").lower(),
            "position_name": player.get("role", {}).get("name", ""),
            "height_cm": player.get("height"),
            "weight_kg": player.get("weight"),
            "foot": player.get("foot"),
            "image_url": player.get("imageDataURL"),
        }
    return result


def load_matches() -> list[dict[str, Any]]:
    if not DATA_DIR.exists() or not DATA_DIR.is_dir():
        raise FileNotFoundError(f"Date-meciuri directory not found: {DATA_DIR}")

    matches: list[dict[str, Any]] = []
    for path in sorted(DATA_DIR.glob(PLAYER_FILE_PATTERN)):
        parsed = parse_filename(path.name)
        if not parsed:
            continue
        try:
            data = _load_json(path)
        except Exception:
            continue
        matches.append({
            "file": path.name,
            "home": parsed["home"],
            "away": parsed["away"],
            "home_score": parsed["home_score"],
            "away_score": parsed["away_score"],
            "players": data.get("players", []),
        })
    return matches


def _primary_position(positions: dict[str, int]) -> str | None:
    if not positions:
        return None
    return max(positions, key=positions.get)


def aggregate_players(matches: list[dict[str, Any]], player_meta: dict[int, dict[str, Any]]) -> dict[int, dict[str, Any]]:
    players: dict[int, dict[str, Any]] = {}

    for match in matches:
        for item in match["players"]:
            player_id = item.get("playerId")
            if player_id is None:
                continue
            player_id = int(player_id)
            total = item.get("total", {}) or {}
            player = players.setdefault(player_id, {
                "player_id": player_id,
                "metadata": player_meta.get(player_id, {}),
                "match_count": 0,
                "apps": 0,
                "minutes": 0,
                "position_counts": {},
                "stats": {},
                "appearances": [],
            })

            stats = player["stats"]
            for key, value in total.items():
                if isinstance(value, (int, float)) and value:
                    stats[key] = stats.get(key, 0) + value

            player["match_count"] += 1
            player["minutes"] += int(total.get("minutesOnField", 0) or 0)
            if int(total.get("matches", 0) or 0) > 0:
                player["apps"] += 1

            for pos_entry in item.get("positions", []):
                code = pos_entry.get("position", {}).get("code", "")
                if code:
                    player["position_counts"][code] = player["position_counts"].get(code, 0) + 1

            appearance = {
                "match_file": match["file"],
                "home": match["home"],
                "away": match["away"],
                "home_score": match["home_score"],
                "away_score": match["away_score"],
                "team": "home" if item.get("teamId") == match.get("home") else "away",
                "minutes": int(total.get("minutesOnField", 0) or 0),
                "stats": total,
            }
            player["appearances"].append(appearance)

    for player in players.values():
        player["primary_position"] = _primary_position(player["position_counts"]) or player["metadata"].get("position_meta")
        if player["metadata"]:
            player["name"] = player["metadata"].get("name")
            player["short_name"] = player["metadata"].get("short_name")
            player["nationality"] = player["metadata"].get("nationality")
            player["birth_date"] = player["metadata"].get("birth_date")
            player["age"] = player["metadata"].get("age")
            player["position_name"] = player["metadata"].get("position_name")
            player["height_cm"] = player["metadata"].get("height_cm")
            player["weight_kg"] = player["metadata"].get("weight_kg")
            player["foot"] = player["metadata"].get("foot")
            player["image_url"] = player["metadata"].get("image_url")
        else:
            player["name"] = None
            player["short_name"] = None
            player["nationality"] = None
            player["birth_date"] = None
            player["age"] = None
            player["position_name"] = None
            player["height_cm"] = None
            player["weight_kg"] = None
            player["foot"] = None
            player["image_url"] = None

    return players


@lru_cache(maxsize=1)
def load_database() -> dict[str, Any]:
    player_meta = load_player_meta()
    matches = load_matches()
    players = aggregate_players(matches, player_meta)
    return {
        "metadata": player_meta,
        "matches": matches,
        "players": players,
    }


@lru_cache(maxsize=1)
def _fullname_map() -> dict[int, str]:
    """Build {wyId -> 'FirstName LastName'} from the raw players metadata."""
    candidates = [
        ROOT / "Data" / "Date - meciuri" / "players (1).json",
        ROOT / "analytics" / "Data" / "Date - meciuri" / "players (1).json",
        ROOT / "Date-meciuri" / "players (1).json",
    ]
    for path in candidates:
        if path.exists():
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
                players = data.get("players", data) if isinstance(data, dict) else data
                return {
                    int(p["wyId"]): f"{p.get('firstName','').strip()} {p.get('lastName','').strip()}".strip()
                    for p in players if p.get("wyId")
                }
            except Exception:
                pass
    return {}


@lru_cache(maxsize=1)
def _load_prebuilt() -> list[dict[str, Any]]:
    data = json.loads(PREBUILT_JSON.read_text(encoding="utf-8"))
    players = data.get("players", []) if isinstance(data, dict) else data
    fm = _fullname_map()
    for p in players:
        pid = p.get("player_id")
        full = fm.get(pid, "")
        p["full_name"] = full if full else p.get("name", "")
    return players


@router.get("/")
def all_players() -> list[dict[str, Any]]:
    # Fast path: serve pre-generated snapshot if available
    if PREBUILT_JSON.exists():
        return _load_prebuilt()

    # Slow path: aggregate from raw match files
    data = load_database()
    return sorted(
        [
            {
                "player_id": p["player_id"],
                "name": p.get("name") or p["metadata"].get("name"),
                "short_name": p.get("short_name"),
                "nationality": p.get("nationality"),
                "age": p.get("age"),
                "position_meta": p.get("primary_position"),
                "position_name": p.get("position_name"),
                "apps": p["apps"],
                "minutes": p["minutes"],
                "match_count": p["match_count"],
                "stats": p["stats"],
            }
            for p in data["players"].values()
        ],
        key=lambda x: (x["name"] or "", x["player_id"]),
    )


@router.get("/{player_id}")
def player_detail(player_id: int) -> dict[str, Any]:
    data = load_database()
    player = data["players"].get(player_id)
    if not player:
        raise HTTPException(status_code=404, detail=f"Player {player_id} not found")
    return player


@router.get("/{player_id}/appearances")
def player_appearances(player_id: int) -> list[dict[str, Any]]:
    player = load_database()["players"].get(player_id)
    if not player:
        raise HTTPException(status_code=404, detail=f"Player {player_id} not found")
    return player["appearances"]


@router.get("/metadata")
def player_metadata() -> list[dict[str, Any]]:
    return sorted(load_database()["metadata"].values(), key=lambda p: (p.get("name") or "", p["player_id"]))
