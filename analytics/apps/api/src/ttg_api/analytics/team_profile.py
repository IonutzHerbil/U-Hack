"""
team_profile.py — Computes the 12-dimension tactical profile for U Cluj.

Each dimension is scored 0–100 based on team-aggregated stats.
Scoring uses football analytics thresholds calibrated for Liga 1 level.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class Dimension:
    key: str
    label: str              # Romanian label
    label_en: str           # English label
    score: float = 0.0      # 0–100
    description: str = ""
    evidence: list[str] = field(default_factory=list)   # what drove the score
    concern: str = ""       # what's weak about this dimension


# ── Scoring helpers ────────────────────────────────────────────────────────────

def _score(value: float, low: float, high: float) -> float:
    """Linear clamp: value below low → 0, above high → 100."""
    if high <= low:
        return 0.0
    return round(max(0.0, min(100.0, (value - low) / (high - low) * 100)), 1)


def _weighted(*pairs: tuple[float, float]) -> float:
    """Weighted average of (score, weight) pairs."""
    total_w = sum(w for _, w in pairs)
    if total_w == 0:
        return 0.0
    return round(sum(s * w for s, w in pairs) / total_w, 1)


# ── Main profile computation ───────────────────────────────────────────────────

def compute_team_profile(
    team_totals: dict,          # summed stats across all matches
    match_count: int,
    total_minutes: float,       # sum of all outfield player minutes
    gk_stats: dict,             # aggregated GK-only stats
    wide_player_stats: dict,    # aggregated wide players stats
    central_mid_stats: dict,    # aggregated CM/DM/AM stats
    per_match: dict,            # pre-computed per-match averages
) -> list[Dimension]:

    n = max(match_count, 1)
    tm = team_totals
    pm = per_match

    dimensions: list[Dimension] = []

    # ── 1. Combinații mijloc ──────────────────────────────────────────────────
    cm = central_mid_stats
    key_passes_pm = cm.get("keyPasses", 0) / n
    smart_passes_pm = cm.get("successfulSmartPasses", 0) / n
    vertical_pct = _pct(cm.get("successfulVerticalPasses", 0), cm.get("verticalPasses", 1))
    touch_box_pm = cm.get("touchInBox", 0) / n
    central_xg = cm.get("xgShot", 0) / n

    s_key = _score(key_passes_pm, 0.5, 4.0)
    s_smart = _score(smart_passes_pm, 0.2, 2.0)
    s_vert = _score(vertical_pct, 50, 85)
    s_box = _score(touch_box_pm, 1, 8)
    score = _weighted((s_key, 2.0), (s_smart, 1.5), (s_vert, 1.0), (s_box, 1.5))

    dimensions.append(Dimension(
        key="combinatii_mijloc",
        label="Combinații mijloc",
        label_en="Central combinations",
        score=score,
        description="Capacitatea echipei de a construi prin centru cu pase decisive și infiltrări.",
        evidence=[
            f"Key passes (CM/DM/AM) per meci: {key_passes_pm:.1f}",
            f"Smart passes reușite per meci: {smart_passes_pm:.1f}",
            f"Precizie pase verticale: {vertical_pct:.0f}%",
            f"Atingeri în careu per meci: {touch_box_pm:.1f}",
        ],
        concern=_low_concern(score, "Centrul creează puține situații de pericol."),
    ))

    # ── 2. Combinații pe flancuri ─────────────────────────────────────────────
    wp = wide_player_stats
    crosses_pm = wp.get("crosses", 0) / n
    cross_acc = _pct(wp.get("successfulCrosses", 0), wp.get("crosses", 1))
    prog_run_pm = wp.get("progressiveRun", 0) / n
    wide_xg = wp.get("xgShot", 0) / n

    s_cross = _score(crosses_pm, 2, 12)
    s_cross_acc = _score(cross_acc, 15, 45)
    s_prog = _score(prog_run_pm, 1, 6)
    s_wxg = _score(wide_xg, 0.05, 0.5)
    score = _weighted((s_cross, 2.0), (s_cross_acc, 2.0), (s_prog, 1.5), (s_wxg, 1.0))

    dimensions.append(Dimension(
        key="combinatii_flancuri",
        label="Combinații pe flancuri",
        label_en="Wing combinations",
        score=score,
        description="Joc pe laturile terenului cu centrări și infiltrări ale jucătorilor de bandă.",
        evidence=[
            f"Centrări per meci: {crosses_pm:.1f}",
            f"Precizie centrări: {cross_acc:.0f}%",
            f"Rulaje progresive (fundași+extreme) per meci: {prog_run_pm:.1f}",
        ],
        concern=_low_concern(score, "Jocul pe flancuri e ineficient sau centrările nu duc la pericol."),
    ))

    # ── 3. Joc direct ─────────────────────────────────────────────────────────
    long_pass_ratio = _pct(tm.get("longPasses", 0), tm.get("passes", 1))
    long_pass_acc = _pct(tm.get("successfulLongPasses", 0), tm.get("longPasses", 1))
    aerial_won_pct = _pct(tm.get("aerialDuelsWon", 0), tm.get("aerialDuels", 1))

    s_lp_ratio = _score(long_pass_ratio, 5, 25)
    s_lp_acc = _score(long_pass_acc, 30, 65)
    s_aerial = _score(aerial_won_pct, 40, 65)
    score = _weighted((s_lp_ratio, 2.0), (s_lp_acc, 1.5), (s_aerial, 1.5))

    dimensions.append(Dimension(
        key="joc_direct",
        label="Joc direct",
        label_en="Direct play",
        score=score,
        description="Utilizarea paselor lungi pentru a avansa rapid și câștigarea duelurilor aeriene.",
        evidence=[
            f"Ponderea paselor lungi: {long_pass_ratio:.0f}%",
            f"Precizie pase lungi: {long_pass_acc:.0f}%",
            f"Dueluri aeriene câștigate: {aerial_won_pct:.0f}%",
        ],
        concern=_low_concern(score, "Pasele lungi sunt imprecise sau echipa pierde duelurile aeriene."),
    ))

    # ── 4. Contraatac rapid ───────────────────────────────────────────────────
    opp_recovery_pm = tm.get("opponentHalfRecoveries", 0) / n
    dangerous_recovery_pm = tm.get("dangerousOpponentHalfRecoveries", 0) / n
    prog_run_pm_all = tm.get("progressiveRun", 0) / n
    xa_pm = tm.get("xgAssist", 0) / n

    s_opp_rec = _score(opp_recovery_pm, 5, 25)
    s_danger = _score(dangerous_recovery_pm, 0.5, 5)
    s_prog_all = _score(prog_run_pm_all, 3, 15)
    score = _weighted((s_opp_rec, 1.5), (s_danger, 2.0), (s_prog_all, 1.5))

    dimensions.append(Dimension(
        key="contraatac_rapid",
        label="Contraatac rapid",
        label_en="Fast counter-attack",
        score=score,
        description="Tranziție rapidă defensivă→ofensivă cu recuperări în jumătatea adversă.",
        evidence=[
            f"Recuperări în jum. adversă per meci: {opp_recovery_pm:.1f}",
            f"Recuperări periculoase per meci: {dangerous_recovery_pm:.1f}",
            f"Rulaje progresive per meci: {prog_run_pm_all:.1f}",
        ],
        concern=_low_concern(score, "Echipa nu exploatează bine tranziția ofensivă."),
    ))

    # ── 5. Joc controlat și calm ──────────────────────────────────────────────
    pass_acc = _pct(tm.get("successfulPasses", 0), tm.get("passes", 1))
    back_pass_ratio = _pct(tm.get("backPasses", 0), tm.get("passes", 1))
    short_pass_ratio = _pct(
        tm.get("passes", 0) - tm.get("longPasses", 0),
        tm.get("passes", 1)
    )
    pass_to_ft_acc = _pct(tm.get("successfulPassesToFinalThird", 0), tm.get("passesToFinalThird", 1))

    s_acc = _score(pass_acc, 65, 88)
    s_build = _score(short_pass_ratio, 60, 90)
    s_ft = _score(pass_to_ft_acc, 40, 75)
    score = _weighted((s_acc, 2.5), (s_build, 1.5), (s_ft, 2.0))

    dimensions.append(Dimension(
        key="joc_controlat",
        label="Joc controlat și calm",
        label_en="Controlled possession",
        score=score,
        description="Menținerea posesiei cu precizie mare, construcție din spate.",
        evidence=[
            f"Precizie generală pase: {pass_acc:.0f}%",
            f"Ponderea paselor scurte/medii: {short_pass_ratio:.0f}%",
            f"Precizie pase în treimea finală: {pass_to_ft_acc:.0f}%",
        ],
        concern=_low_concern(score, "Echipa pierde mult mingea prin pase imprecise."),
    ))

    # ── 6. Pressing retras ────────────────────────────────────────────────────
    own_half_losses_pm = tm.get("ownHalfLosses", 0) / n
    danger_own_pm = tm.get("dangerousOwnHalfLosses", 0) / n
    clearances_pm = tm.get("clearances", 0) / n
    def_duels_won_pct = _pct(tm.get("defensiveDuelsWon", 0), tm.get("defensiveDuels", 1))

    # High clearances + high def duels in own half = low block tendency
    s_clear = _score(clearances_pm, 8, 30)
    s_dd = _score(def_duels_won_pct, 40, 65)
    s_safety = _score(100 - _pct(danger_own_pm, own_half_losses_pm + 1), 50, 95)
    score = _weighted((s_clear, 1.5), (s_dd, 2.0), (s_safety, 1.5))

    dimensions.append(Dimension(
        key="pressing_retras",
        label="Pressing retras (bloc jos)",
        label_en="Low block / Defensive shape",
        score=score,
        description="Organizare defensivă adâncă, bloc compact, spații mici.",
        evidence=[
            f"Degajări per meci: {clearances_pm:.1f}",
            f"Dueluri defensive câștigate: {def_duels_won_pct:.0f}%",
            f"Pierderi periculoase în prop. teren per meci: {danger_own_pm:.1f}",
        ],
        concern=_low_concern(score, "Blocul defensiv lasă spații periculoase."),
    ))

    # ── 7. Pressing median ────────────────────────────────────────────────────
    # Pressing in middle third — moderate pressingDuels, medium recovery height
    pressing_duels_pm = tm.get("pressingDuels", 0) / n
    pressing_won_pct = _pct(tm.get("pressingDuelsWon", 0), tm.get("pressingDuels", 1))
    interceptions_pm = tm.get("interceptions", 0) / n

    s_pd = _score(pressing_duels_pm, 3, 15)
    s_pd_won = _score(pressing_won_pct, 30, 60)
    s_int = _score(interceptions_pm, 5, 20)
    score = _weighted((s_pd, 2.0), (s_pd_won, 1.5), (s_int, 1.5))

    dimensions.append(Dimension(
        key="pressing_median",
        label="Pressing median",
        label_en="Mid-block pressing",
        score=score,
        description="Pressing organizat în jumătatea proprie/mediană pentru recuperare.",
        evidence=[
            f"Dueluri de pressing per meci: {pressing_duels_pm:.1f}",
            f"Dueluri de pressing câștigate: {pressing_won_pct:.0f}%",
            f"Intercepții per meci: {interceptions_pm:.1f}",
        ],
        concern=_low_concern(score, "Pressingul de mijloc teren nu e eficient."),
    ))

    # ── 8. Pressing avansat (high press) ─────────────────────────────────────
    opp_rec_pm = tm.get("opponentHalfRecoveries", 0) / n
    danger_opp_rec_pm = tm.get("dangerousOpponentHalfRecoveries", 0) / n
    counterpress_pm = tm.get("counterpressingRecoveries", 0) / n

    s_or = _score(opp_rec_pm, 5, 22)
    s_dor = _score(danger_opp_rec_pm, 0.5, 4)
    s_cp = _score(counterpress_pm, 3, 15)
    score = _weighted((s_or, 2.0), (s_dor, 2.5), (s_cp, 1.5))

    dimensions.append(Dimension(
        key="pressing_avansat",
        label="Pressing avansat (presing înalt)",
        label_en="High press",
        score=score,
        description="Recuperarea mingii în jumătatea adversă prin pressing agresiv.",
        evidence=[
            f"Recuperări în jum. adversă per meci: {opp_rec_pm:.1f}",
            f"Recuperări periculoase în jum. adversă per meci: {danger_opp_rec_pm:.1f}",
            f"Recuperări contrapressing per meci: {counterpress_pm:.1f}",
        ],
        concern=_low_concern(score, "Echipa nu presează eficient sus pe teren."),
    ))

    # ── 9. Contrapressing ─────────────────────────────────────────────────────
    cp_rec_pm = tm.get("counterpressingRecoveries", 0) / n
    losses_pm = tm.get("losses", 0) / n
    cp_rate = _pct(tm.get("counterpressingRecoveries", 0), tm.get("losses", 1))

    s_cp_abs = _score(cp_rec_pm, 3, 15)
    s_cp_rate = _score(cp_rate, 5, 20)
    score = _weighted((s_cp_abs, 2.0), (s_cp_rate, 2.0))

    dimensions.append(Dimension(
        key="contrapressing",
        label="Contrapressing",
        label_en="Counter-press",
        score=score,
        description="Recuperarea imediată a mingii după pierdere, înainte ca adversarul să organizeze.",
        evidence=[
            f"Recuperări contrapressing per meci: {cp_rec_pm:.1f}",
            f"Rată contrapressing (din total pierderi): {cp_rate:.1f}%",
            f"Total pierderi per meci: {losses_pm:.1f}",
        ],
        concern=_low_concern(score, "Echipa nu reacționează imediat după pierderea mingii."),
    ))

    # ── 10. Retragere și organizare ───────────────────────────────────────────
    interc_pm = tm.get("interceptions", 0) / n
    dd_won = _pct(tm.get("defensiveDuelsWon", 0), tm.get("defensiveDuels", 1))
    fouls_pm = tm.get("fouls", 0) / n
    rc_pm = tm.get("redCards", 0) / n

    s_int2 = _score(interc_pm, 8, 30)
    s_dd2 = _score(dd_won, 40, 65)
    s_discipline = _score(100 - _score(fouls_pm, 8, 20), 0, 100)
    s_rc = _score(100 - (rc_pm * 100), 0, 100)
    score = _weighted((s_int2, 2.0), (s_dd2, 2.0), (s_discipline, 1.0), (s_rc, 0.5))

    dimensions.append(Dimension(
        key="retragere_organizare",
        label="Retragere și organizare",
        label_en="Defensive organization",
        score=score,
        description="Organizare defensivă după pierderea mingii, disciplină tactică.",
        evidence=[
            f"Intercepții per meci: {interc_pm:.1f}",
            f"Dueluri defensive câștigate: {dd_won:.0f}%",
            f"Faulturi comise per meci: {fouls_pm:.1f}",
        ],
        concern=_low_concern(score, "Organizarea defensivă e slabă — faulturi sau spații."),
    ))

    # ── 11. Construcție de la portar ─────────────────────────────────────────
    gk = gk_stats
    gk_pass_acc = _pct(gk.get("successfulPasses", 0), gk.get("passes", 1))
    gk_short_ratio = _pct(gk.get("goalKicksShort", 0), gk.get("goalKicks", 1))
    gk_prog_passes = gk.get("successfulProgressivePasses", 0) / n

    s_gk_acc = _score(gk_pass_acc, 50, 85)
    s_gk_short = _score(gk_short_ratio, 20, 70)
    s_gk_prog = _score(gk_prog_passes, 0.5, 4)
    score = _weighted((s_gk_acc, 2.0), (s_gk_short, 1.5), (s_gk_prog, 1.5))

    dimensions.append(Dimension(
        key="constructie_portar",
        label="Construcție de la portar",
        label_en="Build-up from goalkeeper",
        score=score,
        description="Portarul participă activ la jocul de construcție, pase scurte cu fundașii.",
        evidence=[
            f"Precizie pase portar: {gk_pass_acc:.0f}%",
            f"Ponderea repunerii scurte: {gk_short_ratio:.0f}%",
            f"Pase progresive reușite per meci: {gk_prog_passes:.1f}",
        ],
        concern=_low_concern(score, "Portarul joacă direct — echipa nu construiește de jos."),
    ))

    # ── 12. Minge lungă ───────────────────────────────────────────────────────
    long_pm = tm.get("longPasses", 0) / n
    long_acc = _pct(tm.get("successfulLongPasses", 0), tm.get("longPasses", 1))
    gk_long_ratio = _pct(gk.get("goalKicksLong", 0), gk.get("goalKicks", 1))
    aerial_won = _pct(tm.get("aerialDuelsWon", 0), tm.get("aerialDuels", 1))

    s_lp = _score(long_pm, 5, 25)
    s_la = _score(long_acc, 35, 65)
    s_gk_long = _score(gk_long_ratio, 30, 80)
    s_aerial2 = _score(aerial_won, 40, 65)
    score = _weighted((s_lp, 1.5), (s_la, 2.0), (s_gk_long, 1.5), (s_aerial2, 2.0))

    dimensions.append(Dimension(
        key="minge_lunga",
        label="Minge lungă",
        label_en="Long ball",
        score=score,
        description="Utilizarea mingii lungi pentru a trece rapid peste linii sau a câștiga dueluri.",
        evidence=[
            f"Pase lungi per meci: {long_pm:.1f}",
            f"Precizie pase lungi: {long_acc:.0f}%",
            f"Repuneri lungi portar: {gk_long_ratio:.0f}%",
            f"Dueluri aeriene câștigate: {aerial_won:.0f}%",
        ],
        concern=_low_concern(score, "Mingea lungă e imprecisă sau se pierde la dueluri aeriene."),
    ))

    return dimensions


def _pct(num: float, den: float) -> float:
    if den < 1:
        return 0.0
    return num / den * 100


def _low_concern(score: float, message: str) -> str:
    return message if score < 45 else ""
