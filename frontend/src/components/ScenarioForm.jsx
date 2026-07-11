import { useEffect, useState } from 'react'
import { Cpu, Hash, Clock, MapPin } from 'lucide-react'
import { fetchGpus } from '../api'

const FIELD_ICONS = { gpu_type: Cpu, gpu_count: Hash, hours: Clock, region: MapPin }

function Field({ id, label, children }) {
  const Icon = FIELD_ICONS[id]
  return (
    <label className="block">
      <span className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
        {Icon && <Icon size={13} className="text-emerald-500" />}
        {label}
      </span>
      {children}
    </label>
  )
}

const inputClass =
  'mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none'

export default function ScenarioForm({ regions, onSubmit, loading }) {
  const [gpuTypes, setGpuTypes] = useState([])
  const [fields, setFields] = useState({ gpu_type: 'MI300X', gpu_count: 8, hours: 24, region: 'virginia' })

  useEffect(() => {
    fetchGpus()
      .then((specs) => setGpuTypes(Object.keys(specs)))
      .catch(() => {})
  }, [])

  const field = (key, value) => setFields((prev) => ({ ...prev, [key]: value }))

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <label className="text-sm font-medium text-slate-300">Or build a scenario directly</label>
      <p className="mt-1 text-xs text-slate-500">
        Skip the agent — pick exact GPU, count, duration, and region for a precise calculation.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Field id="gpu_type" label="GPU type">
          <select className={inputClass} value={fields.gpu_type} onChange={(e) => field('gpu_type', e.target.value)}>
            {gpuTypes.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </Field>
        <Field id="gpu_count" label="GPU count">
          <input
            type="number"
            min={1}
            className={inputClass}
            value={fields.gpu_count}
            onChange={(e) => field('gpu_count', Number(e.target.value))}
          />
        </Field>
        <Field id="hours" label="Hours">
          <input
            type="number"
            min={0.1}
            step={0.5}
            className={inputClass}
            value={fields.hours}
            onChange={(e) => field('hours', Number(e.target.value))}
          />
        </Field>
        <Field id="region" label="Region">
          <select className={inputClass} value={fields.region} onChange={(e) => field('region', e.target.value)}>
            {regions.map((r) => (
              <option key={r.region} value={r.region}>{r.label}</option>
            ))}
          </select>
        </Field>
      </div>

      <button
        onClick={() => onSubmit(fields)}
        disabled={loading}
        className="mt-3 rounded-lg border border-slate-700 bg-slate-950 px-4 py-2 text-sm font-medium text-slate-200 hover:border-emerald-500 disabled:opacity-50"
      >
        {loading ? 'Calculating…' : 'Calculate →'}
      </button>
    </div>
  )
}
