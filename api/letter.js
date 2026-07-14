// Vercel Edge Function：學生自助下載「錄取通知單」。
// 前端落地頁（#/letter）POST { account, passport } 到 same-origin 的 /api/letter。
// 伺服器用 service_role key（只存在於 Vercel 環境變數）比對 applications 的
// 護照號碼，通過後才對私有 Storage bucket 的 {account}.pdf 產生短效簽名連結。
// 檔案本身放在私有 bucket（admission-letters），file id / 路徑不外露到前端。
export const config = { runtime: 'edge' }

// URL 非機密，可寫死；機密只有 SUPABASE_SERVICE_ROLE_KEY。
const SUPABASE_URL = 'https://lveekehjxkfvigwfwgvn.supabase.co'
const BUCKET = 'admission-letters'
const SIGN_TTL = 300 // 簽名連結有效秒數（5 分鐘）

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

// 護照號碼正規化：去空白、轉大寫（比對用）。
const normPass = (s) => String(s || '').replace(/\s+/g, '').toUpperCase()

export default async function handler(req) {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let body
  try { body = await req.json() } catch { return json({ error: '無效的請求內容' }, 400) }

  const account = String(body?.account || '').trim()
  const passport = normPass(body?.passport)
  if (!account || !passport) return json({ error: '請輸入帳號與護照號碼' }, 400)

  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!KEY) return json({ error: '伺服器尚未設定金鑰' }, 500)
  const auth = { apikey: KEY, Authorization: `Bearer ${KEY}` }

  // 1) 用 service key 撈該帳號的申請資料（可能有多筆志願，護照相同）。
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/applications?account=eq.${encodeURIComponent(account)}` +
      `&select=passport_number,name,name_english`,
    { headers: auth },
  )
  const rows = res.ok ? await res.json() : []
  if (!Array.isArray(rows) || rows.length === 0) {
    // 帳號不存在：回一致的錯誤訊息，避免帳號枚舉。
    return json({ error: '帳號或護照號碼不正確' }, 401)
  }

  // 2) 比對護照號碼（任一筆相符即通過）。
  const ok = rows.some((r) => normPass(r.passport_number) === passport)
  if (!ok) return json({ error: '帳號或護照號碼不正確' }, 401)

  // 3) 產生私有物件的簽名連結；物件不存在＝通知單尚未備妥。
  const niceName = `錄取通知單_${account}.pdf`
  const signRes = await fetch(
    `${SUPABASE_URL}/storage/v1/object/sign/${BUCKET}/${encodeURIComponent(account)}.pdf`,
    {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: SIGN_TTL }),
    },
  )

  if (!signRes.ok) {
    // 404 / 400：檔案還沒上傳 → 尚未開放下載。
    return json({ ok: true, ready: false })
  }

  const signed = await signRes.json()
  const path = signed?.signedURL || signed?.signedUrl
  if (!path) return json({ ok: true, ready: false })

  const url =
    `${SUPABASE_URL}/storage/v1${path}` +
    `${path.includes('?') ? '&' : '?'}download=${encodeURIComponent(niceName)}`

  return json({ ok: true, ready: true, url })
}
