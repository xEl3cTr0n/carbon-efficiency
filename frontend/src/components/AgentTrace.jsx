const ENGINE_LABELS = {
  fireworks: 'Fireworks · AMD MI300X',
  claude: 'Claude',
  fallback: 'Fallback parser',
}

function EngineBadge({ engine }) {
  if (!engine) return null
  const isAmd = engine === 'fireworks'
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
        isAmd ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-700/50 text-slate-400'
      }`}
    >
      {ENGINE_LABELS[engine] || engine}
    </span>
  )
}

export default function AgentTrace({ trace, engine }) {
  if (!trace) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 text-sm text-slate-600">
        Describe a workload above and hit Analyze to see the agent reason through it.
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-slate-300">CarbonPilot agent analysis</h3>
        <EngineBadge engine={engine} />
      </div>
      <div className="space-y-2 text-sm">
        {trace.map((step, i) => {
          if (step.type === 'thought') {
            return (
              <p key={i} className="text-slate-400">
                <span className="text-slate-600">Thought: </span>
                {step.text}
              </p>
            )
          }
          if (step.type === 'tool_call') {
            return (
              <div key={i} className="rounded-lg bg-slate-800/50 p-2 font-mono text-xs text-slate-400">
                <span className="text-sky-400">{step.name}</span>({JSON.stringify(step.input)})
              </div>
            )
          }
          return (
            <p key={i} className="font-medium text-emerald-300">
              {step.text}
            </p>
          )
        })}
      </div>
    </div>
  )
}
