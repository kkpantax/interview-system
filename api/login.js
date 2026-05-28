// Vercel Edge Function：server-side 老師登入驗證。
// 前端不再直接撈 teachers 表比對帳密，改打 same-origin 的 /api/login。
// 比對在伺服器端完成，並使用 service_role key（只存在於 Vercel 環境變數）。
export const config = { runtime: 'edge' }

// 與 api/submit.js 一致，URL 非機密，可寫死；機密只有 SUPABASE_SERVICE_KEY。
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

  const { username, password } = body || {}
  if (!username || !password) return json({ error: '請輸入帳號與密碼' }, 400)

  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
  if (!SUPABASE_SERVICE_KEY) return json({ error: '伺服器尚未設定金鑰' }, 500)

  // 撈 username 對應的 row（用 service key，繞過 RLS）。
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/teachers?username=eq.${encodeURIComponent(username)}` +
      `&select=id,username,display_name,role,department,password_hash`,
    { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } },
  )
  const rows = await res.json()
  const teacher = Array.isArray(rows) ? rows[0] : null

  // 沿用現有編碼：password_hash === btoa(username + ':' + password)。
  const expected = btoa(`${username}:${password}`)
  if (!teacher || teacher.password_hash !== expected) {
    return json({ error: '帳號或密碼錯誤' }, 401)
  }

  // 不要把 password_hash 回傳給前端。
  const { password_hash, ...safe } = teacher
  return json({ teacher: safe })
}
