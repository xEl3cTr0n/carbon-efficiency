from __future__ import annotations

import csv
import math
from datetime import datetime
from io import StringIO

from app.options import COOLING_TYPES, GRID_REGIONS
from app.schemas import (
    ChartPoint,
    TelemetryCharts,
    TelemetryContext,
    TelemetryIngestRequest,
    TelemetryInsight,
    TelemetryResponse,
    TelemetrySample,
    TelemetrySimulationRequest,
    TelemetrySummary,
)


def _round(value: float) -> float:
    return round(value + 1e-9, 1)


def _grid_intensity(region: str) -> float:
    return float(GRID_REGIONS.get(region, GRID_REGIONS["us_average"])["analysis_intensity_kg_per_kwh"])


def _water_factor(cooling_type: str) -> float:
    return float(COOLING_TYPES.get(cooling_type, COOLING_TYPES["hybrid"])["water_liters_per_kwh"])


def _timestamp_seconds(value: str) -> float | None:
    try:
        if "T" in value or value.endswith("Z"):
            return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
        parts = [int(part) for part in value.split(":")]
        if len(parts) == 2:
            return float(parts[0] * 3600 + parts[1] * 60)
        if len(parts) == 3:
            return float(parts[0] * 3600 + parts[1] * 60 + parts[2])
    except (ValueError, OverflowError):
        return None
    return None


def _integrate_energy(samples: list[TelemetrySample]) -> tuple[float, float]:
    if len(samples) == 1:
        duration_seconds = 5 * 60
        return samples[0].power_watts / 1000 * duration_seconds / 3600, duration_seconds / 60

    energy_kwh = 0.0
    duration_seconds = 0.0
    for previous, current in zip(samples, samples[1:]):
        previous_time = _timestamp_seconds(previous.timestamp)
        current_time = _timestamp_seconds(current.timestamp)
        interval_seconds = (
            current_time - previous_time
            if previous_time is not None and current_time is not None
            else 5 * 60
        )
        if interval_seconds <= 0:
            interval_seconds = 5 * 60

        average_power_kw = (previous.power_watts + current.power_watts) / 2 / 1000
        energy_kwh += average_power_kw * interval_seconds / 3600
        duration_seconds += interval_seconds

    return energy_kwh, duration_seconds / 60


def parse_csv_samples(csv_text: str) -> list[TelemetrySample]:
    reader = csv.DictReader(StringIO(csv_text.strip()))
    samples: list[TelemetrySample] = []

    for row in reader:
        samples.append(
            TelemetrySample(
                timestamp=str(row["timestamp"]),
                gpu_utilization_percent=float(row["gpu_utilization_percent"]),
                power_watts=float(row["power_watts"]),
                memory_used_gb=float(row["memory_used_gb"]),
                temperature_c=float(row["temperature_c"]),
            )
        )

    return samples


def simulate_samples(request: TelemetrySimulationRequest) -> list[TelemetrySample]:
    step_count = 16
    samples: list[TelemetrySample] = []
    base_power = request.gpu_count * 760

    for index in range(step_count):
        wave = math.sin((index / step_count) * math.tau)
        alternating = -1 if index % 2 else 1
        utilization = max(3.0, min(99.0, request.target_utilization + wave * 8 + alternating * 2.4))
        power_watts = base_power * (0.42 + utilization / 155)
        memory_gb = request.gpu_count * (42 + utilization / 3.8)
        temperature = 58 + utilization * 0.23 + max(0.0, request.power_usage_effectiveness - 1.18) * 18
        label_minutes = round((request.duration_minutes / (step_count - 1)) * index)

        samples.append(
            TelemetrySample(
                timestamp=f"{label_minutes // 60:02d}:{label_minutes % 60:02d}",
                gpu_utilization_percent=_round(utilization),
                power_watts=_round(power_watts),
                memory_used_gb=_round(memory_gb),
                temperature_c=_round(temperature),
            )
        )

    return samples


def summarize_telemetry(context: TelemetryContext, samples: list[TelemetrySample]) -> TelemetrySummary:
    if not samples:
        raise ValueError("At least one telemetry sample is required")

    sample_count = len(samples)
    avg_utilization = sum(sample.gpu_utilization_percent for sample in samples) / sample_count
    peak_utilization = max(sample.gpu_utilization_percent for sample in samples)
    avg_power_kw = sum(sample.power_watts for sample in samples) / sample_count / 1000
    peak_power_kw = max(sample.power_watts for sample in samples) / 1000
    avg_temperature = sum(sample.temperature_c for sample in samples) / sample_count
    estimated_it_energy, duration_minutes = _integrate_energy(samples)
    estimated_facility_energy = estimated_it_energy * context.power_usage_effectiveness

    return TelemetrySummary(
        sample_count=sample_count,
        duration_minutes=_round(duration_minutes),
        avg_gpu_utilization_percent=_round(avg_utilization),
        peak_gpu_utilization_percent=_round(peak_utilization),
        avg_power_kw=_round(avg_power_kw),
        peak_power_kw=_round(peak_power_kw),
        avg_temperature_c=_round(avg_temperature),
        estimated_it_energy_kwh=_round(estimated_it_energy),
        estimated_facility_energy_kwh=_round(estimated_facility_energy),
        carbon_kg_co2e=_round(estimated_facility_energy * _grid_intensity(context.grid_region)),
        water_liters=_round(estimated_facility_energy * _water_factor(context.cooling_type)),
    )


def build_insights(summary: TelemetrySummary, samples: list[TelemetrySample]) -> list[TelemetryInsight]:
    insights: list[TelemetryInsight] = []
    utilization_range = summary.peak_gpu_utilization_percent - min(
        sample.gpu_utilization_percent for sample in samples
    )

    if utilization_range >= 45:
        insights.append(
            TelemetryInsight(
                severity="warning",
                title="Bursty utilization",
                detail="GPU load swings sharply across the run, which suggests batching or queue smoothing could reduce idle power.",
            )
        )

    if summary.avg_gpu_utilization_percent < 55:
        insights.append(
            TelemetryInsight(
                severity="warning",
                title="Low average utilization",
                detail="The run keeps accelerators underloaded relative to the facility power already committed.",
            )
        )
    elif summary.avg_gpu_utilization_percent >= 75:
        insights.append(
            TelemetryInsight(
                severity="success",
                title="Healthy accelerator loading",
                detail="The workload keeps GPUs materially occupied, so optimization should focus on energy source and cooling overhead.",
            )
        )

    if summary.avg_temperature_c >= 78:
        insights.append(
            TelemetryInsight(
                severity="warning",
                title="Thermal pressure",
                detail="Average temperature is high enough to justify checking airflow, coolant supply, and fan curves.",
            )
        )

    if not insights:
        insights.append(
            TelemetryInsight(
                severity="info",
                title="Stable run profile",
                detail="Telemetry is consistent enough to use as a baseline for scenario comparisons and reporting.",
            )
        )

    return insights


def build_charts(samples: list[TelemetrySample]) -> TelemetryCharts:
    return TelemetryCharts(
        power=[
            ChartPoint(label=sample.timestamp, value=_round(sample.power_watts / 1000))
            for sample in samples
        ],
        utilization=[
            ChartPoint(label=sample.timestamp, value=sample.gpu_utilization_percent)
            for sample in samples
        ],
        temperature=[ChartPoint(label=sample.timestamp, value=sample.temperature_c) for sample in samples],
    )


def offline_telemetry_summary(summary: TelemetrySummary, insights: list[TelemetryInsight]) -> str:
    top = insights[0]
    return (
        f"{top.title}: {top.detail} The run averaged "
        f"{summary.avg_gpu_utilization_percent}% utilization and {summary.avg_power_kw} kW IT load."
    )


def build_telemetry_response(
    context: TelemetryContext,
    samples: list[TelemetrySample],
    source: str | None = None,
) -> TelemetryResponse:
    summary = summarize_telemetry(context, samples)
    insights = build_insights(summary, samples)
    return TelemetryResponse(
        source=source or context.source,
        workload_name=context.workload_name,
        samples=samples,
        summary=summary,
        insights=insights,
        charts=build_charts(samples),
        ai_summary=offline_telemetry_summary(summary, insights),
    )


def ingest_telemetry(request: TelemetryIngestRequest) -> TelemetryResponse:
    samples = parse_csv_samples(request.csv_text) if request.csv_text else request.samples
    return build_telemetry_response(request, samples)


def simulate_telemetry(request: TelemetrySimulationRequest) -> TelemetryResponse:
    return build_telemetry_response(request, simulate_samples(request), source="synthetic")
