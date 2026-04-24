@echo off
pip install fastapi uvicorn structlog
pip install -e .
uvicorn ttg_api.main:app --port 8000
