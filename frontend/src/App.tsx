import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  BarChart3,
  Bolt,
  BrainCircuit,
  Database,
  Droplets,
  FileText,
  Gauge,
  Leaf,
  RefreshCw,
  Server,
  Thermometer,
  Upload,
} from "lucide-react";

type FormState = {
  workload_type: string;
  monthly_requests: number;
  avg_tokens_per_request: number;
  gpu_count: number;
  gpu_type: string;
  avg_gpu_utilization: number;
  power_usage_effectiveness: number;
  grid_region: string;
  renewable_percent: number;
  cooling_type: string;
};

type Options = {
  gpu_types: string[];
  workload_types: string[];
  cooling_types: string[];
  grid_regions: Record<string, { label: string; carbon_intensity_kg_per_kwh: number }>;
};

type Metadata = { provider: string; model: string; latency_ms: number; fallback_used: boolean };

type Analysis = {
  baseline: Record<string, number>;
  scenarios: Array<{
    id: string;
    title: string;
    description: string;
    energy_savings_kwh_per_month: number;
    carbon_savings_kg_co2e_per_month: number;
    carbon_savings_percent: number;
  }>;
  ai_recommendation: string;
  metadata: Metadata;
};

type ChartPoint = { label: string; value: number };
type Telemetry = {
  source: string;
  workload_name: string;
  summary: Record<string, number>;
  insights: Array<{ severity: string; title: string; detail: string }>;
  charts: { power: ChartPoint[]; utilization: ChartPoint[]; temperature: ChartPoint[] };
  ai_summary: string;
  metadata: Metadata;
};

type Report = {
  headline: string;
  scenario: Analysis;
  telemetry: Telemetry | null;
  actions: string[];
  executive_summary: string;
  metadata: Metadata;
};

const API = import.meta.env.VITE_API_BASE_URL ?? "";

const defaults: FormState = {
  workload_type: "llm_inference",
  monthly_requests: 6_000_000,
  avg_tokens_per_request: 750,
  gpu_count: 16,
  gpu_type: "AMD MI300X",
  avg_gpu_utilization: 55,
  power_usage_effectiveness: 1.25,
  grid_region: "california",
  renewable_percent: 25,
  cooling_type: "hybrid",
};

const fallbackOptions: Options = {
  gpu_types: ["AMD MI300X", "AMD MI250X", "NVIDIA H100"],
  workload_types: ["llm_inference", "training", "batch_analytics", "rendering"],
  cooling_types: ["air", "evaporative", "hybrid", "liquid"],
  grid_regions: {
    california: { label: "California", carbon_intensity_kg_per_kwh: 0.164 },
    us_average: { label: "US average", carbon_intensity_kg_per_kwh: 0.386 },
  },
};

const sampleCsv = [
  "timestamp,gpu_utilization_percent,power_watts,memory_used_gb,temperature_c",
  "2026-07-10T00:00:00Z,44,5200,96,65",
  "2026-07-10T00:05:00Z,72,6900,118,71",
  "2026-07-10T00:10:00Z,81,7350,124,74",
  "2026-07-10T00:15:00Z,58,6100,106,69",
].join("\n");

const fmt = (value = 0, digits = 0) =>
  value.toLocaleString(undefined, { maximumFractionDigits: digits });

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${path} failed`);
  return response.json();
}

function ProviderBadge({ metadata }: { metadata?: Metadata }) {
  const label = metadata ? `${metadata.provider} / ${metadata.model}` : "connecting";
  return <div className={`provider ${metadata?.fallback_used ? "fallback" : ""}`}><i />{label}</div>;
}

function MiniChart({ title, points, unit }: { title: string; points: ChartPoint[]; unit: string }) {
  const max = Math.max(...points.map((point) => point.value), 1);
  return (
    <section className="chart-card">
      <div className="chart-head"><span>{title}</span><small>{unit}</small></div>
      <div className="bars-chart">
        {points.map((point, index) => (
          <b key={`${point.label}-${index}`} style={{ height: `${Math.max(8, (point.value / max) * 100)}%` }} title={`${point.label}: ${point.value} ${unit}`} />
        ))}
      </div>
    </section>
  );
}

export default function App() {
  const [form, setForm] = useState(defaults);
  const [options, setOptions] = useState(fallbackOptions);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [csvText, setCsvText] = useState(sampleCsv);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const field = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const runAnalysis = async (payload = form) => {
    setBusy("analysis");
    setError("");
    try {
      const next = await postJson<Analysis>("/api/analyze", payload);
      setAnalysis(next);
      return next;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
      return null;
    } finally {
      setBusy("");
    }
  };

  const simulateTelemetry = async (payload = form) => {
    setBusy("telemetry");
    setError("");
    try {
      const next = await postJson<Telemetry>("/api/telemetry/simulate", {
        workload_name: "llama inference load test",
        gpu_type: payload.gpu_type,
        gpu_count: payload.gpu_count,
        duration_minutes: 60,
        target_utilization: payload.avg_gpu_utilization,
        grid_region: payload.grid_region,
        cooling_type: payload.cooling_type,
        power_usage_effectiveness: payload.power_usage_effectiveness,
      });
      setTelemetry(next);
      return next;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Telemetry simulation failed");
      return null;
    } finally {
      setBusy("");
    }
  };

  const importTelemetry = async () => {
    setBusy("import");
    setError("");
    try {
      const next = await postJson<Telemetry>("/api/telemetry/ingest", {
        source: "amd-smi-csv",
        workload_name: "pasted AMD telemetry",
        gpu_type: form.gpu_type,
        gpu_count: form.gpu_count,
        grid_region: form.grid_region,
        cooling_type: form.cooling_type,
        power_usage_effectiveness: form.power_usage_effectiveness,
        csv_text: csvText,
      });
      setTelemetry(next);
      return next;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Telemetry import failed");
      return null;
    } finally {
      setBusy("");
    }
  };

  const generateReport = async (payload = form, telemetryOverride = telemetry) => {
    setBusy("report");
    setError("");
    try {
      const next = await postJson<Report>("/api/report", {
        scenario: payload,
        telemetry: telemetryOverride
          ? {
              source: telemetryOverride.source,
              workload_name: telemetryOverride.workload_name,
              gpu_type: payload.gpu_type,
              gpu_count: payload.gpu_count,
              grid_region: payload.grid_region,
              cooling_type: payload.cooling_type,
              power_usage_effectiveness: payload.power_usage_effectiveness,
              samples: [],
              csv_text: csvText,
            }
          : null,
      });
      setReport(next);
      return next;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Report generation failed");
      return null;
    } finally {
      setBusy("");
    }
  };

  useEffect(() => {
    fetch(`${API}/api/options`)
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then(setOptions)
      .catch(() => {});

    (async () => {
      await runAnalysis(defaults);
      const simulated = await simulateTelemetry(defaults);
      await generateReport(defaults, simulated);
    })();
  }, []);

  const metrics = useMemo(() => analysis ? [
    ["Energy", `${fmt(analysis.baseline.energy_kwh_per_month)} kWh`, Bolt],
    ["Carbon", `${fmt(analysis.baseline.carbon_kg_co2e_per_month)} kg CO2e`, Leaf],
    ["Water", `${fmt(analysis.baseline.water_liters_per_month)} L`, Droplets],
    ["Facility load", `${fmt(analysis.baseline.facility_power_kw, 1)} kW`, Server],
    ["Utilization", `${fmt(analysis.baseline.utilization_efficiency_percent, 1)}%`, Gauge],
  ] : [], [analysis]);

  return (
    <div className="shell">
      <aside>
        <div className="brand"><span><Leaf size={20} /></span><div><strong>CarbonBuilder</strong><small>Facility intelligence</small></div></div>
        <nav>
          <a className="active"><Activity size={17} /> Scenario studio</a>
          <a><Database size={17} /> Telemetry</a>
          <a><BarChart3 size={17} /> Reports</a>
          <a><BrainCircuit size={17} /> Fireworks agent</a>
        </nav>
        <div className="amd"><strong>AMD + Fireworks</strong><span>Inference-backed recommendations with deterministic fallback</span></div>
      </aside>

      <main>
        <header>
          <div><p>AI INFRASTRUCTURE OPERATIONS</p><h1>Carbon, power, and water command center</h1></div>
          <ProviderBadge metadata={analysis?.metadata} />
        </header>

        <section className="dashboard">
          <section className="panel scenario-panel">
            <div className="panel-title">
              <div><h2>Scenario planner</h2><p>Model facility impact before capacity is committed.</p></div>
              <button className="icon" title="Reset scenario" onClick={() => setForm(defaults)}><RefreshCw size={18} /></button>
            </div>
            <div className="form-grid">
              <label className="wide">Workload description<textarea value={`Serve ${fmt(form.monthly_requests)} monthly requests on ${form.gpu_count} ${form.gpu_type} accelerators.`} readOnly /></label>
              <label>GPU type<select value={form.gpu_type} onChange={(event) => field("gpu_type", event.target.value)}>{options.gpu_types.map((value) => <option key={value}>{value}</option>)}</select></label>
              <label>GPU count<input type="number" value={form.gpu_count} onChange={(event) => field("gpu_count", +event.target.value)} /></label>
              <label>Utilization (%)<input type="number" value={form.avg_gpu_utilization} onChange={(event) => field("avg_gpu_utilization", +event.target.value)} /></label>
              <label>PUE<input type="number" step=".01" value={form.power_usage_effectiveness} onChange={(event) => field("power_usage_effectiveness", +event.target.value)} /></label>
              <label>Grid region<select value={form.grid_region} onChange={(event) => field("grid_region", event.target.value)}>{Object.entries(options.grid_regions).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select></label>
              <label>Cooling<select value={form.cooling_type} onChange={(event) => field("cooling_type", event.target.value)}>{options.cooling_types.map((value) => <option key={value}>{value}</option>)}</select></label>
              <label>Renewable coverage (%)<input type="number" value={form.renewable_percent} onChange={(event) => field("renewable_percent", +event.target.value)} /></label>
              <label>Monthly requests<input type="number" value={form.monthly_requests} onChange={(event) => field("monthly_requests", +event.target.value)} /></label>
            </div>
            <button className="primary" onClick={() => runAnalysis()} disabled={busy === "analysis"}>{busy === "analysis" ? "Analyzing..." : "Analyze workload"}</button>
            {error && <p className="error">{error}</p>}
          </section>

          <section className="metric-grid">
            {metrics.map(([label, value, Icon]) => <article key={String(label)}><span><Icon size={18} /></span><small>{label as string}</small><strong>{value as string}</strong></article>)}
          </section>

          <section className="panel telemetry-panel">
            <div className="panel-title">
              <div><h2>Telemetry studio</h2><p>Use synthetic runs now; paste AMD SMI CSV later without changing the app.</p></div>
              <ProviderBadge metadata={telemetry?.metadata} />
            </div>
            <div className="telemetry-stats">
              <article><Gauge size={18} /><small>Avg utilization</small><strong>{fmt(telemetry?.summary.avg_gpu_utilization_percent, 1)}%</strong></article>
              <article><Bolt size={18} /><small>IT load</small><strong>{fmt(telemetry?.summary.avg_power_kw, 1)} kW</strong></article>
              <article><Thermometer size={18} /><small>Temperature</small><strong>{fmt(telemetry?.summary.avg_temperature_c, 1)} C</strong></article>
              <article><Leaf size={18} /><small>Sample carbon</small><strong>{fmt(telemetry?.summary.carbon_kg_co2e, 1)} kg</strong></article>
            </div>
            <div className="chart-grid">
              <MiniChart title="Power trace" points={telemetry?.charts.power ?? []} unit="kW" />
              <MiniChart title="Utilization trace" points={telemetry?.charts.utilization ?? []} unit="%" />
              <MiniChart title="Thermal trace" points={telemetry?.charts.temperature ?? []} unit="C" />
            </div>
            <div className="ingest-grid">
              <label>Telemetry CSV<textarea value={csvText} onChange={(event) => setCsvText(event.target.value)} /></label>
              <div>
                <button className="secondary" onClick={() => simulateTelemetry()} disabled={busy === "telemetry"}><Activity size={16} /> Simulate telemetry</button>
                <button className="secondary" onClick={importTelemetry} disabled={busy === "import"}><Upload size={16} /> Import telemetry</button>
                <p className="source-pill">{telemetry?.source ?? "synthetic"}</p>
              </div>
            </div>
            <div className="insight-list">
              {telemetry?.insights.map((item) => <article key={item.title} className={item.severity}><strong>{item.title}</strong><p>{item.detail}</p></article>)}
            </div>
          </section>

          <section className="panel optimization-panel">
            <div className="panel-title"><div><h2>Optimization queue</h2><p>Ranked by modeled monthly carbon savings.</p></div></div>
            {analysis?.scenarios.map((item, index) => (
              <div className="scenario" key={item.id}>
                <b>{String(index + 1).padStart(2, "0")}</b>
                <div><strong>{item.title}</strong><p>{item.description}</p><span>{fmt(item.carbon_savings_kg_co2e_per_month)} kg CO2e/mo</span></div>
                <em>{item.carbon_savings_percent}%</em>
              </div>
            ))}
          </section>

          <section className="panel agent-panel">
            <div className="agent-title"><span><BrainCircuit size={20} /></span><div><h2>Fireworks analysis</h2><small>{analysis?.metadata.latency_ms ?? 0} ms scenario latency</small></div></div>
            <p>{analysis?.ai_recommendation ?? "Waiting for workload analysis."}</p>
            <p>{telemetry?.ai_summary ?? "Waiting for telemetry analysis."}</p>
          </section>

          <section className="panel report-panel">
            <div className="panel-title">
              <div><h2>Operator report</h2><p>Submission-ready narrative with scenarios, telemetry, and Fireworks evidence.</p></div>
              <button className="secondary compact" onClick={() => generateReport()} disabled={busy === "report"}><FileText size={16} /> Generate report</button>
            </div>
            <h3>{report?.headline ?? "Report pending"}</h3>
            <p>{report?.executive_summary ?? "Generate a report after scenario and telemetry analysis."}</p>
            <ul>{report?.actions.map((action) => <li key={action}>{action}</li>)}</ul>
          </section>
        </section>
      </main>
    </div>
  );
}
