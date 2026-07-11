import { GitCompare, X } from 'lucide-react'

const METRICS = [
  { key: 'energy_kwh', label: 'Energy', unit: 'kWh' },
  { key: 'carbon_kg', label: 'Carbon', unit: 'kg CO2e' },
  { key: 'water_l', label: 'Water', unit: 'L' },
  { key: 'trees_per_year', label: 'Trees/yr to offset', unit: '' },
]

function DeltaBadge({ a, b }) {
  if (!a || a === 0) return <span className="text-slate-600">—</span>
  const pct = ((b - a) / a) * 100
  const better = pct < 0
  const worse = pct > 0
  return (
    <span className={`text-xs font-medium ${better ? 'text-emerald-400' : worse ? 'text-rose-400' : 'text-slate-500'}`}>
      {pct > 0 ? '+' : ''}{pct.toFixed(1)}%
    </span>
  )
}

export default function RunComparison({ runA, runB, onClear }) {
  if (!runA || !runB) return null

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitCompare size={16} className="text-emerald-400" />
          <h2 className="text-sm font-medium text-slate-200">Comparing 2 runs</h2>
        </div>
        <button onClick={onClear} className="text-slate-600 hover:text-slate-400">
          <X size={14} />
        </button>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-3 text-xs">
        <div className="truncate rounded-lg border border-slate-800 bg-slate-950/60 px-2 py-1.5 text-slate-300">{runA.label}</div>
        <div className="truncate rounded-lg border border-slate-800 bg-slate-950/60 px-2 py-1.5 text-slate-300">{runB.label}</div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-800/60 text-slate-400">
            <tr>
              <th className="px-3 py-2 font-medium">Metric</th>
              <th className="px-3 py-2 font-medium">Run A</th>
              <th className="px-3 py-2 font-medium">Run B</th>
              <th className="px-3 py-2 font-medium">Change</th>
            </tr>
          </thead>
          <tbody>
            {METRICS.map((m) => {
              const a = runA.directResult?.[m.key]
              const b = runB.directResult?.[m.key]
              return (
                <tr key={m.key} className="border-t border-slate-800">
                  <td className="px-3 py-2 text-slate-400">{m.label}</td>
                  <td className="px-3 py-2 text-slate-200">{a} {m.unit}</td>
                  <td className="px-3 py-2 text-slate-200">{b} {m.unit}</td>
                  <td className="px-3 py-2"><DeltaBadge a={a} b={b} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
