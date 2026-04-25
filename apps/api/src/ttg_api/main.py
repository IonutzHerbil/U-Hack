from fastapi import FastAPI # type: ignore
from fastapi.middleware.cors import CORSMiddleware # type: ignore
<<<<<<< HEAD
from ttg_api.routers import analytics, scraper
=======
from ttg_api.routers import analytics, players
>>>>>>> 050a72f2a4a1e318bc5ed27feb659e160035bbe1

app = FastAPI(title="TTG API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.include_router(analytics.router)
<<<<<<< HEAD
app.include_router(scraper.router)
=======
app.include_router(players.router)
>>>>>>> 050a72f2a4a1e318bc5ed27feb659e160035bbe1
