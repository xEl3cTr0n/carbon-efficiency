import { useEffect, useState } from 'react'
import { estimateFromText, fetchRegions, generateReport } from './api'
import { useLiveStream } from './hooks/useLiveStream'
import WorkloadForm from './components/WorkloadForm'
import ScenarioForm from './components/ScenarioForm'
import StatTiles from './components/StatTiles'
import AgentTrace from './components/AgentTrace'
import RegionTable from './components/RegionTable'
import LiveTicker from './components/LiveTicker'
import Sparkline from './components/Sparkline'
import CarbonMap from './components/CarbonMap'
import OptimizationQueue from './components/OptimizationQueue'
import OperatorReport from './components/OperatorReport'
import TelemetryCharts from './components/TelemetryCharts'
import RunHistory from './components/RunHistory'
import RunComparison from './components/RunComparison'
import Tabs from './components/Tabs'
import { Activity, Radio, TrendingDown, MapPin } from 'lucide-react'

const TABS = [
  { id: 'analyze', label: 'Analyze', icon: Activity },
  { id: 'live', label: 'Live Ops', icon: Radio },
  { id: 'optimization', label: 'Optimization', icon: TrendingDown },
  { id: 'regions', label: 'Regions', icon: MapPin },
]

function extractResult(trace) {
  const call = [...trace].reverse().find((s) => s.type === 'tool_call' && s.name === 'calculate_footprint')
  return call?.result ?? null
}

const RUNS_STORAGE_KEY = 'carbonpilot_runs'

function loadStoredRuns() {
  try {
    const raw = localStorage.getItem(RUNS_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function App() {
  const [region, setRegion] = useState('virginia')
  const [regions, setRegions] = useState([])
  const [trace, setTrace] = useState(null)
  const [engine, setEngine] = useState(null)
  const [loading, setLoading] = useState(false)
  const [report, setReport] = useState(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [directResult, setDirectResult] = useState(null)
  const [manualLoading, setManualLoading] = useState(false)
  const [tab, setTab] = useState('analyze')
  const [runs, setRuns] = useState(loadStoredRuns)
  const [compareIds, setCompareIds] = useState([])

  const { carbonIntensity, gpuNodes, powerHistory, connected } = useLiveStream(region)

  useEffect(() => {
    fetchRegions().then(setRegions).catch(() => {})
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(RUNS_STORAGE_KEY, JSON.stringify(runs))
    } catch {
      // storage full or unavailable (private browsing) - history just won't persist
    }
  }, [runs])

  function toggleCompare(id) {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (prev.length >= 2) return prev
      return [...prev, id]
    })
  }

  function clearRuns() {
    setRuns([])
    setCompareIds([])
  }

  function recordRun({ engineUsed, trace: runTrace, result: runResult, report: runReport }) {
    if (!runResult) return
    const regionLabel = regions.find((r) => r.region === runResult.region)?.label ?? runResult.region
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      label: `${runResult.gpu_count}x ${runResult.gpu_type} · ${regionLabel}`,
      carbonKg: runResult.carbon_kg,
      engine: engineUsed,
      trace: runTrace,
      directResult: runResult,
      report: runReport,
    }
    setRuns((prev) => [entry, ...prev].slice(0, 10))
  }

  function loadRun(entry) {
    setTrace(entry.trace)
    setEngine(entry.engine)
    setDirectResult(entry.directResult)
    setReport(entry.report)
    setTab('analyze')
  }

  async function fetchReport(fields) {
    setReportLoading(true)
    try {
      const nodeId = gpuNodes?.[0]?.node_id
      const data = await generateReport({ ...fields, ...(nodeId ? { node_id: nodeId } : {}) })
      setReport(data)
      return data
    } catch {
      setReport(null)
      return null
    } finally {
      setReportLoading(false)
    }
  }

  async function handleAnalyze(text) {
    setLoading(true)
    setReport(null)
    setDirectResult(null)
    try {
      const data = await estimateFromText(text)
      setTrace(data.trace)
      setEngine(data.engine ?? null)
      const parsed = extractResult(data.trace)
      if (parsed) {
        const reportData = await fetchReport({
          gpu_type: parsed.gpu_type,
          gpu_count: parsed.gpu_count,
          hours: parsed.hours,
          region: parsed.region,
        })
        recordRun({ engineUsed: data.engine ?? null, trace: data.trace, result: parsed, report: reportData })
      }
    } catch (err) {
      setTrace([{ type: 'final_answer', text: `Error: ${err.message}. Is the backend running on :8000?` }])
      setEngine(null)
    } finally {
      setLoading(false)
    }
  }

  async function handleManualAnalyze(fields) {
    setManualLoading(true)
    try {
      const data = await fetchReport(fields)
      if (data) {
        const manualTrace = [{ type: 'final_answer', text: data.executive_summary }]
        setDirectResult(data.baseline)
        setTrace(manualTrace)
        setEngine('manual')
        recordRun({ engineUsed: 'manual', trace: manualTrace, result: data.baseline, report: data })
      }
    } finally {
      setManualLoading(false)
    }
  }

  const result = (trace && extractResult(trace)) || directResult

  function handleGenerateReport() {
    if (!result) return
    return fetchReport({
      gpu_type: result.gpu_type,
      gpu_count: result.gpu_count,
      hours: result.hours,
      region: result.region,
    })
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-50">CarbonPilot</h1>
          <p className="text-sm text-slate-400">Agentic carbon, energy &amp; water footprint analyzer for AI workloads</p>
        </div>
        <select
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-200"
        >
          {regions.map((r) => (
            <option key={r.region} value={r.region}>{r.label}</option>
          ))}
        </select>
      </header>

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'analyze' && (
        <>
          <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
            <WorkloadForm onSubmit={handleAnalyze} loading={loading} />
            <ScenarioForm regions={regions} onSubmit={handleManualAnalyze} loading={manualLoading} />
          </div>

          <div className="mb-6">
            <StatTiles result={result} />
          </div>

          <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
            <AgentTrace trace={trace} engine={engine} />
            <RunHistory
              runs={runs}
              onSelect={loadRun}
              onClear={clearRuns}
              compareIds={compareIds}
              onToggleCompare={toggleCompare}
            />
          </div>

          {compareIds.length === 2 && (
            <RunComparison
              runA={runs.find((r) => r.id === compareIds[0])}
              runB={runs.find((r) => r.id === compareIds[1])}
              onClear={() => setCompareIds([])}
            />
          )}
        </>
      )}

      {tab === 'live' && (
        <>
          <div className="mb-6">
            <LiveTicker
              carbonIntensity={carbonIntensity}
              connected={connected}
              powerSpark={<Sparkline points={powerHistory} />}
            />
          </div>

          <div className="mb-6">
            <TelemetryCharts gpuNodes={gpuNodes} />
          </div>

          <CarbonMap
            regions={regions}
            selectedRegion={region}
            onSelectRegion={setRegion}
            liveIntensity={carbonIntensity}
          />
        </>
      )}

      {tab === 'optimization' && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <OptimizationQueue scenarios={report?.scenarios} />
          <OperatorReport
            report={report}
            onGenerate={handleGenerateReport}
            loading={reportLoading}
            disabled={!result}
          />
        </div>
      )}

      {tab === 'regions' && <RegionTable regions={regions} />}
    </div>
  )
}

export default App
