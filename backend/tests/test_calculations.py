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

    assert result.baseline.energy_kwh_per_month == 19_045.7
    assert result.baseline.carbon_kg_co2e_per_month == 1_936.4
    assert result.baseline.water_liters_per_month == 4_761.4
    assert result.baseline.facility_power_kw == 26.1
    assert result.baseline.utilization_efficiency_percent == 62.0
    assert result.baseline.workload_tokens_per_month == 10_800_000_000.0
    assert result.baseline.energy_kwh_per_million_tokens == 1.8
    assert result.scenarios[0].id == "raise-utilization"
    assert result.scenarios[0].carbon_savings_percent == 18.6
    assert result.scenarios[-1].carbon_savings_kg_co2e_per_month < result.scenarios[0].carbon_savings_kg_co2e_per_month
    assert result.region_comparison[0].id == "washington"
    assert next(row for row in result.region_comparison if row.selected).id == "california"
    assert result.region_comparison[-1].id == "texas"


def test_renewable_coverage_reduces_market_based_carbon():
    without_renewables = analyze(AnalyzeRequest(renewable_percent=0))
    half_renewable = analyze(AnalyzeRequest(renewable_percent=50))

    assert half_renewable.baseline.energy_kwh_per_month == without_renewables.baseline.energy_kwh_per_month
    assert half_renewable.baseline.carbon_kg_co2e_per_month == round(
        without_renewables.baseline.carbon_kg_co2e_per_month / 2,
        1,
    )


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
