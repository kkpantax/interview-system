let SCRIPT_URL = localStorage.getItem('scriptUrl') || ''

export const getScriptUrl = () => SCRIPT_URL
export const setScriptUrl = (url) => {
  SCRIPT_URL = url
  localStorage.setItem('scriptUrl', url)
}

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
  if (!SCRIPT_URL) throw new Error('未設定 Google Sheets URL')
  return apiFetch(SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}
