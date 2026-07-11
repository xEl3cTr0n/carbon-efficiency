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

function extractResult(trace) {
  const call = [...trace].reverse().find((s) => s.type === 'tool_call' && s.name === 'calculate_footprint')
  return call?.result ?? null
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

  const { carbonIntensity, gpuNodes, powerHistory, connected } = useLiveStream(region)

  useEffect(() => {
    fetchRegions().then(setRegions).catch(() => {})
  }, [])

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
        await fetchReport({
          gpu_type: parsed.gpu_type,
          gpu_count: parsed.gpu_count,
          hours: parsed.hours,
          region: parsed.region,
        })
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
        setDirectResult(data.baseline)
        setTrace([{ type: 'final_answer', text: data.executive_summary }])
        setEngine('manual')
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

      <div className="mb-6">
        <LiveTicker
          carbonIntensity={carbonIntensity}
          connected={connected}
          powerSpark={<Sparkline points={powerHistory} />}
        />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        <WorkloadForm onSubmit={handleAnalyze} loading={loading} />
        <ScenarioForm regions={regions} onSubmit={handleManualAnalyze} loading={manualLoading} />
      </div>

      <div className="mb-6">
        <StatTiles result={result} />
      </div>

      <div className="mb-6">
        <TelemetryCharts nodeId={gpuNodes?.[0]?.node_id} />
      </div>

      <div className="mb-6">
        <CarbonMap
          regions={regions}
          selectedRegion={region}
          onSelectRegion={setRegion}
          liveIntensity={carbonIntensity}
        />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        <OptimizationQueue scenarios={report?.scenarios} />
        <OperatorReport
          report={report}
          onGenerate={handleGenerateReport}
          loading={reportLoading}
          disabled={!result}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <AgentTrace trace={trace} engine={engine} />
        <RegionTable regions={regions} />
      </div>
    </div>
  )
}

export default App
