# CarbonBuilder

CarbonBuilder is a data-center scenario planner for AI workload power, carbon, water, PUE, and utilization efficiency. It was built for Track 3 of the AMD Developer Hackathon ACT II.

## AMD and Fireworks path

The FastAPI service always calculates auditable facility metrics locally. When `FIREWORKS_API_KEY` is configured, it sends those metrics and ranked scenarios to a Fireworks-hosted model for an operational recommendation. Every response reports the provider, model, latency, and whether deterministic fallback was used. This gives the repository and demo explicit evidence of the hackathon AMD/Fireworks compute path without making the calculator dependent on an LLM.

No key is required to run the application. Missing credentials, timeouts, and provider errors fall back to a deterministic recommendation.

## Architecture

```text
React dashboard -> FastAPI -> deterministic facility calculator
                         \-> Fireworks recommendation (optional)
```

The MVP deliberately focuses on scenario planning rather than telemetry ingestion or DCIM control.

## Run locally

Backend:

```bash
cd backend
python3.12 -m venv .venv
source .venv/bin/activate
pip install -e '.[test]'
uvicorn app.main:app --reload
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. Run the full stack with `docker compose up --build`.

## Environment

Copy `.env.example` to `.env`. Keep `FIREWORKS_API_KEY` only in the backend environment. Never use a `VITE_` prefix for secrets.

## API

- `GET /api/health`
- `GET /api/options`
- `POST /api/analyze`

## Tests

```bash
pytest backend/tests
cd frontend && npm test && npm run build
```

## Deployment

- Deploy `frontend/` to Vercel and set `VITE_API_BASE_URL` to the Railway service URL.
- Deploy `backend/` to Railway using its Dockerfile.
- Set `FIREWORKS_API_KEY`, `FIREWORKS_MODEL`, and the allowed frontend origin in Railway.

The application remains usable if Fireworks is temporarily unavailable, but the judged demo should show `provider: fireworks` to demonstrate AMD compute usage.

## Limitations

Reference factors are scenario estimates, not utility invoices. The MVP does not connect to live GPU telemetry, PDUs, facility water meters, cloud accounts, or production scheduling systems.
