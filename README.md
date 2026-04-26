# TTG Scout

Lightweight scouting platform for **U Cluj**:
- track team strengths and weaknesses
- inspect squad analytics
- generate AI-powered recruitment needs
- shortlist Liga 1 players that fit the team's gaps

## What It Does

**Team Lens**
- U Cluj overview
- tactical profile
- weak points and underperformers

**Squad Lens**
- player ratings
- per-90 stats
- searchable squad data

**Scout Lens**
- AI interprets `/api/v1/ucluj/weaknesses`
- suggests priority roles to recruit
- matches those needs against Liga 1 player data

## Stack

- `FastAPI` for the backend
- `Electron` for the desktop app
- `LangChain + Gemini` for scouting recommendations
- CSV/JSON analytics generated from match data

## Project Layout

```text
apps/api      FastAPI backend + scouting logic
apps/desktop  Electron desktop client
analytics/    aggregation scripts and analysis generation
resources/    assets
```

## Main Endpoints

- `/api/v1/ucluj/overview`
- `/api/v1/ucluj/weaknesses`
- `/api/v1/recruitment/recommendations`
- `/api/v1/recruitment/shortlist`

## Run It

### 1. Start the API

From `apps/api`:

```powershell
$env:GOOGLE_API_KEY="your_key_here"
python -m pip install -e .
python -m pip install langchain-google-genai
python -m uvicorn ttg_api.main:app --port 8000
```

API docs:

```text
http://localhost:8000/docs
```

### 2. Start the Desktop App

From `apps/desktop`:

```powershell
npm install
npm run build
npm start
```

## Quick Flow

1. Backend loads U Cluj analytics and Liga 1 player data.
2. Gemini interprets team weaknesses into recruitment priorities.
3. The shortlist endpoint ranks external players by fit.
4. The desktop app visualizes the results.

## Useful Notes

- `GOOGLE_API_KEY` is required for the AI recruitment endpoints.
- If `uvicorn` is not found, use `python -m uvicorn ...`.
- The shortlist endpoint uses `apps/api/src/dataframe/baza_date_restul_jucatorilor.csv`.

## Demo URLs

```text
http://localhost:8000/api/v1/ucluj/weaknesses
http://localhost:8000/api/v1/recruitment/recommendations
http://localhost:8000/api/v1/recruitment/shortlist
```
