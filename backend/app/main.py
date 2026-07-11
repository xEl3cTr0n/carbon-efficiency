from __future__ import annotations

import os
import time
from collections import defaultdict, deque
from threading import Lock

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi import Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.calculations import analyze
from app.fireworks import (
    enrich_report_with_fireworks,
    enrich_telemetry_with_fireworks,
    enrich_with_fireworks,
    provider_health,
)
from app.options import api_options
from app.reports import build_report
from app.schemas import (
    AIProviderHealth,
    AnalyzeRequest,
    AnalyzeResponse,
    AnalysisMetadata,
    ReportRequest,
    ReportResponse,
    TelemetryIngestRequest,
    TelemetryResponse,
    TelemetrySimulationRequest,
)
from app.telemetry import ingest_telemetry, simulate_telemetry

load_dotenv()

app = FastAPI(title="CarbonBuilder API", version="0.1.0")

AI_POST_PATHS = {
    "/api/analyze",
    "/api/telemetry/simulate",
    "/api/telemetry/ingest",
    "/api/report",
}
_rate_windows: dict[str, deque[float]] = defaultdict(deque)
_rate_lock = Lock()


def _rate_limit_per_minute() -> int:
    try:
        return max(1, min(1000, int(os.getenv("API_RATE_LIMIT_PER_MINUTE", "60"))))
    except ValueError:
        return 60


def _client_key(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
    return forwarded or (request.client.host if request.client else "unknown")


@app.middleware("http")
async def limit_ai_requests(request: Request, call_next):
    if request.method == "POST" and request.url.path in AI_POST_PATHS:
        now = time.monotonic()
        cutoff = now - 60
        key = _client_key(request)
        with _rate_lock:
            window = _rate_windows[key]
            while window and window[0] <= cutoff:
                window.popleft()
            if len(window) >= _rate_limit_per_minute():
                return JSONResponse(
                    status_code=429,
                    content={"detail": "AI request rate limit exceeded; retry in under one minute."},
                    headers={"Retry-After": "60"},
                )
            window.append(now)

    return await call_next(request)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/health/ai", response_model=AIProviderHealth)
@app.get("/api/health/ready", response_model=AIProviderHealth)
def ai_health() -> AIProviderHealth:
    return provider_health()


@app.get("/api/options")
def options() -> dict[str, object]:
    return api_options()


@app.post("/api/analyze", response_model=AnalyzeResponse)
async def analyze_endpoint(request: AnalyzeRequest) -> AnalyzeResponse:
    deterministic = analyze(request)
    return await enrich_with_fireworks(request, deterministic)


@app.post("/api/telemetry/simulate", response_model=TelemetryResponse)
async def simulate_telemetry_endpoint(request: TelemetrySimulationRequest) -> TelemetryResponse:
    deterministic = simulate_telemetry(request)
    if not request.use_ai:
        deterministic.metadata = AnalysisMetadata(fallback_reason="skipped_by_request")
        return deterministic
    return await enrich_telemetry_with_fireworks(deterministic)


@app.post("/api/telemetry/ingest", response_model=TelemetryResponse)
async def ingest_telemetry_endpoint(request: TelemetryIngestRequest) -> TelemetryResponse:
    try:
        deterministic = ingest_telemetry(request)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return await enrich_telemetry_with_fireworks(deterministic)


@app.post("/api/report", response_model=ReportResponse)
async def report_endpoint(request: ReportRequest) -> ReportResponse:
    try:
        deterministic = build_report(request)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if not request.use_ai:
        deterministic.metadata = AnalysisMetadata(fallback_reason="skipped_by_request")
        return deterministic
    return await enrich_report_with_fireworks(deterministic)
