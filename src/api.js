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

// ── 面試資訊連結（info_links：老師時段表 / 各系 Meet / 其他，後台「連結管理」可編輯）──
// kind: 'schedule'＝時段安排表、'meet'＝各系視訊連結（departments 存逗號分隔系名關鍵字）、'link'＝其他
export async function getInfoLinks() {
  return callProxy('/rest/v1/info_links?select=*&order=sort_order.asc,id.asc', 'GET')
}
export async function addInfoLink(row) {
  return callProxy('/rest/v1/info_links', 'POST', row, 'return=representation')
}
export async function updateInfoLink(id, patch) {
  return callProxy(
    `/rest/v1/info_links?id=eq.${id}`,
    'PATCH', { ...patch, updated_at: new Date().toISOString() }, 'return=representation',
  )
}
export async function deleteInfoLink(id) {
  const res = await callProxy(`/rest/v1/info_links?id=eq.${id}`, 'DELETE', undefined, 'return=representation')
  if (!Array.isArray(res) || !res.length) {
    throw new Error('刪除失敗：0 筆（請確認 info_links 的 DELETE RLS 政策）')
  }
  return res
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

// 批次以「帳號」寫入書面資料雲端連結（PATCH applications，沿用既有 UPDATE RLS）
export async function updateMaterialsUrlByAccount(updates, onProgress) {
  let done = 0, updated = 0
  for (const u of updates) {
    if (!u.account || !u.materials_url) { done++; onProgress?.(done, updates.length); continue }
    const res = await callProxy(
      `/rest/v1/applications?account=eq.${encodeURIComponent(u.account)}`,
      'PATCH', { materials_url: u.materials_url }, 'return=representation',
    )
    if (Array.isArray(res) && res.length) updated++
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

// 刪除單筆第二階段評分（僅超級管理員介面提供：老師誤送出時移除後可重評）。
// 需 evaluations 的 DELETE RLS 政策。
export async function deleteEvaluation(id) {
  const res = await callProxy(
    `/rest/v1/evaluations?id=eq.${id}`,
    'DELETE', undefined, 'return=representation',
  )
  if (!Array.isArray(res) || !res.length) {
    throw new Error('刪除失敗：0 筆（請確認 evaluations 的 DELETE RLS 政策）')
  }
  return res
}

// 依帳號清單撈一階評分紀錄（二階報到頁「下載當日名單」用）。
// in.() 過長會爆 URL，分批每 50 帳號一次。
export async function getStage1RecordsByAccounts(accounts) {
  const uniq = [...new Set((accounts || []).filter(Boolean))]
  const out = []
  for (let i = 0; i < uniq.length; i += 50) {
    const batch = uniq.slice(i, i + 50).map((a) => `"${a}"`).join(',')
    const rows = await callProxy(
      `/rest/v1/stage1_records?account=in.(${encodeURIComponent(batch)})` +
        '&select=account,appeared,total_score,scores,recommendation',
      'GET',
    )
    out.push(...(rows || []))
  }
  return out
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
    `/rest/v1/applications?select=*,evaluations(id,recommendation,total_score,eval_date,evaluator_name,translator_name,scores,teacher_note,custom_questions)` +
      `&department=eq.${encodeURIComponent(dept)}` +
      `&stage1_passed_date=not.is.null&paper_passed=is.true&withdrawn=is.false&order=name.asc`,
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
//   waiting=尚未評分且未放棄, evaluated=已有至少一筆評分, admitted=評分中有任一筆 recommendation=admit,
//   abandoned=未評分但行政報到端已標記放棄該志願（不計入 waiting，避免行政誤以為還有人沒評到）。
//   放棄比對沿用評分頁邏輯：報到列 status='abandoned' 且 checkin_date == 該生面試日（無排程退回今天）才算數，
//   改期後舊日期的放棄列自動失效。
// dateFilter：'all'=全部日期（預設，向後相容）｜'unscheduled'=未排面試日｜ISO 日期=只計面試日為該日者
export async function getStage2DeptSummary(dateFilter = 'all') {
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const matchDate = (r) =>
    dateFilter === 'all' ? true :
    dateFilter === 'unscheduled' ? !r.stage2_date :
    (r.stage2_date || '') === dateFilter
  const [depts, rows, abChecks] = await Promise.all([
    getDepartments(),
    callProxy(
      '/rest/v1/applications?select=account,department,stage2_date,evaluations(recommendation)&stage1_passed_date=not.is.null&paper_passed=is.true',
      'GET',
    ),
    callProxy('/rest/v1/stage2_checkins?select=account,department,checkin_date&status=eq.abandoned', 'GET'),
  ])
  // 放棄面試查找表：account|department → Set(checkin_date)
  const abMap = new Map()
  for (const c of (abChecks || [])) {
    if (!c.department) continue
    const k = c.account + '|' + c.department
    if (!abMap.has(k)) abMap.set(k, new Set())
    abMap.get(k).add(c.checkin_date)
  }
  const map = new Map(depts.map((d) => [d, { department: d, waiting: 0, evaluated: 0, admitted: 0, abandoned: 0 }]))
  for (const r of (rows || [])) {
    if (!matchDate(r)) continue
    const m = map.get(r.department)
    if (!m) continue
    const evs = r.evaluations || []
    if (evs.length > 0) {
      m.evaluated++
      if (evs.some((e) => e.recommendation === 'admit')) m.admitted++
      continue
    }
    const ab = abMap.get(r.account + '|' + r.department)
    if (ab && ab.has(r.stage2_date || today)) m.abandoned++
    else m.waiting++
  }
  return depts.map((d) => map.get(d))
}

// 二階各日人數：進二階者依 stage2_date 統計（以 account 去重；全志願皆未排者計入 unscheduled）
export async function getStage2DateCounts() {
  const rows = await callProxy(
    '/rest/v1/applications?select=account,stage2_date&stage1_passed_date=not.is.null&paper_passed=is.true',
    'GET',
  )
  const byDate = new Map()           // iso → Set(account)
  const dated = new Set()            // 已有任一志願排日的帳號
  const all = new Set()
  for (const r of (rows || [])) {
    if (!r.account) continue
    all.add(r.account)
    if (r.stage2_date) {
      dated.add(r.account)
      if (!byDate.has(r.stage2_date)) byDate.set(r.stage2_date, new Set())
      byDate.get(r.stage2_date).add(r.account)
    }
  }
  const dates = [...byDate.keys()].sort()
  const m = {}
  for (const d of dates) m[d] = byDate.get(d).size
  return { dates, m, unscheduled: all.size - dated.size }
}

// 進度總覽用：進二階的「人」之中，已被任一系評過分的人數（以 account 去重）
export async function getStage2Progress() {
  const rows = await callProxy(
    '/rest/v1/applications?select=account,evaluations(id)&stage1_passed_date=not.is.null&paper_passed=is.true',
    'GET',
  )
  const m = new Map()
  for (const r of (rows || [])) {
    if (!r.account) continue
    const prev = m.get(r.account) || false
    m.set(r.account, prev || (r.evaluations || []).length > 0)
  }
  let evaluated = 0
  for (const v of m.values()) if (v) evaluated++
  return { total: m.size, evaluated, waiting: m.size - evaluated }
}

// 某系某日的評分明細（含學生資料），供下載查核 Excel 使用
export async function getStage2EvalsByDate(dept, date) {
  return callProxy(
    `/rest/v1/evaluations?select=*,applications(account,name,name_english,nationality,gender)` +
      `&department=eq.${encodeURIComponent(dept)}&eval_date=eq.${date}&order=total_score.desc`,
    'GET',
  )
}

export async function addStage2Translator({ department, session_date, translator_name }) {
  return callProxy(
    '/rest/v1/stage2_translators?on_conflict=department,session_date,translator_name',
    'POST',
    { department, session_date, translator_name },
    'resolution=merge-duplicates,return=representation',
  )
}
export async function getStage2TranslatorsByDate(dept, date) {
  return callProxy(
    `/rest/v1/stage2_translators?select=translator_name` +
      `&department=eq.${encodeURIComponent(dept)}&session_date=eq.${date}&order=translator_name.asc`,
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

// 整批指派但「只填還沒排日期的志願」（stage2_date IS NULL），不覆蓋已分天指派過的列。
// 供未排程整批指派用，避免把先前依系所／個別分天的結果蓋掉。每 50 個帳號一批。
export async function fillStage2Date(accounts, date) {
  const list = [...new Set((accounts || []).filter(Boolean))]
  if (!list.length || !date) return
  const BATCH = 50
  for (let i = 0; i < list.length; i += BATCH) {
    const inList = list.slice(i, i + BATCH).map((a) => encodeURIComponent(a)).join(',')
    await callProxy(
      `/rest/v1/applications?account=in.(${inList})&stage2_date=is.null`,
      'PATCH',
      { stage2_date: date },
      'return=minimal',
    )
  }
}

// 依系所整批指派二階面試日：只動該系所的志願列（其他志願不受影響）。二階資格者（過一階＋書審通過）。
// date 傳 '' / null 表示把該系所移回未排程。需 applications 的 UPDATE RLS 政策。
export async function setStage2DateByDept(dept, date) {
  if (!dept) return
  await callProxy(
    `/rest/v1/applications?department=eq.${encodeURIComponent(dept)}` +
      '&stage1_passed_date=not.is.null&paper_passed=is.true',
    'PATCH',
    { stage2_date: date || null },
    'return=minimal',
  )
}

// 個別調整：單一（帳號＋系所）那一列的二階面試日（account+department 組合唯一）。
export async function setStage2DateForPref(account, dept, date) {
  if (!account || !dept) return
  await callProxy(
    `/rest/v1/applications?account=eq.${encodeURIComponent(account)}` +
      `&department=eq.${encodeURIComponent(dept)}`,
    'PATCH',
    { stage2_date: date || null },
    'return=minimal',
  )
}

// 批次調整：依 application id 一次設定多列的二階面試日（供「把篩選出的整批改期」用）。每 50 筆一批。
export async function setStage2DateByIds(ids, date) {
  const list = [...new Set((ids || []).filter(Boolean))]
  if (!list.length) return
  const BATCH = 50
  for (let i = 0; i < list.length; i += BATCH) {
    const inList = list.slice(i, i + BATCH).join(',')
    await callProxy(
      `/rest/v1/applications?id=in.(${inList})`,
      'PATCH',
      { stage2_date: date || null },
      'return=minimal',
    )
  }
}

// 分天指派用：所有二階資格者的「逐志願」清單（含各列目前 stage2_date），供依系所統計與個別搜尋調整。
export async function getStage2AllPrefs() {
  return callProxy(
    '/rest/v1/applications?select=id,account,name,name_english,department,preference_order,stage2_date' +
      '&stage1_passed_date=not.is.null&paper_passed=is.true&order=name.asc,preference_order.asc',
    'GET',
  )
}

// 某日所有報到／進度紀錄（department='' 為主會議室總報到，department=系名 為該系進度）。
export async function getCheckins(date) {
  return callProxy(`/rest/v1/stage2_checkins?checkin_date=eq.${date}&select=*`, 'GET')
}

// 全部報到／進度列（老師端依各學生自己的面試日比對，不限定單一日期）。
export async function getAllCheckins() {
  return callProxy('/rest/v1/stage2_checkins?select=*', 'GET')
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

// 重設某學生在某系的派遣狀態：刪除該系所有 stage2_checkins 列（不分日期、不動主會議室 department='' 那筆）。
// 供超管刪除評分後連動使用，學生回到「待面試」可重新派出。0 筆也視為成功。
export async function resetStage2CheckinDept(account, department) {
  return callProxy(
    `/rest/v1/stage2_checkins?account=eq.${encodeURIComponent(account)}&department=eq.${encodeURIComponent(department)}`,
    'DELETE', undefined, 'return=minimal',
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

// ── 統計儀表板原始資料（一次撈齊，前端純函式 buildDashboard 再彙總／可依校區篩選）──
// 全部走現有 read RLS（getFunnelStats 已在生產驗證可讀），不需任何 DDL。
export async function getDashboardData() {
  const [apps, s1, s2chk, fa, s4] = await Promise.all([
    callProxy('/rest/v1/applications?select=account,department,preference_order,nationality,gender,birth_date,center', 'GET'),
    callProxy('/rest/v1/stage1_records?select=account', 'GET'),
    callProxy('/rest/v1/stage2_checkins?select=account&department=eq.&status=eq.arrived', 'GET'),
    callProxy('/rest/v1/final_admissions?select=account,department,final_status', 'GET'),
    callProxy('/rest/v1/stage4_confirmations?select=account,department,contact_status', 'GET'),
  ])
  return { apps: apps || [], stage1: s1 || [], stage2: s2chk || [], finalAdmissions: fa || [], stage4: s4 || [] }
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
  const rows = await callProxy(
    '/rest/v1/evaluations?select=*,applications(account,name,name_english,department,stage1_passed_date,preference_order,center,nationality,gender,withdrawn)' +
      '&order=department.asc,total_score.desc',
    'GET',
  )
  // 轉報後原志願已標記 withdrawn，排除其評分列不進放榜比對
  return (rows || []).filter((e) => !e.applications?.withdrawn)
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
    '/rest/v1/applications?select=account,name,name_english,nationality,birth_date,passport_number,email',
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

// ── 統計頁：正取學生 + 性別（一人一列，依帳號去重）──────────────
// final_admissions(admitted) join applications 取性別；校區由系所在 StatsApp 端判定
export async function getAdmittedForStats() {
  const fa = await callProxy(
    '/rest/v1/final_admissions?select=account,department&final_status=eq.admitted',
    'GET',
  )
  const apps = await callProxy('/rest/v1/applications?select=account,gender', 'GET')
  const genderMap = new Map((apps || []).map((a) => [a.account, a.gender]))
  const seen = new Set()
  const out = []
  for (const r of (fa || [])) {
    if (seen.has(r.account)) continue
    seen.add(r.account)
    out.push({ account: r.account, department: r.department, gender: genderMap.get(r.account) || '' })
  }
  return out
}

// ── 就讀學生（含性別，依帳號去重）：stage4 contact_status='enrolled' ──────────
export async function getEnrolledForStats() {
  const s4 = await callProxy(
    '/rest/v1/stage4_confirmations?select=account,department&contact_status=eq.enrolled',
    'GET',
  )
  const apps = await callProxy('/rest/v1/applications?select=account,gender', 'GET')
  const genderMap = new Map((apps || []).map((a) => [a.account, a.gender]))
  const seen = new Set()
  const out = []
  for (const r of (s4 || [])) {
    if (seen.has(r.account)) continue
    seen.add(r.account)
    out.push({ account: r.account, department: r.department, gender: genderMap.get(r.account) || '' })
  }
  return out
}

// ── 不錄取名單（第三階段全系所皆未錄取）：單向感謝信用，一人一列 ──────────
// 定義：學生在 final_admissions 有放榜資料，但沒有任何一筆 admitted/waitlisted
//      （即所有志願皆 rejected）。一階淘汰、未進放榜者不在此列。
// 不寫入 stage4_confirmations，純即時計算；依最高志願序（preference_order 最小）
// 的系所分組，附 Email/姓名/國籍供寄信。寄送狀態走 mail_log（kind='s4_reject'）。
export async function getStage4Rejected() {
  const fa = await callProxy(
    '/rest/v1/final_admissions?select=account,department,final_status',
    'GET',
  )
  // 以帳號彙整放榜結果，判斷是否「全部皆未錄取」
  const byAcct = new Map()
  for (const r of (fa || [])) {
    if (!byAcct.has(r.account)) byAcct.set(r.account, [])
    byAcct.get(r.account).push(r)
  }
  const rejSet = new Set()
  for (const [account, rows] of byAcct) {
    const hasPlace = rows.some((r) => r.final_status === 'admitted' || r.final_status === 'waitlisted')
    if (!hasPlace) rejSet.add(account)
  }
  if (!rejSet.size) return []

  // 取這些帳號的 applications，挑最高志願序（preference_order 最小）的系所作代表列
  const apps = await callProxy(
    '/rest/v1/applications?select=account,name,name_english,email,nationality,department,preference_order,center&order=preference_order.asc',
    'GET',
  )
  const pick = new Map()   // account → 代表列
  for (const a of (apps || [])) {
    if (!rejSet.has(a.account)) continue
    const cur = pick.get(a.account)
    if (!cur || (a.preference_order ?? 99) < (cur.preference_order ?? 99)) pick.set(a.account, a)
  }
  return Array.from(pick.values()).map((a) => ({
    account: a.account,
    name: a.name || '',
    name_english: a.name_english || '',
    email: a.email || '',
    nationality: a.nationality || '',
    department: a.department || '',   // 最高志願序系所，用於卡片分組
    center: a.center || '',
  }))
}

// 從 Stage3（final_admissions 的 admitted + waitlisted）同步到 Stage4：
//   1. 取 evaluations 的 total_score、applications 的 preference_order / center / 姓名
//   2. 依 科系 分組（跨中心），waitlisted 完全以該系老師打的分數 total_score desc 計算 standby_rank
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

  // 計算 standby_rank：依「科系」分組（跨中心），只對 waitlisted 排序。
  // 完全依該系老師打的分數（stage2_score = evaluations.total_score）由高到低排；
  // 同分時以志願序、帳號作為穩定排序的次要依據（不影響主排序＝老師分數）。
  const groups = {}
  for (const r of rows) {
    if (r.stage3_status !== 'waitlisted') continue
    const k = r.department
    if (!groups[k]) groups[k] = []
    groups[k].push(r)
  }
  for (const group of Object.values(groups)) {
    group.sort((a, b) =>
      (b.stage2_score || 0) - (a.stage2_score || 0) ||
      (a.preference_order || 99) - (b.preference_order || 99) ||
      String(a.account || '').localeCompare(String(b.account || '')),
    )
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

// 硬刪除某帳號的整位考生與其所有關聯資料（走 server-side /api/delete-student，service key + superadmin 驗證）。
export async function deleteStudentByAccount(account, username, password) {
  const res = await fetch('/api/delete-student', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account, username, password }),
  })
  let data = {}
  try { data = await res.json() } catch { /* 非 JSON 回應 */ }
  if (!res.ok) throw new Error(data.error || '刪除失敗')
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
    `/rest/v1/mail_log?select=account,kind,status,sent_at,draft_ids&kind=eq.${encodeURIComponent(kind)}`,
    'GET',
  )
  return Object.fromEntries((rows || []).map((r) => [r.account, r]))
}

// ── 第四階段 · 學生端就讀確認（公開端點 /api/confirm，service key 驗 token）─────
async function callConfirm(action, payload) {
  const res = await fetch('/api/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload }),
  })
  const text = await res.text()
  let data
  try { data = text ? JSON.parse(text) : {} } catch { data = { ok: false, error: text } }
  if (!res.ok || data.ok === false) throw new Error(data.error || '確認服務請求失敗')
  return data
}
// 學生開啟確認頁時讀取本人資訊（依 token）
export async function confirmInfo(token) {
  return callConfirm('info', { token })
}
// 學生送出選擇（decision: 'enrolled' | 'declined'）
export async function confirmSubmit(token, decision) {
  return callConfirm('submit', { token, decision })
}

// ── 入學準備 · 學生端（公開端點 /api/onboard，service key 驗 token）───────────
// GET 回傳 { ok, student, progress: {step: {...}}, settings: {step: {...}}, prefill }
export async function onboardInfo(token) {
  const res = await fetch(`/api/onboard?token=${encodeURIComponent(token)}`)
  const text = await res.text()
  let data
  try { data = text ? JSON.parse(text) : {} } catch { data = { ok: false, error: text } }
  if (!res.ok || data.ok === false) {
    const err = new Error(data.error || '入學準備服務請求失敗')
    err.status = res.status
    throw err
  }
  return data
}
// 送出步驟表單（payload: { token, step, data, line_joined }），回傳更新後五步 progress
export async function onboardSubmit(payload) {
  const res = await fetch('/api/onboard', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const text = await res.text()
  let data
  try { data = text ? JSON.parse(text) : {} } catch { data = { ok: false, error: text } }
  if (!res.ok || data.ok === false) throw new Error(data.error || '入學準備服務請求失敗')
  return data
}
// 中文姓名更改申請（token-only；同帳號同時只允許一筆 pending）。
// 錯誤帶 err.status 讓前端可分辨 409（已有待審申請）。
export async function onboardNameChangeRequest(payload) {
  const res = await fetch('/api/onboard', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'name-change-request', ...payload }),
  })
  const text = await res.text()
  let data
  try { data = text ? JSON.parse(text) : {} } catch { data = { ok: false, error: text } }
  if (!res.ok || data.ok === false) {
    const err = new Error(data.error || '入學準備服務請求失敗')
    err.status = res.status
    throw err
  }
  return data
}
// 上傳檔案到學生的 Drive 資料夾（走 /api/onboard-upload → Apps Script）。
// 參數物件：{ token, step, kind, file }；file 為 <input type="file"> 的 File 物件，
// kind 為檔案類別（如 'receipt'）。前端先擋 >10MB 與非 image/PDF 類型（真正上限由 Edge 再把關）。
// 回傳 { ok, url, kind, filename, fileId, states }（states 為更新後五步 progress）。
export async function onboardUpload({ token, step, kind, file }) {
  if (!file) throw new Error('請先選擇檔案')
  const mimeType = file.type || ''
  if (!(mimeType.startsWith('image/') || mimeType === 'application/pdf')) {
    throw new Error('只接受圖片或 PDF 檔')
  }
  if (file.size > 10 * 1024 * 1024) throw new Error('檔案過大（上限 10MB）')

  const dataBase64 = await new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1] || '')
    r.onerror = () => reject(new Error('讀取檔案失敗'))
    r.readAsDataURL(file)
  })
  const res = await fetch('/api/onboard-upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, step, kind, filename: file.name, mimeType, dataBase64 }),
  })
  const text = await res.text()
  let data
  try { data = text ? JSON.parse(text) : {} } catch { data = { ok: false, error: text } }
  if (!res.ok || data.ok === false) throw new Error(data.error || '上傳失敗')
  return data
}

// ── 入學準備後台（走 /api/onboard-admin，service role + superadmin 驗證）───────────
// 每次操作都帶超管帳密（前端在後台頁以一次性密碼閘門取得後快取於記憶體重用）。
async function onboardAdminPost(payload) {
  const res = await fetch('/api/onboard-admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const text = await res.text()
  let data
  try { data = text ? JSON.parse(text) : {} } catch { data = { ok: false, error: text } }
  if (!res.ok || data.ok === false) {
    const err = new Error(data.error || '操作失敗')
    err.status = res.status
    throw err
  }
  return data
}
// 撈全部入學準備學生 + 五步狀態 + 檔案（batch: 'all'|'1'|'2'；campus: 'all'|'台北'|'高雄'）
// 註：後台頁的校區篩選在前端做（總覽的分校區小計需要全部校區資料），campus 參數保留給
// 之後的匯出等單一校區場景使用。
export const onboardAdminList = (username, password, batch = 'all', campus = 'all') =>
  onboardAdminPost({ action: 'list', username, password, batch, campus })
// 步驟①資料明細（BA0203 匯出＋檢視彈窗共用）：不帶 account＝全體(非測試)；帶 account＝單筆
export const onboardAdminStep1Data = (username, password, account = null) =>
  onboardAdminPost({ action: 'step1-data', username, password, ...(account ? { account } : {}) })
// 確認某生某步（步驟2/3），自動開下一步
export const onboardAdminConfirm = (username, password, account, step) =>
  onboardAdminPost({ action: 'confirm', username, password, account, step })
// 標記放棄（帶原因）
export const onboardAdminAbandon = (username, password, account, reason) =>
  onboardAdminPost({ action: 'abandon', username, password, account, reason })
// 放棄復原（回 active）
export const onboardAdminReactivate = (username, password, account) =>
  onboardAdminPost({ action: 'reactivate', username, password, account })
// 撈設定：全部 enroll_settings（batch×step 10 列）＋ LINE 群組 QR（enroll_config.line_qr）
export const onboardAdminGetSettings = (username, password) =>
  onboardAdminPost({ action: 'settings', username, password })
// 儲存某 (batch, step) 的截止日／承辦資訊；step=5 可帶 notice（字串或 {台北,高雄} 物件）
export const onboardAdminSaveSettings = (username, password, payload) =>
  onboardAdminPost({ action: 'save-settings', username, password, ...payload })
// 儲存 LINE 群組 QR 圖片網址（value = {台北, 高雄}）
export const onboardAdminSaveLineQr = (username, password, value) =>
  onboardAdminPost({ action: 'save-line-qr', username, password, value })
// 儲存承辦窗口（全域兩組、只分校區：value = {台北:{name,email,phone}, 高雄:{...}}）
export const onboardAdminSaveContacts = (username, password, value) =>
  onboardAdminPost({ action: 'save-contacts', username, password, value })
// 批次匯入學號/宿舍資訊（rows = [{account, fields:{student_id?,dorm_room?,dorm_bed?,classroom?}}]，
// fields 只含有值欄＝空欄不覆蓋）；回 { updated, skipped }
export const onboardAdminImportStudents = (username, password, rows) =>
  onboardAdminPost({ action: 'import-students', username, password, rows })
// pending 更名申請清單（含系所/校區）
export const onboardAdminNameRequests = (username, password) =>
  onboardAdminPost({ action: 'name-requests', username, password })
// 通知信收件名單（payload = { step, batch, campus }；卡在該步且 active，含 email/已提醒次數）
export const onboardAdminMailRecipients = (username, password, payload) =>
  onboardAdminPost({ action: 'mail-recipients', username, password, ...payload })
// 通知信寄送成功回報（payload = { step, tier, accounts }：reminder_count+1、log mail_sent）
export const onboardAdminMailMarkSent = (username, password, payload) =>
  onboardAdminPost({ action: 'mail-mark-sent', username, password, ...payload })
// 通知信建立草稿回報（payload = { step, tier, accounts }：只 log mail_draft，不加提醒計數）
export const onboardAdminMailLogDraft = (username, password, payload) =>
  onboardAdminPost({ action: 'mail-log-draft', username, password, ...payload })
// （已停用）建立通知信 Gmail 草稿——Phase A 流程，UI 已改用 OnboardMailComposer 系統內寄送
export const onboardAdminBuildMailDrafts = (username, password, payload) =>
  onboardAdminPost({ action: 'mail-build-drafts', username, password, ...payload })
// 審核更名申請（payload = { id, decision: 'approve'|'reject', note? }；approve 才真的改 name）
export const onboardAdminNameReview = (username, password, payload) =>
  onboardAdminPost({ action: 'name-review', username, password, ...payload })

// 設定某筆 stage4 的確認 token 與回覆期限（承辦寄信時呼叫；走既有 PATCH proxy）
export async function setStage4Confirm(id, fields) {
  return updateStage4Status(id, fields)
}

// 第四階段寄信設定（依梯次記住正式放榜日期/回覆期限/承辦資訊）
// 回傳 { '1': {...}, '2': {...} }，找不到的梯次為 undefined
export async function getStage4Settings() {
  const rows = await callProxy('/rest/v1/stage4_settings?select=*', 'GET')
  const map = {}
  for (const r of (rows || [])) map[r.batch] = r
  return map
}
// 寫入/更新某梯設定（upsert by batch）
export async function saveStage4Settings(batch, fields) {
  const row = { batch: String(batch), ...fields, updated_at: new Date().toISOString() }
  return callProxy(
    '/rest/v1/stage4_settings?on_conflict=batch',
    'POST', [row],
    'resolution=merge-duplicates,return=minimal',
  )
}

// 建立/更新測試列（工具頁用；強制 is_test=true，永不進正式統計）
// 回傳 upsert 後的列（含 id 與 confirm_token），by (account, department) 去重
export async function upsertStage4TestRow(row) {
  const res = await callProxy(
    '/rest/v1/stage4_confirmations?on_conflict=account,department',
    'POST', [{ ...row, is_test: true }],
    'resolution=merge-duplicates,return=representation',
  )
  return Array.isArray(res) ? res[0] : res
}

// 稽核軌跡（承辦查看：某帳號/系所的確認紀錄）
export async function getStage4ConfirmLog() {
  return callProxy(
    '/rest/v1/stage4_confirm_log?select=*&order=created_at.desc',
    'GET',
  )
}

// ── 轉報（行政後台）────────────────────────────────────────────────
// 可轉報的目標系所：全系所清單扣掉該生原本已報考的系（皆以 applications.department 的實際字串為準）
export async function getTransferTargets(account) {
  const [all, mine] = await Promise.all([
    callProxy('/rest/v1/applications?select=department', 'GET'),
    callProxy(`/rest/v1/applications?select=department&account=eq.${encodeURIComponent(account)}`, 'GET'),
  ])
  const taken = new Set((mine || []).map((a) => a.department).filter(Boolean))
  const allSet = new Set((all || []).map((a) => a.department).filter(Boolean))
  return [...allSet].filter((d) => !taken.has(d)).sort((a, b) => a.localeCompare(b, 'zh-Hant'))
}

// 執行轉報：
//   1) 目前 stage4 列 → 已轉報（開出備取缺額）
//   2) 該生原有 applications 全部標記 withdrawn（退出放榜比對）
//   3) 在新系開一筆申請（withdrawn=false、paper_passed=true、帶 stage1_passed_date）→ 出現在新系二階待評分
//   4) 寫入 transfers 記錄（供追蹤頁）
export async function doTransfer({ row, toDepartment, note }) {
  const account = row.account
  const teacher = getTeacher()
  const src = await callProxy(
    `/rest/v1/applications?select=*&account=eq.${encodeURIComponent(account)}&limit=1`, 'GET',
  )
  const base = (src && src[0]) || {}

  // 1) 開出舊缺額
  await updateStage4Status(row.id, { contact_status: 'transferred' })

  // 2) 原有志願退出比對
  await callProxy(
    `/rest/v1/applications?account=eq.${encodeURIComponent(account)}`,
    'PATCH', { withdrawn: true }, 'return=minimal',
  )

  // 3) 新系建立申請
  const today = new Date().toISOString().slice(0, 10)
  const newApp = {
    account,
    department: toDepartment,
    preference_order: null,
    name: base.name ?? null,
    name_english: base.name_english ?? null,
    passport_number: base.passport_number ?? null,
    nationality: base.nationality ?? null,
    gender: base.gender ?? null,
    birth_date: base.birth_date ?? null,
    email: base.email ?? null,
    phone: base.phone ?? null,
    high_school: base.high_school ?? null,
    status: 'stage1_passed',
    stage1_passed_date: base.stage1_passed_date ?? today,
    paper_passed: true,
    center: base.center ?? null,
    withdrawn: false,
  }
  await callProxy('/rest/v1/applications', 'POST', newApp, 'return=minimal')

  // 4) 轉報記錄
  await callProxy('/rest/v1/transfers', 'POST', {
    account,
    from_department: row.department,
    from_status: row.stage3_status ?? null,
    from_standby_rank: row.standby_rank ?? null,
    to_department: toDepartment,
    note: note || null,
    created_by: teacher?.username || teacher?.display_name || null,
    to_status: 'scoring',
  }, 'return=minimal')

  return true
}

// 轉報追蹤清單：每筆附學生姓名 + 自動計算「新系現況」
//   二階待評分 → 二階已評分 → 三階正取/備取/不錄取 → 四階(就讀/放棄)
export async function getTransfers() {
  const [tr, apps, evals, fa, s4] = await Promise.all([
    callProxy('/rest/v1/transfers?select=*&order=created_at.desc', 'GET'),
    callProxy('/rest/v1/applications?select=account,name,name_english', 'GET'),
    callProxy('/rest/v1/evaluations?select=department,total_score,recommendation,applications(account)', 'GET'),
    callProxy('/rest/v1/final_admissions?select=account,department,final_status', 'GET'),
    callProxy('/rest/v1/stage4_confirmations?select=account,department,contact_status,stage3_status,standby_rank', 'GET'),
  ])
  const nameMap = new Map((apps || []).map((a) => [a.account, a]))
  const k = (acct, dept) => `${acct}__${dept}`
  const evalMap = new Map()
  for (const e of (evals || [])) {
    const acct = e.applications?.account
    if (acct) evalMap.set(k(acct, e.department), e)
  }
  const faMap = new Map((fa || []).map((r) => [k(r.account, r.department), r]))
  const s4Map = new Map((s4 || []).map((r) => [k(r.account, r.department), r]))

  return (tr || []).map((t) => {
    const key = k(t.account, t.to_department)
    const s4r = s4Map.get(key)
    const far = faMap.get(key)
    const ev  = evalMap.get(key)
    let newStatus
    if (s4r) {
      const base = s4r.stage3_status === 'admitted' ? '正取'
        : s4r.stage3_status === 'waitlisted' ? `備取${s4r.standby_rank ?? ''}` : '已放榜'
      const cs = s4r.contact_status === 'enrolled' ? '·就讀'
        : s4r.contact_status === 'declined' ? '·放棄'
        : s4r.contact_status === 'transferred' ? '·已轉報' : ''
      newStatus = { key: 'stage4', label: `四階 ${base}${cs}`, color: '#15803d', bg: '#dcfce7' }
    } else if (far) {
      const fs = far.final_status
      newStatus = fs === 'admitted'   ? { key: 'admitted',   label: '三階 正取',   color: '#15803d', bg: '#dcfce7' }
        : fs === 'waitlisted' ? { key: 'waitlisted', label: '三階 備取',   color: '#b45309', bg: '#fef3c7' }
        : fs === 'rejected'   ? { key: 'rejected',   label: '三階 不錄取', color: '#b91c1c', bg: '#fee2e2' }
        :                       { key: 'pending',    label: '三階 待定',   color: '#6b7280', bg: '#f3f4f6' }
    } else if (ev) {
      newStatus = { key: 'scored', label: `二階已評分${ev.total_score != null ? `（${ev.total_score}）` : ''}`, color: '#1e40af', bg: '#dbeafe' }
    } else {
      newStatus = { key: 'await_eval', label: '二階待評分', color: '#92400e', bg: '#fef3c7' }
    }
    return { ...t, appInfo: nameMap.get(t.account) || {}, newStatus }
  })
}

// 手動更新轉報的承辦處理狀態（to_status）
export async function updateTransferStatus(id, to_status) {
  const r = await callProxy(`/rest/v1/transfers?id=eq.${id}`, 'PATCH', { to_status }, 'return=representation')
  if (!r || (Array.isArray(r) && r.length === 0)) {
    throw new Error('更新失敗（找不到記錄，或 transfers 缺少 UPDATE 的 RLS 政策）')
  }
  return r
}
