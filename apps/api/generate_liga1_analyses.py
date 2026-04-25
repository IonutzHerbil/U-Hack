from __future__ import annotations

import importlib.util
import json
import re
import unicodedata
from collections import defaultdict
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
ANALYTICS_DIR = ROOT / "analytics"
AGGREGATE_PATH = ANALYTICS_DIR / "aggregate.py"
DATA_DIR = ANALYTICS_DIR / "Data" / "Date - meciuri"
PLAYERS_FILE = DATA_DIR / "players (1).json"
OUTPUT_DIR = Path(__file__).resolve().parent / "team_analyses"
SKIP_TEAM = "Universitatea Cluj"


def slugify(name: str) -> str:
    normalized = unicodedata.normalize("NFKD", name)
    ascii_only = normalized.encode("ascii", "ignore").decode("ascii")
    ascii_only = ascii_only.lower()
    ascii_only = re.sub(r"[^a-z0-9]+", "_", ascii_only)
    return ascii_only.strip("_")


def safe_console_text(text: str) -> str:
    return text.encode("cp1252", errors="replace").decode("cp1252")


def parse_match_filename(name: str):
    name = re.sub(r"_\d{7}_players_stats\.json$", "_players_stats.json", name)
    if not name.endswith("_players_stats.json"):
        return None
    base = name.removesuffix("_players_stats.json")
    parts = base.split(", ", 1)
    if len(parts) < 2:
        return None
    teams_str, score_str = parts
    team_parts = teams_str.split(" - ", 1)
    if len(team_parts) != 2:
        return None
    if not re.match(r"^\d+-\d+$", score_str):
        return None
    return team_parts[0].strip(), team_parts[1].strip()


def discover_teams() -> list[str]:
    teams: set[str] = set()
    for path in DATA_DIR.glob("*_players_stats.json"):
        parsed = parse_match_filename(path.name)
        if not parsed:
            continue
        home, away = parsed
        teams.add(home)
        teams.add(away)
    return sorted(teams)


def load_aggregate_module():
    spec = importlib.util.spec_from_file_location("ttg_aggregate", AGGREGATE_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load aggregate module from {AGGREGATE_PATH}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def run_for_team(aggregate_module, team_name: str, player_meta: dict) -> dict | None:
    aggregate_module.U_CLUJ = team_name
    aggregate_module.DATA_DIR = DATA_DIR
    aggregate_module.PLAYERS_FILE = PLAYERS_FILE

    matches = aggregate_module.load_matches()
    if not matches:
        return None

    player_stats, match_results = aggregate_module.aggregate(matches)
    n_matches = len(matches)
    squad_ids = aggregate_module.identify_ucluj_squad(player_stats, n_matches)
    record = aggregate_module.compute_match_record(match_results)

    players_out = []
    for pid in squad_ids:
        d = player_stats[pid]
        meta = player_meta.get(pid, {})
        pos = aggregate_module.get_primary_pos(d["positions"]) or meta.get("position_meta") or "cm"
        mins = d["stats"].get("minutesOnField", 0)
        apps = int(d["stats"].get("matches", 0))
        if mins < 90:
            continue
        rating = aggregate_module.rate_player(
            pid,
            meta.get("short_name") or meta.get("name", f"P{pid}"),
            pos,
            dict(d["stats"]),
            mins,
            apps,
        )
        players_out.append(rating)

    def agg_group(filter_fn):
        total = defaultdict(float)
        for pid in squad_ids:
            pos = aggregate_module.get_primary_pos(player_stats[pid]["positions"]) or ""
            if filter_fn(pos):
                for key, value in player_stats[pid]["stats"].items():
                    total[key] += value
        return dict(total)

    team_totals = agg_group(lambda pos: True)
    gk_stats = agg_group(lambda pos: pos.lower() == "gk")
    wide_stats = agg_group(lambda pos: pos.lower() in aggregate_module.WIDE_POS)
    cmid_stats = agg_group(lambda pos: pos.lower() in aggregate_module.CENTRAL_MID_POS)

    profile = aggregate_module.compute_team_profile(team_totals, n_matches, gk_stats, wide_stats, cmid_stats)
    needs = aggregate_module.identify_transfer_needs(players_out)

    return {
        "generated_at": datetime.now().isoformat(),
        "match_record": record,
        "squad": players_out,
        "team_profile": profile,
        "transfer_needs": needs,
        "raw_team_totals": {k: round(v, 3) for k, v in team_totals.items()},
    }


def main():
    if not AGGREGATE_PATH.exists():
        raise FileNotFoundError(f"Missing aggregate script: {AGGREGATE_PATH}")
    if not DATA_DIR.exists():
        raise FileNotFoundError(f"Missing data directory: {DATA_DIR}")

    aggregate_module = load_aggregate_module()
    aggregate_module.DATA_DIR = DATA_DIR
    aggregate_module.PLAYERS_FILE = PLAYERS_FILE
    player_meta = aggregate_module.load_player_meta()

    teams = [team for team in discover_teams() if team != SKIP_TEAM]
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    generated = 0
    for team in teams:
        print(f"Generating analysis for {safe_console_text(team)}...")
        analysis = run_for_team(aggregate_module, team, player_meta)
        if analysis is None:
            print(f"  Skipped (no matches found): {safe_console_text(team)}")
            continue

        output_path = OUTPUT_DIR / f"{slugify(team)}_analysis.json"
        output_path.write_text(json.dumps(analysis, ensure_ascii=False, indent=2), encoding="utf-8")
        generated += 1

    print(f"Done. Generated {generated} team analysis files in: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
