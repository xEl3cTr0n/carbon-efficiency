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


class TelemetrySample(BaseModel):
    timestamp: str
    gpu_utilization_percent: float = Field(ge=0, le=100)
    power_watts: float = Field(ge=0)
    memory_used_gb: float = Field(ge=0)
    temperature_c: float = Field(ge=0)


class TelemetryContext(BaseModel):
    source: str = "manual-json"
    workload_name: str = "AI workload"
    gpu_type: str = "AMD MI300X"
    gpu_count: int = Field(default=8, ge=1, le=50_000)
    grid_region: str = "california"
    cooling_type: str = "hybrid"
    power_usage_effectiveness: float = Field(default=1.25, ge=1, le=3)


class TelemetryIngestRequest(TelemetryContext):
    samples: list[TelemetrySample] = Field(default_factory=list)
    csv_text: str | None = None


class TelemetrySimulationRequest(TelemetryContext):
    duration_minutes: int = Field(default=60, ge=10, le=24 * 60)
    target_utilization: float = Field(default=65, ge=5, le=98)


class TelemetrySummary(BaseModel):
    sample_count: int
    avg_gpu_utilization_percent: float
    peak_gpu_utilization_percent: float
    avg_power_kw: float
    peak_power_kw: float
    avg_temperature_c: float
    estimated_it_energy_kwh: float
    estimated_facility_energy_kwh: float
    carbon_kg_co2e: float
    water_liters: float


class TelemetryInsight(BaseModel):
    severity: str
    title: str
    detail: str


class ChartPoint(BaseModel):
    label: str
    value: float


class TelemetryCharts(BaseModel):
    power: list[ChartPoint]
    utilization: list[ChartPoint]
    temperature: list[ChartPoint]


class TelemetryResponse(BaseModel):
    source: str
    workload_name: str
    summary: TelemetrySummary
    insights: list[TelemetryInsight]
    charts: TelemetryCharts
    ai_summary: str
    metadata: AnalysisMetadata = Field(default_factory=AnalysisMetadata)


class ReportRequest(BaseModel):
    scenario: AnalyzeRequest
    telemetry: TelemetryIngestRequest | None = None


class ReportResponse(BaseModel):
    headline: str
    scenario: AnalyzeResponse
    telemetry: TelemetryResponse | None = None
    actions: list[str]
    executive_summary: str
    metadata: AnalysisMetadata = Field(default_factory=AnalysisMetadata)
