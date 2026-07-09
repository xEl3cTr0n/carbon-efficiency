import { useEffect, useState } from "react";
import { Activity, Bolt, BrainCircuit, Droplets, Gauge, Leaf, RefreshCw, Server } from "lucide-react";

type FormState = {
  workload_type: string; monthly_requests: number; avg_tokens_per_request: number;
  gpu_count: number; gpu_type: string; avg_gpu_utilization: number;
  power_usage_effectiveness: number; grid_region: string;
  renewable_percent: number; cooling_type: string;
};
type Options = {
  gpu_types: string[]; workload_types: string[]; cooling_types: string[];
  grid_regions: Record<string, { label: string; carbon_intensity_kg_per_kwh: number }>;
};
type Analysis = {
  baseline: Record<string, number>;
  scenarios: Array<{ id: string; title: string; description: string; energy_savings_kwh_per_month: number; carbon_savings_kg_co2e_per_month: number; carbon_savings_percent: number }>;
  ai_recommendation: string;
  metadata: { provider: string; model: string; latency_ms: number; fallback_used: boolean };
};

const API = import.meta.env.VITE_API_BASE_URL ?? "";
const defaults: FormState = {
  workload_type: "llm_inference", monthly_requests: 6_000_000, avg_tokens_per_request: 750,
  gpu_count: 16, gpu_type: "AMD MI300X", avg_gpu_utilization: 55,
  power_usage_effectiveness: 1.25, grid_region: "california", renewable_percent: 25, cooling_type: "hybrid",
};

const fallbackOptions: Options = {
  gpu_types: ["AMD MI300X", "AMD MI250X", "NVIDIA H100"],
  workload_types: ["llm_inference", "training", "batch_analytics"],
  cooling_types: ["air", "evaporative", "hybrid", "liquid"],
  grid_regions: { california: { label: "California", carbon_intensity_kg_per_kwh: .164 } },
};

const fmt = (value: number, digits = 0) => value.toLocaleString(undefined, { maximumFractionDigits: digits });

export default function App() {
  const [form, setForm] = useState(defaults);
  const [options, setOptions] = useState(fallbackOptions);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const analyze = async (payload = form) => {
    setBusy(true); setError("");
    try {
      const response = await fetch(`${API}/api/analyze`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error("Analysis service unavailable");
      setAnalysis(await response.json());
    } catch (err) { setError(err instanceof Error ? err.message : "Analysis failed"); }
    finally { setBusy(false); }
  };

  useEffect(() => {
    fetch(`${API}/api/options`).then(r => r.ok ? r.json() : Promise.reject()).then(setOptions).catch(() => {});
    analyze(defaults);
  }, []);

  const field = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm(current => ({ ...current, [key]: value }));
  const metrics = analysis ? [
    ["Energy", `${fmt(analysis.baseline.energy_kwh_per_month)} kWh`, Bolt],
    ["Carbon", `${fmt(analysis.baseline.carbon_kg_co2e_per_month)} kg CO2e`, Leaf],
    ["Water", `${fmt(analysis.baseline.water_liters_per_month)} L`, Droplets],
    ["Facility load", `${fmt(analysis.baseline.facility_power_kw, 1)} kW`, Server],
    ["Utilization score", `${fmt(analysis.baseline.utilization_efficiency_percent, 1)}%`, Gauge],
  ] : [];

  return <div className="shell">
    <aside>
      <div className="brand"><span><Leaf size={20}/></span><div><strong>CarbonBuilder</strong><small>Facility intelligence</small></div></div>
      <nav><a className="active"><Activity size={17}/> Scenario studio</a><a><Server size={17}/> Infrastructure</a><a><BrainCircuit size={17}/> Recommendations</a></nav>
      <div className="amd"><strong>AMD + Fireworks</strong><span>Compute path instrumented</span></div>
    </aside>
    <main>
      <header><div><p>DATA CENTER OPERATIONS</p><h1>Power & utility efficiency</h1></div><div className={`provider ${analysis?.metadata.fallback_used ? "fallback" : ""}`}><i/>{analysis ? `${analysis.metadata.provider} / ${analysis.metadata.model}` : "connecting"}</div></header>
      <section className="workspace">
        <div className="panel input-panel">
          <div className="panel-title"><div><h2>Workload scenario</h2><p>Model facility impact before capacity is committed.</p></div><button className="icon" title="Reset scenario" onClick={() => setForm(defaults)}><RefreshCw size={18}/></button></div>
          <div className="form-grid">
            <label className="wide">Workload description<textarea value={`Serve ${fmt(form.monthly_requests)} monthly requests on ${form.gpu_count} ${form.gpu_type} accelerators.`} readOnly /></label>
            <label>GPU type<select value={form.gpu_type} onChange={e => field("gpu_type", e.target.value)}>{options.gpu_types.map(v => <option key={v}>{v}</option>)}</select></label>
            <label>GPU count<input type="number" value={form.gpu_count} onChange={e => field("gpu_count", +e.target.value)} /></label>
            <label>Utilization (%)<input type="number" value={form.avg_gpu_utilization} onChange={e => field("avg_gpu_utilization", +e.target.value)} /></label>
            <label>PUE<input type="number" step=".01" value={form.power_usage_effectiveness} onChange={e => field("power_usage_effectiveness", +e.target.value)} /></label>
            <label>Grid region<select value={form.grid_region} onChange={e => field("grid_region", e.target.value)}>{Object.entries(options.grid_regions).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
            <label>Cooling<select value={form.cooling_type} onChange={e => field("cooling_type", e.target.value)}>{options.cooling_types.map(v => <option key={v}>{v}</option>)}</select></label>
            <label>Renewable coverage (%)<input type="number" value={form.renewable_percent} onChange={e => field("renewable_percent", +e.target.value)} /></label>
            <label>Monthly requests<input type="number" value={form.monthly_requests} onChange={e => field("monthly_requests", +e.target.value)} /></label>
          </div>
          <button className="primary" onClick={() => analyze()} disabled={busy}>{busy ? "Analyzing..." : "Analyze workload"}</button>
          {error && <p className="error">{error}</p>}
        </div>
        <div className="results">
          <div className="metric-grid">{metrics.map(([label,value,Icon]) => <article key={String(label)}><span><Icon size={18}/></span><small>{label as string}</small><strong>{value as string}</strong></article>)}</div>
          <div className="lower-grid">
            <section className="panel scenarios"><div className="panel-title"><div><h2>Optimization queue</h2><p>Ranked by modeled monthly carbon savings.</p></div></div>
              {analysis?.scenarios.map((item, index) => <div className="scenario" key={item.id}><b>{String(index + 1).padStart(2,"0")}</b><div><strong>{item.title}</strong><p>{item.description}</p><span>{fmt(item.carbon_savings_kg_co2e_per_month)} kg CO2e/mo</span></div><em>{item.carbon_savings_percent}%</em></div>)}
            </section>
            <section className="panel recommendation"><div className="agent-title"><span><BrainCircuit size={20}/></span><div><h2>Efficiency agent</h2><small>{analysis?.metadata.latency_ms ?? 0} ms</small></div></div><p>{analysis?.ai_recommendation ?? "Waiting for workload analysis."}</p><div className="bars">{analysis?.scenarios.slice(0,3).map((x, index) => <div key={x.id}><label>Scenario {index + 1}<span>{x.carbon_savings_percent}% potential</span></label><i><b style={{width:`${Math.min(x.carbon_savings_percent * 4,100)}%`}}/></i></div>)}</div></section>
          </div>
        </div>
      </section>
    </main>
  </div>;
}
