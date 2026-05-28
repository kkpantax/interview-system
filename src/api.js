const SCRIPT_URL = import.meta.env.VITE_SCRIPT_URL || ''

export const getScriptUrl = () => SCRIPT_URL

function jsonp(url) {
  return new Promise((resolve, reject) => {
    const cb = 'cb_' + Math.random().toString(36).slice(2)
    const script = document.createElement('script')
    window[cb] = (data) => {
      delete window[cb]
      document.body.removeChild(script)
      resolve(data)
    }
    script.onerror = () => {
      delete window[cb]
      document.body.removeChild(script)
      reject(new Error('JSONP failed'))
    }
    script.src = url + '&callback=' + cb
    document.body.appendChild(script)
  })
}

export async function apiGet(action, params = {}) {
  if (!SCRIPT_URL) return null
  const q = new URLSearchParams({ action, ...params }).toString()
  return jsonp(`${SCRIPT_URL}?${q}`)
}

export async function apiPost(body) {
  if (!SCRIPT_URL) throw new Error('未設定 VITE_SCRIPT_URL 環境變數')
  const q = new URLSearchParams({ payload: JSON.stringify(body) }).toString()
  return jsonp(`${SCRIPT_URL}?${q}`)
}
