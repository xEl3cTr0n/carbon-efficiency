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
