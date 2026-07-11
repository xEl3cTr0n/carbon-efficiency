from __future__ import annotations

from pydantic import BaseModel, Field, field_validator

from app.options import COOLING_TYPES, GPU_TYPES, GRID_REGIONS, WORKLOAD_TYPES


def _supported(value: str, choices: dict[str, object], label: str) -> str:
    if value not in choices:
        raise ValueError(f"Unsupported {label}: {value}")
    return value


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

    @field_validator("workload_type")
    @classmethod
    def validate_workload_type(cls, value: str) -> str:
        return _supported(value, WORKLOAD_TYPES, "workload type")

    @field_validator("gpu_type")
    @classmethod
    def validate_gpu_type(cls, value: str) -> str:
        return _supported(value, GPU_TYPES, "GPU type")

    @field_validator("grid_region")
    @classmethod
    def validate_grid_region(cls, value: str) -> str:
        return _supported(value, GRID_REGIONS, "grid region")

    @field_validator("cooling_type")
    @classmethod
    def validate_cooling_type(cls, value: str) -> str:
        return _supported(value, COOLING_TYPES, "cooling type")


class BaselineMetrics(BaseModel):
    energy_kwh_per_month: float
    carbon_kg_co2e_per_month: float
    water_liters_per_month: float
    facility_power_kw: float
    utilization_efficiency_percent: float
    workload_tokens_per_month: float
    energy_kwh_per_million_tokens: float


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
    fallback_reason: str | None = None
    provider_attempted: bool = False
    retryable: bool = False
    request_id: str | None = None


class RegionComparison(BaseModel):
    id: str
    label: str
    carbon_intensity_kg_per_kwh: float
    carbon_kg_co2e_per_month: float
    carbon_savings_kg_co2e_per_month: float
    carbon_savings_percent: float
    selected: bool = False
    source: str = "reference"


class AIProviderHealth(BaseModel):
    provider: str = "fireworks"
    status: str
    configured: bool
    model: str
    endpoint_host: str
    reason_code: str | None = None
    last_latency_ms: int = 0
    last_checked_at: str | None = None


class AnalyzeResponse(BaseModel):
    baseline: BaselineMetrics
    scenarios: list[Scenario]
    region_comparison: list[RegionComparison] = Field(default_factory=list)
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

    @field_validator("gpu_type")
    @classmethod
    def validate_gpu_type(cls, value: str) -> str:
        return _supported(value, GPU_TYPES, "GPU type")

    @field_validator("grid_region")
    @classmethod
    def validate_grid_region(cls, value: str) -> str:
        return _supported(value, GRID_REGIONS, "grid region")

    @field_validator("cooling_type")
    @classmethod
    def validate_cooling_type(cls, value: str) -> str:
        return _supported(value, COOLING_TYPES, "cooling type")


class TelemetryIngestRequest(TelemetryContext):
    samples: list[TelemetrySample] = Field(default_factory=list)
    csv_text: str | None = None


class TelemetrySimulationRequest(TelemetryContext):
    duration_minutes: int = Field(default=60, ge=10, le=24 * 60)
    target_utilization: float = Field(default=65, ge=5, le=98)
    use_ai: bool = True


class TelemetrySummary(BaseModel):
    sample_count: int
    duration_minutes: float
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
    samples: list[TelemetrySample] = Field(default_factory=list)
    summary: TelemetrySummary
    insights: list[TelemetryInsight]
    charts: TelemetryCharts
    ai_summary: str
    metadata: AnalysisMetadata = Field(default_factory=AnalysisMetadata)


class ReportRequest(BaseModel):
    scenario: AnalyzeRequest
    telemetry: TelemetryIngestRequest | None = None
    use_ai: bool = True


class ReportResponse(BaseModel):
    headline: str
    scenario: AnalyzeResponse
    telemetry: TelemetryResponse | None = None
    actions: list[str]
    executive_summary: str
    metadata: AnalysisMetadata = Field(default_factory=AnalysisMetadata)
