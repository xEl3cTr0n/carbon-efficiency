import respx
from fastapi.testclient import TestClient
from httpx import Response

from app.main import app


def test_synthetic_telemetry_returns_trace_summary_and_charts():
    client = TestClient(app)

    response = client.post(
        "/api/telemetry/simulate",
        json={
            "workload_name": "llama inference load test",
            "gpu_type": "AMD MI300X",
            "gpu_count": 8,
            "duration_minutes": 45,
            "target_utilization": 68,
            "grid_region": "virginia",
            "cooling_type": "hybrid",
            "power_usage_effectiveness": 1.22,
        },
    )

    data = response.json()

    assert response.status_code == 200
    assert data["source"] == "synthetic"
    assert data["summary"]["sample_count"] == 16
    assert data["summary"]["avg_gpu_utilization_percent"] == 68.0
    assert data["summary"]["estimated_facility_energy_kwh"] > data["summary"]["estimated_it_energy_kwh"]
    assert data["summary"]["carbon_kg_co2e"] > 0
    assert data["charts"]["power"][0]["label"] == "00:00"
    assert data["metadata"]["provider"] == "offline"


def test_csv_telemetry_ingest_flags_spiky_utilization_and_uses_fireworks(monkeypatch):
    monkeypatch.setenv("FIREWORKS_API_KEY", "test-key")
    monkeypatch.setenv("FIREWORKS_MODEL", "accounts/fireworks/models/kimi-k2-instruct-0905")
    client = TestClient(app)

    csv_text = "\n".join(
        [
            "timestamp,gpu_utilization_percent,power_watts,memory_used_gb,temperature_c",
            "2026-07-10T00:00:00Z,22,2800,81,62",
            "2026-07-10T00:05:00Z,91,7800,127,76",
            "2026-07-10T00:10:00Z,24,3100,84,64",
            "2026-07-10T00:15:00Z,89,7600,125,77",
        ]
    )

    with respx.mock(assert_all_called=True) as router:
        router.post("https://api.fireworks.ai/inference/v1/chat/completions").mock(
            return_value=Response(
                200,
                json={
                    "choices": [
                        {
                            "message": {
                                "content": "The run is bursty. Batch requests and pin flexible work to cleaner windows."
                            }
                        }
                    ]
                },
            )
        )
        response = client.post(
            "/api/telemetry/ingest",
            json={
                "source": "amd-smi-csv",
                "workload_name": "captured load test",
                "gpu_type": "AMD MI300X",
                "gpu_count": 8,
                "grid_region": "virginia",
                "cooling_type": "hybrid",
                "power_usage_effectiveness": 1.22,
                "csv_text": csv_text,
            },
        )

    data = response.json()

    assert response.status_code == 200
    assert data["source"] == "amd-smi-csv"
    assert data["summary"]["sample_count"] == 4
    assert data["summary"]["peak_gpu_utilization_percent"] == 91.0
    assert data["insights"][0]["severity"] == "warning"
    assert "bursty" in data["ai_summary"].lower()
    assert data["metadata"]["provider"] == "fireworks"


def test_report_combines_scenario_and_telemetry_without_credentials():
    client = TestClient(app)

    response = client.post(
        "/api/report",
        json={
            "scenario": {
                "gpu_count": 12,
                "gpu_type": "AMD MI300X",
                "avg_gpu_utilization": 52,
                "power_usage_effectiveness": 1.28,
                "grid_region": "california",
                "renewable_percent": 18,
                "cooling_type": "hybrid",
            },
            "telemetry": {
                "source": "manual-json",
                "workload_name": "batch eval",
                "gpu_type": "AMD MI300X",
                "gpu_count": 12,
                "grid_region": "california",
                "cooling_type": "hybrid",
                "power_usage_effectiveness": 1.28,
                "samples": [
                    {
                        "timestamp": "2026-07-10T00:00:00Z",
                        "gpu_utilization_percent": 44,
                        "power_watts": 6200,
                        "memory_used_gb": 98,
                        "temperature_c": 66,
                    },
                    {
                        "timestamp": "2026-07-10T00:05:00Z",
                        "gpu_utilization_percent": 57,
                        "power_watts": 6900,
                        "memory_used_gb": 102,
                        "temperature_c": 70,
                    },
                ],
            },
        },
    )

    data = response.json()

    assert response.status_code == 200
    assert data["headline"].startswith("CarbonBuilder report")
    assert len(data["actions"]) >= 3
    assert data["scenario"]["baseline"]["energy_kwh_per_month"] > 0
    assert data["telemetry"]["summary"]["sample_count"] == 2
    assert data["metadata"]["fallback_used"] is True
