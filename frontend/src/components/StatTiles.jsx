import { Zap, Leaf, Droplets, TreePine } from 'lucide-react'

function Tile({ label, value, unit, source, icon: Icon }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-slate-400">
          {Icon && <Icon size={14} className="text-emerald-500" />}
          {label}
        </span>
        {source && (
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
              source === 'live' || source === 'measured'
                ? 'bg-emerald-500/15 text-emerald-400'
                : 'bg-slate-700/50 text-slate-400'
            }`}
          >
            {source}
          </span>
        )}
      </div>
      <div className="mt-2 text-2xl font-semibold text-slate-50">
        {value} <span className="text-base font-normal text-slate-400">{unit}</span>
      </div>
    </div>
  )
}

export default function StatTiles({ result }) {
  if (!result) {
    return (
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {['Energy', 'Carbon', 'Water', 'Trees/yr'].map((label) => (
          <div key={label} className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 text-slate-600">
            <span className="text-xs uppercase tracking-wide">{label}</span>
            <div className="mt-2 text-2xl">—</div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      <Tile label="Energy used" value={result.energy_kwh} unit="kWh" icon={Zap} />
      <Tile label="Carbon emissions" value={result.carbon_kg} unit="kg CO2e" source={result.carbon_intensity_source} icon={Leaf} />
      <Tile label="Water usage" value={result.water_l} unit="liters" icon={Droplets} />
      <Tile label="Trees to offset" value={result.trees_per_year} unit="trees/yr" icon={TreePine} />
    </div>
  )
}
