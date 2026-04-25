from __future__ import annotations

import json
import os
from typing import Literal
from dotenv import load_dotenv

load_dotenv()

from langchain_core.prompts import ChatPromptTemplate
from langchain_google_genai import ChatGoogleGenerativeAI
from pydantic import BaseModel, Field


class RecruitmentNeed(BaseModel):
    position: str = Field(description="Primary position to recruit for, such as CM, LB, RB, CB, ST.")
    priority: Literal["high", "medium", "low"] = Field(description="How urgent the recruitment need is.")
    reason: str = Field(description="Short explanation tied to the team's weaknesses.")
    desired_traits: list[str] = Field(
        default_factory=list,
        description="Key traits or metrics the player should offer.",
    )
    min_minutes: int = Field(description="Minimum minutes for shortlist filtering.", ge=0)
    age_max: int = Field(description="Maximum preferred age for the role.", ge=16, le=40)
    target_metrics: list[str] = Field(
        default_factory=list,
        description="Preferred CSV metric columns used to rank candidates.",
    )


class RecruitmentNeeds(BaseModel):
    priority_needs: list[RecruitmentNeed] = Field(
        default_factory=list,
        description="Ranked recruitment needs inferred from the weaknesses payload.",
    )


PROMPT = ChatPromptTemplate.from_messages(
    [
        (
            "human",
            """
You are a football scouting analyst helping identify transfer needs for Universitatea Cluj.

You receive a JSON payload from the team's weaknesses endpoint. Interpret:
- tactical_weaknesses: low-scoring tactical dimensions
- underperforming_players: weak current squad options

Your job is to produce a concise structured recruitment brief.

Rules:
- Return between 1 and 4 priority_needs.
- Prioritize positions that directly address the weakest tactical areas and weak squad options.
- Keep reasons specific and grounded in the JSON.
- desired_traits must be concrete football traits or scouting metrics.
- target_metrics must use only exact metric column names from this allow-list:
  overall
  subscores.Atac
  subscores.Creativitate
  subscores.Pasare
  subscores.Apărare
  subscores.Pressing
  subscores.Dribling
  subscores.Fizic
  per90.goals
  per90.assists
  per90.xg
  per90.xa
  per90.key_passes
  per90.prog_passes
  per90.pressing_duels
  per90.counterpress_rec
  per90.opp_half_rec
  per90.interceptions
  per90.dribbles
  per90.progressive_runs
  per90.touches_box
  pct.pass_accuracy
  pct.dribble_success
  pct.def_duels_won
  pct.aerial_won
  pct.long_pass_acc
  pct.cross_acc
- Prefer realistic squad-building assumptions for a Liga 1 club.
- Use common position labels like GK, CB, LB, RB, DM, CM, AM, LW, RW, ST.
- If the evidence is thin, return fewer needs rather than inventing weak points.
- Pick 3 to 6 target_metrics per need.

Here is the weaknesses payload:
{weaknesses_json}
""".strip(),
        ),
    ]
)


def _build_chain() -> ChatPromptTemplate:
    api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GOOGLE_API_KEY or GEMINI_API_KEY is not set.")

    llm = ChatGoogleGenerativeAI(
        model="gemini-3-flash-preview",
        temperature=0,
        google_api_key=api_key,
    )
    return PROMPT | llm.with_structured_output(RecruitmentNeeds)


def _fallback_recruitment_needs(weaknesses_payload: dict) -> RecruitmentNeeds:
    tactical = weaknesses_payload.get("tactical_weaknesses", []) or []
    underperformers = weaknesses_payload.get("underperforming_players", []) or []

    tactical_text = " ".join(
        f"{item.get('label', '')} {item.get('description', '')}".lower()
        for item in tactical
    )

    needs: list[RecruitmentNeed] = []
    seen_positions: set[str] = set()

    def add_need(need: RecruitmentNeed) -> None:
        if need.position in seen_positions:
            return
        seen_positions.add(need.position)
        needs.append(need)

    # Tactical-signal based defaults (no LLM dependency).
    if any(k in tactical_text for k in ["duel", "aerial", "block", "defens", "apărare", "aparare"]):
        add_need(
            RecruitmentNeed(
                position="CB",
                priority="high",
                reason="Defensive indicators suggest the back line needs stronger duel and aerial stability.",
                desired_traits=["Defensive duel dominance", "Aerial strength", "Positional awareness"],
                min_minutes=900,
                age_max=31,
                target_metrics=[
                    "subscores.Apărare",
                    "pct.def_duels_won",
                    "pct.aerial_won",
                    "per90.interceptions",
                    "subscores.Fizic",
                ],
            )
        )

    if any(k in tactical_text for k in ["attack", "atac", "finishing", "xg", "box", "chance"]):
        add_need(
            RecruitmentNeed(
                position="ST",
                priority="high",
                reason="Attacking output trends indicate a need for a more productive focal striker.",
                desired_traits=["Clinical finishing", "Box presence", "Creative link-up"],
                min_minutes=700,
                age_max=29,
                target_metrics=[
                    "subscores.Atac",
                    "per90.goals",
                    "per90.xg",
                    "per90.touches_box",
                    "subscores.Creativitate",
                ],
            )
        )

    if any(k in tactical_text for k in ["press", "recovery", "loss", "midfield", "transition"]):
        add_need(
            RecruitmentNeed(
                position="DM",
                priority="medium",
                reason="Transition and ball-recovery signals suggest adding a stronger defensive screen.",
                desired_traits=["Ball recovery", "Passing reliability", "Tactical discipline"],
                min_minutes=800,
                age_max=30,
                target_metrics=[
                    "subscores.Pressing",
                    "per90.interceptions",
                    "pct.pass_accuracy",
                    "per90.prog_passes",
                    "subscores.Apărare",
                ],
            )
        )

    # Underperformer-signal fallback if tactical text did not provide enough roles.
    position_map = {
        "gk": "GK", "cb": "CB", "lcb": "CB", "rcb": "CB", "lb": "LB", "rb": "RB",
        "dmf": "DM", "cdm": "DM", "cm": "CM", "amf": "AM", "cf": "ST", "st": "ST",
        "lw": "LW", "rw": "RW", "lwf": "LW", "rwf": "RW",
    }
    for p in underperformers:
        raw_pos = str(p.get("position", "")).lower().strip()
        pos = position_map.get(raw_pos)
        if not pos:
            continue
        if pos in {"CB", "LB", "RB", "DM", "CM", "AM", "ST", "LW", "RW", "GK"} and pos not in seen_positions:
            add_need(
                RecruitmentNeed(
                    position=pos,
                    priority="medium",
                    reason=f"Current options in {pos} include underperforming profiles and need reinforcement.",
                    desired_traits=["Consistency", "Role fit", "Reliable execution"],
                    min_minutes=600,
                    age_max=30,
                    target_metrics=["overall", "subscores.Apărare", "subscores.Pressing"],
                )
            )
        if len(needs) >= 3:
            break

    if not needs:
        add_need(
            RecruitmentNeed(
                position="CM",
                priority="medium",
                reason="Fallback baseline: reinforce central stability when model generation is unavailable.",
                desired_traits=["Ball progression", "Press resistance", "Defensive work rate"],
                min_minutes=700,
                age_max=30,
                target_metrics=["subscores.Pasare", "subscores.Pressing", "per90.prog_passes"],
            )
        )

    return RecruitmentNeeds(priority_needs=needs[:4])


def generate_recruitment_needs(weaknesses_payload: dict) -> RecruitmentNeeds:
    try:
        chain = _build_chain()
        return chain.invoke(
            {
                "weaknesses_json": json.dumps(
                    weaknesses_payload,
                    ensure_ascii=False,
                    indent=2,
                )
            }
        )
    except Exception:
        # Graceful degradation for quota/rate-limit/provider outages.
        return _fallback_recruitment_needs(weaknesses_payload)
