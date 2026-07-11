from __future__ import annotations

import logging
import math
import os
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from urllib.parse import urlparse
from uuid import uuid4

import httpx

from app.schemas import (
    AIProviderHealth,
    AnalyzeRequest,
    AnalyzeResponse,
    AnalysisMetadata,
    ReportResponse,
    TelemetryResponse,
)

DEFAULT_ENDPOINT = "https://api.fireworks.ai/inference/v1/chat/completions"
DEFAULT_MODEL = "accounts/fireworks/models/gpt-oss-120b"
DEFAULT_TIMEOUT_SECONDS = 15.0
MAX_TIMEOUT_SECONDS = 20.0
ALLOWED_ENDPOINT_HOSTS = {"api.fireworks.ai"}

logger = logging.getLogger(__name__)

_provider_state: dict[str, object] = {
    "status": "unconfigured",
    "reason_code": "not_configured",
    "last_latency_ms": 0,
    "last_checked_at": None,
}


@dataclass(frozen=True)
class CompletionResult:
    content: str | None
    metadata: AnalysisMetadata


class FireworksConfigurationError(ValueError):
    pass


def _api_key() -> str | None:
    value = os.getenv("FIREWORKS_API_KEY", "").strip()
    return value or None


def _model() -> str:
    return os.getenv("FIREWORKS_MODEL", DEFAULT_MODEL).strip() or DEFAULT_MODEL


def _endpoint() -> str:
    raw = os.getenv("FIREWORKS_ENDPOINT", DEFAULT_ENDPOINT).strip() or DEFAULT_ENDPOINT
    normalized = raw.rstrip("/")
    if normalized.endswith("/inference/v1"):
        normalized = f"{normalized}/chat/completions"

    parsed = urlparse(normalized)
    if parsed.scheme != "https" or parsed.hostname not in ALLOWED_ENDPOINT_HOSTS:
        raise FireworksConfigurationError("Fireworks endpoint must use the official HTTPS host")
    if not parsed.path.endswith("/chat/completions"):
        raise FireworksConfigurationError("Fireworks endpoint must target chat completions")
    return normalized


def _timeout_seconds() -> float:
    raw = os.getenv("FIREWORKS_TIMEOUT_SECONDS", str(DEFAULT_TIMEOUT_SECONDS)).strip()
    try:
        value = float(raw)
    except ValueError:
        return DEFAULT_TIMEOUT_SECONDS
    if not math.isfinite(value) or value <= 0:
        return DEFAULT_TIMEOUT_SECONDS
    return min(value, MAX_TIMEOUT_SECONDS)


def _now() -> str:
    return datetime.now(UTC).isoformat()


def _reason_for_exception(exc: Exception) -> tuple[str, bool]:
    if isinstance(exc, FireworksConfigurationError):
        return "invalid_configuration", False
    if isinstance(exc, httpx.TimeoutException):
        return "timeout", True
    if isinstance(exc, httpx.NetworkError):
        return "network_error", True
    if isinstance(exc, httpx.HTTPStatusError):
        status = exc.response.status_code
        if status in {401, 403}:
            return "authentication_failed", False
        if status == 402:
            return "billing_required", False
        if status == 404:
            return "model_or_endpoint_unavailable", False
        if status == 429:
            return "rate_limited", True
        if status >= 500:
            return "provider_unavailable", True
        return "request_rejected", False
    if isinstance(exc, (KeyError, TypeError, ValueError)):
        return "invalid_response", True
    return "unexpected_error", True


def _record_provider_state(status: str, reason_code: str | None, latency_ms: int) -> None:
    _provider_state.update(
        status=status,
        reason_code=reason_code,
        last_latency_ms=latency_ms,
        last_checked_at=_now(),
    )


def provider_health() -> AIProviderHealth:
    configured = _api_key() is not None
    status = str(_provider_state["status"])
    reason_code = _provider_state["reason_code"]

    if not configured:
        status = "unconfigured"
        reason_code = "not_configured"
    elif status == "unconfigured":
        status = "configured"
        reason_code = None

    try:
        endpoint_host = urlparse(_endpoint()).hostname or "api.fireworks.ai"
    except FireworksConfigurationError:
        endpoint_host = "invalid"
        status = "degraded"
        reason_code = "invalid_configuration"

    return AIProviderHealth(
        status=status,
        configured=configured,
        model=_model(),
        endpoint_host=endpoint_host,
        reason_code=str(reason_code) if reason_code else None,
        last_latency_ms=int(_provider_state["last_latency_ms"]),
        last_checked_at=(
            str(_provider_state["last_checked_at"])
            if _provider_state["last_checked_at"]
            else None
        ),
    )


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


async def _fireworks_completion(
    prompt: str,
    system: str,
    *,
    max_tokens: int = 260,
) -> CompletionResult:
    api_key = _api_key()
    request_id = str(uuid4())

    if not api_key:
        _record_provider_state("unconfigured", "not_configured", 0)
        return CompletionResult(
            content=None,
            metadata=AnalysisMetadata(
                fallback_reason="not_configured",
                request_id=request_id,
            ),
        )

    started = time.perf_counter()
    try:
        endpoint = _endpoint()
        model = _model()
        async with httpx.AsyncClient(timeout=_timeout_seconds()) as client:
            result = await client.post(
                endpoint,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": model,
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": prompt},
                    ],
                    "temperature": 0.2,
                    "max_tokens": max_tokens,
                },
            )
            result.raise_for_status()
            payload = result.json()
            content = payload["choices"][0]["message"]["content"].strip()
            if not content:
                raise ValueError("empty provider response")
    except Exception as exc:
        latency_ms = max(0, int((time.perf_counter() - started) * 1000))
        reason_code, retryable = _reason_for_exception(exc)
        _record_provider_state("degraded", reason_code, latency_ms)
        logger.warning(
            "fireworks_fallback reason=%s request_id=%s latency_ms=%s",
            reason_code,
            request_id,
            latency_ms,
        )
        return CompletionResult(
            content=None,
            metadata=AnalysisMetadata(
                latency_ms=latency_ms,
                fallback_reason=reason_code,
                provider_attempted=True,
                retryable=retryable,
                request_id=request_id,
            ),
        )

    latency_ms = max(0, int((time.perf_counter() - started) * 1000))
    _record_provider_state("ready", None, latency_ms)
    return CompletionResult(
        content=content,
        metadata=AnalysisMetadata(
            provider="fireworks",
            model=model,
            latency_ms=latency_ms,
            fallback_used=False,
            provider_attempted=True,
            request_id=request_id,
        ),
    )


async def enrich_with_fireworks(request: AnalyzeRequest, response: AnalyzeResponse) -> AnalyzeResponse:
    result = await _fireworks_completion(
        _prompt(request, response),
        "Return a concise, operational carbon-efficiency recommendation.",
        max_tokens=220,
    )
    if result.content:
        response.ai_recommendation = result.content
    response.metadata = result.metadata
    return response


async def enrich_telemetry_with_fireworks(response: TelemetryResponse) -> TelemetryResponse:
    prompt = (
        "Explain this AI infrastructure telemetry run for an operations lead. "
        f"Workload: {response.workload_name}. "
        f"Average utilization: {response.summary.avg_gpu_utilization_percent}%. "
        f"Peak utilization: {response.summary.peak_gpu_utilization_percent}%. "
        f"Average IT load: {response.summary.avg_power_kw} kW. "
        f"Facility energy: {response.summary.estimated_facility_energy_kwh} kWh. "
        f"Carbon: {response.summary.carbon_kg_co2e} kg CO2e. "
        f"Top insight: {response.insights[0].title} - {response.insights[0].detail}"
    )
    result = await _fireworks_completion(
        prompt,
        "Return one concise telemetry analysis with a concrete action. Do not invent metrics.",
    )
    if result.content:
        response.ai_summary = result.content
    response.metadata = result.metadata
    return response


async def enrich_report_with_fireworks(response: ReportResponse) -> ReportResponse:
    telemetry_summary = "No telemetry uploaded."
    if response.telemetry:
        telemetry_summary = (
            f"Telemetry averaged {response.telemetry.summary.avg_gpu_utilization_percent}% utilization, "
            f"{response.telemetry.summary.avg_power_kw} kW IT load, and "
            f"{response.telemetry.summary.carbon_kg_co2e} kg CO2e for the sampled run."
        )

    prompt = (
        "Write an executive summary for a carbon efficiency demo report. "
        f"Monthly scenario energy: {response.scenario.baseline.energy_kwh_per_month} kWh. "
        f"Monthly scenario carbon: {response.scenario.baseline.carbon_kg_co2e_per_month} kg CO2e. "
        f"Top scenario: {response.scenario.scenarios[0].title} saves "
        f"{response.scenario.scenarios[0].carbon_savings_percent}% modeled carbon. "
        f"{telemetry_summary} "
        f"Recommended actions: {'; '.join(response.actions[:4])}."
    )
    result = await _fireworks_completion(
        prompt,
        "Return a concise operator-facing summary. Keep it grounded in the provided numbers.",
    )
    if result.content:
        response.executive_summary = result.content
    response.metadata = result.metadata
    return response
