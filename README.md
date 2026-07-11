# CarbonBuilder

CarbonBuilder is an AI infrastructure efficiency command center for the AMD Developer Hackathon ACT II. It models data-center workload power, carbon, water, PUE, utilization, optimization scenarios, telemetry traces, and operator reports.

## AMD And Fireworks Path

The FastAPI service always calculates auditable facility metrics locally. When `FIREWORKS_API_KEY` is configured, it sends scenario metrics, telemetry summaries, and report context to a Fireworks-hosted model for recommendations. Every AI-backed response reports:

- provider
- model
- latency
- fallback status
- bounded fallback reason and retryability

No key is required to run the application. Missing credentials, timeouts, and provider errors fall back to deterministic recommendations. The judged demo should show `provider: fireworks` to demonstrate the AMD/Fireworks compute path.

## Product Shape

```text
React operator dashboard
  -> FastAPI scenario planner
  -> deterministic power/carbon/water engine
  -> synthetic telemetry simulator
  -> CSV/JSON telemetry ingestion
  -> Fireworks analysis and report narrative
```

The app does not depend on GPU droplets or live AMD hardware. It is production-shaped around telemetry adapters, so captured AMD SMI data can be imported later without changing the hosted deployment.

## Features

- Scenario planner for GPU type/count, utilization, workload scale, PUE, region, renewable coverage, and cooling type.
- Metric cards for energy, carbon, water, facility load, and utilization efficiency.
- Ranked optimization scenarios with modeled monthly savings.
- Ranked regional carbon comparison with factor provenance.
- Versioned local run ledger with two-run metric comparison.
- Telemetry studio with synthetic runs and pasted CSV import.
- Charts for power, utilization, and temperature traces.
- Fireworks-powered scenario recommendations, telemetry analysis, and executive reports.
- Downloadable Markdown operator report with scenario, metrics, provider evidence, and actions.
- Deterministic fallback mode for local development and CI.
- Optional AMD SMI collector script for future GPU VM access.
- Dockerfiles and Compose config for reproducible local execution.

## API

- `GET /api/health`
- `GET /api/health/ai`
- `GET /api/health/ready`
- `GET /api/options`
- `POST /api/analyze`
- `POST /api/telemetry/simulate`
- `POST /api/telemetry/ingest`
- `POST /api/report`

## Run Locally

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

Open `http://localhost:5173`.

Full stack:

```bash
docker compose up --build
```

## Environment

Copy `.env.example` to backend `.env` or configure the same variables in Railway. Keep `FIREWORKS_API_KEY` only in the backend environment. Never use a `VITE_` prefix for secrets.

```dotenv
FIREWORKS_API_KEY=
FIREWORKS_MODEL=accounts/fireworks/models/gpt-oss-120b
FIREWORKS_ENDPOINT=https://api.fireworks.ai/inference/v1/chat/completions
FIREWORKS_TIMEOUT_SECONDS=15
API_RATE_LIMIT_PER_MINUTE=60
VITE_API_BASE_URL=http://localhost:8000
```

The backend accepts either `https://api.fireworks.ai/inference/v1` or the full chat-completions URL and normalizes it internally. It rejects non-Fireworks hosts before attaching the bearer key. The default `gpt-oss-120b` model is available through Fireworks serverless inference; a dedicated deployment is not required.

AI-capable POST routes are limited per client by `API_RATE_LIMIT_PER_MINUTE`. Synthetic telemetry and report requests also accept `use_ai: false`; the dashboard uses that mode for its initial supporting panels so one page load spends only the scenario-analysis inference call. Manual telemetry and report actions use Fireworks normally.

For Vercel, set only:

```dotenv
VITE_API_BASE_URL=https://your-railway-backend.example
```

## Telemetry Import

Paste CSV with these columns:

```csv
timestamp,gpu_utilization_percent,power_watts,memory_used_gb,temperature_c
2026-07-10T00:00:00Z,44,5200,96,65
2026-07-10T00:05:00Z,72,6900,118,71
```

If AMD VM access becomes available, capture a CSV with:

```bash
python tools/collect_amd_smi.py --output amd-telemetry.csv --samples 24 --interval 5
```

That helper expects `amd-smi metric --json` to be available on the VM.

## Deployment

- Deploy `frontend/` to Vercel.
- Deploy `backend/` to Railway using `backend/Dockerfile`.
- Set `FIREWORKS_API_KEY`, `FIREWORKS_MODEL`, `FIREWORKS_ENDPOINT`, `FIREWORKS_TIMEOUT_SECONDS`, and `API_RATE_LIMIT_PER_MINUTE` on Railway.
- Set `VITE_API_BASE_URL` on Vercel to the Railway public URL.

The frontend never receives the Fireworks key.

After deployment, call `/api/health/ai` and then `/api/analyze`. A successful inference reports `provider: fireworks`; a deterministic fallback reports a bounded reason such as `authentication_failed`, `billing_required`, `model_or_endpoint_unavailable`, or `rate_limited` without returning provider response bodies or credentials.

## Calculation Method

- GPU IT power interpolates between an idle-power fraction and per-GPU platform power using the entered average utilization.
- Facility power applies the entered PUE; monthly energy uses 730 hours.
- Grid carbon uses versioned reference intensity and applies renewable coverage as a market-based adjustment.
- Cooling water uses a documented scenario factor per facility kWh.
- Imported telemetry energy is integrated from sample timestamps with trapezoidal power integration; invalid intervals use a five-minute fallback.
- Generated reports reuse the exact telemetry samples returned to the dashboard, preserving measured-versus-modeled provenance.
- Workload volume is reported as tokens per month and kWh per million tokens so runs can be compared on delivered work.

## Verification

```bash
pytest backend/tests
npm --prefix frontend test
npm --prefix frontend run build
```

CI mocks Fireworks. Run one local credentialed smoke test before submission to confirm the demo displays `provider: fireworks`.

## Limitations

Reference factors are scenario estimates, not utility invoices. Telemetry import supports captured or synthetic run data; it does not directly connect to DCIM, cloud billing, PDUs, water meters, schedulers, or production identity systems.
