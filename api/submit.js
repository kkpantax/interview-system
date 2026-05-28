// Vercel Edge Function：代理所有對 Supabase 的請求
// 前端只打 same-origin 的 /api/submit，避免 CORS 並把 key 收在伺服器端。
export const config = { runtime: 'edge' }

const SUPABASE_URL = 'https://lveekehjxkfvigwfwgvn.supabase.co'
const SUPABASE_KEY = 'sb_publishable_YpPdYBr3FIXZQzjbRwPpcw_1DmxNCq8'

const json = (data, status = 200) =>
  new Response(typeof data === 'string' ? data : JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

export default async function handler(req) {
  if (req.method !== 'POST') {
    return json({ message: 'Method not allowed' }, 405)
  }

  let payload
  try {
    payload = await req.json()
  } catch {
    return json({ message: '無效的請求內容' }, 400)
  }

  const { path, method = 'GET', body, prefer } = payload || {}

  // 只允許代理到 Supabase REST API，避免被當成開放式 proxy。
  if (typeof path !== 'string' || !path.startsWith('/rest/v1/')) {
    return json({ message: '不允許的請求路徑' }, 400)
  }

  const headers = {
    'Content-Type': 'application/json',
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
  }
  if (prefer) headers.Prefer = prefer

  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  // 原樣回傳 Supabase 的內容與狀態碼。
  const text = await res.text()
  return new Response(text, {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  })
}
