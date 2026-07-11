import { motion } from 'motion/react'
import { FileText, Zap } from 'lucide-react'

export default function OperatorReport({ report, onGenerate, loading, disabled }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText size={16} className="text-emerald-400" />
          <div>
            <h2 className="text-sm font-medium text-slate-200">Operator report</h2>
            <p className="text-xs text-slate-500">Auto-generated with live evidence when available</p>
          </div>
        </div>
        <button
          onClick={onGenerate}
          disabled={disabled || loading}
          className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-emerald-500 disabled:opacity-40"
        >
          {loading ? 'Refreshing…' : 'Refresh report'}
        </button>
      </div>

      {!report && (
        <p className="text-sm text-slate-600">Run an analysis above — the report generates automatically.</p>
      )}

      {report && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          <p className="text-sm leading-relaxed text-slate-300">{report.executive_summary}</p>

          {report.telemetry_note && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
              <Zap size={14} className="mt-0.5 shrink-0 text-emerald-400" />
              <p className="text-xs text-emerald-300">{report.telemetry_note}</p>
            </div>
          )}

          <ul className="mt-3 space-y-1.5">
            {report.actions.map((action, i) => (
              <li key={i} className="flex gap-2 text-xs text-slate-400">
                <span className="text-emerald-500">→</span>
                {action}
              </li>
            ))}
          </ul>
        </motion.div>
      )}
    </div>
  )
}
