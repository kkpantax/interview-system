// ── 統計儀表板純計算 ──────────────────────────────────────────────────────
// 把 getDashboardData() 撈回的原始資料壓成漏斗 / 各系產出 / 國籍 / 性別 / 年齡，
// 並可依校區（全部 / 台北校區 / 高雄校區 / 其他）篩選。純函式、無 React，方便單測。
import { resolveCampus, batchOf } from './constants'
import { calcAge } from './utils'

const sizeOf = (arr) => new Set((arr || []).filter(Boolean)).size

// 年齡分桶（≥23 視為偏大族群，與一階評分表的 ≥23 警示一致）
export const AGE_BUCKETS = ['未滿 18', '18–20', '21–22', '23 歲以上', '未填']
function ageBucket(birth) {
  const a = calcAge(birth)
  if (a == null) return '未填'
  if (a < 18) return '未滿 18'
  if (a <= 20) return '18–20'
  if (a <= 22) return '21–22'
  return '23 歲以上'
}

const tally = (arr, keyFn) => {
  const o = {}
  for (const x of arr) { const k = keyFn(x); o[k] = (o[k] || 0) + 1 }
  return o
}

// data: { apps, stage1, stage2, finalAdmissions, stage4 }（見 api.getDashboardData）
// campusMap: department_campus 覆蓋表；campusFilter: '全部' | 校區名
export function buildDashboard(data, campusMap = {}, campusFilter = '全部') {
  const apps = data?.apps || []
  const fa = data?.finalAdmissions || []
  const s4 = data?.stage4 || []

  // 帳號 → 主校區（以第一志願系所所屬校區；無第一志願者取首次出現的系）
  const primary = new Map()
  for (const r of apps) {
    if (!r.account) continue
    const p = Number(r.preference_order)
    const cur = primary.get(r.account)
    if (!cur || (p === 1 && cur.p !== 1)) primary.set(r.account, { dept: r.department, p })
  }
  const campusOfAcc = (acc) => {
    const e = primary.get(acc)
    return e ? resolveCampus(e.dept, campusMap) : '其他'
  }
  const inFilter = (acc) => campusFilter === '全部' || campusOfAcc(acc) === campusFilter

  // 不重複「人」（每帳號取首列）做 demographic
  const personRow = new Map()
  for (const r of apps) {
    if (r.account && !personRow.has(r.account)) personRow.set(r.account, r)
  }
  const people = [...personRow.entries()].filter(([acc]) => inFilter(acc)).map(([, r]) => r)

  // ── 漏斗（全部階段依「人的主校區」篩）──────────────────────────────────────
  const pick = (rows) => (rows || []).map((r) => r.account).filter((a) => a && inFilter(a))
  const funnel = {
    applicants: sizeOf(pick(apps)),
    stage1: sizeOf(pick(data?.stage1)),
    stage2: sizeOf(pick(data?.stage2)),
    admitted: sizeOf(pick(fa.filter((r) => r.final_status === 'admitted'))),
    waitlisted: sizeOf(pick(fa.filter((r) => r.final_status === 'waitlisted'))),
    enrolled: sizeOf(pick(s4.filter((r) => r.contact_status === 'enrolled'))),
  }

  // ── 梯次對照（同漏斗口徑，再依帳號第 4 碼分第一梯 / 第二梯）──────────────────
  const batchPick = (rows, b) =>
    (rows || []).map((r) => r.account).filter((a) => a && inFilter(a) && batchOf(a) === b)
  const batchFunnelFor = (b) => ({
    applicants: sizeOf(batchPick(apps, b)),
    stage1: sizeOf(batchPick(data?.stage1, b)),
    stage2: sizeOf(batchPick(data?.stage2, b)),
    admitted: sizeOf(batchPick(fa.filter((r) => r.final_status === 'admitted'), b)),
    waitlisted: sizeOf(batchPick(fa.filter((r) => r.final_status === 'waitlisted'), b)),
    enrolled: sizeOf(batchPick(s4.filter((r) => r.contact_status === 'enrolled'), b)),
  })
  const batchFunnel = { 1: batchFunnelFor(1), 2: batchFunnelFor(2) }

  // ── 各系產出（一律以系所自身校區歸屬；校區篩選只決定顯示哪些系）──────────────
  const dm = {}
  const ensure = (d) => (dm[d] || (dm[d] = {
    dept: d, admitted: new Set(), waitlisted: new Set(), enrolled: new Set(), p1: 0, total: 0,
  }))
  for (const r of fa) {
    if (!r.department) continue
    if (r.final_status === 'admitted') ensure(r.department).admitted.add(r.account)
    else if (r.final_status === 'waitlisted') ensure(r.department).waitlisted.add(r.account)
  }
  for (const r of s4) {
    if (r.department && r.contact_status === 'enrolled') ensure(r.department).enrolled.add(r.account)
  }
  for (const r of apps) {
    if (!r.department) continue
    const e = ensure(r.department)
    e.total++
    if (Number(r.preference_order) === 1) e.p1++
  }
  let deptRows = Object.values(dm).map((m) => ({
    dept: m.dept,
    campus: resolveCampus(m.dept, campusMap),
    admitted: m.admitted.size,
    waitlisted: m.waitlisted.size,
    enrolled: m.enrolled.size,
    p1: m.p1,
    total: m.total,
  }))
  if (campusFilter !== '全部') deptRows = deptRows.filter((d) => d.campus === campusFilter)

  // ── demographic ───────────────────────────────────────────────────────────
  const natStats = tally(people, (p) => (p.nationality || '未填').trim() || '未填')
  const genderStats = tally(people, (p) => (p.gender || '未填').trim() || '未填')
  const ageStats = tally(people, (p) => ageBucket(p.birth_date))

  return { funnel, batchFunnel, deptRows, people, totalPeople: people.length, natStats, genderStats, ageStats }
}
