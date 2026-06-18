// Vercel Edge Function：server-side 單筆硬刪除（刪除某帳號的整位考生與其所有關聯資料）。
// 用 service_role key（繞過 RLS）刪除，與 /api/reset 同一套安全模型：
// 五張學生資料表的 DELETE RLS 政策維持關閉，anon key（/api/submit）仍無法刪除任何資料，
// 一切硬刪除只能經由本端點（或 /api/reset），且呼叫前必須通過 superadmin 帳密驗證。
export const config = { runtime: 'edge' }

const SUPABASE_URL = 'https://lveekehjxkfvigwfwgvn.supabase.co'

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

export default async function handler(req) {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let body
  try {
    body = await req.json()
  } catch {
    return json({ error: '無效的請求內容' }, 400)
  }

  const { username, password, account } = body || {}
  if (!username || !password) return json({ error: '請輸入帳號與密碼' }, 400)
  if (!account || !String(account).trim()) return json({ error: '缺少要刪除的考生帳號' }, 400)
  const acct = String(account).trim()

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!SERVICE_KEY) return json({ error: '伺服器尚未設定金鑰' }, 500)

  const auth = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }

  const verifyRes = await fetch(
    `${SUPABASE_URL}/rest/v1/teachers?username=eq.${encodeURIComponent(username)}&select=role,password_hash`,
    { headers: auth },
  )
  const rows = await verifyRes.json()
  const teacher = Array.isArray(rows) ? rows[0] : null
  const expected = btoa(`${username}:${password}`)
  if (!teacher || teacher.password_hash !== expected) {
    return json({ error: '帳號或密碼錯誤' }, 401)
  }
  if (teacher.role !== 'superadmin') {
    return json({ error: '只有超級管理員可刪除考生' }, 403)
  }

  const acctEnc = encodeURIComponent(acct)

  const idsRes = await fetch(
    `${SUPABASE_URL}/rest/v1/applications?account=eq.${acctEnc}&select=id`,
    { headers: auth },
  )
  const appRows = await idsRes.json()
  const appIds = Array.isArray(appRows) ? appRows.map((r) => r.id).filter((v) => v != null) : []

  // 逐表刪除：先下游後上游，避免 FK 衝突；每步只 scope 到這位考生。
  // stage4_confirm_log 為稽核紀錄；若要保留歷史可移除該行。
  const steps = [
    { name: 'stage4_confirm_log',   filter: `account=eq.${acctEnc}` },
    { name: 'stage4_confirmations', filter: `account=eq.${acctEnc}` },
    { name: 'final_admissions',     filter: `account=eq.${acctEnc}` },
    appIds.length
      ? { name: 'evaluations',      filter: `application_id=in.(${appIds.join(',')})` }
      : null,
    { name: 'stage2_checkins',      filter: `account=eq.${acctEnc}` },
    { name: 'stage1_records',       filter: `account=eq.${acctEnc}` },
    { name: 'applications',         filter: `account=eq.${acctEnc}` },
  ].filter(Boolean)

  for (const step of steps) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${step.name}?${step.filter}`, {
      method: 'DELETE',
      headers: { ...auth, Prefer: 'return=minimal' },
    })
    if (!res.ok && res.status !== 204) {
      const text = await res.text()
      return json({ error: `刪除 ${step.name} 失敗：${text}` }, 500)
    }
  }

  return json({ ok: true, account: acct, deletedApplications: appIds.length })
}
