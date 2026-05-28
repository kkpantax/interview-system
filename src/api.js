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
  // key = 帳號 + 系所 + 志願序，精準對應「一個人的單一志願」。
  // （只用 account+系所 會把同系不同志願視為同一筆；且需配合 DB 去重避免重複匯入。）
  const existing = await callProxy('/rest/v1/applications?select=id,account,department,preference_order', 'GET')
  const keyOf = (r) => `${r.account ?? ''}__${r.department ?? ''}__${r.preference_order ?? ''}`
  const idByKey = new Map((existing || []).map((r) => [keyOf(r), r.id]))

  const toInsert = []
  const toUpdate = []
  const seen = new Set()   // 批次內去重：來源檔同一筆出現多次時，只處理一次
  for (const row of rows) {
    const key = keyOf(row)
    if (seen.has(key)) continue
    seen.add(key)
    const id = idByKey.get(key)
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
  // 更新：依 id 逐筆 PATCH。重複上傳時只修正基本資料，不覆寫 status，
  // 否則已「通過一階」的考生會被重設回 pending（interview_date / stage1_passed_date
  // 等流程欄位本來就不在匯入內容裡，不受影響）。
  for (const { id, row } of toUpdate) {
    const { status, ...basicFields } = row
    await callProxy(`/rest/v1/applications?id=eq.${id}`, 'PATCH', basicFields, 'return=minimal')
    tick(1)
  }
  return { added: toInsert.length, updated: toUpdate.length }
}

// 單筆編輯 / 刪除 / 新增（行政在學生總覽手動修正名單用）
export async function updateApplication(id, fields) {
  return callProxy(`/rest/v1/applications?id=eq.${id}`, 'PATCH', fields, 'return=representation')
}
export async function deleteApplication(id) {
  return callProxy(`/rest/v1/applications?id=eq.${id}`, 'DELETE', undefined, 'return=minimal')
}
export async function createApplication(row) {
  return callProxy('/rest/v1/applications', 'POST', row, 'return=representation')
}

// ── Centers（面試中心，由行政人員動態管理）─────────────────────────────────
export async function getCenters() {
  return callProxy('/rest/v1/centers?select=*&order=sort_order.asc,name.asc', 'GET')
}
export async function createCenter(name) {
  return callProxy('/rest/v1/centers', 'POST', { name }, 'return=representation')
}
export async function deleteCenter(id) {
  return callProxy(`/rest/v1/centers?id=eq.${id}`, 'DELETE', undefined, 'return=minimal')
}

// 設定 applications 的中心（批次：傳入多個 id 設成同一個中心；需要 UPDATE RLS 政策）
// center 傳 '' / null 表示清除。
export async function batchSetCenter(ids, center) {
  if (!ids || !ids.length) return []
  return callProxy(
    `/rest/v1/applications?id=in.(${ids.join(',')})`,
    'PATCH',
    { center: center || null },
    'return=representation',
  )
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
// 第一階段以「帳號」為單位：同一人多個志願只面試、評分一次。
// 把多筆 application（同 account）合併成一筆，附上所有志願清單 allDepts，
// 並用 preference_order 最小的那筆作為主資料（id / department）。
function groupByAccount(rows) {
  const map = {}
  for (const r of rows) {
    if (!map[r.account]) map[r.account] = { ...r, allDepts: [] }
    map[r.account].allDepts.push({
      id: r.id,
      department: r.department,
      preference_order: r.preference_order,
    })
  }
  return Object.values(map).map((g) => {
    g.allDepts.sort((a, b) => (a.preference_order ?? 99) - (b.preference_order ?? 99))
    const primary = g.allDepts[0]
    return { ...g, id: primary.id, department: primary.department, preference_order: primary.preference_order }
  })
}

// 某日應試名單：有帳號、interview_date = date（按帳號合併）
export async function getStage1List(date) {
  const rows = await callProxy(
    `/rest/v1/applications?select=*&account=not.is.null&interview_date=eq.${date}&order=name.asc`,
    'GET',
  )
  return groupByAccount(rows || [])
}

// 備援：尚未通過一階的所有帳號持有者（interview_date 尚未排期時用，按帳號合併）
export async function getStage1Pending() {
  const rows = await callProxy(
    '/rest/v1/applications?select=*&account=not.is.null&stage1_passed_date=is.null&order=name.asc',
    'GET',
  )
  return groupByAccount(rows || [])
}

// 當日所有簽到/評分紀錄（一次撈回，前端以 application_id 建 map，避免逐生打 API）
export async function getStage1Records(date) {
  return callProxy(`/rest/v1/stage1_records?record_date=eq.${date}&select=*`, 'GET')
}

// 簽到：以 account + record_date 為 key（一個人一筆）。已存在則 PATCH，否則 POST。
// rec 需含 account；application_id 仍寫入主志願 id 備查。回傳該筆紀錄。
export async function saveStage1Checkin(rec) {
  const existing = await callProxy(
    `/rest/v1/stage1_records?account=eq.${encodeURIComponent(rec.account)}&record_date=eq.${rec.record_date}&select=id`,
    'GET',
  )
  if (existing && existing.length > 0) {
    return callProxy(
      `/rest/v1/stage1_records?id=eq.${existing[0].id}`,
      'PATCH', rec, 'return=representation',
    )
  }
  return callProxy('/rest/v1/stage1_records', 'POST', rec, 'return=representation')
}

// 依 account + record_date 取單筆簽到/評分紀錄（無則回 null）
export async function getStage1RecordByAccount(account, date) {
  const rows = await callProxy(
    `/rest/v1/stage1_records?account=eq.${encodeURIComponent(account)}&record_date=eq.${date}&select=*`,
    'GET',
  )
  return rows && rows.length > 0 ? rows[0] : null
}

// 寫入第一階段評分（依 stage1_records.id 更新已建立的簽到紀錄）
export async function saveStage1Score(recordId, payload) {
  return callProxy(
    `/rest/v1/stage1_records?id=eq.${recordId}`,
    'PATCH', payload, 'return=representation',
  )
}

// 標記通過一階（更新單筆 application，需要 UPDATE 的 RLS 政策）
export async function markStage1Passed(applicationId, date) {
  return callProxy(
    `/rest/v1/applications?id=eq.${applicationId}`,
    'PATCH',
    { stage1_passed_date: date, status: 'stage1_passed' },
    'return=representation',
  )
}

// 通過一階：把該帳號「所有志願」的 applications 一起標記通過（一人面一次、全志願進二階）
export async function markStage1PassedByAccount(account, date) {
  return callProxy(
    `/rest/v1/applications?account=eq.${encodeURIComponent(account)}`,
    'PATCH',
    { stage1_passed_date: date, status: 'stage1_passed' },
    'return=representation',
  )
}

// ── Stage 2（第二階段評分）──────────────────────────────────────────────────
// 某科系、已過一階的「所有」學生，附上各自的 evaluations 摘要（前端再分待評/已評）。
// 同一學生在同系可能有多筆評分（多老師、多輪），故全帶回不去重。
export async function getStage2List(dept) {
  const rows = await callProxy(
    `/rest/v1/applications?select=*,evaluations(id,recommendation,total_score,eval_date)` +
      `&department=eq.${encodeURIComponent(dept)}` +
      `&stage1_passed_date=not.is.null&order=name.asc`,
    'GET',
  )
  return rows || []
}

// 某科系評分統計：以 evaluations.recommendation 計筆數（不去重，含多老師多輪）
export async function getStage2Stats(dept) {
  const rows = await callProxy(
    `/rest/v1/evaluations?select=recommendation&department=eq.${encodeURIComponent(dept)}`,
    'GET',
  )
  const stats = { admit: 0, waitlist: 0, reject: 0, pending: 0 }
  for (const r of (rows || [])) {
    if (stats[r.recommendation] !== undefined) stats[r.recommendation]++
    else stats.pending++
  }
  return stats
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

// ── Teachers（老師帳號）─────────────────────────────────────────────────────
// 簡單編碼（非正式加密）：btoa(username + ':' + password)
const encodePw = (username, password) => btoa(`${username}:${password}`)

export async function getTeachers() {
  return callProxy('/rest/v1/teachers?select=*&order=created_at.asc', 'GET')
}

export async function createTeacher({ username, password, display_name, role, department }) {
  return callProxy('/rest/v1/teachers', 'POST', {
    username,
    password_hash: encodePw(username, password),
    display_name: display_name || null,
    role,
    department: department || null,
  }, 'return=representation')
}

export async function deleteTeacher(id) {
  return callProxy(`/rest/v1/teachers?id=eq.${id}`, 'DELETE', undefined, 'return=minimal')
}

// 登入：撈 username 對應的 row，比對 password_hash。成功回傳 teacher，失敗回 null。
export async function loginTeacher(username, password) {
  const rows = await callProxy(
    `/rest/v1/teachers?select=*&username=eq.${encodeURIComponent(username)}`,
    'GET',
  )
  const t = (rows || [])[0]
  if (!t) return null
  if (t.password_hash !== encodePw(username, password)) return null
  return t
}

// ── Stage 3（第三階段 · 最終錄取）──────────────────────────────────────────
// 所有二階評分 + 對應 application（只有已過一階者才會有評分）
export async function getStage3Data() {
  return callProxy(
    '/rest/v1/evaluations?select=*,applications(account,name,name_english,department,stage1_passed_date)' +
      '&order=department.asc,total_score.desc',
    'GET',
  )
}

export async function getFinalAdmissions() {
  return callProxy('/rest/v1/final_admissions?select=*', 'GET')
}

// 依 (account, department) upsert 最終錄取狀態（資料表有 UNIQUE(account, department)）
export async function upsertFinalAdmission(row) {
  return callProxy(
    '/rest/v1/final_admissions?on_conflict=account,department',
    'POST',
    row,
    'resolution=merge-duplicates,return=representation',
  )
}
