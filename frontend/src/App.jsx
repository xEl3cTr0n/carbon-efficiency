import { useEffect, useState } from 'react'
import { estimateFromText, fetchRegions } from './api'
import { useLiveStream } from './hooks/useLiveStream'
import WorkloadForm from './components/WorkloadForm'
import StatTiles from './components/StatTiles'
import AgentTrace from './components/AgentTrace'
import RegionTable from './components/RegionTable'
import LiveTicker from './components/LiveTicker'
import Sparkline from './components/Sparkline'

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

  const { carbonIntensity, powerHistory, connected } = useLiveStream(region)

  useEffect(() => {
    fetchRegions().then(setRegions).catch(() => {})
  }, [])

  async function handleAnalyze(text) {
    setLoading(true)
    try {
      const data = await estimateFromText(text)
      setTrace(data.trace)
      setEngine(data.engine ?? null)
    } catch (err) {
      setTrace([{ type: 'final_answer', text: `Error: ${err.message}. Is the backend running on :8000?` }])
      setEngine(null)
    } finally {
      setLoading(false)
    }
  }

  const result = trace ? extractResult(trace) : null

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

      <div className="mb-6">
        <WorkloadForm onSubmit={handleAnalyze} loading={loading} />
      </div>

      <div className="mb-6">
        <StatTiles result={result} />
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <AgentTrace trace={trace} engine={engine} />
        <RegionTable regions={regions} />
      </div>
    </div>
  )
}

export default App
