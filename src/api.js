// 改為呼叫 same-origin 的 /api/submit（Vercel Edge Function），
// 由它代理到 Supabase，前端不再直接接觸 Supabase URL / KEY，也避免 CORS。

// 透過 proxy 對 Supabase REST 發出請求
async function callProxy(path, method, body, prefer) {
  const res = await fetch('/api/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, method, body, prefer }),
  })
  const text = await res.text()
  if (!res.ok) {
    let msg = '請求失敗'
    try { msg = JSON.parse(text).message || msg } catch { /* 非 JSON 回應 */ }
    throw new Error(msg)
  }
  // return=minimal 等情況 body 為空，避免 res.json() 在空字串上拋
  // "Unexpected end of JSON input"
  return text ? JSON.parse(text) : null
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

// ═══════════════════════════════════════════════════════════════════════════
// 三入口系統的資料存取
// 直接使用 applications / stage1_records / evaluations 的 snake_case 欄位，
// 不經過上面的 camelCase 轉換（spec 的 SQL / JSON 範例都是 snake_case）。
// ═══════════════════════════════════════════════════════════════════════════

// ── Applications（行政）─────────────────────────────────────────────────────
export async function getAllApplications() {
  return callProxy('/rest/v1/applications?select=*&order=preference_order.asc,name.asc', 'GET')
}

// distinct 系所清單
export async function getDepartments() {
  const rows = await callProxy('/rest/v1/applications?select=department', 'GET')
  return [...new Set((rows || []).map((r) => r.department).filter(Boolean))].sort()
}

// 以 (account, department) 為 key 手動 upsert（資料表無 unique 約束）。
// 回傳 { added, updated }。注意：更新走 PATCH，需要 applications 有 UPDATE 的 RLS 政策。
const IMPORT_BATCH = 50

export async function upsertApplications(rows, onProgress) {
  const existing = await callProxy('/rest/v1/applications?select=id,account,department', 'GET')
  const keyOf = (r) => `${r.account ?? ''}__${r.department ?? ''}`
  const idByKey = new Map((existing || []).map((r) => [keyOf(r), r.id]))

  const toInsert = []
  const toUpdate = []
  for (const row of rows) {
    const id = idByKey.get(keyOf(row))
    if (id) toUpdate.push({ id, row })
    else toInsert.push(row)
  }

  const total = toInsert.length + toUpdate.length
  let done = 0
  const tick = (n) => { done += n; if (onProgress) onProgress(done, total) }

  // 新增：每批最多 50 筆，避免單一請求過大
  for (let i = 0; i < toInsert.length; i += IMPORT_BATCH) {
    const chunk = toInsert.slice(i, i + IMPORT_BATCH)
    await callProxy('/rest/v1/applications', 'POST', chunk, 'return=minimal')
    tick(chunk.length)
  }
  // 更新：依 id 逐筆 PATCH
  for (const { id, row } of toUpdate) {
    await callProxy(`/rest/v1/applications?id=eq.${id}`, 'PATCH', row, 'return=minimal')
    tick(1)
  }
  return { added: toInsert.length, updated: toUpdate.length }
}

// 指派/清除面試日期（批次，需要 applications 的 UPDATE RLS 政策）
export async function setInterviewDate(ids, date) {
  if (!ids || !ids.length) return []
  return callProxy(
    `/rest/v1/applications?id=in.(${ids.join(',')})`,
    'PATCH',
    { interview_date: date || null },
    'return=representation',
  )
}

// ── Stage 1（第一階段簽到）──────────────────────────────────────────────────
// 某日應試名單：有帳號、interview_date = date
export async function getStage1List(date) {
  return callProxy(
    `/rest/v1/applications?select=*&account=not.is.null&interview_date=eq.${date}&order=name.asc`,
    'GET',
  )
}

// 備援：尚未通過一階的所有帳號持有者（interview_date 尚未排期時用）
export async function getStage1Pending() {
  return callProxy(
    '/rest/v1/applications?select=*&account=not.is.null&stage1_passed_date=is.null&order=name.asc',
    'GET',
  )
}

export async function saveStage1Record(rec) {
  return callProxy('/rest/v1/stage1_records', 'POST', rec, 'return=representation')
}

// 標記通過一階（更新 applications，需要 UPDATE 的 RLS 政策）
export async function markStage1Passed(applicationId, date) {
  return callProxy(
    `/rest/v1/applications?id=eq.${applicationId}`,
    'PATCH',
    { stage1_passed_date: date, status: 'stage1_passed' },
    'return=representation',
  )
}

// ── Stage 2（第二階段評分）──────────────────────────────────────────────────
// 某科系、已過一階、尚未評分（用 embed evaluations(id) 後在前端過濾）
export async function getStage2List(dept) {
  const rows = await callProxy(
    `/rest/v1/applications?select=*,evaluations(id)` +
      `&department=eq.${encodeURIComponent(dept)}` +
      `&stage1_passed_date=not.is.null&order=name.asc`,
    'GET',
  )
  return (rows || []).filter((a) => !a.evaluations || a.evaluations.length === 0)
}

export async function saveEvaluation(ev) {
  return callProxy('/rest/v1/evaluations', 'POST', ev, 'return=representation')
}

// ── Admin 匯出最終名單 ──────────────────────────────────────────────────────
// recommendation = admit 的評分，連同 applications 一起帶出
export async function getFinalList() {
  return callProxy(
    '/rest/v1/evaluations?select=*,applications(*)&recommendation=eq.admit&order=total_score.desc',
    'GET',
  )
}
