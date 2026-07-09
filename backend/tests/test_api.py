import respx
from fastapi.testclient import TestClient
from httpx import Response

from app.main import app


def test_options_and_health():
    client = TestClient(app)

    assert client.get("/api/health").json() == {"status": "ok"}
    options = client.get("/api/options").json()

    assert "AMD MI300X" in options["gpu_types"]
    assert options["grid_regions"]["california"]["carbon_intensity_kg_per_kwh"] == 0.164
    assert "hybrid" in options["cooling_types"]


def test_analyze_uses_fireworks_when_configured(monkeypatch):
    monkeypatch.setenv("FIREWORKS_API_KEY", "test-key")
    monkeypatch.setenv("FIREWORKS_MODEL", "accounts/fireworks/models/llama-v3p1-8b-instruct")
    client = TestClient(app)

    with respx.mock(assert_all_called=True) as router:
        router.post("https://api.fireworks.ai/inference/v1/chat/completions").mock(
            return_value=Response(
                200,
                json={
                    "choices": [
                        {
                            "message": {
                                "content": "Prioritize utilization tuning, then shift flexible load to lower-carbon windows."
                            }
                        }
                    ]
                },
            )
        )
        response = client.post("/api/analyze", json={"gpu_count": 16})

    data = response.json()
    assert response.status_code == 200
    assert data["metadata"]["provider"] == "fireworks"
    assert data["metadata"]["model"] == "accounts/fireworks/models/llama-v3p1-8b-instruct"
    assert data["metadata"]["fallback_used"] is False
    assert data["metadata"]["latency_ms"] >= 0
    assert "Prioritize utilization" in data["ai_recommendation"]


def test_analyze_falls_back_when_fireworks_fails(monkeypatch):
    monkeypatch.setenv("FIREWORKS_API_KEY", "test-key")
    client = TestClient(app)

    with respx.mock(assert_all_called=True) as router:
        router.post("https://api.fireworks.ai/inference/v1/chat/completions").mock(return_value=Response(503))
        response = client.post("/api/analyze", json={"gpu_count": 16, "renewable_percent": 12})

    data = response.json()
    assert response.status_code == 200
    assert data["metadata"]["provider"] == "offline"
    assert data["metadata"]["fallback_used"] is True
    assert "renewable" in data["ai_recommendation"].lower()
