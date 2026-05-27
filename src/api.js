const SCRIPT_URL = import.meta.env.VITE_SCRIPT_URL || ''

export const getScriptUrl = () => SCRIPT_URL

async function apiFetch(url, opts) {
  const res = await fetch(url, opts)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function apiGet(action, params = {}) {
  if (!SCRIPT_URL) return null
  const q = new URLSearchParams({ action, ...params }).toString()
  return apiFetch(`${SCRIPT_URL}?${q}`)
}

export async function apiPost(body) {
  if (!SCRIPT_URL) throw new Error('未設定 VITE_SCRIPT_URL 環境變數')
  return apiFetch(SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}
