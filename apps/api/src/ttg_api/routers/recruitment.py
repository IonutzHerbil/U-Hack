from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ttg_api.candidate_shortlist import shortlist_candidates
from ttg_api.routers.analytics import weaknesses
from ttg_api.scouting_agent import generate_recruitment_needs

router = APIRouter(prefix="/api/v1/recruitment", tags=["recruitment"])


@router.get("/recommendations")
def recommendations() -> dict:
    try:
        weaknesses_payload = weaknesses()
        result = generate_recruitment_needs(weaknesses_payload)
        return result.model_dump()
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate recruitment recommendations: {exc}",
        ) from exc


@router.get("/shortlist")
def shortlist(limit_per_need: int = 4) -> dict:
    try:
        weaknesses_payload = weaknesses()
        result = generate_recruitment_needs(weaknesses_payload)
        candidates = shortlist_candidates(result.priority_needs, limit_per_need=limit_per_need)
        return {
            "priority_needs": result.model_dump()["priority_needs"],
            "shortlist": candidates,
        }
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate player shortlist: {exc}",
        ) from exc
