import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import {
  Activity,
  BarChart3,
  Bolt,
  BrainCircuit,
  Database,
  Download,
  Droplets,
  FileText,
  Gauge,
  GitCompare,
  Globe2,
  History,
  Leaf,
  RefreshCw,
  Server,
  Thermometer,
  Trash2,
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
  grid_regions: Record<string, {
    label: string;
    carbon_intensity_kg_per_kwh: number;
    source?: string;
    vintage?: string;
  }>;
  grid_factor_metadata?: { source: string; vintage: string; methodology: string };
};

type Metadata = {
  provider: string;
  model: string;
  latency_ms: number;
  fallback_used: boolean;
  fallback_reason?: string | null;
  provider_attempted?: boolean;
  retryable?: boolean;
  request_id?: string | null;
};

type RegionComparison = {
  id: string;
  label: string;
  carbon_intensity_kg_per_kwh: number;
  carbon_kg_co2e_per_month: number;
  carbon_savings_kg_co2e_per_month: number;
  carbon_savings_percent: number;
  selected: boolean;
  source: string;
};

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
  region_comparison?: RegionComparison[];
  ai_recommendation: string;
  metadata: Metadata;
};

type ChartPoint = { label: string; value: number };
type TelemetrySample = {
  timestamp: string;
  gpu_utilization_percent: number;
  power_watts: number;
  memory_used_gb: number;
  temperature_c: number;
};
type Telemetry = {
  source: string;
  workload_name: string;
  samples?: TelemetrySample[];
  summary: Record<string, number>;
  insights: Array<{ severity: string; title: string; detail: string }>;
  charts: { power: ChartPoint[]; utilization: ChartPoint[]; temperature: ChartPoint[] };
  ai_summary: string;
  metadata: Metadata;
};

type AIHealth = {
  provider: string;
  status: string;
  configured: boolean;
  model: string;
  endpoint_host: string;
  reason_code?: string | null;
  last_latency_ms: number;
  last_checked_at?: string | null;
};

type RunSnapshot = {
  id: string;
  name: string;
  createdAt: string;
  input: FormState;
  analysis: Analysis;
};

type Report = {
  headline: string;
  scenario: Analysis;
  telemetry: Telemetry | null;
  actions: string[];
  executive_summary: string;
  metadata: Metadata;
};

type GeneratedReport = {
  response: Report;
  form: FormState;
  analysis: Analysis;
  createdAt: string;
};

const API = import.meta.env.VITE_API_BASE_URL ?? "";
const RUN_HISTORY_KEY = "carbonbuilder.run-history.v1";
const MAX_RUN_HISTORY = 6;
const MotionSection = motion.section;
const MotionArticle = motion.article;

const cardMotion = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.28 },
};

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

function loadRunHistory(): RunSnapshot[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(RUN_HISTORY_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.slice(0, MAX_RUN_HISTORY) : [];
  } catch {
    return [];
  }
}

function copySnapshot<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

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
  const detail = metadata?.fallback_reason
    ? `${metadata.fallback_reason}${metadata.retryable ? " (retryable)" : ""}`
    : `${metadata?.latency_ms ?? 0} ms`;
  return <div className={`provider ${metadata?.fallback_used ? "fallback" : ""}`} title={detail}><i />{label}</div>;
}

function downloadMarkdown(filename: string, content: string) {
  const link = document.createElement("a");
  link.href = `data:text/markdown;charset=utf-8,${encodeURIComponent(content)}`;
  link.download = filename;
  link.click();
}

function reportMarkdown(form: FormState, analysis: Analysis, report: Report): string {
  const baseline = analysis.baseline;
  return [
    `# ${report.headline}`,
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Scenario input",
    `- Workload: ${form.workload_type}`,
    `- Fleet: ${form.gpu_count} x ${form.gpu_type}`,
    `- Utilization: ${form.avg_gpu_utilization}%`,
    `- PUE: ${form.power_usage_effectiveness}`,
    `- Region: ${form.grid_region}`,
    `- Renewable coverage: ${form.renewable_percent}%`,
    `- Cooling: ${form.cooling_type}`,
    "",
    "## Baseline",
    `- Energy: ${baseline.energy_kwh_per_month} kWh/month`,
    `- Carbon: ${baseline.carbon_kg_co2e_per_month} kg CO2e/month`,
    `- Water: ${baseline.water_liters_per_month} L/month`,
    `- Facility load: ${baseline.facility_power_kw} kW`,
    `- Utilization: ${baseline.utilization_efficiency_percent}%`,
    "",
    "## Provider evidence",
    `- Scenario: ${report.scenario.metadata.provider} / ${report.scenario.metadata.model} / ${report.scenario.metadata.latency_ms} ms`,
    ...(report.telemetry ? [`- Telemetry: ${report.telemetry.metadata.provider} / ${report.telemetry.metadata.model} / ${report.telemetry.metadata.latency_ms} ms`] : []),
    `- Report: ${report.metadata.provider} / ${report.metadata.model} / ${report.metadata.latency_ms} ms`,
    `- Report fallback: ${report.metadata.fallback_used ? report.metadata.fallback_reason ?? "yes" : "no"}`,
    ...(report.telemetry ? [
      "",
      "## Telemetry provenance",
      `- Source: ${report.telemetry.source}`,
      `- Samples: ${report.telemetry.summary.sample_count}`,
      `- Duration: ${report.telemetry.summary.duration_minutes ?? 0} minutes`,
      `- Facility energy: ${report.telemetry.summary.estimated_facility_energy_kwh} kWh`,
    ] : []),
    "",
    "## Executive summary",
    report.executive_summary,
    "",
    "## Actions",
    ...report.actions.map((action) => `- ${action}`),
    "",
  ].join("\n");
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
  const initialized = useRef(false);
  const [form, setForm] = useState(defaults);
  const [analyzedForm, setAnalyzedForm] = useState<FormState | null>(null);
  const [options, setOptions] = useState(fallbackOptions);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);
  const [generatedReport, setGeneratedReport] = useState<GeneratedReport | null>(null);
  const [aiHealth, setAiHealth] = useState<AIHealth | null>(null);
  const [runHistory, setRunHistory] = useState<RunSnapshot[]>(loadRunHistory);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [csvText, setCsvText] = useState(sampleCsv);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const report = generatedReport?.response ?? null;

  const field = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const refreshAIHealth = () =>
    fetch(`${API}/api/health/ai`)
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then(setAiHealth)
      .catch(() => {});

  const runAnalysis = async (payload = form, saveRun = false) => {
    setBusy("analysis");
    setError("");
    try {
      const next = await postJson<Analysis>("/api/analyze", payload);
      setAnalysis(next);
      setAnalyzedForm(copySnapshot(payload));
      void refreshAIHealth();
      if (saveRun) {
        const regionLabel = options.grid_regions[payload.grid_region]?.label ?? payload.grid_region;
        const snapshot: RunSnapshot = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: `${payload.gpu_count} x ${payload.gpu_type} / ${regionLabel}`,
          createdAt: new Date().toISOString(),
          input: copySnapshot(payload),
          analysis: copySnapshot(next),
        };
        setRunHistory((current) => {
          const updated = [snapshot, ...current].slice(0, MAX_RUN_HISTORY);
          localStorage.setItem(RUN_HISTORY_KEY, JSON.stringify(updated));
          return updated;
        });
      }
      return next;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
      return null;
    } finally {
      setBusy("");
    }
  };

  const simulateTelemetry = async (payload = analyzedForm ?? form, useAi = true) => {
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
        use_ai: useAi,
      });
      setTelemetry(next);
      if (useAi) void refreshAIHealth();
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
      const context = analyzedForm ?? form;
      const next = await postJson<Telemetry>("/api/telemetry/ingest", {
        source: "amd-smi-csv",
        workload_name: "pasted AMD telemetry",
        gpu_type: context.gpu_type,
        gpu_count: context.gpu_count,
        grid_region: context.grid_region,
        cooling_type: context.cooling_type,
        power_usage_effectiveness: context.power_usage_effectiveness,
        csv_text: csvText,
      });
      setTelemetry(next);
      void refreshAIHealth();
      return next;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Telemetry import failed");
      return null;
    } finally {
      setBusy("");
    }
  };

  const generateReport = async (payload = analyzedForm ?? form, telemetryOverride = telemetry, useAi = true) => {
    setBusy("report");
    setError("");
    try {
      const next = await postJson<Report>("/api/report", {
        scenario: payload,
        use_ai: useAi,
        telemetry: telemetryOverride
          ? {
              source: telemetryOverride.source,
              workload_name: telemetryOverride.workload_name,
              gpu_type: payload.gpu_type,
              gpu_count: payload.gpu_count,
              grid_region: payload.grid_region,
              cooling_type: payload.cooling_type,
              power_usage_effectiveness: payload.power_usage_effectiveness,
              samples: telemetryOverride.samples ?? [],
              csv_text: telemetryOverride.samples?.length ? null : csvText,
            }
          : null,
      });
      setGeneratedReport({
        response: next,
        form: copySnapshot(payload),
        analysis: copySnapshot(next.scenario),
        createdAt: new Date().toISOString(),
      });
      if (useAi) void refreshAIHealth();
      return next;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Report generation failed");
      return null;
    } finally {
      setBusy("");
    }
  };

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    fetch(`${API}/api/options`)
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then(setOptions)
      .catch(() => {});

    (async () => {
      await runAnalysis(defaults);
      const simulated = await simulateTelemetry(defaults, false);
      await generateReport(defaults, simulated, false);
    })();
  }, []);

  const toggleComparison = (id: string) => {
    setCompareIds((current) => {
      if (current.includes(id)) return current.filter((value) => value !== id);
      if (current.length >= 2) return current;
      return [...current, id];
    });
  };

  const clearHistory = () => {
    localStorage.removeItem(RUN_HISTORY_KEY);
    setRunHistory([]);
    setCompareIds([]);
  };

  const comparedRuns = compareIds
    .map((id) => runHistory.find((run) => run.id === id))
    .filter((run): run is RunSnapshot => Boolean(run));

  const draftDirty = analyzedForm
    ? (Object.keys(form) as Array<keyof FormState>).some((key) => form[key] !== analyzedForm[key])
    : false;

  const metrics = useMemo(() => analysis ? [
    ["Energy", `${fmt(analysis.baseline.energy_kwh_per_month)} kWh`, Bolt],
    ["Carbon", `${fmt(analysis.baseline.carbon_kg_co2e_per_month)} kg CO2e`, Leaf],
    ["Water", `${fmt(analysis.baseline.water_liters_per_month)} L`, Droplets],
    ["Facility load", `${fmt(analysis.baseline.facility_power_kw, 1)} kW`, Server],
    ["Utilization", `${fmt(analysis.baseline.utilization_efficiency_percent, 1)}%`, Gauge],
    ["Energy intensity", `${fmt(analysis.baseline.energy_kwh_per_million_tokens, 1)} kWh/M tok`, BarChart3],
  ] : [], [analysis]);

  const regionRows = analysis?.region_comparison ?? [];
  const maxRegionCarbon = Math.max(...regionRows.map((row) => row.carbon_kg_co2e_per_month), 1);
  const comparisonMetrics = [
    ["Energy", "energy_kwh_per_month", "kWh", true],
    ["Carbon", "carbon_kg_co2e_per_month", "kg", true],
    ["Water", "water_liters_per_month", "L", true],
    ["Facility", "facility_power_kw", "kW", true],
    ["Utilization", "utilization_efficiency_percent", "%", false],
  ] as const;

  return (
    <motion.div className="shell" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.22 }}>
      <aside>
        <div className="brand"><span><Leaf size={20} /></span><div><strong>CarbonBuilder</strong><small>Facility intelligence</small></div></div>
        <nav>
          <a className="active" href="#scenario"><Activity size={17} /> Scenario studio</a>
          <a href="#telemetry"><Database size={17} /> Telemetry</a>
          <a href="#report"><BarChart3 size={17} /> Reports</a>
          <a href="#agent"><BrainCircuit size={17} /> Fireworks agent</a>
        </nav>
        <div className="amd"><strong>AMD + Fireworks</strong><span>Inference-backed recommendations with deterministic fallback</span></div>
      </aside>

      <main>
        <header>
          <div><p>AI INFRASTRUCTURE OPERATIONS</p><h1>Carbon, power, and water command center</h1></div>
          <div className="header-status">
            <ProviderBadge metadata={analysis?.metadata} />
            {aiHealth && <small>Fireworks {aiHealth.status}{aiHealth.reason_code ? ` / ${aiHealth.reason_code}` : ""}</small>}
          </div>
        </header>

        <section className="dashboard">
          <MotionSection className="panel scenario-panel" id="scenario" {...cardMotion}>
            <div className="panel-title">
              <div><h2>Scenario planner</h2><p>Model facility impact before capacity is committed.</p></div>
              <div className="planner-status">
                {draftDirty && <span className="draft-status">Draft changed</span>}
                <button className="icon" title="Reset scenario" onClick={() => setForm(defaults)}><RefreshCw size={18} /></button>
              </div>
            </div>
            <div className="form-grid">
              <label className="wide">Workload description<textarea value={`Serve ${fmt(form.monthly_requests)} monthly requests on ${form.gpu_count} ${form.gpu_type} accelerators.`} readOnly /></label>
              <label>GPU type<select value={form.gpu_type} onChange={(event) => field("gpu_type", event.target.value)}>{options.gpu_types.map((value) => <option key={value}>{value}</option>)}</select></label>
              <label>GPU count<input type="number" value={form.gpu_count} onChange={(event) => field("gpu_count", +event.target.value)} /></label>
              <label>Utilization (%)<input type="number" value={form.avg_gpu_utilization} onChange={(event) => field("avg_gpu_utilization", +event.target.value)} /></label>
              <label>PUE<input type="number" step=".01" value={form.power_usage_effectiveness} onChange={(event) => field("power_usage_effectiveness", +event.target.value)} /></label>
              <label>Grid region<select value={form.grid_region} onChange={(event) => field("grid_region", event.target.value)}>{Object.entries(options.grid_regions).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select><small className="factor-note">{fmt((options.grid_regions[form.grid_region]?.carbon_intensity_kg_per_kwh ?? 0) * 1000)} g CO2e/kWh</small></label>
              <label>Cooling<select value={form.cooling_type} onChange={(event) => field("cooling_type", event.target.value)}>{options.cooling_types.map((value) => <option key={value}>{value}</option>)}</select></label>
              <label>Renewable coverage (%)<input type="number" value={form.renewable_percent} onChange={(event) => field("renewable_percent", +event.target.value)} /></label>
              <label>Monthly requests<input type="number" value={form.monthly_requests} onChange={(event) => field("monthly_requests", +event.target.value)} /></label>
            </div>
            <button className="primary" onClick={() => runAnalysis(form, true)} disabled={busy === "analysis"}>{busy === "analysis" ? "Analyzing..." : "Analyze workload"}</button>
            {error && <p className="error">{error}</p>}
          </MotionSection>

          <section className="metric-grid">
            {metrics.map(([label, value, Icon], index) => (
              <MotionArticle
                key={String(label)}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.035, duration: 0.24 }}
                whileHover={{ y: -2 }}
              >
                <span><Icon size={18} /></span><small>{label as string}</small><strong>{value as string}</strong>
              </MotionArticle>
            ))}
          </section>

          <MotionSection className="panel decision-panel" {...cardMotion} transition={{ duration: 0.28, delay: 0.03 }}>
            <div className="panel-title">
              <div><h2>Decision matrix</h2><p>Compare regional factors and preserve the runs used to make a capacity decision.</p></div>
              <span className="factor-source">{options.grid_factor_metadata?.vintage ?? "reference"}</span>
            </div>
            <div className="decision-grid">
              <section className="region-section">
                <div className="section-heading"><span><Globe2 size={17} /> Region comparison</span><small>{options.grid_factor_metadata?.source ?? "Reference factors"}</small></div>
                <div className="region-head"><span>Region</span><span>Intensity</span><span>Carbon / month</span><span>Delta</span></div>
                {regionRows.length ? regionRows.map((row) => (
                  <div className={`region-row ${row.selected ? "selected" : ""}`} key={row.id}>
                    <strong>{row.label}{row.selected ? " / current" : ""}</strong>
                    <span>{fmt(row.carbon_intensity_kg_per_kwh * 1000)} g</span>
                    <span>{fmt(row.carbon_kg_co2e_per_month)} kg</span>
                    <span className={row.carbon_savings_kg_co2e_per_month >= 0 ? "positive" : "negative"}>{row.selected ? "baseline" : `${row.carbon_savings_kg_co2e_per_month >= 0 ? "-" : "+"}${fmt(Math.abs(row.carbon_savings_kg_co2e_per_month))} kg`}</span>
                    <i style={{ width: `${Math.max(3, row.carbon_kg_co2e_per_month / maxRegionCarbon * 100)}%` }} />
                  </div>
                )) : <p className="empty-state">Run the updated API to populate auditable regional comparisons.</p>}
              </section>

              <section className="history-section">
                <div className="section-heading">
                  <span><History size={17} /> Run history</span>
                  <button className="icon subtle" title="Clear run history" onClick={clearHistory} disabled={!runHistory.length}><Trash2 size={16} /></button>
                </div>
                <p className="history-help">Select two saved analyses to compare their operating metrics.</p>
                <div className="run-list">
                  {runHistory.length ? runHistory.map((run) => (
                    <label className="run-row" key={run.id}>
                      <input
                        type="checkbox"
                        aria-label={`Compare ${run.name}`}
                        checked={compareIds.includes(run.id)}
                        disabled={!compareIds.includes(run.id) && compareIds.length >= 2}
                        onChange={() => toggleComparison(run.id)}
                      />
                      <span><strong>{run.name}</strong><small>{new Date(run.createdAt).toLocaleString()}</small></span>
                      <b>{fmt(run.analysis.baseline.carbon_kg_co2e_per_month)} kg</b>
                    </label>
                  )) : <p className="empty-state">Saved analyses appear here after you run the scenario planner.</p>}
                </div>
                {comparedRuns.length === 2 && (
                  <div className="run-comparison">
                    <div className="comparison-head"><span><GitCompare size={15} /> Metric</span><b>A</b><b>B</b><b>Delta</b></div>
                    {comparisonMetrics.map(([label, key, unit, lowerIsBetter]) => {
                      const first = comparedRuns[0].analysis.baseline[key] ?? 0;
                      const second = comparedRuns[1].analysis.baseline[key] ?? 0;
                      const delta = second - first;
                      const favorable = lowerIsBetter ? delta <= 0 : delta >= 0;
                      return <div key={key}><span>{label}</span><b>{fmt(first, 1)}</b><b>{fmt(second, 1)}</b><b className={favorable ? "positive" : "negative"}>{delta > 0 ? "+" : ""}{fmt(delta, 1)} {unit}</b></div>;
                    })}
                  </div>
                )}
              </section>
            </div>
          </MotionSection>

          <MotionSection className="panel telemetry-panel" id="telemetry" {...cardMotion} transition={{ duration: 0.28, delay: 0.04 }}>
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
          </MotionSection>

          <MotionSection className="panel optimization-panel" {...cardMotion} transition={{ duration: 0.28, delay: 0.08 }}>
            <div className="panel-title"><div><h2>Optimization queue</h2><p>Ranked by modeled monthly carbon savings.</p></div></div>
            {analysis?.scenarios.map((item, index) => (
              <div className="scenario" key={item.id}>
                <b>{String(index + 1).padStart(2, "0")}</b>
                <div><strong>{item.title}</strong><p>{item.description}</p><span>{fmt(item.carbon_savings_kg_co2e_per_month)} kg CO2e/mo</span></div>
                <em>{item.carbon_savings_percent}%</em>
              </div>
            ))}
          </MotionSection>

          <MotionSection className="panel agent-panel" id="agent" {...cardMotion} transition={{ duration: 0.28, delay: 0.12 }}>
            <div className="agent-title"><span><BrainCircuit size={20} /></span><div><h2>Fireworks analysis</h2><small>{analysis?.metadata.latency_ms ?? 0} ms scenario latency</small></div></div>
            <p>{analysis?.ai_recommendation ?? "Waiting for workload analysis."}</p>
            <p>{telemetry?.ai_summary ?? "Waiting for telemetry analysis."}</p>
            {analysis?.metadata.fallback_used && <p className="diagnostics">Fallback: {analysis.metadata.fallback_reason ?? "deterministic local analysis"}{analysis.metadata.retryable ? " / retryable" : ""}</p>}
          </MotionSection>

          <MotionSection className="panel report-panel" id="report" {...cardMotion} transition={{ duration: 0.28, delay: 0.16 }}>
            <div className="panel-title">
              <div><h2>Operator report</h2><p>Submission-ready narrative with scenarios, telemetry, and Fireworks evidence.</p></div>
              <div className="report-actions">
                <button className="secondary compact" onClick={() => generateReport()} disabled={busy === "report"}><FileText size={16} /> Generate report</button>
                <button className="icon" title="Download report" onClick={() => generatedReport && downloadMarkdown(`carbonbuilder-operator-report-${generatedReport.createdAt.slice(0, 10)}.md`, reportMarkdown(generatedReport.form, generatedReport.analysis, generatedReport.response))} disabled={!generatedReport}><Download size={17} /></button>
              </div>
            </div>
            <h3>{report?.headline ?? "Report pending"}</h3>
            <p>{report?.executive_summary ?? "Generate a report after scenario and telemetry analysis."}</p>
            <ul>{report?.actions.map((action) => <li key={action}>{action}</li>)}</ul>
          </MotionSection>
        </section>
      </main>
    </motion.div>
  );
}
