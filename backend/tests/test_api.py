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
    assert options["grid_factor_metadata"]["source"] == "CarbonBuilder reference factors"


def test_ai_health_is_passive_and_secret_free(monkeypatch):
    monkeypatch.setenv("FIREWORKS_API_KEY", "super-secret-test-key")
    client = TestClient(app)

    data = client.get("/api/health/ai").json()

    assert data["configured"] is True
    assert data["provider"] == "fireworks"
    assert data["endpoint_host"] == "api.fireworks.ai"
    assert "super-secret-test-key" not in str(data)


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
    assert data["metadata"]["fallback_reason"] == "provider_unavailable"
    assert data["metadata"]["provider_attempted"] is True
    assert data["metadata"]["retryable"] is True
    assert "renewable" in data["ai_recommendation"].lower()


def test_fireworks_base_endpoint_is_normalized(monkeypatch):
    monkeypatch.setenv("FIREWORKS_API_KEY", "test-key")
    monkeypatch.setenv("FIREWORKS_ENDPOINT", "https://api.fireworks.ai/inference/v1")
    client = TestClient(app)

    with respx.mock(assert_all_called=True) as router:
        router.post("https://api.fireworks.ai/inference/v1/chat/completions").mock(
            return_value=Response(
                200,
                json={"choices": [{"message": {"content": "Use the cleanest available region."}}]},
            )
        )
        response = client.post("/api/analyze", json={"gpu_count": 8})

    assert response.status_code == 200
    assert response.json()["metadata"]["provider"] == "fireworks"


def test_untrusted_fireworks_endpoint_is_rejected_before_sending_key(monkeypatch):
    monkeypatch.setenv("FIREWORKS_API_KEY", "test-key")
    monkeypatch.setenv("FIREWORKS_ENDPOINT", "https://example.com/collect")
    client = TestClient(app)

    with respx.mock(assert_all_called=False) as router:
        response = client.post("/api/analyze", json={"gpu_count": 8})
        assert len(router.calls) == 0

    data = response.json()
    assert data["metadata"]["fallback_reason"] == "invalid_configuration"
    assert data["metadata"]["retryable"] is False


def test_unknown_region_is_rejected_instead_of_silently_using_us_average():
    client = TestClient(app)

    response = client.post("/api/analyze", json={"grid_region": "typo-region"})

    assert response.status_code == 422
    assert "Unsupported grid region" in response.text


def test_public_ai_routes_are_rate_limited(monkeypatch):
    monkeypatch.setenv("API_RATE_LIMIT_PER_MINUTE", "1")
    client = TestClient(app)
    headers = {"x-forwarded-for": "203.0.113.42"}

    first = client.post("/api/analyze", json={"gpu_count": 4}, headers=headers)
    second = client.post("/api/analyze", json={"gpu_count": 4}, headers=headers)

    assert first.status_code == 200
    assert second.status_code == 429
    assert second.headers["retry-after"] == "60"
