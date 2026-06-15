// Vercel Edge Function：學生端「預計錄取確認」公開端點。
// 學生信中連結 → 前端 #/confirm 頁 → 前端以 POST 呼叫本端點（action: 'info' / 'submit'）。
// 安全設計：
//   1. 唯一憑證是 confirm_token（不可猜的隨機字串），端點絕不接受 account / id。
//   2. 用 service key（只在伺服器環境變數）查詢與更新，且只動 token 命中的那一列。
//   3. 寫入只允許把 contact_status 改成 'enrolled' / 'declined'，不做跨系連動或候補遞補
//      （那些維持承辦端操作 / v2）。
//   4. 每次確認或改答案都寫一筆 stage4_confirm_log（保留完整軌跡）。
//   5. 讀資訊（info）也走 POST，避免信件用戶端自動 prefetch 連結造成誤確認。
export const config = { runtime: 'edge' }

const SUPABASE_URL = 'https://lveekehjxkfvigwfwgvn.supabase.co'

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })

// 只回傳學生看得到的安全欄位（不含護照等）
const publicShape = (row, expired) => ({
  found: true,
  account: row.account,
  name: row.name || '',
  name_english: row.name_english || '',
  department: row.department || '',
  type: row.stage3_status === 'admitted' ? 'admitted' : 'waitlisted',
  standby_rank: row.standby_rank ?? null,
  status: row.contact_status || 'pending',
  deadline: row.confirm_deadline || null,
  confirmed_at: row.confirmed_at || null,
  expired,
})

export default async function handler(req) {
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405)

  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!KEY) return json({ ok: false, error: '伺服器尚未設定金鑰' }, 500)
  const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }

  let payload
  try { payload = await req.json() } catch { return json({ ok: false, error: '無效的請求內容' }, 400) }
  const { action, token, decision } = payload || {}

  if (!token || typeof token !== 'string') return json({ ok: false, error: '缺少確認碼' }, 400)

  // 依 token 撈該列（含學生姓名，經 applications join 補上）
  const sel = 'select=id,account,department,stage3_status,standby_rank,contact_status,confirm_deadline,confirmed_at'
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/stage4_confirmations?confirm_token=eq.${encodeURIComponent(token)}&${sel}`,
    { headers: H },
  )
  const rows = await res.json()
  const row = Array.isArray(rows) ? rows[0] : null
  if (!row) return json({ ok: true, found: false })

  // 補學生姓名（stage4_confirmations 未設 FK，分撈）
  const aRes = await fetch(
    `${SUPABASE_URL}/rest/v1/applications?account=eq.${encodeURIComponent(row.account)}&select=name,name_english,nationality&limit=1`,
    { headers: H },
  )
  const aRows = await aRes.json()
  const app = (Array.isArray(aRows) && aRows[0]) || {}
  row.name = app.name; row.name_english = app.name_english
  const nationality = app.nationality || ''

  const now = Date.now()
  const expired = !!row.confirm_deadline && now > Date.parse(row.confirm_deadline)

  if (action === 'info') {
    return json({ ok: true, nationality, ...publicShape(row, expired) })
  }

  if (action === 'submit') {
    if (!['enrolled', 'declined'].includes(decision)) {
      return json({ ok: false, error: '無效的選項' }, 400)
    }
    if (expired) {
      return json({ ok: false, expired: true, error: '已逾回覆期限' }, 200)
    }

    const oldStatus = row.contact_status
    const nowIso = new Date().toISOString()

    // 只更新本列：狀態 + 確認時間 + 來源
    const upRes = await fetch(
      `${SUPABASE_URL}/rest/v1/stage4_confirmations?id=eq.${row.id}`,
      {
        method: 'PATCH',
        headers: { ...H, Prefer: 'return=representation' },
        body: JSON.stringify({ contact_status: decision, confirmed_at: nowIso, confirm_source: 'email' }),
      },
    )
    if (!upRes.ok) {
      const t = await upRes.text()
      return json({ ok: false, error: '更新失敗：' + t }, 500)
    }

    // 寫稽核軌跡（失敗不阻斷主流程）
    const ip = req.headers.get('x-forwarded-for') || ''
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/stage4_confirm_log`, {
        method: 'POST',
        headers: { ...H, Prefer: 'return=minimal' },
        body: JSON.stringify({
          confirmation_id: String(row.id),
          account: row.account,
          department: row.department,
          old_status: oldStatus,
          new_status: decision,
          source: 'email',
          ip,
        }),
      })
    } catch { /* log 失敗不影響確認結果 */ }

    return json({ ok: true, status: decision })
  }

  return json({ ok: false, error: '不允許的 action' }, 400)
}
