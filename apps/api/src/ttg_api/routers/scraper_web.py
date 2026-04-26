"""
routers/scraper.py — Player risk profiling via web scraper.

Loads web-scraper/main.py lazily on first request so that a missing
dependency (e.g. google-generativeai not yet installed) does NOT crash
uvicorn startup and does NOT break any other endpoint.
"""

from __future__ import annotations

import asyncio
import importlib.util
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/api/v1/scraper", tags=["scraper"])

_SCRAPER_MAIN = Path(__file__).resolve().parents[5] / "web-scraper" / "main.py"
print(f"[scraper] Scraper main.py expected at {_SCRAPER_MAIN}")
_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="scraper")

# Loaded once on first request; None until then.
_build_player_profile = None
_load_error: str | None = None


def _load_scraper() -> None:
    """Import web-scraper/main.py and cache build_player_profile."""
    global _build_player_profile, _load_error
    if _build_player_profile is not None or _load_error is not None:
        return
    try:
        if not _SCRAPER_MAIN.exists():
            raise FileNotFoundError(f"Scraper not found at {_SCRAPER_MAIN}")
        spec = importlib.util.spec_from_file_location("web_scraper_main", _SCRAPER_MAIN)
        mod = importlib.util.module_from_spec(spec)
        
        if spec is None or spec.loader is None:
            raise ImportError("Could not load scraper module")
        spec.loader.exec_module(mod)

        _build_player_profile = mod.build_player_profile
        print(f"[scraper] Loaded OK from {_SCRAPER_MAIN}")
    except Exception as exc:
        _load_error = f"{type(exc).__name__}: {exc}"
        print(f"[scraper] Load failed — {_load_error}")


@router.get("/player/{player_name}")
async def player_risk(player_name: str) -> dict[str, Any]:
    """
    Scrape web articles for *player_name* and return a risk + character profile.
    First call triggers a one-time import of the scraper module.
    """
    _load_scraper()

    if _load_error:
        raise HTTPException(
            status_code=503,
            detail=f"Scraper module failed to load: {_load_error}. "
                   f"Make sure all dependencies are installed "
                   f"(ddgs, newspaper3k, google-generativeai, lxml_html_clean).",
        )

    loop = asyncio.get_running_loop()
    result: dict[str, Any] = await loop.run_in_executor(
        _executor, _build_player_profile, player_name
    )
    return result
