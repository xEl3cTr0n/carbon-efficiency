import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ChevronDown, ChevronRight } from 'lucide-react'

const ENGINE_LABELS = {
  fireworks: 'Fireworks · AMD MI300X',
  claude: 'Claude',
  fallback: 'Fallback parser',
  manual: 'Direct calculation',
}

const MARKDOWN_COMPONENTS = {
  p: (props) => <p className="mb-2 leading-relaxed text-slate-200" {...props} />,
  strong: (props) => <strong className="font-semibold text-emerald-300" {...props} />,
  ul: (props) => <ul className="mb-2 list-disc space-y-1 pl-5 text-slate-300" {...props} />,
  li: (props) => <li {...props} />,
  h1: (props) => <h4 className="mb-1 mt-3 font-semibold text-slate-100" {...props} />,
  h2: (props) => <h4 className="mb-1 mt-3 font-semibold text-slate-100" {...props} />,
  h3: (props) => <h4 className="mb-1 mt-3 font-semibold text-slate-100" {...props} />,
  table: (props) => (
    <div className="mb-2 overflow-x-auto rounded-lg border border-slate-800">
      <table className="w-full text-left text-xs" {...props} />
    </div>
  ),
  thead: (props) => <thead className="bg-slate-800/60 text-slate-400" {...props} />,
  th: (props) => <th className="px-2 py-1.5 font-medium" {...props} />,
  td: (props) => <td className="border-t border-slate-800 px-2 py-1.5 text-slate-300" {...props} />,
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
  const [showReasoning, setShowReasoning] = useState(false)

  if (!trace) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 text-sm text-slate-600">
        Describe a workload above and hit Analyze to see the agent reason through it.
      </div>
    )
  }

  const finalAnswer = [...trace].reverse().find((s) => s.type === 'final_answer')
  const reasoningSteps = trace.filter((s) => s.type === 'thought' || s.type === 'tool_call')

  return (
    <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60 p-4 break-words">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-slate-300">CarbonPilot agent analysis</h3>
        <EngineBadge engine={engine} />
      </div>

      {finalAnswer ? (
        <div className="text-sm">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
            {finalAnswer.text}
          </ReactMarkdown>
        </div>
      ) : (
        <p className="text-sm text-slate-500">Reasoning in progress…</p>
      )}

      {reasoningSteps.length > 0 && (
        <div className="mt-3 border-t border-slate-800 pt-2">
          <button
            onClick={() => setShowReasoning((v) => !v)}
            className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-300"
          >
            {showReasoning ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            {showReasoning ? 'Hide reasoning' : 'Show reasoning'}
          </button>

          {showReasoning && (
            <div className="mt-2 space-y-2 text-xs">
              {reasoningSteps.map((step, i) => {
                if (step.type === 'tool_call') {
                  return (
                    <div key={i} className="rounded-lg bg-slate-800/50 p-2">
                      <div className="font-mono text-sky-400">{step.name}</div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[11px] text-slate-500">
                        {Object.entries(step.input).map(([key, value]) => (
                          <span key={key}>
                            {key}=<span className="text-slate-300">{String(value)}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )
                }
                return (
                  <div key={i} className="text-slate-500">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
                      {step.text}
                    </ReactMarkdown>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
