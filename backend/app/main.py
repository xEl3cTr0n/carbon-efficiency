from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.calculations import analyze
from app.fireworks import enrich_with_fireworks
from app.options import api_options
from app.schemas import AnalyzeRequest, AnalyzeResponse

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
