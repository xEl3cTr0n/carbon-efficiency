import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import App from "../src/App";

const options = {
  gpu_types: ["AMD MI300X", "NVIDIA H100"],
  workload_types: ["llm_inference", "training"],
  cooling_types: ["air", "evaporative", "hybrid", "liquid"],
  grid_regions: {
    california: { label: "California", carbon_intensity_kg_per_kwh: 0.164 },
    us_average: { label: "US average", carbon_intensity_kg_per_kwh: 0.386 },
  },
};

const analysis = {
  baseline: {
    energy_kwh_per_month: 269079.6,
    carbon_kg_co2e_per_month: 44126.2,
    water_liters_per_month: 67269.9,
    facility_power_kw: 368.6,
    utilization_efficiency_percent: 70.4,
  },
  scenarios: [
    {
      id: "raise-utilization",
      title: "Raise utilization",
      description: "Batch and schedule inference to lift GPU utilization.",
      energy_savings_kwh_per_month: 50113.4,
      carbon_savings_kg_co2e_per_month: 8218.6,
      carbon_savings_percent: 18.6,
    },
    {
      id: "renewable-shift",
      title: "Renewable shift",
      description: "Move flexible work to cleaner supply windows.",
      energy_savings_kwh_per_month: 0,
      carbon_savings_kg_co2e_per_month: 5736.4,
      carbon_savings_percent: 13.0,
    },
  ],
  ai_recommendation:
    "Prioritize utilization tuning, then shift flexible load to lower-carbon windows.",
  metadata: {
    provider: "offline",
    model: "deterministic-local",
    latency_ms: 14,
    fallback_used: true,
  },
};

const telemetry = {
  source: "synthetic",
  workload_name: "llama inference load test",
  summary: {
    sample_count: 16,
    avg_gpu_utilization_percent: 68,
    peak_gpu_utilization_percent: 78.4,
    avg_power_kw: 6.8,
    peak_power_kw: 7.5,
    avg_temperature_c: 74.2,
    estimated_it_energy_kwh: 9.1,
    estimated_facility_energy_kwh: 11.1,
    carbon_kg_co2e: 3.5,
    water_liters: 2.8,
  },
  insights: [
    {
      severity: "info",
      title: "Stable run profile",
      detail: "Telemetry is consistent enough to use as a baseline.",
    },
  ],
  charts: {
    power: [
      { label: "00:00", value: 5.8 },
      { label: "00:05", value: 6.6 },
      { label: "00:10", value: 7.4 },
    ],
    utilization: [
      { label: "00:00", value: 61 },
      { label: "00:05", value: 68 },
      { label: "00:10", value: 75 },
    ],
    temperature: [
      { label: "00:00", value: 70 },
      { label: "00:05", value: 74 },
      { label: "00:10", value: 78 },
    ],
  },
  ai_summary: "Stable run profile with room to shift flexible work.",
  metadata: {
    provider: "fireworks",
    model: "accounts/fireworks/models/kimi-k2-instruct-0905",
    latency_ms: 120,
    fallback_used: false,
  },
};

const report = {
  headline: "CarbonBuilder report for AI workload efficiency",
  scenario: analysis,
  telemetry,
  actions: [
    "Start with raise utilization to target 18.6% modeled carbon savings.",
    "Use the telemetry importer as the bridge from simulated planning to captured AMD workload evidence.",
  ],
  executive_summary: "The workload has a clear utilization-first optimization path.",
  metadata: {
    provider: "offline",
    model: "deterministic-local",
    latency_ms: 0,
    fallback_used: true,
  },
};

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.endsWith("/api/options")) {
        return new Response(JSON.stringify(options), { status: 200 });
      }
      if (url.endsWith("/api/analyze")) {
        return new Response(JSON.stringify(analysis), { status: 200 });
      }
      if (url.endsWith("/api/telemetry/simulate")) {
        return new Response(JSON.stringify(telemetry), { status: 200 });
      }
      if (url.endsWith("/api/telemetry/ingest")) {
        return new Response(JSON.stringify({ ...telemetry, source: "amd-smi-csv" }), { status: 200 });
      }
      if (url.endsWith("/api/report")) {
        return new Response(JSON.stringify(report), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    }),
  );
});

test("renders operational dashboard with analysis results", async () => {
  render(<App />);

  expect(await screen.findByText("CarbonBuilder")).toBeInTheDocument();
  expect(screen.getByText("AMD + Fireworks")).toBeInTheDocument();
  expect(await screen.findByText("269,080 kWh")).toBeInTheDocument();
  expect(screen.getByText("44,126 kg CO2e")).toBeInTheDocument();
  expect(screen.getByText("Raise utilization")).toBeInTheDocument();
  expect(screen.getByText(/Prioritize utilization tuning/)).toBeInTheDocument();
  expect(screen.getByText("offline / deterministic-local")).toBeInTheDocument();
  expect(screen.getByText("Telemetry studio")).toBeInTheDocument();
  expect(await screen.findByText("Stable run profile")).toBeInTheDocument();
  expect(screen.getByText("CarbonBuilder report for AI workload efficiency")).toBeInTheDocument();
});

test("submits edited inputs and renders refreshed recommendation", async () => {
  const user = userEvent.setup();
  render(<App />);

  const gpuInput = await screen.findByLabelText("GPU count");
  await user.clear(gpuInput);
  await user.type(gpuInput, "48");
  await user.click(screen.getByRole("button", { name: /Analyze/i }));

  await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/analyze", expect.anything()));
  expect(screen.getByText("18.6%")).toBeInTheDocument();
});

test("can ingest pasted telemetry csv and refresh the report", async () => {
  const user = userEvent.setup();
  render(<App />);

  const csvInput = await screen.findByLabelText("Telemetry CSV");
  await user.clear(csvInput);
  await user.type(
    csvInput,
    "timestamp,gpu_utilization_percent,power_watts,memory_used_gb,temperature_c\n2026-07-10T00:00:00Z,70,6400,110,72",
  );
  await user.click(screen.getByRole("button", { name: /Import telemetry/i }));
  await user.click(screen.getByRole("button", { name: /Generate report/i }));

  await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/telemetry/ingest", expect.anything()));
  await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/report", expect.anything()));
  expect(screen.getByText("amd-smi-csv")).toBeInTheDocument();
  expect(screen.getByText(/utilization-first optimization path/i)).toBeInTheDocument();
});
