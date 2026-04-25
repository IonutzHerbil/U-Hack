from __future__ import annotations

import csv
from pathlib import Path
from typing import Any

from ttg_api.scouting_agent import RecruitmentNeed

ROOT = Path(__file__).resolve().parents[1]
CANDIDATES_CSV = ROOT / "dataframe" / "baza_date_restul_jucatorilor.csv"

POSITION_ALIASES: dict[str, set[str]] = {
    "GK": {"gk"},
    "CB": {"cb", "lcb", "rcb"},
    "LB": {"lb", "lwb"},
    "RB": {"rb", "rwb"},
    "DM": {"dmf", "ldmf", "rdmf"},
    "CM": {"cmf", "lcmf", "rcmf", "dmf", "ldmf", "rdmf"},
    "AM": {"amf", "lamf", "ramf"},
    "LW": {"lw", "lwf", "lamf"},
    "RW": {"rw", "rwf", "ramf"},
    "ST": {"cf"},
}

GROUP_FALLBACK: dict[str, str] = {
    "GK": "GK",
    "CB": "DEF",
    "LB": "DEF",
    "RB": "DEF",
    "DM": "MID",
    "CM": "MID",
    "AM": "MID",
    "LW": "ATT",
    "RW": "ATT",
    "ST": "ATT",
}


def _to_float(value: str | None) -> float:
    if value in (None, ""):
        return 0.0
    try:
        return float(value)
    except ValueError:
        return 0.0


def _load_candidates() -> list[dict[str, Any]]:
    with CANDIDATES_CSV.open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        rows = []
        for row in reader:
            enriched = dict(row)
            enriched["minutes_value"] = int(_to_float(row.get("minutes")))
            enriched["overall_value"] = _to_float(row.get("overall"))
            rows.append(enriched)
        return rows


def _matches_position(player: dict[str, Any], target_position: str) -> bool:
    target = target_position.upper()
    position = (player.get("position") or "").lower()
    group = (player.get("position_group") or "").upper()

    aliases = POSITION_ALIASES.get(target, set())
    if position in aliases:
        return True

    return group == GROUP_FALLBACK.get(target, target)


def _metric_score(player: dict[str, Any], metrics: list[str]) -> float:
    if not metrics:
        return player["overall_value"]
    values = [_to_float(player.get(metric)) for metric in metrics]
    return sum(values) / max(len(values), 1)


def _candidate_fit_summary(player: dict[str, Any], metrics: list[str]) -> list[dict[str, float | str]]:
    selected = metrics[:3] if metrics else ["overall"]
    return [
        {
            "metric": metric,
            "value": round(_to_float(player.get(metric)), 2),
        }
        for metric in selected
    ]


def shortlist_candidates(needs: list[RecruitmentNeed], limit_per_need: int = 4) -> list[dict[str, Any]]:
    players = _load_candidates()
    shortlist: list[dict[str, Any]] = []

    for need in needs:
        filtered = [
            player
            for player in players
            if _matches_position(player, need.position)
            and player["minutes_value"] >= need.min_minutes
        ]

        ranked = sorted(
            filtered,
            key=lambda player: (
                _metric_score(player, need.target_metrics),
                player["overall_value"],
                player["minutes_value"],
            ),
            reverse=True,
        )

        candidates = [
            {
                "player_id": int(_to_float(player.get("player_id"))),
                "name": player.get("name"),
                "team_slug": player.get("team_slug"),
                "position": player.get("position"),
                "position_group": player.get("position_group"),
                "age_max_rule": need.age_max,
                "minutes": player["minutes_value"],
                "overall": round(player["overall_value"], 2),
                "strengths": player.get("strengths"),
                "verdict": player.get("verdict"),
                "fit_score": round(_metric_score(player, need.target_metrics), 2),
                "fit_metrics": _candidate_fit_summary(player, need.target_metrics),
            }
            for player in ranked[:limit_per_need]
        ]

        shortlist.append(
            {
                "position": need.position,
                "priority": need.priority,
                "reason": need.reason,
                "desired_traits": need.desired_traits,
                "target_metrics": need.target_metrics,
                "candidates": candidates,
            }
        )

    return shortlist
