@echo off
pushd %~dp0
pip install fastapi uvicorn structlog
pip install -e .
uvicorn ttg_api.main:app --port 8000
popd
