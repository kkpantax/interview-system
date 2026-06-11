// Vercel Edge Function：代理到公務信箱的 Apps Script 草稿服務。
// token 收在伺服器環境變數，前端只打 same-origin 的 /api/draftmail。
//
// 需在 Vercel 設定環境變數（設定後要重新部署才生效）：
//   DRAFT_SERVICE_URL   = Apps Script 網頁應用程式 URL（.../exec）
//   DRAFT_SERVICE_TOKEN = 與 Apps Script 內 TOKEN 完全相同的密鑰
export const config = { runtime: 'edge' }

const json = (data, status = 200) =>
  new Response(typeof data === 'string' ? data : JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

export default async function handler(req) {
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405)

  const url = process.env.DRAFT_SERVICE_URL
  const token = process.env.DRAFT_SERVICE_TOKEN
  if (!url || !token) return json({ ok: false, error: '伺服器未設定 DRAFT_SERVICE_URL / DRAFT_SERVICE_TOKEN' }, 500)

  let payload
  try { payload = await req.json() } catch { return json({ ok: false, error: '無效的請求內容' }, 400) }

  const { action, messages, draftIds } = payload || {}
  if (action !== 'create_drafts' && action !== 'send_batch') {
    return json({ ok: false, error: '不允許的 action' }, 400)
  }

  // 帶上密鑰轉發給 Apps Script
  const upstream = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, action, messages, draftIds }),
    redirect: 'follow',   // Apps Script /exec 會 302 到 googleusercontent
  })

  const text = await upstream.text()
  return new Response(text, { status: upstream.status, headers: { 'Content-Type': 'application/json' } })
}
