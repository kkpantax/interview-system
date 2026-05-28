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

// 新增一筆（或多筆）申請資料
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

// ── 欄位名稱對應 ────────────────────────────────────────────────────────────
// 前端使用 camelCase，applications 資料表用 snake_case；同時把工作流／匯入用的
// 欄位（stage1Status / finalResult / scholarship 等）擋在表外，避免「找不到欄位」錯誤。
const APP_COLUMN_MAP = {
  id:             'id',
  chName:         'name',
  enName:         'name_english',
  gender:         'gender',
  birthDate:      'birth_date',
  nationality:    'nationality',
  passportNo:     'passport_number',
  phone:          'phone',
  email:          'email',
  highSchool:     'high_school',
  graduationYear: 'graduation_year',
  dept:           'department',
  interviewTime:  'interview_time',
  status:         'status',
}
const REVERSE_APP_COLUMN_MAP = Object.fromEntries(
  Object.entries(APP_COLUMN_MAP).map(([local, col]) => [col, local])
)

// 把前端物件壓成 applications 表能吃的 row（只保留有對應欄位的鍵，且重命名）
export function toApplicationRow(local) {
  const out = {}
  for (const [localKey, col] of Object.entries(APP_COLUMN_MAP)) {
    // id 是 DB 自動產生的 uuid，不可從前端送出（Excel 的序號塞進去會觸發
    // 22P02 "invalid input syntax for type uuid"，整批 insert 失敗）。
    if (localKey === 'id') continue
    if (local[localKey] !== undefined) out[col] = local[localKey]
  }
  return out
}

// 反向：DB row → 前端物件
export function fromApplicationRow(row) {
  const out = {}
  for (const [col, val] of Object.entries(row)) {
    const localKey = REVERSE_APP_COLUMN_MAP[col]
    if (localKey) out[localKey] = val
  }
  return out
}
