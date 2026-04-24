"""
aggregate.py — Full U Cluj data pipeline.

Run from D:\\Uhack\\:
    python aggregate.py

Outputs:
  - Console summary (squad table + team profile + transfer needs)
  - ucluj_analysis.json   (full data, use for API / frontend)
  - Seeds Postgres if docker is running
"""

from __future__ import annotations

import json
import os
import re
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path

# ── Paths ──────────────────────────────────────────────────────────────────────
DATA_DIR = Path("../Date-meciuri")
PLAYERS_FILE = DATA_DIR / "players (1).json"
OUTPUT_FILE = Path("ucluj_analysis.json")

DB_CONFIG = dict(host="localhost", port=5432, dbname="ttg", user="ttg", password="ttg_dev")

U_CLUJ = "Universitatea Cluj"

# ── All stat keys we care about ────────────────────────────────────────────────
STAT_KEYS = [
    "matches", "matchesInStart", "matchesSubstituted", "matchesComingOff",
    "minutesOnField", "goals", "assists", "shots", "headShots", "shotsOnTarget",
    "shotsBlocked", "yellowCards", "redCards", "penalties", "fouls", "foulsSuffered",
    "offsides",
    "duels", "duelsWon", "defensiveDuels", "defensiveDuelsWon",
    "offensiveDuels", "offensiveDuelsWon",
    "aerialDuels", "aerialDuelsWon", "fieldAerialDuels", "fieldAerialDuelsWon",
    "looseBallDuels", "looseBallDuelsWon",
    "pressingDuels", "pressingDuelsWon",
    "slidingTackles", "successfulSlidingTackles",
    "dribbles", "successfulDribbles", "dribblesAgainst", "dribblesAgainstWon",
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
    "crosses", "successfulCrosses",
    "freeKicks", "freeKicksOnTarget",
    "corners", "shotAssists", "shotOnTargetAssists",
    "recoveries", "opponentHalfRecoveries", "dangerousOpponentHalfRecoveries",
    "losses", "ownHalfLosses", "dangerousOwnHalfLosses",
    "counterpressingRecoveries",
    "attackingActions", "successfulAttackingActions",
    "defensiveActions", "successfulDefensiveAction",
    "interceptions", "clearances",
    "linkupPlays", "successfulLinkupPlays",
    "touchInBox", "progressiveRun", "accelerations", "missedBalls",
    "xgShot", "xgAssist", "xgSave", "receivedPass",
    # GK
    "gkCleanSheets", "gkConcededGoals", "gkShotsAgainst",
    "gkExits", "gkSuccessfulExits",
    "gkAerialDuels", "gkAerialDuelsWon", "gkSaves",
    "goalKicks", "goalKicksShort", "goalKicksLong", "successfulGoalKicks",
    "secondAssists", "thirdAssists",
]

POSITION_GROUP = {
    "gk": "GK",
    "cb": "DEF", "lcb": "DEF", "rcb": "DEF",
    "lb": "DEF", "rb": "DEF", "lb5": "DEF", "rb5": "DEF", "lwb": "DEF", "rwb": "DEF",
    "cdm": "MID", "ldmf": "MID", "rdmf": "MID",
    "cm": "MID", "lcmf": "MID", "rcmf": "MID", "lcmf3": "MID",
    "lm": "MID", "rm": "MID",
    "amf": "MID", "lamf": "MID", "ramf": "MID",
    "lw": "ATT", "rw": "ATT", "lwf": "ATT", "rwf": "ATT",
    "cf": "ATT", "ss": "ATT",
}

WIDE_POS = {"lb","rb","lb5","rb5","lwb","rwb","lw","rw","lwf","rwf","lamf","ramf"}
CENTRAL_MID_POS = {"cdm","ldmf","rdmf","cm","lcmf","rcmf","lcmf3","amf","lamf","ramf"}


# ══════════════════════════════════════════════════════════════════════════════
# DATA LOADING
# ══════════════════════════════════════════════════════════════════════════════

def load_player_meta() -> dict:
    data = json.loads(PLAYERS_FILE.read_text(encoding="utf-8"))
    result = {}
    for p in data.get("players", []):
        dob = p.get("birthDate")
        age = None
        if dob:
            try:
                age = (datetime.now() - datetime.strptime(dob, "%Y-%m-%d")).days // 365
            except Exception:
                pass
        result[p["wyId"]] = {
            "wyscout_id": p["wyId"],
            "name": f"{p['firstName']} {p['lastName']}",
            "short_name": p.get("shortName", ""),
            "nationality": p.get("birthArea", {}).get("name", "?"),
            "birth_date": dob,
            "age": age,
            "position_meta": p.get("role", {}).get("code2", "").lower(),
            "position_name": p.get("role", {}).get("name", ""),
            "height_cm": p.get("height"),
            "weight_kg": p.get("weight"),
            "foot": p.get("foot"),
            "image_url": p.get("imageDataURL"),
        }
    print(f"  Loaded metadata for {len(result)} players")
    return result


def parse_filename(name: str):
    """
    'Universitatea Cluj - Argeș, 3-1_players_stats.json'
    → (home, away, home_score, away_score) or None
    """
    name = re.sub(r"_\d{7}_players_stats\.json$", "_players_stats.json", name)
    name = name.replace("_players_stats.json", "")
    parts = name.split(", ", 1)
    if len(parts) < 2:
        return None
    teams_str, score_str = parts
    team_parts = teams_str.split(" - ", 1)
    if len(team_parts) != 2:
        return None
    m = re.match(r"(\d+)-(\d+)", score_str)
    if not m:
        return None
    return team_parts[0].strip(), team_parts[1].strip(), int(m.group(1)), int(m.group(2))


def load_matches() -> list[dict]:
    matches = []
    for f in sorted(DATA_DIR.glob("*_players_stats.json")):
        parsed = parse_filename(f.name)
        if not parsed:
            continue
        home, away, hs, as_ = parsed
        if U_CLUJ not in (home, away):
            continue
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
        except Exception as e:
            print(f"  ⚠ {f.name}: {e}")
            continue
        matches.append({
            "file": f.name,
            "home": home, "away": away,
            "home_score": hs, "away_score": as_,
            "ucluj_home": home == U_CLUJ,
            "players": data.get("players", []),
        })
    print(f"  Loaded {len(matches)} U Cluj matches")
    return matches


# ══════════════════════════════════════════════════════════════════════════════
# AGGREGATION
# ══════════════════════════════════════════════════════════════════════════════

def aggregate(matches: list[dict]) -> tuple[dict, dict]:
    """
    Returns:
      player_stats: {pid: {stats:{}, match_count, positions:{code:count}, match_list:[]}}
      match_results: [{home, away, hs, as, ucluj_home, ucluj_score, opp_score}]
    """
    player_stats: dict = defaultdict(lambda: {
        "stats": defaultdict(float),
        "match_count": 0,
        "positions": defaultdict(int),
        "match_list": [],
    })
    match_results = []

    for m in matches:
        ucluj_score = m["home_score"] if m["ucluj_home"] else m["away_score"]
        opp_score   = m["away_score"] if m["ucluj_home"] else m["home_score"]
        opp = m["away"] if m["ucluj_home"] else m["home"]

        match_results.append({
            "opponent": opp,
            "ucluj_home": m["ucluj_home"],
            "ucluj_score": ucluj_score,
            "opp_score": opp_score,
            "result": "W" if ucluj_score > opp_score else ("D" if ucluj_score == opp_score else "L"),
        })

        for p in m["players"]:
            total = p.get("total", {})
            if total.get("matches", 0) == 0:
                continue
            pid = p["playerId"]
            ps = player_stats[pid]
            ps["match_count"] += 1
            ps["match_list"].append(f"{m['home']} {m['home_score']}-{m['away_score']} {m['away']}")

            for k in STAT_KEYS:
                v = total.get(k, 0)
                if v:
                    ps["stats"][k] = ps["stats"].get(k, 0) + v

            for pos_entry in p.get("positions", []):
                code = pos_entry.get("position", {}).get("code", "")
                if code:
                    ps["positions"][code] = ps["positions"].get(code, 0) + 1

    return dict(player_stats), match_results


def identify_ucluj_squad(player_stats: dict, total_matches: int) -> set:
    """Players who appeared in ≥25% of U Cluj matches."""
    min_m = max(2, int(total_matches * 0.25))
    squad = {pid for pid, d in player_stats.items() if d["match_count"] >= min_m}
    print(f"  U Cluj squad: {len(squad)} players (min {min_m}/{total_matches} matches)")
    return squad


def get_primary_pos(positions: dict) -> str | None:
    if not positions:
        return None
    return max(positions, key=positions.get)


# ══════════════════════════════════════════════════════════════════════════════
# TACTICAL PROFILE
# ══════════════════════════════════════════════════════════════════════════════

def s(v, lo, hi):
    if hi <= lo: return 0.0
    return round(max(0.0, min(100.0, (v - lo) / (hi - lo) * 100)), 1)

def pct(num, den):
    return 0.0 if den < 1 else num / den * 100

def p90(val, minutes):
    return 0.0 if minutes < 1 else round(val * 90 / minutes, 2)


def compute_team_profile(team_totals: dict, n: int, gk: dict, wide: dict, cmid: dict) -> list[dict]:
    t = team_totals

    dims = []

    # helper
    def dim(key, label, label_en, score, evidence, concern=""):
        dims.append({
            "key": key, "label": label, "label_en": label_en,
            "score": round(score, 1),
            "evidence": evidence,
            "concern": concern,
            "tier": "FORTE" if score >= 65 else ("OK" if score >= 45 else "SLAB"),
        })

    # 1. Combinații mijloc
    kp_pm   = cmid.get("keyPasses", 0) / n
    sp_pm   = cmid.get("successfulSmartPasses", 0) / n
    vp_acc  = pct(cmid.get("successfulVerticalPasses", 0), cmid.get("verticalPasses", 1))
    tib_pm  = cmid.get("touchInBox", 0) / n
    sc = (s(kp_pm,0.3,3.5)*2 + s(sp_pm,0.1,1.5)*1.5 + s(vp_acc,50,85)*1 + s(tib_pm,0.5,6)*1.5) / 6.0
    dim("combinatii_mijloc","Combinații mijloc","Central combinations", sc,
        [f"Key passes (CM/AMF) per meci: {kp_pm:.1f}",
         f"Smart passes reușite per meci: {sp_pm:.1f}",
         f"Precizie pase verticale: {vp_acc:.0f}%",
         f"Atingeri în careu (MF) per meci: {tib_pm:.1f}"],
        "Centrul nu creează suficient pericol." if sc < 45 else "")

    # 2. Combinații flancuri
    cross_pm  = wide.get("crosses", 0) / n
    cross_acc = pct(wide.get("successfulCrosses", 0), wide.get("crosses", 1))
    prog_pm   = wide.get("progressiveRun", 0) / n
    w_xg_pm   = wide.get("xgShot", 0) / n
    sc = (s(cross_pm,1,10)*2 + s(cross_acc,10,40)*2 + s(prog_pm,0.5,5)*1.5 + s(w_xg_pm,0.02,0.4)*1) / 6.5
    dim("combinatii_flancuri","Combinații pe flancuri","Wing combinations", sc,
        [f"Centrări per meci: {cross_pm:.1f}",
         f"Precizie centrări: {cross_acc:.0f}%",
         f"Rulaje progresive (wide) per meci: {prog_pm:.1f}",
         f"xG extreme/fundași per meci: {w_xg_pm:.2f}"],
        "Jocul pe bandă nu produce pericol real." if sc < 45 else "")

    # 3. Joc direct
    lp_ratio  = pct(t.get("longPasses",0), t.get("passes",1))
    lp_acc    = pct(t.get("successfulLongPasses",0), t.get("longPasses",1))
    aer_won   = pct(t.get("aerialDuelsWon",0), t.get("aerialDuels",1))
    sc = (s(lp_ratio,5,25)*2 + s(lp_acc,25,60)*2 + s(aer_won,38,65)*2) / 6.0
    dim("joc_direct","Joc direct","Direct play", sc,
        [f"Ponderea paselor lungi: {lp_ratio:.0f}%",
         f"Precizie pase lungi: {lp_acc:.0f}%",
         f"Dueluri aeriene câștigate: {aer_won:.0f}%"],
        "Pasele lungi sunt imprecise sau se pierd duelurile aeriene." if sc < 45 else "")

    # 4. Contraatac rapid
    or_pm   = t.get("opponentHalfRecoveries",0) / n
    dor_pm  = t.get("dangerousOpponentHalfRecoveries",0) / n
    pr_pm   = t.get("progressiveRun",0) / n
    sc = (s(or_pm,4,20)*1.5 + s(dor_pm,0.3,4)*2.5 + s(pr_pm,2,12)*1.5) / 5.5
    dim("contraatac_rapid","Contraatac rapid","Fast counter-attack", sc,
        [f"Recuperări jum. adversă per meci: {or_pm:.1f}",
         f"Recuperări periculoase per meci: {dor_pm:.1f}",
         f"Rulaje progresive per meci: {pr_pm:.1f}"],
        "Echipa nu exploatează bine tranzițiile ofensive." if sc < 45 else "")

    # 5. Joc controlat
    pass_acc  = pct(t.get("successfulPasses",0), t.get("passes",1))
    sp_ratio  = pct(t.get("passes",0)-t.get("longPasses",0), t.get("passes",1))
    ft_acc    = pct(t.get("successfulPassesToFinalThird",0), t.get("passesToFinalThird",1))
    sc = (s(pass_acc,62,88)*2.5 + s(sp_ratio,60,92)*1.5 + s(ft_acc,35,72)*2) / 6.0
    dim("joc_controlat","Joc controlat și calm","Controlled possession", sc,
        [f"Precizie generală pasare: {pass_acc:.0f}%",
         f"Ponderea paselor scurte/medii: {sp_ratio:.0f}%",
         f"Precizie pase în treimea finală: {ft_acc:.0f}%"],
        "Echipa pierde mingea des prin pase imprecise." if sc < 45 else "")

    # 6. Pressing retras (bloc jos)
    clr_pm  = t.get("clearances",0) / n
    dd_won  = pct(t.get("defensiveDuelsWon",0), t.get("defensiveDuels",1))
    dohl_pm = t.get("dangerousOwnHalfLosses",0) / n
    safe    = 100 - pct(dohl_pm, t.get("ownHalfLosses",1)/n + 0.001)
    sc = (s(clr_pm,5,25)*1.5 + s(dd_won,38,65)*2 + s(safe,40,95)*1.5) / 5.0
    dim("pressing_retras","Pressing retras (bloc jos)","Low block", sc,
        [f"Degajări per meci: {clr_pm:.1f}",
         f"Dueluri defensive câștigate: {dd_won:.0f}%",
         f"Pierderi periculoase teren propriu per meci: {dohl_pm:.1f}"],
        "Blocul defensiv lasă spații periculoase." if sc < 45 else "")

    # 7. Pressing median
    pd_pm   = t.get("pressingDuels",0) / n
    pd_won  = pct(t.get("pressingDuelsWon",0), t.get("pressingDuels",1))
    int_pm  = t.get("interceptions",0) / n
    sc = (s(pd_pm,2,12)*2 + s(pd_won,25,60)*1.5 + s(int_pm,4,18)*1.5) / 5.0
    dim("pressing_median","Pressing median","Mid-block pressing", sc,
        [f"Dueluri pressing per meci: {pd_pm:.1f}",
         f"Dueluri pressing câștigate: {pd_won:.0f}%",
         f"Intercepții per meci: {int_pm:.1f}"],
        "Pressingul de mijloc teren nu e eficient." if sc < 45 else "")

    # 8. Pressing avansat
    cp_pm   = t.get("counterpressingRecoveries",0) / n
    sc = (s(or_pm,4,20)*2 + s(dor_pm,0.3,4)*2.5 + s(cp_pm,2,12)*1.5) / 6.0
    dim("pressing_avansat","Pressing avansat (presing înalt)","High press", sc,
        [f"Recuperări jum. adversă per meci: {or_pm:.1f}",
         f"Recuperări periculoase jum. adversă per meci: {dor_pm:.1f}",
         f"Contrapressing per meci: {cp_pm:.1f}"],
        "Echipa nu presează eficient sus pe teren." if sc < 45 else "")

    # 9. Contrapressing
    cp_rate = pct(t.get("counterpressingRecoveries",0), t.get("losses",1))
    sc = (s(cp_pm,2,12)*2 + s(cp_rate,3,18)*2) / 4.0
    dim("contrapressing","Contrapressing","Counter-press", sc,
        [f"Recuperări contrapressing per meci: {cp_pm:.1f}",
         f"Rată contrapressing (din pierderi): {cp_rate:.1f}%"],
        "Echipa nu reacționează imediat după pierderea mingii." if sc < 45 else "")

    # 10. Retragere și organizare
    foul_pm = t.get("fouls",0) / n
    rc_pm   = t.get("redCards",0) / n
    disc    = s(100 - s(foul_pm,6,18), 0, 100)
    sc = (s(int_pm,4,20)*2 + s(dd_won,38,65)*2 + disc*1 + s(100-rc_pm*50,0,100)*0.5) / 5.5
    dim("retragere_organizare","Retragere și organizare","Defensive organization", sc,
        [f"Intercepții per meci: {int_pm:.1f}",
         f"Dueluri defensive câștigate: {dd_won:.0f}%",
         f"Faulturi comise per meci: {foul_pm:.1f}",
         f"Cartonașe roșii per meci: {rc_pm:.2f}"],
        "Disciplina și organizarea defensivă au probleme." if sc < 45 else "")

    # 11. Construcție de la portar
    gk_acc   = pct(gk.get("successfulPasses",0), gk.get("passes",1))
    gk_short = pct(gk.get("goalKicksShort",0), gk.get("goalKicks",1))
    gk_prog  = gk.get("successfulProgressivePasses",0) / n
    sc = (s(gk_acc,45,85)*2 + s(gk_short,15,65)*1.5 + s(gk_prog,0.3,3.5)*1.5) / 5.0
    dim("constructie_portar","Construcție de la portar","Build-up from goalkeeper", sc,
        [f"Precizie pase portar: {gk_acc:.0f}%",
         f"Ponderea repunerii scurte: {gk_short:.0f}%",
         f"Pase progresive portar per meci: {gk_prog:.1f}"],
        "Portarul nu contribuie la construcție — joacă direct." if sc < 45 else "")

    # 12. Minge lungă
    gk_long = pct(gk.get("goalKicksLong",0), gk.get("goalKicks",1))
    sc = (s(lp_ratio,5,25)*1.5 + s(lp_acc,25,60)*2 + s(gk_long,35,85)*1.5 + s(aer_won,38,65)*2) / 7.0
    dim("minge_lunga","Minge lungă","Long ball", sc,
        [f"Ponderea paselor lungi: {lp_ratio:.0f}%",
         f"Precizie pase lungi: {lp_acc:.0f}%",
         f"Repuneri lungi portar: {gk_long:.0f}%",
         f"Dueluri aeriene câștigate: {aer_won:.0f}%"],
        "Mingea lungă e imprecisă sau se pierd duelurile aeriene." if sc < 45 else "")

    return dims


# ══════════════════════════════════════════════════════════════════════════════
# PLAYER RATINGS
# ══════════════════════════════════════════════════════════════════════════════

def rate_player(pid, name, pos, stats, minutes, apps) -> dict:
    pos_grp = POSITION_GROUP.get((pos or "").lower(), "MID")
    m = max(minutes, 1)

    g90    = p90(stats.get("goals",0), m)
    a90    = p90(stats.get("assists",0), m)
    xg90   = p90(stats.get("xgShot",0), m)
    xa90   = p90(stats.get("xgAssist",0), m)
    kp90   = p90(stats.get("keyPasses",0), m)
    pp90   = p90(stats.get("successfulProgressivePasses",0), m)
    pd90   = p90(stats.get("pressingDuels",0), m)
    cp90   = p90(stats.get("counterpressingRecoveries",0), m)
    or90   = p90(stats.get("opponentHalfRecoveries",0), m)
    int90  = p90(stats.get("interceptions",0), m)
    clr90  = p90(stats.get("clearances",0), m)
    dr90   = p90(stats.get("dribbles",0), m)
    prg90  = p90(stats.get("progressiveRun",0), m)
    tib90  = p90(stats.get("touchInBox",0), m)
    sot90  = p90(stats.get("shotsOnTarget",0), m)

    pa     = pct(stats.get("successfulPasses",0), stats.get("passes",1))
    da     = pct(stats.get("successfulDribbles",0), stats.get("dribbles",1))
    ddw    = pct(stats.get("defensiveDuelsWon",0), stats.get("defensiveDuels",1))
    aerw   = pct(stats.get("aerialDuelsWon",0), stats.get("aerialDuels",1))
    la     = pct(stats.get("successfulLongPasses",0), stats.get("longPasses",1))
    cross_a= pct(stats.get("successfulCrosses",0), stats.get("crosses",1))

    # sub scores
    sc_att  = (s(g90,0,0.5)*2 + s(xg90,0,0.5)*2 + s(tib90,0,3)*1.5 + s(sot90,0,0.4)*1) / 6.5
    sc_cre  = (s(a90,0,0.3)*2 + s(xa90,0,0.3)*2 + s(kp90,0,0.5)*2 + s(pp90,0,1.5)*1) / 7.0
    sc_pass = (s(pa,55,90)*2.5 + s(pp90,0,1.5)*1.5 + s(la,20,65)*1) / 5.0
    sc_def  = (s(ddw,30,70)*2.5 + s(int90,0,2.5)*2 + s(clr90,0,3)*1) / 5.5
    sc_pres = (s(pd90,0,2)*2 + s(cp90,0,1.5)*2 + s(or90,0,2)*1.5) / 5.5
    sc_drib = (s(da,20,80)*2 + s(dr90,0,3)*1.5 + s(prg90,0,1.5)*1.5) / 5.0
    sc_phys = (s(aerw,30,70)*2 + s(cross_a,10,50)*1) / 3.0  # GK uses saves

    # GK override
    if pos_grp == "GK":
        saves_pct = pct(stats.get("gkSaves",0), stats.get("gkShotsAgainst",1))
        exit_pct  = pct(stats.get("gkSuccessfulExits",0), stats.get("gkExits",1))
        aerw_gk   = pct(stats.get("gkAerialDuelsWon",0), stats.get("gkAerialDuels",1))
        cs_rate   = pct(stats.get("gkCleanSheets",0), max(apps,1))
        sc_def    = (s(saves_pct,50,90)*3 + s(aerw_gk,40,80)*1.5 + s(cs_rate,10,50)*2 + s(exit_pct,30,80)*1) / 7.5
        sc_pass   = (s(pa,45,85)*2.5 + s(pp90,0,0.5)*1) / 3.5

    # position weights
    W = {
        "GK":  {"att":0.2,"cre":0.3,"pass":2.5,"def":3.5,"pres":0.5,"drib":0.3,"phys":1.5},
        "DEF": {"att":0.5,"cre":1.0,"pass":2.0,"def":3.5,"pres":2.0,"drib":1.0,"phys":2.0},
        "MID": {"att":1.5,"cre":2.5,"pass":2.5,"def":2.0,"pres":2.0,"drib":1.5,"phys":1.0},
        "ATT": {"att":3.5,"cre":2.5,"pass":1.5,"def":0.5,"pres":1.5,"drib":2.0,"phys":1.5},
    }.get(pos_grp, {"att":1.5,"cre":1.5,"pass":2.0,"def":2.0,"pres":2.0,"drib":1.5,"phys":1.5})

    total_w = sum(W.values())
    overall = (sc_att*W["att"] + sc_cre*W["cre"] + sc_pass*W["pass"] +
               sc_def*W["def"] + sc_pres*W["pres"] + sc_drib*W["drib"] + sc_phys*W["phys"]) / total_w

    subs = {"Atac":sc_att,"Creativitate":sc_cre,"Pasare":sc_pass,
            "Apărare":sc_def,"Pressing":sc_pres,"Dribling":sc_drib,"Fizic":sc_phys}
    strengths  = [k for k,v in sorted(subs.items(), key=lambda x:-x[1]) if v >= 62][:3]
    weaknesses = [k for k,v in sorted(subs.items(), key=lambda x: x[1]) if v <  40][:3]

    verdict = (
        "Jucător de bază. Performant pentru nivel." if overall >= 68 else
        "Decent, îmbunătățibil în zone specifice."  if overall >= 55 else
        "Sub medie pentru poziție. Candidat înlocuire." if overall >= 42 else
        "Performanțe slabe. Înlocuire urgentă necesară."
    )

    return {
        "player_id": pid, "name": name, "position": pos, "position_group": pos_grp,
        "apps": apps, "minutes": int(minutes),
        "overall": round(overall, 1),
        "subscores": {k: round(v, 1) for k,v in subs.items()},
        "strengths": strengths, "weaknesses": weaknesses, "verdict": verdict,
        "per90": {
            "goals": g90, "assists": a90, "xg": xg90, "xa": xa90,
            "key_passes": kp90, "prog_passes": pp90,
            "pressing_duels": pd90, "counterpress_rec": cp90,
            "opp_half_rec": or90, "interceptions": int90,
            "dribbles": dr90, "progressive_runs": prg90, "touches_box": tib90,
        },
        "pct": {
            "pass_accuracy": round(pa,1), "dribble_success": round(da,1),
            "def_duels_won": round(ddw,1), "aerial_won": round(aerw,1),
            "long_pass_acc": round(la,1), "cross_acc": round(cross_a,1),
        },
        "raw": {k: stats.get(k, 0) for k in [
            "goals","assists","shots","shotsOnTarget","xgShot","xgAssist",
            "yellowCards","redCards","fouls","foulsSuffered",
            "passes","successfulPasses","longPasses","successfulLongPasses",
            "keyPasses","progressivePasses","successfulProgressivePasses",
            "crosses","successfulCrosses","dribbles","successfulDribbles",
            "interceptions","clearances","defensiveDuels","defensiveDuelsWon",
            "aerialDuels","aerialDuelsWon","pressingDuels","pressingDuelsWon",
            "counterpressingRecoveries","opponentHalfRecoveries",
            "gkSaves","gkConcededGoals","gkCleanSheets","gkShotsAgainst",
        ]},
    }


def identify_transfer_needs(ratings: list[dict]) -> list[dict]:
    by_group: dict[str, list] = defaultdict(list)
    for r in ratings:
        by_group[r["position_group"]].append(r)

    needs = []
    group_labels = {"GK":"Portar","DEF":"Fundași","MID":"Mijlocași","ATT":"Atacanți"}

    for grp, players in sorted(by_group.items()):
        avg = sum(p["overall"] for p in players) / len(players)
        worst = min(players, key=lambda p: p["overall"])
        weak_cats = []
        for cat in ["Atac","Creativitate","Pasare","Apărare","Pressing","Dribling"]:
            cat_avg = sum(p["subscores"].get(cat,0) for p in players) / len(players)
            if cat_avg < 38:
                weak_cats.append(f"{cat} ({cat_avg:.0f}/100)")

        if avg < 45 or worst["overall"] < 30:
            urgency = "🔴 URGENT"
        elif avg < 58:
            urgency = "🟡 NECESAR"
        else:
            urgency = "🟢 OPȚIONAL"

        needs.append({
            "group": group_labels.get(grp, grp),
            "urgency": urgency,
            "avg_rating": round(avg, 1),
            "player_count": len(players),
            "worst_player": f"{worst['name']} ({worst['overall']:.0f}/100)",
            "weak_categories": weak_cats,
            "recommendation": _recommend(grp, players),
        })

    needs.sort(key=lambda x: {"🔴 URGENT":0,"🟡 NECESAR":1,"🟢 OPȚIONAL":2}[x["urgency"]])
    return needs


def _recommend(grp: str, players: list) -> str:
    avg_press  = sum(p["subscores"].get("Pressing",0)   for p in players) / len(players)
    avg_pass   = sum(p["subscores"].get("Pasare",0)     for p in players) / len(players)
    avg_att    = sum(p["subscores"].get("Atac",0)       for p in players) / len(players)
    avg_def    = sum(p["subscores"].get("Apărare",0)    for p in players) / len(players)
    worst_cat  = min(["Pressing","Pasare","Atac","Apărare"],
                     key=lambda c: {"Pressing":avg_press,"Pasare":avg_pass,"Atac":avg_att,"Apărare":avg_def}[c])
    recs = {
        ("GK","Pasare"):   "Portar modern cu piciorul bun — construcție de jos.",
        ("GK","Apărare"):  "Portar cu reflexe bune și dominant în careu.",
        ("DEF","Pasare"):  "Fundaș central cu piciorul bun pentru construcție.",
        ("DEF","Apărare"): "Fundaș solid, câștigă dueluri, curăță pericolul.",
        ("DEF","Pressing"):"Fundaș lateral cu energie pentru presing înalt.",
        ("MID","Pasare"):  "Regizor cu viziune și precizie la pasare.",
        ("MID","Atac"):    "Mijlocaș ofensiv cu finalitate din a doua linie.",
        ("MID","Pressing"):"Box-to-box agresiv, recuperare intensă.",
        ("MID","Apărare"): "Mijlocaș defensiv screening, câștigă dueluri.",
        ("ATT","Atac"):    "Atacant finalizator pur, xG mare, eficient în careu.",
        ("ATT","Pasare"):  "Atacant tehnic, leagă jocul, creează pentru colegi.",
        ("ATT","Pressing"):"Vârf cu muncă defensivă, agresiv în recuperare.",
    }
    return recs.get((grp, worst_cat), f"Jucător polivalent pentru {grp}.")


# ══════════════════════════════════════════════════════════════════════════════
# MATCH RECORD ANALYSIS
# ══════════════════════════════════════════════════════════════════════════════

def compute_match_record(results: list[dict]) -> dict:
    w = sum(1 for r in results if r["result"] == "W")
    d = sum(1 for r in results if r["result"] == "D")
    l = sum(1 for r in results if r["result"] == "L")
    gf = sum(r["ucluj_score"] for r in results)
    ga = sum(r["opp_score"] for r in results)
    n  = len(results)

    return {
        "played": n, "wins": w, "draws": d, "losses": l,
        "goals_for": gf, "goals_against": ga,
        "goals_for_pm": round(gf/max(n,1), 2),
        "goals_against_pm": round(ga/max(n,1), 2),
        "points": w*3 + d,
        "win_rate_pct": round(w/max(n,1)*100, 1),
        "clean_sheets": sum(1 for r in results if r["opp_score"] == 0),
        "results": results,
    }


# ══════════════════════════════════════════════════════════════════════════════
# PRINT HELPERS
# ══════════════════════════════════════════════════════════════════════════════

def print_squad_table(players_out: list[dict]) -> None:
    print("\n" + "═"*100)
    print("  U CLUJ — SQUAD RATINGS")
    print("═"*100)
    hdr = f"{'Name':<22}{'Pos':<7}{'Apps':>5}{'Min':>6}{'OVR':>5}{'Atac':>6}{'Cre':>5}{'Pas':>5}{'Def':>5}{'Pres':>5}{'G':>4}{'A':>4}{'xG':>6}{'xA':>5}"
    print(hdr)
    print("-"*100)
    for p in sorted(players_out, key=lambda x: -x["overall"]):
        s = p["subscores"]
        r = p["per90"]
        print(f"{p['name']:<22}{p['position'].upper():<7}{p['apps']:>5}{p['minutes']:>6}{p['overall']:>5.1f}"
              f"{s['Atac']:>6.0f}{s['Creativitate']:>5.0f}{s['Pasare']:>5.0f}{s['Apărare']:>5.0f}{s['Pressing']:>5.0f}"
              f"{r['goals']:>4.2f}{r['assists']:>4.2f}{r['xg']:>6.3f}{r['xa']:>5.3f}")
    print("═"*100)


def print_profile(dims: list[dict]) -> None:
    print("\n" + "═"*60)
    print("  PROFIL TACTIC U CLUJ")
    print("═"*60)
    for d in dims:
        bar = "█" * int(d["score"]//5) + "░" * (20 - int(d["score"]//5))
        tier_color = {"FORTE":"✅","OK":"🟡","SLAB":"🔴"}[d["tier"]]
        print(f"{tier_color} {d['label']:<35} {bar} {d['score']:>5.1f}/100")
        for e in d["evidence"]:
            print(f"   · {e}")
        if d["concern"]:
            print(f"   ⚠ {d['concern']}")
    print("═"*60)


def print_transfer_needs(needs: list[dict]) -> None:
    print("\n" + "═"*60)
    print("  NEVOI DE TRANSFER")
    print("═"*60)
    for n in needs:
        print(f"\n{n['urgency']} — {n['group']} (rating mediu: {n['avg_rating']}/100)")
        print(f"  Cel mai slab: {n['worst_player']}")
        if n["weak_categories"]:
            print(f"  Probleme: {', '.join(n['weak_categories'])}")
        print(f"  Recomandare: {n['recommendation']}")


# ══════════════════════════════════════════════════════════════════════════════
# DB SEED
# ══════════════════════════════════════════════════════════════════════════════

def seed_db(players_out, squad_ids, player_stats, player_meta):
    try:
        import psycopg2
        import psycopg2.extras
    except ImportError:
        print("\n⚠ psycopg2 not installed — skipping DB seed. Run: pip install psycopg2-binary")
        return

    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cur = conn.cursor()

        # Upsert U Cluj club
        cur.execute("""
            INSERT INTO clubs (tm_id,name,short_name,country,league,league_level,created_at,updated_at)
            VALUES (%s,%s,%s,%s,%s,%s,NOW(),NOW())
            ON CONFLICT (tm_id) DO UPDATE SET updated_at=NOW() RETURNING id
        """, ("wyscout-ucluj","Universitatea Cluj","U Cluj","Romania","Liga 1",1))
        club_id = cur.fetchone()[0]

        inserted = 0
        for pid in squad_ids:
            p_out = next((p for p in players_out if p["player_id"] == pid), None)
            if not p_out:
                continue
            meta = player_meta.get(pid, {})
            raw  = p_out["raw"]
            cur.execute("""
                INSERT INTO players (
                    tm_id,name,short_name,nationality,age,position,position_group,
                    foot,height_cm,image_url,club_id,
                    apps,goals,assists,minutes_played,yellow_cards,red_cards,
                    xg,xa,progressive_passes,created_at,updated_at
                ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW(),NOW())
                ON CONFLICT (tm_id) DO UPDATE SET
                    apps=EXCLUDED.apps,goals=EXCLUDED.goals,assists=EXCLUDED.assists,
                    minutes_played=EXCLUDED.minutes_played,xg=EXCLUDED.xg,xa=EXCLUDED.xa,
                    progressive_passes=EXCLUDED.progressive_passes,updated_at=NOW()
            """, (
                f"wyscout-{pid}", p_out["name"], meta.get("short_name",""),
                meta.get("nationality","Unknown"), meta.get("age"),
                p_out["position"], p_out["position_group"],
                meta.get("foot"), meta.get("height_cm"), meta.get("image_url"), club_id,
                p_out["apps"], raw.get("goals",0), raw.get("assists",0), p_out["minutes"],
                raw.get("yellowCards",0), raw.get("redCards",0),
                round(raw.get("xgShot",0),3), round(raw.get("xgAssist",0),3),
                raw.get("progressivePasses",0),
            ))
            inserted += 1

        conn.commit()
        cur.close()
        conn.close()
        print(f"\n✅ DB: club_id={club_id}, upserted {inserted} players")

    except Exception as e:
        print(f"\n⚠ DB error: {e} — make sure docker compose is running")


# ══════════════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════════════

def main():
    print("\n🔵 TTG Data Pipeline — U Cluj\n")

    print("1. Loading player metadata...")
    player_meta = load_player_meta()

    print("2. Loading match files...")
    matches = load_matches()
    if not matches:
        print("❌ No U Cluj match files found. Run from D:\\Uhack\\")
        return

    print("3. Aggregating stats...")
    player_stats, match_results = aggregate(matches)

    n = len(matches)
    squad_ids = identify_ucluj_squad(player_stats, n)

    print("4. Computing match record...")
    record = compute_match_record(match_results)
    print(f"   W{record['wins']} D{record['draws']} L{record['losses']} | "
          f"GF:{record['goals_for']} GA:{record['goals_against']} | "
          f"Points:{record['points']}")

    print("5. Rating players...")
    players_out = []
    for pid in squad_ids:
        d = player_stats[pid]
        meta = player_meta.get(pid, {})
        pos = get_primary_pos(d["positions"]) or meta.get("position_meta") or "cm"
        mins = d["stats"].get("minutesOnField", 0)
        apps = int(d["stats"].get("matches", 0))
        if mins < 90:
            continue
        rating = rate_player(pid, meta.get("short_name") or meta.get("name", f"P{pid}"),
                             pos, dict(d["stats"]), mins, apps)
        players_out.append(rating)

    print(f"   Rated {len(players_out)} players")

    print("6. Computing team profile...")
    # Aggregate sub-groups
    def agg_group(pids_filter):
        t = defaultdict(float)
        for pid in squad_ids:
            pos = get_primary_pos(player_stats[pid]["positions"]) or ""
            if pids_filter(pos):
                for k, v in player_stats[pid]["stats"].items():
                    t[k] += v
        return dict(t)

    team_totals = agg_group(lambda pos: True)
    gk_stats    = agg_group(lambda pos: pos.lower() == "gk")
    wide_stats  = agg_group(lambda pos: pos.lower() in WIDE_POS)
    cmid_stats  = agg_group(lambda pos: pos.lower() in CENTRAL_MID_POS)

    profile = compute_team_profile(team_totals, n, gk_stats, wide_stats, cmid_stats)

    print("7. Identifying transfer needs...")
    needs = identify_transfer_needs(players_out)

    # ── Print ──────────────────────────────────────────────────────────────
    print_squad_table(players_out)
    print_profile(profile)
    print_transfer_needs(needs)

    # ── Save JSON ──────────────────────────────────────────────────────────
    output = {
        "generated_at": datetime.now().isoformat(),
        "match_record": record,
        "squad": players_out,
        "team_profile": profile,
        "transfer_needs": needs,
        "raw_team_totals": {k: round(v, 3) for k, v in team_totals.items()},
    }
    OUTPUT_FILE.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n💾 Full analysis saved to {OUTPUT_FILE}")

    # ── Seed DB ────────────────────────────────────────────────────────────
    print("\n8. Seeding database...")
    seed_db(players_out, squad_ids, player_stats, player_meta)

    print("\n✅ Pipeline complete.")


if __name__ == "__main__":
    main()
