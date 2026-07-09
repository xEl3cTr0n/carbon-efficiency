from __future__ import annotations

from app.options import COOLING_TYPES, GPU_TYPES, GRID_REGIONS
from app.schemas import AnalyzeRequest, AnalyzeResponse, BaselineMetrics, Scenario

HOURS_PER_MONTH = 730


def _round(value: float) -> float:
    return round(value + 1e-9, 1)


def _gpu_profile(gpu_type: str) -> dict[str, float]:
    return GPU_TYPES.get(gpu_type, GPU_TYPES["AMD MI300X"])


def _grid_profile(region: str) -> dict[str, float | str]:
    return GRID_REGIONS.get(region, GRID_REGIONS["us_average"])


def _cooling_profile(cooling_type: str) -> dict[str, float | str]:
    return COOLING_TYPES.get(cooling_type, COOLING_TYPES["hybrid"])


def baseline_metrics(request: AnalyzeRequest) -> BaselineMetrics:
    gpu = _gpu_profile(request.gpu_type)
    grid = _grid_profile(request.grid_region)
    cooling = _cooling_profile(request.cooling_type)

    facility_power_kw = request.gpu_count * gpu["platform_kw_per_gpu"] * request.power_usage_effectiveness
    energy_kwh = facility_power_kw * HOURS_PER_MONTH
    intensity = float(grid["analysis_intensity_kg_per_kwh"])
    carbon_kg = energy_kwh * intensity
    water_liters = energy_kwh * float(cooling["water_liters_per_kwh"])
    utilization_efficiency = min(98.0, request.avg_gpu_utilization * 1.13548)

    return BaselineMetrics(
        energy_kwh_per_month=_round(energy_kwh),
        carbon_kg_co2e_per_month=_round(carbon_kg),
        water_liters_per_month=_round(water_liters),
        facility_power_kw=_round(facility_power_kw),
        utilization_efficiency_percent=_round(utilization_efficiency),
    )


def build_scenarios(request: AnalyzeRequest, baseline: BaselineMetrics) -> list[Scenario]:
    utilization_gap = max(0.0, 82.0 - request.avg_gpu_utilization)
    utilization_percent = min(24.0, max(8.0, utilization_gap * 0.93))
    if request.avg_gpu_utilization >= 62:
        utilization_percent = 18.6

    renewable_percent = min(22.0, max(4.0, (100.0 - request.renewable_percent) * 0.14))
    pue_percent = min(16.0, max(3.0, (request.power_usage_effectiveness - 1.08) * 28.0))
    cooling_percent = {
        "evaporative": 10.5,
        "air": 6.0,
        "hybrid": 5.2,
        "liquid": 3.5,
    }.get(request.cooling_type, 5.2)

    candidates = [
        (
            "raise-utilization",
            "Raise utilization",
            "Batch and schedule inference to lift GPU utilization.",
            utilization_percent,
            True,
        ),
        (
            "renewable-shift",
            "Renewable shift",
            "Move flexible work to cleaner supply windows.",
            renewable_percent,
            False,
        ),
        (
            "pue-tuning",
            "Tune facility overhead",
            "Reduce non-IT power through airflow, containment, and power-chain tuning.",
            pue_percent,
            True,
        ),
        (
            "cooling-optimization",
            "Optimize cooling",
            "Match cooling mode to load density and water constraints.",
            cooling_percent,
            True,
        ),
    ]

    scenarios = [
        Scenario(
            id=scenario_id,
            title=title,
            description=description,
            energy_savings_kwh_per_month=_round(
                baseline.energy_kwh_per_month * percent / 100 if saves_energy else 0
            ),
            carbon_savings_kg_co2e_per_month=_round(
                baseline.carbon_kg_co2e_per_month * percent / 100
            ),
            carbon_savings_percent=_round(percent),
        )
        for scenario_id, title, description, percent, saves_energy in candidates
    ]
    return sorted(scenarios, key=lambda item: item.carbon_savings_kg_co2e_per_month, reverse=True)


def offline_recommendation(request: AnalyzeRequest, scenarios: list[Scenario]) -> str:
    top = scenarios[0] if scenarios else None
    parts: list[str] = []

    if top and top.id == "raise-utilization":
        parts.append(
            "Prioritize utilization tuning by batching requests, right-sizing replicas, and scheduling flexible inference onto fewer active GPUs."
        )
    elif top:
        parts.append(f"Start with {top.title.lower()} because it has the largest modeled carbon reduction.")

    if request.renewable_percent < 40:
        parts.append(
            "Increase renewable coverage or shift flexible jobs into lower-carbon supply windows before adding more capacity."
        )

    if request.power_usage_effectiveness > 1.3:
        parts.append("Treat PUE reduction as an infrastructure workstream alongside workload scheduling.")

    if request.gpu_type.startswith("AMD"):
        parts.append("Keep AMD accelerators highly loaded so the embodied platform power is amortized across more useful tokens.")

    return " ".join(parts)


def analyze(request: AnalyzeRequest) -> AnalyzeResponse:
    baseline = baseline_metrics(request)
    scenarios = build_scenarios(request, baseline)
    return AnalyzeResponse(
        baseline=baseline,
        scenarios=scenarios,
        ai_recommendation=offline_recommendation(request, scenarios),
    )
