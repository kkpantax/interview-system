// Vercel Edge Function：學生端「入學準備」公開端點（Phase 1：唯讀）。
// 學生信中連結 → 前端 #/onboard 頁 → 前端以 GET ?token=xxx 呼叫本端點。
// 安全設計（鏡像 api/confirm.js）：
//   1. 唯一憑證是 confirm_token（不可猜的隨機字串），端點絕不接受 account / id。
//   2. 用 service key（只在伺服器環境變數）查詢，且只回 token 命中的那一位學生。
//   3. 本端點不做任何寫入（各步表單提交為 Phase 2）。
//   4. 只回傳學生看得到的安全欄位（不含護照號碼、drive_folder_id）。
export const config = { runtime: 'edge' }

const SUPABASE_URL = 'https://lveekehjxkfvigwfwgvn.supabase.co'

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })

export default async function handler(req) {
  if (req.method !== 'GET') return json({ ok: false, error: 'Method not allowed' }, 405)

  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!KEY) return json({ ok: false, error: '伺服器尚未設定金鑰' }, 500)
  const H = { apikey: KEY, Authorization: `Bearer ${KEY}` }

  const token = new URL(req.url).searchParams.get('token') || ''
  if (!token) return json({ ok: false, error: '缺少確認碼' }, 400)

  // 依 token 撈學生（只取安全欄位）
  const sel = 'select=account,name,name_en,department,campus,batch,nationality,status'
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/enroll_students?confirm_token=eq.${encodeURIComponent(token)}&${sel}&limit=1`,
    { headers: H },
  )
  if (!res.ok) return json({ ok: false, error: '查詢失敗' }, 500)
  const rows = await res.json()
  const student = Array.isArray(rows) ? rows[0] : null
  if (!student) return json({ ok: false, error: '連結無效或已失效' }, 401)

  // 該生五步進度 + 該梯次各步設定（並行）
  const [pRes, sRes] = await Promise.all([
    fetch(
      `${SUPABASE_URL}/rest/v1/enroll_progress?account=eq.${encodeURIComponent(student.account)}&select=step,state,submitted_at,confirmed_at`,
      { headers: H },
    ),
    fetch(
      `${SUPABASE_URL}/rest/v1/enroll_settings?batch=eq.${encodeURIComponent(student.batch ?? '')}&select=step,open,deadline,contact_name,contact_email,contact_phone,extra`,
      { headers: H },
    ),
  ])
  const pRows = pRes.ok ? await pRes.json() : []
  const sRows = sRes.ok ? await sRes.json() : []

  // 以 step 為 key 攤平成物件，前端好取用；查無的步驟由前端視為 locked
  const progress = {}
  for (const r of Array.isArray(pRows) ? pRows : []) progress[r.step] = r
  const settings = {}
  for (const r of Array.isArray(sRows) ? sRows : []) settings[r.step] = r

  return json({ ok: true, student, progress, settings })
}
