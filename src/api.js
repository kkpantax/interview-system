const SCRIPT_URL = import.meta.env.VITE_SCRIPT_URL || ''

export const getScriptUrl = () => SCRIPT_URL

async function apiFetch(url) {
  const res = await fetch(url)
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
  const q = new URLSearchParams({ payload: JSON.stringify(body) }).toString()
  return apiFetch(`${SCRIPT_URL}?${q}`)
}
