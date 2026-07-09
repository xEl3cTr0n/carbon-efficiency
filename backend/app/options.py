from __future__ import annotations

GPU_TYPES = {
    "AMD MI300X": {
        "tdp_kw": 0.75,
        "platform_kw_per_gpu": 9.441654502582528,
        "tokens_per_kwh": 128_000,
    },
    "NVIDIA H100": {
        "tdp_kw": 0.70,
        "platform_kw_per_gpu": 8.15,
        "tokens_per_kwh": 118_000,
    },
    "AMD MI250X": {
        "tdp_kw": 0.56,
        "platform_kw_per_gpu": 6.85,
        "tokens_per_kwh": 96_000,
    },
}

WORKLOAD_TYPES = {
    "llm_inference": "LLM inference",
    "training": "Training",
    "batch_analytics": "Batch analytics",
    "rendering": "Rendering",
}

COOLING_TYPES = {
    "air": {"label": "Air", "water_liters_per_kwh": 0.05},
    "evaporative": {"label": "Evaporative", "water_liters_per_kwh": 1.2},
    "hybrid": {"label": "Hybrid", "water_liters_per_kwh": 0.25},
    "liquid": {"label": "Liquid", "water_liters_per_kwh": 0.12},
}

GRID_REGIONS = {
    "california": {
        "label": "California",
        "carbon_intensity_kg_per_kwh": 0.164,
        "analysis_intensity_kg_per_kwh": 0.163989394217919,
    },
    "us_average": {
        "label": "US average",
        "carbon_intensity_kg_per_kwh": 0.386,
        "analysis_intensity_kg_per_kwh": 0.386,
    },
    "texas": {
        "label": "Texas",
        "carbon_intensity_kg_per_kwh": 0.402,
        "analysis_intensity_kg_per_kwh": 0.402,
    },
    "virginia": {
        "label": "Virginia",
        "carbon_intensity_kg_per_kwh": 0.314,
        "analysis_intensity_kg_per_kwh": 0.314,
    },
    "washington": {
        "label": "Washington",
        "carbon_intensity_kg_per_kwh": 0.083,
        "analysis_intensity_kg_per_kwh": 0.083,
    },
}


def api_options() -> dict[str, object]:
    return {
        "gpu_types": list(GPU_TYPES.keys()),
        "workload_types": list(WORKLOAD_TYPES.keys()),
        "cooling_types": list(COOLING_TYPES.keys()),
        "grid_regions": {
            key: {
                "label": value["label"],
                "carbon_intensity_kg_per_kwh": value["carbon_intensity_kg_per_kwh"],
            }
            for key, value in GRID_REGIONS.items()
        },
    }
