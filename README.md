# CarbonPilot

Agentic carbon, energy, and water footprint analyzer for AI workloads.
Built for AMD Developer Hackathon Act II.

Describe a workload in plain English ("fine-tune a 70B model on 8 MI300X
GPUs in Virginia for 24 hours") and the agent parses it, calculates
energy/carbon/water impact, and recommends greener GPU/region
alternatives — with live grid carbon-intensity data and (optionally)
real GPU power telemetry layered on top.

## Scope

This is an **estimator + live-monitoring layer**, not a data-center
management platform. It reasons over:
- Static reference data: GPU TDP/specs, PUE, water-usage-effectiveness by region
- Live data (Tier 1): real-time grid carbon intensity via ElectricityMaps, and real GPU power draw via `nvidia-smi`/`rocm-smi` if you're on real hardware

It does **not** connect to real data-center management systems (DCIM,
PDUs, Redfish/IPMI) — that's a possible Tier 2 stretch goal, not in
this scaffold.

## Project layout

```
backend/
  main.py              FastAPI app entry
  config.py             env/config loading
  routers/
    estimate.py          POST /estimate (agent), POST /estimate/manual, GET /estimate/regions, /gpus
    live.py               GET /live/carbon-intensity, GET /live/gpu, WS /live/stream
    ingest.py              POST /ingest/gpu  <- poller pushes telemetry here
  services/
    calc_engine.py         energy/carbon/water math, alternative-region comparison
    electricitymaps.py     live carbon-intensity client (falls back to static data with no key)
    gpu_metrics.py          in-memory ring buffer of live GPU readings
  agents/
    carbon_agent.py         tool-calling agent: Fireworks (AMD MI300X-hosted models) > Claude > regex fallback
    gpu_poller.py            polls nvidia-smi/rocm-smi (or --mock) and pushes to /ingest/gpu
  data/
    gpu_specs.json           TDP + TFLOPs for A100/H100/MI250/MI300X
    regions.json              carbon intensity, PUE, WUE per region

frontend/               Vite + React + Tailwind v4 dashboard
  src/
    App.jsx
    api.js
    hooks/useLiveStream.js   WebSocket hook for the live stream
    components/               WorkloadForm, StatTiles, AgentTrace, RegionTable, LiveTicker, Sparkline
```

## Running it

### Backend

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in keys below if you have them
uvicorn main:app --reload
```

Works with **zero API keys**: `/estimate` falls back to a regex parser,
and `/live/carbon-intensity` falls back to the static values in
`regions.json` instead of live ElectricityMaps data. Add keys to
upgrade to live/agentic mode:

- `FIREWORKS_API_KEY` — tried first. Fireworks serves several open models
  on real AMD Instinct MI300X hardware, so this makes the agent's own
  reasoning run on AMD compute — the strongest AMD-track story we have.
  OpenAI-compatible API, get a key at https://app.fireworks.ai/
- `ANTHROPIC_API_KEY` — tried second if no Fireworks key.
- `ELECTRICITYMAPS_API_KEY` — live grid carbon intensity (independent of the above).

If the configured LLM call fails for any reason (bad key, rate limit,
network) `/estimate` automatically falls back to the regex parser and
surfaces the failure in the trace instead of erroring out — a live-demo
safety net.

> Note: if `python3 -m venv` fails with an `ensurepip` or `pyexpat`
> error on macOS/Homebrew Python, your local Python install is broken
> (expat library mismatch) — `brew reinstall python@3.14` (or whichever
> version `python3 --version` reports) before proceeding.

### GPU telemetry poller (optional, for the live power sparkline)

No GPU on your laptop? Run it in mock mode — simulates plausible power
draw so the live pipeline is fully testable before you're on real
hackathon hardware:

```bash
cd backend
python -m agents.gpu_poller --mock --node-id dev-laptop --gpu-type MI300X
```

On real hardware:
```bash
python -m agents.gpu_poller --vendor amd --node-id node-1 --gpu-type MI300X
# or --vendor nvidia
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Opens on `http://localhost:5173`, talks to the backend on `:8000` by
default (override with `VITE_API_BASE` in a `frontend/.env`).

## Getting a live ElectricityMaps key

Free-tier signup: https://portal.electricitymaps.com/ — takes minutes,
no approval wait (unlike WattTime). Drop the key into `backend/.env`.

## Roadmap / Tier 2 (stretch)

- Real server/rack power via IPMI or Redfish if we get access to real hardware
- PDU-level metering (SNMP/REST) for rack-level oversight
- Cloud provider carbon APIs (AWS/GCP/Azure) as a later, account-scoped data source
