import { Clapperboard, Leaf, Gauge, Cpu, ShieldCheck } from 'lucide-react'
import { DEMO_VIDEO_URL } from '../videoConfig'

const USE_CASES = [
  {
    icon: Leaf,
    title: 'Cut carbon by up to 97%',
    body: 'Route the same workload to a greener GPU/region combo and see the modeled carbon, water, and dollar savings instantly.',
  },
  {
    icon: Cpu,
    title: 'Real AMD hardware, not just estimates',
    body: "The agent's own reasoning runs on AMD Instinct MI300X (via Fireworks), and live GPU telemetry is pulled from real rocm-smi hardware readings.",
  },
  {
    icon: Gauge,
    title: 'Instant efficiency grading',
    body: 'Every configuration gets an A+-F score ranked against every other GPU/region combo for the same workload — no spreadsheet required.',
  },
  {
    icon: ShieldCheck,
    title: 'From plan to proof',
    body: 'Plan a scenario, generate a submission-ready report, and back it with live hardware telemetry — one tool, start to finish.',
  },
]

function toEmbedUrl(url) {
  try {
    const u = new URL(url)
    if (u.hostname.includes('youtube.com') && u.searchParams.get('v')) {
      return `https://www.youtube.com/embed/${u.searchParams.get('v')}`
    }
    if (u.hostname === 'youtu.be') {
      return `https://www.youtube.com/embed/${u.pathname.slice(1)}`
    }
    if (u.hostname.includes('vimeo.com')) {
      return `https://player.vimeo.com/video/${u.pathname.split('/').pop()}`
    }
    return null // direct file - use <video> instead
  } catch {
    return null
  }
}

export default function VideoDemo() {
  const embedUrl = DEMO_VIDEO_URL ? toEmbedUrl(DEMO_VIDEO_URL) : null

  return (
    <div>
      <div className="mb-6 text-center">
        <div className="mb-2 flex items-center justify-center gap-2 text-emerald-400">
          <Clapperboard size={20} />
          <span className="text-xs font-medium uppercase tracking-wide">See it in action</span>
        </div>
        <h2 className="text-2xl font-semibold text-slate-50">CarbonPilot, end to end</h2>
        <p className="mx-auto mt-1 max-w-lg text-sm text-slate-400">
          From a plain-English workload description to a submission-ready report, backed by real AMD hardware.
        </p>
      </div>

      <div className="mb-8 overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
        {DEMO_VIDEO_URL ? (
          embedUrl ? (
            <div className="aspect-video w-full">
              <iframe
                src={embedUrl}
                title="CarbonPilot demo video"
                className="h-full w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          ) : (
            <video src={DEMO_VIDEO_URL} controls className="aspect-video w-full bg-black" />
          )
        ) : (
          <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-800 text-slate-600">
            <Clapperboard size={28} />
            <p className="text-sm">Demo video coming soon</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {USE_CASES.map((useCase) => (
          <div key={useCase.title} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <useCase.icon size={20} className="mb-2 text-emerald-400" />
            <h3 className="mb-1 text-sm font-semibold text-slate-100">{useCase.title}</h3>
            <p className="text-xs leading-relaxed text-slate-400">{useCase.body}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
