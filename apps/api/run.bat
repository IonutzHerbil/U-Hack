@echo off
pushd %~dp0
pip install fastapi uvicorn structlog
pip install ddgs newspaper3k google-generativeai lxml_html_clean
pip install -e .
uvicorn ttg_api.main:app --port 8000
popd
