from __future__ import annotations

from pydantic import BaseModel, Field


class AnalyzeRequest(BaseModel):
    workload_type: str = "llm_inference"
    monthly_requests: int = Field(default=6_000_000, ge=1)
    avg_tokens_per_request: int = Field(default=750, ge=1)
    gpu_count: int = Field(default=16, ge=1, le=50_000)
    gpu_type: str = "AMD MI300X"
    avg_gpu_utilization: float = Field(default=55, ge=1, le=100)
    power_usage_effectiveness: float = Field(default=1.25, ge=1, le=3)
    grid_region: str = "california"
    renewable_percent: float = Field(default=25, ge=0, le=100)
    cooling_type: str = "hybrid"


class BaselineMetrics(BaseModel):
    energy_kwh_per_month: float
    carbon_kg_co2e_per_month: float
    water_liters_per_month: float
    facility_power_kw: float
    utilization_efficiency_percent: float


class Scenario(BaseModel):
    id: str
    title: str
    description: str
    energy_savings_kwh_per_month: float
    carbon_savings_kg_co2e_per_month: float
    carbon_savings_percent: float


class AnalysisMetadata(BaseModel):
    provider: str = "offline"
    model: str = "deterministic-local"
    latency_ms: int = 0
    fallback_used: bool = True


class AnalyzeResponse(BaseModel):
    baseline: BaselineMetrics
    scenarios: list[Scenario]
    ai_recommendation: str
    metadata: AnalysisMetadata = Field(default_factory=AnalysisMetadata)
