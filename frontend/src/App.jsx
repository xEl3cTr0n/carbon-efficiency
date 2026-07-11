import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { estimateFromText, fetchRegions, generateReport } from './api'
import { useLiveStream } from './hooks/useLiveStream'
import WorkloadForm from './components/WorkloadForm'
import ScenarioForm from './components/ScenarioForm'
import StatTiles from './components/StatTiles'
import RegionTable from './components/RegionTable'
import LiveTicker from './components/LiveTicker'
import Sparkline from './components/Sparkline'
import OptimizationQueue from './components/OptimizationQueue'
import OperatorReport from './components/OperatorReport'
import TelemetryCharts from './components/TelemetryCharts'
import RunHistory from './components/RunHistory'
import RunComparison from './components/RunComparison'
import EfficiencyGauge from './components/EfficiencyGauge'
import ImpactEquivalents from './components/ImpactEquivalents'
import Tabs from './components/Tabs'
import CommandPalette from './components/CommandPalette'
import OnboardingTour from './components/OnboardingTour'
import VideoDemo from './components/VideoDemo'
import { SHOW_VIDEO_TAB } from './videoConfig'
import { motion, AnimatePresence } from 'motion/react'
import {
  Activity,
  Radio,
  TrendingDown,
  MapPin,
  Link2,
  Play,
  Square,
  Trash2,
  Command,
  HelpCircle,
  Clapperboard,
} from 'lucide-react'

// Deferred: these pull in d3-geo/topojson-client/world-atlas and
// react-markdown/remark-gfm respectively - split out of the main
// bundle since they're each only needed once a specific tab is open.
const CarbonMap = lazy(() => import('./components/CarbonMap'))
const AgentTrace = lazy(() => import('./components/AgentTrace'))

function PanelSkeleton({ height = 'h-64' }) {
  return <div className={`animate-pulse rounded-xl border border-slate-800 bg-slate-900/40 ${height}`} />
}

const TABS = [
  { id: 'analyze', label: 'Analyze', icon: Activity },
  { id: 'live', label: 'Live Ops', icon: Radio },
  { id: 'optimization', label: 'Optimization', icon: TrendingDown },
  { id: 'regions', label: 'Regions', icon: MapPin },
  ...(SHOW_VIDEO_TAB ? [{ id: 'video', label: 'Demo', icon: Clapperboard }] : []),
]

const DEMO_SCENARIOS = [
  { gpu_type: 'H100-SXM', gpu_count: 16, hours: 48, region: 'texas' },
  { gpu_type: 'MI300X', gpu_count: 16, hours: 48, region: 'virginia' },
  { gpu_type: 'H100-PCIe', gpu_count: 16, hours: 48, region: 'norway' },
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
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [demoStep, setDemoStep] = useState(null)
  const [linkCopied, setLinkCopied] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(() => !localStorage.getItem('carbonpilot_onboarded'))
  const demoStopRef = useRef(false)

  function dismissOnboarding() {
    try {
      localStorage.setItem('carbonpilot_onboarded', '1')
    } catch {
      // storage unavailable - tour will just show again next visit
    }
    setShowOnboarding(false)
  }

  const { carbonIntensity, gpuNodes, powerHistory, connected } = useLiveStream(region)

  useEffect(() => {
    fetchRegions().then(setRegions).catch(() => {})
  }, [])

  // Deep-link support: ?gpu=MI300X&count=8&hours=24&region=virginia auto-runs that scenario.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const gpu_type = params.get('gpu')
    const region_p = params.get('region')
    if (gpu_type && region_p) {
      handleManualAnalyze({
        gpu_type,
        gpu_count: Number(params.get('count')) || 8,
        hours: Number(params.get('hours')) || 24,
        region: region_p,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    function handleKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((v) => !v)
        return
      }
      const tag = document.activeElement?.tagName
      const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
      if (!isTyping && ['1', '2', '3', '4'].includes(e.key)) {
        setTab(TABS[Number(e.key) - 1].id)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
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

  const resultKey = result ? `${result.gpu_type}|${result.gpu_count}|${result.hours}|${result.region}` : null

  useEffect(() => {
    if (!result) return
    const params = new URLSearchParams({
      gpu: result.gpu_type,
      count: String(result.gpu_count),
      hours: String(result.hours),
      region: result.region,
    })
    window.history.replaceState(null, '', `?${params.toString()}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultKey])

  async function copyShareLink() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 1500)
    } catch {
      // clipboard unavailable - silently no-op
    }
  }

  async function runDemo() {
    demoStopRef.current = false
    setTab('analyze')
    for (let i = 0; i < DEMO_SCENARIOS.length; i++) {
      if (demoStopRef.current) break
      setDemoStep(i)
      await handleManualAnalyze(DEMO_SCENARIOS[i])
      await new Promise((resolve) => setTimeout(resolve, 3500))
    }
    setDemoStep(null)
  }

  function stopDemo() {
    demoStopRef.current = true
    setDemoStep(null)
  }

  const paletteActions = [
    { id: 'tab-analyze', label: 'Go to Analyze', icon: Activity, run: () => setTab('analyze') },
    { id: 'tab-live', label: 'Go to Live Ops', icon: Radio, run: () => setTab('live') },
    { id: 'tab-optimization', label: 'Go to Optimization', icon: TrendingDown, run: () => setTab('optimization') },
    { id: 'tab-regions', label: 'Go to Regions', icon: MapPin, run: () => setTab('regions') },
    { id: 'run-demo', label: 'Run demo mode', icon: Play, run: runDemo },
    { id: 'copy-link', label: 'Copy shareable link', icon: Link2, run: copyShareLink },
    { id: 'clear-history', label: 'Clear run history', icon: Trash2, run: clearRuns },
    { id: 'show-tour', label: 'Show onboarding tour', icon: HelpCircle, run: () => setShowOnboarding(true) },
  ]

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-50">CarbonPilot</h1>
          <p className="text-sm text-slate-400">Agentic carbon, energy &amp; water footprint analyzer for AI workloads</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={copyShareLink}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 hover:border-emerald-500"
            title="Copy a shareable link to this scenario"
          >
            <Link2 size={14} />
            {linkCopied ? 'Copied!' : 'Share'}
          </button>
          {demoStep === null ? (
            <button
              onClick={runDemo}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 hover:border-emerald-500"
              title="Auto-play through preset scenarios"
            >
              <Play size={14} />
              Run demo
            </button>
          ) : (
            <button
              onClick={stopDemo}
              className="flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-sm text-rose-300"
            >
              <Square size={14} />
              Stop demo
            </button>
          )}
          <button
            onClick={() => setPaletteOpen(true)}
            className="hidden items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-400 hover:border-emerald-500 sm:flex"
            title="Command palette"
          >
            <Command size={14} />
            <kbd className="text-[10px]">⌘K</kbd>
          </button>
          <button
            onClick={() => setShowOnboarding(true)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-400 hover:border-emerald-500"
            title="Show the quick tour"
          >
            <HelpCircle size={14} />
          </button>
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-200"
          >
            {regions.map((r) => (
              <option key={r.region} value={r.region}>{r.label}</option>
            ))}
          </select>
        </div>
      </header>

      {demoStep !== null && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-300">
          <span>Demo running — scenario {demoStep + 1} of {DEMO_SCENARIOS.length}</span>
          <button onClick={stopDemo} className="text-xs underline hover:no-underline">Stop</button>
        </div>
      )}

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} actions={paletteActions} />

      {showOnboarding && <OnboardingTour onDone={dismissOnboarding} />}

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
        >
          {tab === 'analyze' && (
            <>
              <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
                <WorkloadForm onSubmit={handleAnalyze} loading={loading} />
                <ScenarioForm regions={regions} onSubmit={handleManualAnalyze} loading={manualLoading} />
              </div>

              <div className="mb-6">
                <StatTiles result={result} />
              </div>

              <div className="mb-6">
                <ImpactEquivalents result={result} />
              </div>

              <div className="mb-6">
                <EfficiencyGauge efficiency={report?.efficiency} />
              </div>

              <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
                <Suspense fallback={<PanelSkeleton />}>
                  <AgentTrace trace={trace} engine={engine} />
                </Suspense>
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

              <Suspense fallback={<PanelSkeleton height="h-96" />}>
                <CarbonMap
                  regions={regions}
                  selectedRegion={region}
                  onSelectRegion={setRegion}
                  liveIntensity={carbonIntensity}
                />
              </Suspense>
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

          {SHOW_VIDEO_TAB && tab === 'video' && <VideoDemo />}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

export default App
