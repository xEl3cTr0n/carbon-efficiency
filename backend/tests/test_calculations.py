from app.calculations import analyze
from app.schemas import AnalyzeRequest


def test_deterministic_analysis_ranks_scenarios_and_metrics():
    request = AnalyzeRequest(
        workload_type="llm_inference",
        monthly_requests=12_000_000,
        avg_tokens_per_request=900,
        gpu_count=32,
        gpu_type="AMD MI300X",
        avg_gpu_utilization=62,
        power_usage_effectiveness=1.22,
        grid_region="california",
        renewable_percent=38,
        cooling_type="hybrid",
    )

    result = analyze(request)

    assert result.baseline.energy_kwh_per_month == 269_079.6
    assert result.baseline.carbon_kg_co2e_per_month == 44_126.2
    assert result.baseline.water_liters_per_month == 67_269.9
    assert result.baseline.facility_power_kw == 368.6
    assert result.baseline.utilization_efficiency_percent == 70.4
    assert result.scenarios[0].id == "raise-utilization"
    assert result.scenarios[0].carbon_savings_percent == 18.6
    assert result.scenarios[-1].carbon_savings_kg_co2e_per_month < result.scenarios[0].carbon_savings_kg_co2e_per_month


def test_offline_fallback_is_deterministic():
    low_renewable = AnalyzeRequest(
        monthly_requests=2_000_000,
        avg_tokens_per_request=500,
        gpu_count=8,
        gpu_type="NVIDIA H100",
        avg_gpu_utilization=41,
        power_usage_effectiveness=1.45,
        grid_region="us_average",
        renewable_percent=8,
        cooling_type="evaporative",
    )

    first = analyze(low_renewable).ai_recommendation
    second = analyze(low_renewable).ai_recommendation

    assert first == second
    assert "utilization" in first.lower()
    assert "renewable" in first.lower()
