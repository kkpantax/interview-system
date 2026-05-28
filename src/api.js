// 改為呼叫 same-origin 的 /api/submit（Vercel Edge Function），
// 由它代理到 Supabase，前端不再直接接觸 Supabase URL / KEY，也避免 CORS。

// 透過 proxy 對 Supabase REST 發出請求
async function callProxy(path, method, body, prefer) {
  const res = await fetch('/api/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, method, body, prefer }),
  })
  if (!res.ok) {
    let msg = '請求失敗'
    try {
      const err = await res.json()
      msg = err.message || msg
    } catch {
      /* 回應不是 JSON，沿用預設訊息 */
    }
    throw new Error(msg)
  }
  return res.json()
}

// 新增一筆申請資料
export async function apiPost(body) {
  return callProxy('/rest/v1/applications', 'POST', body, 'return=representation')
}

// 查詢申請資料
export async function apiGet(action, params = {}) {
  const query = new URLSearchParams(params).toString()
  return callProxy(`/rest/v1/applications${query ? `?${query}` : ''}`, 'GET')
}

// 更新申請資料（依 id）
export async function apiPatch(id, body) {
  return callProxy(`/rest/v1/applications?id=eq.${id}`, 'PATCH', body, 'return=representation')
}
