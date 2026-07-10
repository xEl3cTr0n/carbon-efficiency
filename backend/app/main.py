from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.calculations import analyze
from app.fireworks import (
    enrich_report_with_fireworks,
    enrich_telemetry_with_fireworks,
    enrich_with_fireworks,
)
from app.options import api_options
from app.reports import build_report
from app.schemas import (
    AnalyzeRequest,
    AnalyzeResponse,
    ReportRequest,
    ReportResponse,
    TelemetryIngestRequest,
    TelemetryResponse,
    TelemetrySimulationRequest,
)
from app.telemetry import ingest_telemetry, simulate_telemetry

app = FastAPI(title="CarbonBuilder API", version="0.1.0")

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
    return await enrich_telemetry_with_fireworks(deterministic)


@app.post("/api/telemetry/ingest", response_model=TelemetryResponse)
async def ingest_telemetry_endpoint(request: TelemetryIngestRequest) -> TelemetryResponse:
    deterministic = ingest_telemetry(request)
    return await enrich_telemetry_with_fireworks(deterministic)


@app.post("/api/report", response_model=ReportResponse)
async def report_endpoint(request: ReportRequest) -> ReportResponse:
    deterministic = build_report(request)
    return await enrich_report_with_fireworks(deterministic)
