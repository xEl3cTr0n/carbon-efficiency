#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import shutil
import subprocess
import time
from pathlib import Path


FIELDS = [
    "timestamp",
    "gpu_utilization_percent",
    "power_watts",
    "memory_used_gb",
    "temperature_c",
]


def _parse_number(value: object, default: float = 0.0) -> float:
    if isinstance(value, int | float):
        return float(value)
    if value is None:
        return default
    text = str(value).strip().replace("%", "").replace("W", "").replace("C", "")
    try:
        return float(text)
    except ValueError:
        return default


def _find_nested_number(node: object, keys: tuple[str, ...]) -> float:
    if isinstance(node, dict):
        for key, value in node.items():
            normalized = key.lower().replace(" ", "_")
            if any(target in normalized for target in keys):
                parsed = _parse_number(value, -1)
                if parsed >= 0:
                    return parsed
            nested = _find_nested_number(value, keys)
            if nested >= 0:
                return nested
    if isinstance(node, list):
        for item in node:
            nested = _find_nested_number(item, keys)
            if nested >= 0:
                return nested
    return -1


def read_amd_smi() -> dict[str, float]:
    if not shutil.which("amd-smi"):
        raise RuntimeError("amd-smi was not found on PATH")

    result = subprocess.run(
        ["amd-smi", "metric", "--json"],
        check=True,
        capture_output=True,
        text=True,
    )
    payload = json.loads(result.stdout)
    utilization = _find_nested_number(payload, ("gpu_util", "gfx_activity", "usage"))
    power = _find_nested_number(payload, ("power",))
    memory = _find_nested_number(payload, ("memory_used", "vram_used", "mem_usage"))
    temperature = _find_nested_number(payload, ("temperature", "edge_temp", "hotspot"))

    return {
        "gpu_utilization_percent": max(0.0, utilization),
        "power_watts": max(0.0, power),
        "memory_used_gb": max(0.0, memory / 1024 if memory > 256 else memory),
        "temperature_c": max(0.0, temperature),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Capture AMD SMI telemetry for CarbonBuilder CSV import.")
    parser.add_argument("--output", default="amd-telemetry.csv", help="CSV file to write")
    parser.add_argument("--samples", type=int, default=24, help="Number of samples to capture")
    parser.add_argument("--interval", type=float, default=5.0, help="Seconds between samples")
    args = parser.parse_args()

    output = Path(args.output)
    with output.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS)
        writer.writeheader()
        for _ in range(args.samples):
            row = {"timestamp": dt.datetime.now(dt.UTC).isoformat()}
            row.update(read_amd_smi())
            writer.writerow(row)
            handle.flush()
            time.sleep(args.interval)

    print(f"Wrote {args.samples} samples to {output}")


if __name__ == "__main__":
    main()
