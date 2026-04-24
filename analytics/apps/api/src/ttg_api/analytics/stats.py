"""
stats.py — All stat keys, position mappings, and aggregation helpers.
Single source of truth. Import this everywhere.
"""

from __future__ import annotations

# ── Position mappings ──────────────────────────────────────────────────────────

# Wyscout code → our group
POSITION_GROUP: dict[str, str] = {
    "gk": "GK",
    "cb": "DEF", "lcb": "DEF", "rcb": "DEF",
    "lb": "DEF", "rb": "DEF", "lb5": "DEF", "rb5": "DEF",
    "lwb": "DEF", "rwb": "DEF",
    "cdm": "MID", "ldmf": "MID", "rdmf": "MID",
    "cm": "MID", "lcmf": "MID", "rcmf": "MID", "lcmf3": "MID",
    "lm": "MID", "rm": "MID",
    "amf": "MID", "lamf": "MID", "ramf": "MID",
    "lw": "ATT", "rw": "ATT", "lwf": "ATT", "rwf": "ATT",
    "cf": "ATT", "ss": "ATT",
}

WIDE_POSITIONS = {"lb", "rb", "lb5", "rb5", "lwb", "rwb", "lw", "rw", "lwf", "rwf", "lamf", "ramf"}
CENTRAL_POSITIONS = {"cdm", "ldmf", "rdmf", "cm", "lcmf", "rcmf", "lcmf3", "amf"}
DEFENSIVE_POSITIONS = {"gk", "cb", "lcb", "rcb", "lb", "rb", "lb5", "rb5", "lwb", "rwb"}

# ── All stat keys from the Wyscout total block ─────────────────────────────────

ALL_TOTAL_KEYS = [
    # Appearance
    "matches", "matchesInStart", "matchesSubstituted", "matchesComingOff",
    "minutesOnField", "minutesTagged",
    # Goals / cards
    "goals", "assists", "shots", "headShots", "shotsOnTarget", "shotsBlocked",
    "yellowCards", "redCards", "directRedCards", "penalties",
    "offsides", "foulsSuffered", "fouls",
    # Duels
    "duels", "duelsWon",
    "defensiveDuels", "defensiveDuelsWon",
    "offensiveDuels", "offensiveDuelsWon",
    "aerialDuels", "aerialDuelsWon",
    "fieldAerialDuels", "fieldAerialDuelsWon",
    "looseBallDuels", "looseBallDuelsWon",
    "pressingDuels", "pressingDuelsWon",
    "slidingTackles", "successfulSlidingTackles",
    "newDuelsWon", "newDefensiveDuelsWon", "newOffensiveDuelsWon",
    "newSuccessfulDribbles",
    # Dribbles
    "dribbles", "successfulDribbles",
    "dribblesAgainst", "dribblesAgainstWon",
    # Passes
    "passes", "successfulPasses",
    "forwardPasses", "successfulForwardPasses",
    "backPasses", "successfulBackPasses",
    "lateralPasses", "successfulLateralPasses",
    "verticalPasses", "successfulVerticalPasses",
    "longPasses", "successfulLongPasses",
    "progressivePasses", "successfulProgressivePasses",
    "keyPasses", "successfulKeyPasses",
    "smartPasses", "successfulSmartPasses",
    "throughPasses", "successfulThroughPasses",
    "passesToFinalThird", "successfulPassesToFinalThird",
    # Crosses
    "crosses", "successfulCrosses",
    "freeKicks", "freeKicksOnTarget",
    "directFreeKicks", "directFreeKicksOnTarget",
    "corners",
    # Transitions / pressing
    "recoveries", "opponentHalfRecoveries", "dangerousOpponentHalfRecoveries",
    "losses", "ownHalfLosses", "dangerousOwnHalfLosses",
    "counterpressingRecoveries",
    # Attacking
    "attackingActions", "successfulAttackingActions",
    "shotAssists", "shotOnTargetAssists",
    "linkupPlays", "successfulLinkupPlays",
    "touchInBox", "progressiveRun",
    "accelerations", "missedBalls",
    # Defensive
    "defensiveActions", "successfulDefensiveAction",
    "interceptions", "clearances",
    # xG / xA
    "xgShot", "xgAssist", "xgSave",
    "receivedPass",
    # GK
    "gkCleanSheets", "gkConcededGoals", "gkShotsAgainst",
    "gkExits", "gkSuccessfulExits",
    "gkAerialDuels", "gkAerialDuelsWon",
    "gkSaves",
    "goalKicks", "goalKicksShort", "goalKicksLong", "successfulGoalKicks",
    # Second/third assists
    "secondAssists", "thirdAssists",
]

# ── Aggregation ────────────────────────────────────────────────────────────────

def empty_stats() -> dict:
    return {k: 0.0 for k in ALL_TOTAL_KEYS}


def add_stats(acc: dict, new: dict) -> None:
    """Add new stat dict into accumulator in-place."""
    for k in ALL_TOTAL_KEYS:
        v = new.get(k, 0)
        if v:
            acc[k] = acc.get(k, 0) + v


def per90(stat: float, minutes: float) -> float:
    """Normalize a stat to per-90-minutes rate."""
    if minutes < 1:
        return 0.0
    return round(stat * 90 / minutes, 3)


def pct(numerator: float, denominator: float) -> float:
    """Safe percentage."""
    if denominator < 1:
        return 0.0
    return round(numerator / denominator * 100, 1)


def get_primary_position(positions: dict[str, int]) -> str | None:
    """Most common position code from {code: count}."""
    if not positions:
        return None
    return max(positions, key=positions.get)
