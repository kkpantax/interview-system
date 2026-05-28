const SUPABASE_URL = 'https://lveekehjxkfvigwfwgvn.supabase.co'
const SUPABASE_KEY = 'sb_publishable_YpPdYBr3FIXZQzjbRwPpcw_1DmxNCq8'

const headers = {
  'Content-Type': 'application/json',
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
}

// 新增一筆申請資料
export async function apiPost(body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/applications`, {
    method: 'POST',
    headers: {
      ...headers,
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.message || '送出失敗')
  }
  return res.json()
}

// 查詢申請資料
export async function apiGet(action, params = {}) {
  const query = new URLSearchParams(params).toString()
  const res = await fetch(`${SUPABASE_URL}/rest/v1/applications?${query}`, {
    method: 'GET',
    headers,
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.message || '查詢失敗')
  }
  return res.json()
}

// 更新申請資料（依 id）
export async function apiPatch(id, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/applications?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      ...headers,
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.message || '更新失敗')
  }
  return res.json()
}