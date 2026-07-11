from __future__ import annotations

from app.calculations import analyze
from app.schemas import ReportRequest, ReportResponse, TelemetryResponse
from app.telemetry import ingest_telemetry


def _actions_from_scenario_and_telemetry(report: ReportRequest, telemetry: TelemetryResponse | None) -> list[str]:
    scenario = analyze(report.scenario)
    actions = [
        f"Start with {scenario.scenarios[0].title.lower()} to target {scenario.scenarios[0].carbon_savings_percent}% modeled carbon savings.",
        "Confirm the modeled reduction against a measured workload run before changing production capacity.",
        "Retain telemetry source and Fireworks provider metadata with the operating record.",
    ]

    if report.scenario.renewable_percent < 40:
        actions.append("Shift flexible jobs into cleaner grid windows or increase renewable coverage before scaling capacity.")

    if report.scenario.power_usage_effectiveness > 1.25:
        actions.append("Treat PUE reduction as a facility workstream because overhead is materially affecting every workload.")

    if telemetry:
        if telemetry.summary.avg_gpu_utilization_percent < 60:
            actions.append("Batch requests or consolidate replicas because sampled GPU utilization is below the target range.")
        if telemetry.insights and telemetry.insights[0].severity == "warning":
            actions.append(f"Investigate telemetry warning: {telemetry.insights[0].title.lower()}.")

    return actions


def build_report(request: ReportRequest) -> ReportResponse:
    scenario = analyze(request.scenario)
    telemetry = ingest_telemetry(request.telemetry) if request.telemetry else None
    actions = _actions_from_scenario_and_telemetry(request, telemetry)

    telemetry_sentence = ""
    if telemetry:
        telemetry_sentence = (
            f" Sample telemetry shows {telemetry.summary.avg_gpu_utilization_percent}% average GPU "
            f"utilization and {telemetry.summary.estimated_facility_energy_kwh} kWh facility energy "
            f"across {telemetry.summary.duration_minutes} minutes."
        )

    return ReportResponse(
        headline="CarbonBuilder report for AI workload efficiency",
        scenario=scenario,
        telemetry=telemetry,
        actions=actions,
        executive_summary=(
            f"The modeled workload uses {scenario.baseline.energy_kwh_per_month} kWh per month "
            f"and emits {scenario.baseline.carbon_kg_co2e_per_month} kg CO2e before optimization."
            f"{telemetry_sentence} The recommended path is to combine the highest-ranked scenario "
            "with telemetry-backed operational tuning."
        ),
    )
