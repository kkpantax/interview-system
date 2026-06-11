// 改為呼叫 same-origin 的 /api/submit（Vercel Edge Function），
// 由它代理到 Supabase，前端不再直接接觸 Supabase URL / KEY，也避免 CORS。
import { getTeacher } from './auth'

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

// ── 各系預計錄取人數（行政後台設定的固定值，存於 department_quota）──
export async function getDepartmentQuotas() {
  const rows = await callProxy('/rest/v1/department_quota?select=department,quota', 'GET')
  return Object.fromEntries((rows || []).map((r) => [r.department, r.quota]))
}
export async function setDepartmentQuota(department, quota) {
  return callProxy(
    '/rest/v1/department_quota?on_conflict=department',
    'POST',
    { department, quota, updated_at: new Date().toISOString() },
    'resolution=merge-duplicates,return=representation',
  )
}

// ── 各系所屬校區（行政後台設定，存於 department_campus）──
// 回傳 { 系名: 校區 } 的 map；未設定的系不在 map 內，由前端用關鍵字 fallback。
export async function getDepartmentCampuses() {
  const rows = await callProxy('/rest/v1/department_campus?select=department,campus', 'GET')
  return Object.fromEntries((rows || []).map((r) => [r.department, r.campus]))
}
export async function setDepartmentCampus(department, campus) {
  return callProxy(
    '/rest/v1/department_campus?on_conflict=department',
    'POST',
    { department, campus, updated_at: new Date().toISOString() },
    'resolution=merge-duplicates,return=representation',
  )
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

// 依「帳號」批次補上生日／護照（不動其他流程欄位）。
// updates: [{ account, birth_date?, passport_number? }]，只送出有值的欄位，避免把既有值覆蓋成 null。
// 同一帳號的所有志願列會一起更新（同一人共用此資料）。需 applications 的 UPDATE RLS 政策。
export async function updateBirthPassportByAccount(updates, onProgress) {
  let done = 0, updated = 0
  for (const u of updates) {
    if (!u.account) { done++; onProgress?.(done, updates.length); continue }
    const fields = {}
    if (u.birth_date != null && u.birth_date !== '') fields.birth_date = u.birth_date
    if (u.passport_number != null && u.passport_number !== '') fields.passport_number = u.passport_number
    if (Object.keys(fields).length) {
      const res = await callProxy(
        `/rest/v1/applications?account=eq.${encodeURIComponent(u.account)}`,
        'PATCH', fields, 'return=representation',
      )
      if (Array.isArray(res) && res.length) updated++
    }
    done++; onProgress?.(done, updates.length)
  }
  return { updated, total: updates.length }
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

// 簽到：以 account + record_date + teacher_id 為 key（每位老師各一筆，支援多老師評分）。
// teacher_id / teacher_name 由登入的老師帶入；已存在則 PATCH，否則 POST。回傳該筆紀錄。
export async function saveStage1Checkin(rec) {
  const teacher = getTeacher()
  const full = {
    ...rec,
    teacher_id: teacher?.id || null,
    teacher_name: teacher?.display_name || teacher?.username || null,
  }
  const tidFilter = full.teacher_id ? `teacher_id=eq.${full.teacher_id}` : 'teacher_id=is.null'
  const existing = await callProxy(
    `/rest/v1/stage1_records?account=eq.${encodeURIComponent(full.account)}&record_date=eq.${full.record_date}&${tidFilter}&select=id`,
    'GET',
  )
  if (existing && existing.length > 0) {
    return callProxy(
      `/rest/v1/stage1_records?id=eq.${existing[0].id}`,
      'PATCH', full, 'return=representation',
    )
  }
  return callProxy('/rest/v1/stage1_records', 'POST', full, 'return=representation')
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

// 刪除單筆第一階段評分紀錄（行政用：移除誤記／非實際評分者那筆）。需 stage1_records 的 DELETE RLS 政策。
export async function deleteStage1Record(id) {
  const res = await callProxy(
    `/rest/v1/stage1_records?id=eq.${id}`,
    'DELETE', undefined, 'return=representation',
  )
  if (!Array.isArray(res) || !res.length) {
    throw new Error('刪除失敗：0 筆（請確認 stage1_records 的 DELETE RLS 政策）')
  }
  return res
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

// 設定單一志願（application）的書審通過與否（需要 applications 的 UPDATE RLS 政策）。
export async function setPaperPassed(id, passed) {
  return callProxy(
    `/rest/v1/applications?id=eq.${id}`,
    'PATCH',
    { paper_passed: !!passed },
    'return=representation',
  )
}

// 計算某志願（application）已有的第二階段評分筆數（取消書審通過前的提醒用）
export async function countEvaluationsForApplication(appId) {
  const rows = await callProxy(
    `/rest/v1/evaluations?select=id&application_id=eq.${appId}`,
    'GET',
  )
  return Array.isArray(rows) ? rows.length : 0
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

// 實體面試確認：把該帳號所有志願一起設定確認結果（需要 applications 的 UPDATE RLS 政策）。
//   'pass' → 進二階；'reject' → 不通過；'pending' → 退回待確認
export async function setStage1ConfirmByAccount(account, result, date) {
  const fields =
    result === 'pass'   ? { stage1_passed_date: date, status: 'stage1_passed' }
    : result === 'reject' ? { stage1_passed_date: null, status: 'rejected' }
    :                       { stage1_passed_date: null, status: 'pending' }
  return callProxy(
    `/rest/v1/applications?account=eq.${encodeURIComponent(account)}`,
    'PATCH', fields, 'return=representation',
  )
}

// ── Stage 2（第二階段評分）──────────────────────────────────────────────────
// 某科系、已過一階的「所有」學生，附上各自的 evaluations 摘要（前端再分待評/已評）。
// 同一學生在同系可能有多筆評分（多老師、多輪），故全帶回不去重。
export async function getStage2List(dept) {
  const rows = await callProxy(
    `/rest/v1/applications?select=*,evaluations(id,recommendation,total_score,eval_date,evaluator_name,scores,teacher_note,custom_questions)` +
      `&department=eq.${encodeURIComponent(dept)}` +
      `&stage1_passed_date=not.is.null&paper_passed=is.true&order=name.asc`,
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

// 各系評分總覽：列出所有系所，並計每系（一階通過的學生）
//   waiting=尚未有任何評分, evaluated=已有至少一筆評分, admitted=評分中有任一筆 recommendation=admit
export async function getStage2DeptSummary() {
  const [depts, rows] = await Promise.all([
    getDepartments(),
    callProxy(
      '/rest/v1/applications?select=department,evaluations(recommendation)&stage1_passed_date=not.is.null&paper_passed=is.true',
      'GET',
    ),
  ])
  const map = new Map(depts.map((d) => [d, { department: d, waiting: 0, evaluated: 0, admitted: 0 }]))
  for (const r of (rows || [])) {
    const m = map.get(r.department)
    if (!m) continue
    const evs = r.evaluations || []
    if (evs.length === 0) m.waiting++
    else { m.evaluated++; if (evs.some((e) => e.recommendation === 'admit')) m.admitted++ }
  }
  return depts.map((d) => map.get(d))
}

// 某系某日的評分明細（含學生資料），供下載查核 Excel 使用
export async function getStage2EvalsByDate(dept, date) {
  return callProxy(
    `/rest/v1/evaluations?select=*,applications(account,name,name_english,nationality,gender)` +
      `&department=eq.${encodeURIComponent(dept)}&eval_date=eq.${date}&order=total_score.desc`,
    'GET',
  )
}

// ── Stage 2 報到管理（線上面試：主會議室總報到 + 各系會議室進度）──────────────
// 某日二階面試名單：已過一階 + 書審通過 + stage2_date = date，附 evaluations 摘要
// （該志願是否已評分，用來把膠囊鎖定為「已完成」）。
export async function getStage2Roster(date) {
  return callProxy(
    '/rest/v1/applications?select=account,name,name_english,nationality,gender,passport_number,center,department,preference_order,stage2_date,evaluations(id,eval_date)' +
      `&stage1_passed_date=not.is.null&paper_passed=is.true&stage2_date=eq.${date}&order=name.asc`,
    'GET',
  )
}

// 尚未排定二階面試日者（同條件但 stage2_date 為 null）。
export async function getStage2Unscheduled() {
  return callProxy(
    '/rest/v1/applications?select=account,name,name_english,nationality,gender,passport_number,center,department,preference_order,stage2_date' +
      '&stage1_passed_date=not.is.null&paper_passed=is.true&stage2_date=is.null&order=name.asc',
    'GET',
  )
}

// 漏網之魚：面試日已過（stage2_date < today）的學生，前端再比對報到／評分判斷是否未完成。
export async function getStage2NoShows(today) {
  return callProxy(
    '/rest/v1/applications?select=account,name,name_english,nationality,gender,passport_number,center,department,preference_order,stage2_date,evaluations(id,eval_date)' +
      `&stage1_passed_date=not.is.null&paper_passed=is.true&stage2_date=not.is.null&stage2_date=lt.${today}&order=stage2_date.asc,name.asc`,
    'GET',
  )
}

// 今日以前的所有報到／進度紀錄（資料量小，全帶回前端比對）。
export async function getCheckinsBefore(today) {
  return callProxy(`/rest/v1/stage2_checkins?checkin_date=lt.${today}&select=*`, 'GET')
}

// 批次指派／清除二階面試日（依帳號，同帳號所有志願列一起設定）。每 50 個帳號一批。
// date 傳 '' / null 表示清除（取消排程）。需 applications 的 UPDATE RLS 政策。
export async function setStage2Date(accounts, date) {
  const list = [...new Set((accounts || []).filter(Boolean))]
  if (!list.length) return
  const BATCH = 50
  for (let i = 0; i < list.length; i += BATCH) {
    const inList = list.slice(i, i + BATCH).map((a) => encodeURIComponent(a)).join(',')
    await callProxy(
      `/rest/v1/applications?account=in.(${inList})`,
      'PATCH',
      { stage2_date: date || null },
      'return=minimal',
    )
  }
}

// 某日所有報到／進度紀錄（department='' 為主會議室總報到，department=系名 為該系進度）。
export async function getCheckins(date) {
  return callProxy(`/rest/v1/stage2_checkins?checkin_date=eq.${date}&select=*`, 'GET')
}

// upsert 一筆報到／進度（on_conflict account,checkin_date,department，merge-duplicates）。
export async function upsertCheckin({ account, checkin_date, department, status }) {
  return callProxy(
    '/rest/v1/stage2_checkins?on_conflict=account,checkin_date,department',
    'POST',
    { account, checkin_date, department: department || '', status, updated_at: new Date().toISOString() },
    'resolution=merge-duplicates,return=representation',
  )
}

// 刪除一筆報到／進度（department 為 '' 時即主會議室那筆）。
export async function deleteCheckin(account, date, department) {
  return callProxy(
    `/rest/v1/stage2_checkins?account=eq.${encodeURIComponent(account)}&checkin_date=eq.${date}&department=eq.${encodeURIComponent(department || '')}`,
    'DELETE', undefined, 'return=minimal',
  )
}

// ── 招生漏斗與歷年統計 ──────────────────────────────────────────────────────
// 本年度即時漏斗：各階段「不重複帳號」人數。
//   二階報到以 stage2_checkins 主會議室列（department=''、status='arrived'）計；
//   最終錄取／備取看 final_admissions.final_status；確定就讀看 stage4 contact_status。
export async function getFunnelStats() {
  const [apps, s1, s2chk, fa, s4] = await Promise.all([
    callProxy('/rest/v1/applications?select=account', 'GET'),
    callProxy('/rest/v1/stage1_records?select=account', 'GET'),
    callProxy('/rest/v1/stage2_checkins?select=account&department=eq.&status=eq.arrived', 'GET'),
    callProxy('/rest/v1/final_admissions?select=account,final_status', 'GET'),
    callProxy('/rest/v1/stage4_confirmations?select=account,contact_status', 'GET'),
  ])
  const uniq = (rows) => new Set((rows || []).map((r) => r.account).filter(Boolean)).size
  return {
    applicants: uniq(apps),
    stage1_attended: uniq(s1),
    stage2_attended: uniq(s2chk),
    admitted: uniq((fa || []).filter((r) => r.final_status === 'admitted')),
    waitlisted: uniq((fa || []).filter((r) => r.final_status === 'waitlisted')),
    enrolled: uniq((s4 || []).filter((r) => r.contact_status === 'enrolled')),
  }
}

// 歷年快照（年度清空前寫入 yearly_stats）。
export async function getYearlyStats() {
  return callProxy('/rest/v1/yearly_stats?select=*&order=year.desc', 'GET')
}

export async function saveYearlySnapshot(row) {
  return callProxy(
    '/rest/v1/yearly_stats?on_conflict=year',
    'POST', row,
    'resolution=merge-duplicates,return=representation',
  )
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

// 登入：改打 server-side 的 /api/login，由伺服器用 service key 比對帳密，
// 前端不再直接撈 teachers 表。成功回傳 teacher（不含 password_hash），失敗丟出錯誤。
export async function loginTeacher(username, password) {
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  let data = {}
  try { data = await res.json() } catch { /* 非 JSON 回應 */ }
  if (!res.ok) throw new Error(data.error || '登入失敗')
  return data.teacher
}

// ── Stage 3（第三階段 · 最終錄取）──────────────────────────────────────────
// 所有二階評分 + 對應 application（只有已過一階者才會有評分）
export async function getStage3Data() {
  return callProxy(
    '/rest/v1/evaluations?select=*,applications(account,name,name_english,department,stage1_passed_date,preference_order,center)' +
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

// ── Stage 4（第四階段 · 繳費就讀確認 / 候補遞補）──────────────────────────────
// 撈 stage4_confirmations 全部資料（依 中心 → 科系 → 類別(正取先) → 備取排名 排序），
// 再以 account join applications 補上學生基本資料（appInfo）。
// stage4_confirmations 未設 FK 到 applications，故分兩次撈、前端組合。
export async function getStage4Data() {
  const s4 = await callProxy(
    '/rest/v1/stage4_confirmations?select=*&order=center.asc,department.asc,stage3_status.asc,standby_rank.asc',
    'GET',
  )
  const apps = await callProxy(
    '/rest/v1/applications?select=account,name,name_english,birth_date,passport_number,email',
    'GET',
  )
  const appMap = new Map((apps || []).map((a) => [a.account, a]))
  return (s4 || []).map((r) => ({ ...r, appInfo: appMap.get(r.account) || {} }))
}

// ── 寄信名單（YAMM 郵件合併用；皆含 Email、以「人」為單位）──────────────
// ② 二階（系所面試）通知：通過一階且書審通過者，一人一列、附報考系所
export async function getNotifyStage2() {
  const rows = await callProxy(
    '/rest/v1/applications?select=account,name,name_english,email,nationality,stage1_passed_date,department,preference_order' +
      '&account=not.is.null&stage1_passed_date=not.is.null&paper_passed=is.true&order=name.asc',
    'GET',
  )
  return groupByAccount(rows || [])   // allDepts 內含全部報考系所
}

// ③ 三階（錄取）通知：final_admissions 為 admitted 者，join applications 取 Email
export async function getNotifyStage3() {
  const fa = await callProxy(
    '/rest/v1/final_admissions?select=account,department,final_status&final_status=eq.admitted',
    'GET',
  )
  const apps = await callProxy('/rest/v1/applications?select=account,name,name_english,email', 'GET')
  const m = new Map((apps || []).map((a) => [a.account, a]))
  const seen = new Set(); const out = []
  for (const r of (fa || [])) {
    if (seen.has(r.account)) continue
    seen.add(r.account)
    const a = m.get(r.account) || {}
    out.push({ account: r.account, name: a.name, name_english: a.name_english, email: a.email, department: r.department })
  }
  return out
}

// 從 Stage3（final_admissions 的 admitted + waitlisted）同步到 Stage4：
//   1. 取 evaluations 的 total_score、applications 的 preference_order / center / 姓名
//   2. 依 中心 + 科系 分組，waitlisted 以 preference_order asc, total_score desc 計算 standby_rank
//   3. admitted 的 standby_rank 為 null
//   4. upsert（on_conflict account+department，merge-duplicates）；
//      已存在且 contact_status != 'pending' 的不覆蓋，保護進行中（候補詢問/就讀/放棄…）的資料
export async function syncStage4FromStage3() {
  const admissions = await callProxy(
    '/rest/v1/final_admissions?select=*&or=(final_status.eq.admitted,final_status.eq.waitlisted)',
    'GET',
  )
  const evals = await callProxy(
    '/rest/v1/evaluations?select=department,total_score,applications(account)&order=total_score.desc',
    'GET',
  )
  const apps = await callProxy(
    '/rest/v1/applications?select=account,department,preference_order,center&order=preference_order.asc',
    'GET',
  )

  // account__department → total_score（evaluations 無 account 欄位，經 applications join 取得）
  const evalMap = new Map((evals || []).map((e) => [`${e.applications?.account}__${e.department}`, e.total_score]))
  // account__department → { preference_order, center }
  const appMap = new Map((apps || []).map((a) => [`${a.account}__${a.department}`, a]))

  // 只取 stage4_confirmations 實際存在的欄位（勿 spread ...app，避免帶入表中沒有的欄位）
  const rows = (admissions || []).map((a) => {
    const key = `${a.account}__${a.department}`
    const app = appMap.get(key) || {}
    return {
      account: a.account,
      department: a.department,
      center: app.center || '',
      stage3_status: a.final_status,
      preference_order: app.preference_order || null,
      stage2_score: evalMap.get(key) ?? null,
      standby_rank: null,
      contact_status: 'pending',
    }
  })

  // 計算 standby_rank：依 中心 + 科系 分組，只對 waitlisted 排序
  const groups = {}
  for (const r of rows) {
    if (r.stage3_status !== 'waitlisted') continue
    const k = `${r.center}__${r.department}`
    if (!groups[k]) groups[k] = []
    groups[k].push(r)
  }
  for (const group of Object.values(groups)) {
    group.sort((a, b) => {
      if (a.preference_order !== b.preference_order) return (a.preference_order || 99) - (b.preference_order || 99)
      return (b.stage2_score || 0) - (a.stage2_score || 0)
    })
    group.forEach((r, i) => { r.standby_rank = i + 1 })
  }

  // 保護進行中資料：已存在且 contact_status != 'pending' 的 (account,department) 不重新同步
  const existing = await callProxy(
    '/rest/v1/stage4_confirmations?select=account,department,contact_status',
    'GET',
  )
  const locked = new Set(
    (existing || [])
      .filter((r) => r.contact_status && r.contact_status !== 'pending')
      .map((r) => `${r.account}__${r.department}`),
  )
  const writable = rows.filter((r) => !locked.has(`${r.account}__${r.department}`))

  // 分批 upsert，每批 50 筆
  const BATCH = 50
  for (let i = 0; i < writable.length; i += BATCH) {
    const chunk = writable.slice(i, i + BATCH)
    await callProxy(
      '/rest/v1/stage4_confirmations?on_conflict=account,department',
      'POST', chunk,
      'resolution=merge-duplicates,return=minimal',
    )
  }
  return writable.length
}

// 更新單筆 stage4 狀態（聯繫狀態 / 備注…）
export async function updateStage4Status(id, fields) {
  const result = await callProxy(
    `/rest/v1/stage4_confirmations?id=eq.${id}`,
    'PATCH', fields, 'return=representation',
  )
  // return=representation 回傳更新後的資料陣列；若為空代表 id 不存在或 RLS 阻擋
  if (!result || (Array.isArray(result) && result.length === 0)) {
    throw new Error('更新失敗（找不到該筆資料，或 stage4_confirmations 缺少 UPDATE 的 RLS 政策）')
  }
  return result
}

// ── 年度重置（行政）────────────────────────────────────────────────────────
// 一次撈五張表全部資料，給「匯出年度備份」做成多工作表 Excel。
export async function exportAllData() {
  const [apps, s1, s2, s3, s4, chk] = await Promise.all([
    callProxy('/rest/v1/applications?select=*', 'GET'),
    callProxy('/rest/v1/stage1_records?select=*', 'GET'),
    callProxy('/rest/v1/evaluations?select=*', 'GET'),
    callProxy('/rest/v1/final_admissions?select=*', 'GET'),
    callProxy('/rest/v1/stage4_confirmations?select=*', 'GET'),
    callProxy('/rest/v1/stage2_checkins?select=*', 'GET'),
  ])
  return { apps, s1, s2, s3, s4, chk }
}

// 清空本年度所有學生相關資料（中心名單與老師帳號不動）。
// 走 server-side 的 /api/reset：伺服器用 service key 繞過 RLS 刪除，
// 故五張表的 DELETE RLS 政策維持關閉，anon key（/api/submit）仍無法刪除。
// 須帶 admin 帳密，伺服器驗證帳密 + 角色為 admin 後才執行。
export async function clearAllData(username, password) {
  const res = await fetch('/api/reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  let data = {}
  try { data = await res.json() } catch { /* 非 JSON 回應 */ }
  if (!res.ok) throw new Error(data.error || '清空失敗')
  return data
}

// ── 追加到 src/api.js 末端 ──────────────────────────────────────────────────
// 面試通知信：草稿服務 + 寄送記錄

async function callDraftMail(action, payload) {
  const res = await fetch('/api/draftmail', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload }),
  })
  const text = await res.text()
  let data
  try { data = text ? JSON.parse(text) : {} } catch { data = { ok: false, error: text } }
  if (!res.ok || data.ok === false) throw new Error(data.error || '草稿服務請求失敗')
  return data
}

// 在公務信箱草稿夾建立草稿。messages: [{ to, subject, body }]
export async function createDrafts(messages) {
  return callDraftMail('create_drafts', { messages })
}

// 送出本批草稿（draftIds 來自 createDrafts 的回傳）
export async function sendDraftBatch(draftIds) {
  return callDraftMail('send_batch', { draftIds })
}

// 寄送記錄（mail_log）：kind 例 's1_invite' / 's2_invite'；status 'draft' / 'sent'
export async function logMail(rows) {
  if (!rows || !rows.length) return null
  return callProxy(
    '/rest/v1/mail_log?on_conflict=account,kind',
    'POST',
    rows,
    'resolution=merge-duplicates,return=representation',
  )
}

export async function getMailLog(kind) {
  const rows = await callProxy(
    `/rest/v1/mail_log?select=account,kind,status,sent_at&kind=eq.${encodeURIComponent(kind)}`,
    'GET',
  )
  return Object.fromEntries((rows || []).map((r) => [r.account, r]))
}