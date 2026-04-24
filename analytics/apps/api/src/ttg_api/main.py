from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from ttg_api.routers import analytics

app = FastAPI(title="TTG API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(analytics.router)