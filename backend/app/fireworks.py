from __future__ import annotations

import os
import time

import httpx

from app.schemas import AnalyzeRequest, AnalyzeResponse, AnalysisMetadata

DEFAULT_ENDPOINT = "https://api.fireworks.ai/inference/v1/chat/completions"
DEFAULT_MODEL = "accounts/fireworks/models/kimi-k2-instruct-0905"
DEFAULT_TIMEOUT_SECONDS = 15.0
MAX_TIMEOUT_SECONDS = 20.0


def _timeout_seconds() -> float:
    raw = os.getenv("FIREWORKS_TIMEOUT_SECONDS", str(DEFAULT_TIMEOUT_SECONDS))
    try:
        return min(float(raw), MAX_TIMEOUT_SECONDS)
    except ValueError:
        return DEFAULT_TIMEOUT_SECONDS


def _prompt(request: AnalyzeRequest, response: AnalyzeResponse) -> str:
    scenarios = ", ".join(
        f"{scenario.title}: {scenario.carbon_savings_percent}% carbon savings"
        for scenario in response.scenarios[:3]
    )
    return (
        "You are advising a data-center engineering team on carbon efficiency. "
        "Give one concise recommendation grounded in these modeled metrics. "
        f"GPU fleet: {request.gpu_count} {request.gpu_type}. "
        f"Utilization: {request.avg_gpu_utilization}%. "
        f"Renewable coverage: {request.renewable_percent}%. "
        f"Monthly energy: {response.baseline.energy_kwh_per_month} kWh. "
        f"Monthly carbon: {response.baseline.carbon_kg_co2e_per_month} kg CO2e. "
        f"Scenarios: {scenarios}."
    )


async def enrich_with_fireworks(request: AnalyzeRequest, response: AnalyzeResponse) -> AnalyzeResponse:
    api_key = os.getenv("FIREWORKS_API_KEY")
    endpoint = os.getenv("FIREWORKS_ENDPOINT", DEFAULT_ENDPOINT)
    model = os.getenv("FIREWORKS_MODEL", DEFAULT_MODEL)
    timeout = _timeout_seconds()

    if not api_key:
        response.metadata = AnalysisMetadata(
            provider="offline",
            model="deterministic-local",
            latency_ms=0,
            fallback_used=True,
        )
        return response

    started = time.perf_counter()
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            result = await client.post(
                endpoint,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": model,
                    "messages": [
                        {
                            "role": "system",
                            "content": "Return a concise, operational carbon-efficiency recommendation.",
                        },
                        {"role": "user", "content": _prompt(request, response)},
                    ],
                    "temperature": 0.2,
                    "max_tokens": 220,
                },
            )
            result.raise_for_status()
            payload = result.json()
            content = payload["choices"][0]["message"]["content"].strip()
            if not content:
                raise ValueError("Fireworks returned an empty recommendation")
    except Exception:
        response.metadata = AnalysisMetadata(
            provider="offline",
            model="deterministic-local",
            latency_ms=max(0, int((time.perf_counter() - started) * 1000)),
            fallback_used=True,
        )
        return response

    response.ai_recommendation = content
    response.metadata = AnalysisMetadata(
        provider="fireworks",
        model=model,
        latency_ms=max(0, int((time.perf_counter() - started) * 1000)),
        fallback_used=False,
    )
    return response
