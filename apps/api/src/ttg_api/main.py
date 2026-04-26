from fastapi import FastAPI # type: ignore
from fastapi.middleware.cors import CORSMiddleware # type: ignore
from ttg_api.routers import analytics, players, recruitment, scraper, images, scraper_web

app = FastAPI(title="TTG API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(analytics.router)
app.include_router(players.router)
app.include_router(recruitment.router)
app.include_router(scraper.router)
app.include_router(scraper_web.router)
app.include_router(images.router)
