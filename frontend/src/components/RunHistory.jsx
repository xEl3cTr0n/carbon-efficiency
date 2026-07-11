import { History, Leaf, GitCompare } from 'lucide-react'

const ENGINE_DOT = {
  fireworks: 'bg-emerald-400',
  claude: 'bg-sky-400',
  manual: 'bg-slate-400',
  fallback: 'bg-amber-400',
}

export default function RunHistory({ runs, onSelect, onClear, compareIds = [], onToggleCompare }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History size={16} className="text-emerald-400" />
          <div>
            <h2 className="text-sm font-medium text-slate-200">Run history</h2>
            <p className="text-xs text-slate-500">Click to reload · check two to compare</p>
          </div>
        </div>
        {runs.length > 0 && (
          <button onClick={onClear} className="text-xs text-slate-600 hover:text-slate-400">
            Clear
          </button>
        )}
      </div>

      {!runs.length && (
        <p className="text-sm text-slate-600">Runs you generate will appear here and persist across reloads.</p>
      )}

      <div className="space-y-1.5">
        {runs.map((run) => {
          const checked = compareIds.includes(run.id)
          const disabled = !checked && compareIds.length >= 2
          return (
            <div
              key={run.id}
              className="flex w-full items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 hover:border-emerald-500/50"
            >
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleCompare?.(run.id)
                }}
                disabled={disabled}
                title={disabled ? 'Uncheck one first (compare is limited to 2)' : 'Select for comparison'}
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                  checked ? 'border-emerald-500 bg-emerald-500/20 text-emerald-400' : 'border-slate-600 text-transparent'
                } disabled:opacity-30`}
              >
                <GitCompare size={10} />
              </button>
              <button onClick={() => onSelect(run)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${ENGINE_DOT[run.engine] ?? 'bg-slate-600'}`} />
                <span className="min-w-0 flex-1 truncate text-xs text-slate-200">{run.label}</span>
                <span className="flex shrink-0 items-center gap-1 text-xs text-emerald-400">
                  <Leaf size={12} />
                  {run.carbonKg} kg
                </span>
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
