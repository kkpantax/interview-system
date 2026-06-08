// Vercel Edge Function：server-side 年度重置（清空學生相關資料）。
// 用 service_role key（繞過 RLS）刪除，故五張表的 DELETE RLS 政策維持關閉，
// anon key（/api/submit）仍無法刪除任何資料。呼叫前必須通過 admin 帳密驗證。
export const config = { runtime: 'edge' }

// URL 非機密，可寫死；機密只有 SUPABASE_SERVICE_ROLE_KEY（只存在 Vercel 環境變數）。
const SUPABASE_URL = 'https://lveekehjxkfvigwfwgvn.supabase.co'

// 刪除順序：先下游（參照 applications 者）後上游，避免 FK 衝突。
const TABLES = [
  'stage4_confirmations',
  'final_admissions',
  'evaluations',
  'stage1_records',
  'applications',
  'department_quota',
]

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

  const { username, password } = body || {}
  if (!username || !password) return json({ error: '請輸入帳號與密碼' }, 400)

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!SERVICE_KEY) return json({ error: '伺服器尚未設定金鑰' }, 500)

  const auth = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }

  // 驗證帳密（與 /api/login 同一套編碼），且角色必須為 admin 才能清空。
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
  if (teacher.role !== 'admin' && teacher.role !== 'superadmin') {
    return json({ error: '只有行政人員可執行年度重置' }, 403)
  }

  // 用 service key 逐表刪除（繞過 RLS）。
  for (const t of TABLES) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${t}?id=not.is.null`, {
      method: 'DELETE',
      headers: { ...auth, Prefer: 'return=minimal' },
    })
    if (!res.ok && res.status !== 204) {
      const text = await res.text()
      return json({ error: `清空 ${t} 失敗：${text}` }, 500)
    }
  }

  return json({ ok: true })
}
