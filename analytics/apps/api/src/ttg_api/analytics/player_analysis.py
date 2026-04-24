"""
player_analysis.py — Per-player ratings, strengths, weaknesses.

Computes a composite rating + role-specific subscores for each player.
Identifies which players underperform for their position.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from ttg_api.analytics.stats import (
    POSITION_GROUP, WIDE_POSITIONS, CENTRAL_POSITIONS,
    pct, per90,
)


@dataclass
class PlayerRating:
    player_id: int
    name: str
    position: str           # primary position code
    position_group: str     # GK / DEF / MID / ATT
    apps: int
    minutes: int

    # Composite 0–100
    overall: float = 0.0

    # Sub-scores by role
    attacking: float = 0.0      # goals, xg, shots
    creativity: float = 0.0     # key passes, assists, xa
    passing: float = 0.0        # accuracy, progressive passes
    defending: float = 0.0      # duels won, interceptions, recoveries
    pressing: float = 0.0       # pressing duels, counterpress, opp recoveries
    dribbling: float = 0.0      # dribble success, offensive duels
    physicality: float = 0.0    # aerial duels, fouls suffered

    strengths: list[str] = field(default_factory=list)
    weaknesses: list[str] = field(default_factory=list)
    verdict: str = ""           # 1-line summary

    # Raw key stats (per 90)
    goals_p90: float = 0.0
    assists_p90: float = 0.0
    xg_p90: float = 0.0
    xa_p90: float = 0.0
    key_passes_p90: float = 0.0
    pass_accuracy: float = 0.0
    def_duels_won_pct: float = 0.0
    dribble_success_pct: float = 0.0
    pressing_duels_p90: float = 0.0
    opp_half_rec_p90: float = 0.0


def _s(value: float, low: float, high: float) -> float:
    if high <= low:
        return 0.0
    return max(0.0, min(100.0, (value - low) / (high - low) * 100))


def rate_player(pid: int, name: str, position: str, stats: dict, minutes: float, apps: int) -> PlayerRating:
    pos_group = POSITION_GROUP.get(position.lower(), "MID") if position else "MID"
    m = max(minutes, 1)

    # per-90 core stats
    g90     = per90(stats.get("goals", 0), m)
    a90     = per90(stats.get("assists", 0), m)
    xg90    = per90(stats.get("xgShot", 0), m)
    xa90    = per90(stats.get("xgAssist", 0), m)
    kp90    = per90(stats.get("keyPasses", 0), m)
    shots90 = per90(stats.get("shots", 0), m)
    pp90    = per90(stats.get("successfulProgressivePasses", 0), m)
    pd90    = per90(stats.get("pressingDuels", 0), m)
    cp90    = per90(stats.get("counterpressingRecoveries", 0), m)
    or90    = per90(stats.get("opponentHalfRecoveries", 0), m)
    int90   = per90(stats.get("interceptions", 0), m)
    clr90   = per90(stats.get("clearances", 0), m)
    drib90  = per90(stats.get("dribbles", 0), m)
    prog90  = per90(stats.get("progressiveRun", 0), m)
    tib90   = per90(stats.get("touchInBox", 0), m)
    aer90   = per90(stats.get("aerialDuels", 0), m)

    # percentages
    pass_acc    = pct(stats.get("successfulPasses", 0), stats.get("passes", 1))
    drib_acc    = pct(stats.get("successfulDribbles", 0), stats.get("dribbles", 1))
    dd_won      = pct(stats.get("defensiveDuelsWon", 0), stats.get("defensiveDuels", 1))
    aerial_won  = pct(stats.get("aerialDuelsWon", 0), stats.get("aerialDuels", 1))
    long_acc    = pct(stats.get("successfulLongPasses", 0), stats.get("longPasses", 1))

    # ── Sub-scores (all 0–100) ──────────────────────────────────────────────
    s_attack  = _weighted_score(pos_group, "attacking", g90, xg90, shots90, tib90)
    s_create  = _weighted_score(pos_group, "creativity", a90, xa90, kp90, pp90)
    s_pass    = _weighted_score(pos_group, "passing", pass_acc / 100, pp90, long_acc / 100)
    s_defend  = _weighted_score(pos_group, "defending", dd_won / 100, int90, clr90)
    s_press   = _weighted_score(pos_group, "pressing", pd90, cp90, or90)
    s_dribble = _weighted_score(pos_group, "dribbling", drib_acc / 100, drib90, prog90)
    s_phys    = _weighted_score(pos_group, "physicality", aerial_won / 100, aer90)

    # ── Composite by position group ─────────────────────────────────────────
    weights = _position_weights(pos_group)
    overall = (
        s_attack  * weights["attacking"]  +
        s_create  * weights["creativity"] +
        s_pass    * weights["passing"]    +
        s_defend  * weights["defending"]  +
        s_press   * weights["pressing"]   +
        s_dribble * weights["dribbling"]  +
        s_phys    * weights["physicality"]
    ) / sum(weights.values())

    r = PlayerRating(
        player_id=pid, name=name,
        position=position or "?", position_group=pos_group,
        apps=apps, minutes=int(minutes),
        overall=round(overall, 1),
        attacking=round(s_attack, 1), creativity=round(s_create, 1),
        passing=round(s_pass, 1), defending=round(s_defend, 1),
        pressing=round(s_press, 1), dribbling=round(s_dribble, 1),
        physicality=round(s_phys, 1),
        goals_p90=g90, assists_p90=a90, xg_p90=xg90, xa_p90=xa90,
        key_passes_p90=kp90, pass_accuracy=pass_acc,
        def_duels_won_pct=dd_won, dribble_success_pct=drib_acc,
        pressing_duels_p90=pd90, opp_half_rec_p90=or90,
    )

    _add_strengths_weaknesses(r)
    return r


def _weighted_score(pos_group: str, category: str, *values: float) -> float:
    """Simple average of normalized component values."""
    thresholds = THRESHOLDS.get(category, {})
    low = thresholds.get("low", 0)
    high = thresholds.get("high", 1)
    scores = [_s(v, low, high) for v in values if v is not None]
    return sum(scores) / len(scores) if scores else 0.0


def _position_weights(pos_group: str) -> dict:
    return {
        "GK":  {"attacking": 0.5, "creativity": 0.5, "passing": 2.5, "defending": 3.0, "pressing": 1.0, "dribbling": 0.5, "physicality": 2.0},
        "DEF": {"attacking": 0.5, "creativity": 1.0, "passing": 2.0, "defending": 3.5, "pressing": 2.0, "dribbling": 1.0, "physicality": 2.5},
        "MID": {"attacking": 1.5, "creativity": 2.5, "passing": 2.5, "defending": 2.0, "pressing": 2.0, "dribbling": 1.5, "physicality": 1.0},
        "ATT": {"attacking": 3.5, "creativity": 2.5, "passing": 1.5, "defending": 0.5, "pressing": 1.5, "dribbling": 2.0, "physicality": 1.5},
    }.get(pos_group, {"attacking": 1.5, "creativity": 1.5, "passing": 2.0, "defending": 2.0, "pressing": 2.0, "dribbling": 1.5, "physicality": 1.5})


THRESHOLDS = {
    "attacking":   {"low": 0.0, "high": 0.5},
    "creativity":  {"low": 0.0, "high": 0.3},
    "passing":     {"low": 0.55, "high": 0.90},
    "defending":   {"low": 0.3, "high": 0.7},
    "pressing":    {"low": 0.0, "high": 0.3},
    "dribbling":   {"low": 0.3, "high": 0.8},
    "physicality": {"low": 0.3, "high": 0.7},
}


def _add_strengths_weaknesses(r: PlayerRating) -> None:
    scores = {
        "Atac": r.attacking,
        "Creativitate": r.creativity,
        "Pasare": r.passing,
        "Apărare": r.defending,
        "Pressing": r.pressing,
        "Dribling": r.dribbling,
        "Fizic": r.physicality,
    }
    sorted_scores = sorted(scores.items(), key=lambda x: -x[1])
    r.strengths = [k for k, v in sorted_scores if v >= 60][:3]
    r.weaknesses = [k for k, v in sorted_scores if v < 40][:3]

    if r.overall >= 70:
        r.verdict = "Jucător de bază. Performant pentru nivelul ligii."
    elif r.overall >= 55:
        r.verdict = "Jucător decent, poate fi îmbunătățit în zone specifice."
    elif r.overall >= 40:
        r.verdict = "Sub media așteptată pentru poziție. Candidat pentru înlocuire."
    else:
        r.verdict = "Performanțe slabe. Necesită înlocuire urgentă."


def identify_transfer_needs(ratings: list[PlayerRating]) -> list[dict]:
    """
    Returns list of {position_group, reason, urgency, suggested_profile}
    for positions where U Cluj clearly needs improvement.
    """
    needs = []
    by_group: dict[str, list[PlayerRating]] = {}
    for r in ratings:
        by_group.setdefault(r.position_group, []).append(r)

    for group, players in by_group.items():
        avg_overall = sum(p.overall for p in players) / len(players)
        worst = min(players, key=lambda p: p.overall)
        best = max(players, key=lambda p: p.overall)

        if avg_overall < 45:
            needs.append({
                "position_group": group,
                "urgency": "HIGH",
                "reason": f"Media grupei {group} este {avg_overall:.0f}/100 — sub standard.",
                "worst_player": f"{worst.name} ({worst.overall:.0f}/100)",
                "suggested_profile": _suggest_profile(group, players),
            })
        elif avg_overall < 58:
            needs.append({
                "position_group": group,
                "urgency": "MEDIUM",
                "reason": f"Grupă {group} medie ({avg_overall:.0f}/100). {worst.name} trage media în jos.",
                "worst_player": f"{worst.name} ({worst.overall:.0f}/100)",
                "suggested_profile": _suggest_profile(group, players),
            })

    # Sort by urgency
    needs.sort(key=lambda x: {"HIGH": 0, "MEDIUM": 1, "LOW": 2}[x["urgency"]])
    return needs


def _suggest_profile(group: str, players: list[PlayerRating]) -> str:
    avg_pass = sum(p.passing for p in players) / len(players)
    avg_def  = sum(p.defending for p in players) / len(players)
    avg_att  = sum(p.attacking for p in players) / len(players)
    avg_press = sum(p.pressing for p in players) / len(players)

    weakest = min(["pasare", "apărare", "atac", "pressing"],
                  key=lambda x: {"pasare": avg_pass, "apărare": avg_def, "atac": avg_att, "pressing": avg_press}[x])

    profiles = {
        "GK":  {"pasare": "Portar modern, confortabil cu mingea la picior, repunere scurtă.",
                "apărare": "Portar dominant în careu, bun la ieșiri și dueluri aeriene."},
        "DEF": {"pasare": "Fundaș cu piciorul bun, capabil să inițieze construcția.",
                "apărare": "Fundaș robust, câștigă dueluri 1v1, curat la intercepții.",
                "pressing": "Fundaș cu energie pentru presing înalt."},
        "MID": {"pasare": "Mijlocaș cu precizie mare la pasare, viziune de joc.",
                "atac": "Mijlocaș ofensiv cu finalitate, periculos din a doua linie.",
                "pressing": "Box-to-box cu intensitate mare la recuperare.",
                "apărare": "Mijlocaș defensiv care câștigă dueluri și întrerupe jocul advers."},
        "ATT": {"atac": "Atacant finalizator, xG mare, periculos în careu.",
                "pasare": "Atacant tehnic, capabil să lege jocul și să creeze pentru colegi.",
                "pressing": "Atacant cu pressing intens, agresiv în recuperare sus pe teren."},
    }

    return profiles.get(group, {}).get(weakest, f"Jucător polivalent pentru {group}.")
