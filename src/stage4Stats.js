// 第四階段 · 各系即時就讀確認統計（純函式，無副作用，可用 node 測試）
//
// 輸入：
//   rows       stage4_confirmations 資料（getStage4Data 回傳，含 stage3_status / contact_status / standby_rank）
//   quotas     { 系名: 名額 }（getDepartmentQuotas）
//   overrides  { 系名: 校區 }（getDepartmentCampuses，給 resolveCampus 用）
//
// 每系一列：
//   admitted    正取人數（stage3_status==='admitted'）
//   waitlisted  備取人數（stage3_status==='waitlisted'）
//   pending     等待回應（正取中 contact_status==='pending'）
//   negotiating 候補詢問中（contact_status==='negotiating'）
//   enrolled    確定就讀（contact_status==='enrolled'）
//   declined    拒絕（contact_status==='declined'）
//   quota       名額（quotas 取，無設定為 null）
//   vacancy     出缺（名額 − 確定就讀 − 等待回應 − 候補詢問中；名額未設定為 null，下限 0）
import { resolveCampus, CAMPUS_OPTIONS } from './constants'

export function computeStage4Summary(rows = [], quotas = {}, overrides = {}) {
  const byDept = new Map()
  const ensure = (dept) => {
    if (!byDept.has(dept)) {
      byDept.set(dept, {
        department: dept,
        campus: resolveCampus(dept, overrides),
        admitted: 0, waitlisted: 0, pending: 0,
        negotiating: 0, enrolled: 0, declined: 0,
        settledElsewhere: 0, passed: 0,
      })
    }
    return byDept.get(dept)
  }

  for (const r of rows) {
    const dept = r.department || '（未設定系所）'
    const d = ensure(dept)
    if (r.stage3_status === 'admitted') d.admitted += 1
    if (r.stage3_status === 'waitlisted') d.waitlisted += 1
    const cs = r.contact_status
    if (cs === 'pending' && r.stage3_status === 'admitted') d.pending += 1
    if (cs === 'negotiating') d.negotiating += 1
    if (cs === 'enrolled') d.enrolled += 1
    if (cs === 'declined') d.declined += 1
    if (cs === 'settled_elsewhere') d.settledElsewhere += 1
    if (cs === 'passed') d.passed += 1
  }

  const list = [...byDept.values()].map((d) => {
    const q = quotas?.[d.department]
    const quota = Number.isFinite(q) ? q : (q == null ? null : Number(q))
    const vacancy = quota == null
      ? null
      : Math.max(0, quota - d.enrolled - d.pending - d.negotiating)
    return { ...d, quota, vacancy }
  })

  // 校區排序（台北→高雄→其他），同校區內依系名
  const campusRank = (c) => {
    const i = CAMPUS_OPTIONS.indexOf(c)
    return i === -1 ? CAMPUS_OPTIONS.length : i
  }
  list.sort((a, b) => {
    if (a.campus !== b.campus) return campusRank(a.campus) - campusRank(b.campus)
    return a.department.localeCompare(b.department, 'zh-TW')
  })

  const totals = list.reduce((t, d) => ({
    admitted: t.admitted + d.admitted,
    waitlisted: t.waitlisted + d.waitlisted,
    pending: t.pending + d.pending,
    negotiating: t.negotiating + d.negotiating,
    enrolled: t.enrolled + d.enrolled,
    declined: t.declined + d.declined,
    quota: t.quota + (d.quota || 0),
    vacancy: t.vacancy + (d.vacancy || 0),
    quotaSet: t.quotaSet || d.quota != null,
  }), {
    admitted: 0, waitlisted: 0, pending: 0, negotiating: 0,
    enrolled: 0, declined: 0, quota: 0, vacancy: 0, quotaSet: false,
  })

  return { list, totals }
}
