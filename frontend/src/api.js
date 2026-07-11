export const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'
export const WS_BASE = API_BASE.replace(/^http/, 'ws')

export async function estimateFromText(workloadText) {
  const res = await fetch(`${API_BASE}/estimate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workload_text: workloadText }),
  })
  if (!res.ok) throw new Error(`estimate failed: ${res.status}`)
  return res.json()
}

export async function estimateFromFields(fields) {
  const res = await fetch(`${API_BASE}/estimate/manual`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  })
  if (!res.ok) throw new Error(`estimate/manual failed: ${res.status}`)
  return res.json()
}

export async function fetchRegions() {
  const res = await fetch(`${API_BASE}/estimate/regions`)
  return res.json()
}

export async function fetchGpus() {
  const res = await fetch(`${API_BASE}/estimate/gpus`)
  return res.json()
}

export async function fetchGpuHistory(nodeId) {
  const res = await fetch(`${API_BASE}/live/gpu/${encodeURIComponent(nodeId)}/history`)
  if (!res.ok) throw new Error(`gpu history failed: ${res.status}`)
  return res.json()
}

export async function generateReport(fields) {
  const res = await fetch(`${API_BASE}/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  })
  if (!res.ok) throw new Error(`report failed: ${res.status}`)
  return res.json()
}
