import { useState, useEffect, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { PageShell } from '../components/PageShell'
import { Card, CardHead, Btn, Pill } from '../components/UI'
import { getAllApplications, getDepartmentQuotas, getDepartmentCampuses, getFunnelStats, getYearlyStats } from '../api'
import { resolveCampus, CAMPUS_OPTIONS } from '../constants'
import { getTeacher } from '../auth'

const ACCENT = '#0f766e'

// ── 純計算：把 applications（一列＝一志願）壓成各種統計 ──────────────────────
export function computeStats(apps) {
  const rows = apps || []
  const byAccount = new Map()
  for (const r of rows) {
    const key = r.account || `__noacc_${r.id}`
    if (!byAccount.has(key)) byAccount.set(key, r)
  }
  const people = [...byAccount.values()]

  const deptStats = {}
  for (const r of rows) {
    const d = r.department
    if (!d) continue
    if (!deptStats[d]) deptStats[d] = { dept: d, p1: 0, p2: 0, p3: 0, other: 0, total: 0 }
    deptStats[d].total++
    const p = Number(r.preference_order)
    if (p === 1) deptStats[d].p1++
    else if (p === 2) deptStats[d].p2++
    else if (p === 3) deptStats[d].p3++
    else deptStats[d].other++
  }

  const natStats = {}
  for (const p of people) {
    const n = (p.nationality || '未填').trim() || '未填'
    natStats[n] = (natStats[n] || 0) + 1
  }

  const genderStats = {}
  for (const p of people) {
    const g = (p.gender || '未填').trim() || '未填'
    genderStats[g] = (genderStats[g] || 0) + 1
  }

  const prefStats = {}
  for (const r of rows) {
    const p = r.preference_order != null ? String(r.preference_order) : '未填'
    prefStats[p] = (prefStats[p] || 0) + 1
  }

  return {
    totalPeople: people.length,
    totalApps: rows.length,
    deptCount: Object.keys(deptStats).length,
    natCount: Object.keys(natStats).length,
    people, deptStats, natStats, genderStats, prefStats,
  }
}

function StatBox({ label, value, sub, color = ACCENT }) {
  return (
    <div style={{ flex: '1 1 140px', background: 'white', border: '1px solid #e8e7e3', borderRadius: 10, padding: '16px 18px', minWidth: 140 }}>
      <div style={{ fontSize: 12, color: '#999', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#aaa', marginTop: 6 }}>{sub}</div>}
    </div>
  )
}

const th = { textAlign: 'left', padding: '8px 10px', fontSize: 12, color: '#888', fontWeight: 600, borderBottom: '1px solid #e8e7e3', whiteSpace: 'nowrap' }
const td = { padding: '8px 10px', fontSize: 13, borderBottom: '1px solid #f4f3ef', whiteSpace: 'nowrap' }
const tdNum = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }
const thNum = { ...th, textAlign: 'right' }

export default function StatsApp() {
  const [apps, setApps] = useState([])
  const [quotas, setQuotas] = useState({})
  const [campusMap, setCampusMap] = useState({})
  const [funnel, setFunnel] = useState(null)     // 本年度即時漏斗
  const [yearly, setYearly] = useState([])       // 歷年快照（year desc）
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  // 守衛：只有 admin / superadmin 能進（本頁可匯出含個資的報名明細）
  const teacher = getTeacher()
  useEffect(() => {
    if (!teacher || (teacher.role !== 'admin' && teacher.role !== 'superadmin')) {
      window.location.hash = '#/login?stage=stats'
    }
  }, [teacher])

  useEffect(() => {
    (async () => {
      try {
        const [a, q, c, f, y] = await Promise.all([
          getAllApplications(),
          getDepartmentQuotas().catch(() => ({})),
          getDepartmentCampuses().catch(() => ({})),
          getFunnelStats().catch(() => null),
          getYearlyStats().catch(() => []),
        ])
        setApps(a || [])
        setQuotas(q || {})
        setCampusMap(c || {})
        setFunnel(f)
        setYearly(y || [])
      } catch (e) {
        setErr(e?.message || '載入失敗')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const stats = useMemo(() => computeStats(apps), [apps])

  const byCampus = useMemo(() => {
    const groups = {}
    for (const c of CAMPUS_OPTIONS) groups[c] = []
    for (const d of Object.values(stats.deptStats)) {
      const camp = resolveCampus(d.dept, campusMap)
      ;(groups[camp] || (groups[camp] = [])).push(d)
    }
    for (const c of Object.keys(groups)) groups[c].sort((x, y) => y.p1 - x.p1 || y.total - x.total)
    return groups
  }, [stats.deptStats, campusMap])

  const natSorted = useMemo(() => Object.entries(stats.natStats).sort((a, b) => b[1] - a[1]), [stats.natStats])
  const genderSorted = useMemo(() => Object.entries(stats.genderStats).sort((a, b) => b[1] - a[1]), [stats.genderStats])
  const prefSorted = useMemo(() => Object.entries(stats.prefStats).sort((a, b) => {
    const na = Number(a[0]), nb = Number(b[0])
    if (Number.isNaN(na)) return 1
    if (Number.isNaN(nb)) return -1
    return na - nb
  }), [stats.prefStats])

  // 招生漏斗五階段（轉換率相對上一階；最終錄取卡內另列備取）
  const funnelSteps = useMemo(() => {
    if (!funnel) return []
    const steps = [
      { label: '報名人數', n: funnel.applicants, color: '#0f766e' },
      { label: '一階報到', n: funnel.stage1_attended, color: '#1e40af' },
      { label: '二階報到', n: funnel.stage2_attended, color: '#15803d' },
      { label: '最終錄取', n: funnel.admitted, sub: `備取 ${funnel.waitlisted}`, color: '#7e22ce' },
      { label: '確定就讀', n: funnel.enrolled, color: '#c2410c' },
    ]
    return steps.map((st, i) => ({
      ...st,
      rate: i > 0 && steps[i - 1].n > 0 ? (st.n / steps[i - 1].n * 100).toFixed(1) + '%' : null,
    }))
  }, [funnel])

  const thisYear = new Date().getFullYear()

  const downloadReport = () => {
    const wb = XLSX.utils.book_new()

    const overview = [
      ['項目', '數值'],
      ['實際報名人數（不重複帳號）', stats.totalPeople],
      ['總志願數', stats.totalApps],
      ['報名系所數', stats.deptCount],
      ['國籍數', stats.natCount],
      ['匯出時間', new Date().toLocaleString('zh-TW')],
    ]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(overview), '總覽')

    const deptAoa = [['校區', '系所', '第一志願', '第二志願', '第三志願', '總志願數', '預計錄取名額', '第一志願/名額倍率']]
    for (const camp of CAMPUS_OPTIONS) {
      for (const d of (byCampus[camp] || [])) {
        const quota = quotas[d.dept]
        const ratio = quota ? (d.p1 / quota).toFixed(1) : ''
        deptAoa.push([camp, d.dept, d.p1, d.p2, d.p3, d.total, quota ?? '', ratio])
      }
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(deptAoa), '各系統計')

    const natAoa = [['國籍', '人數', '占比']]
    for (const [n, c] of natSorted) natAoa.push([n, c, stats.totalPeople ? (c / stats.totalPeople * 100).toFixed(1) + '%' : ''])
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(natAoa), '國籍分布')

    const funnelAoa = [['年份', '報名人數', '一階報到', '二階報到', '最終錄取', '備取', '確定就讀']]
    if (funnel) {
      funnelAoa.push([`${thisYear}（進行中）`, funnel.applicants, funnel.stage1_attended, funnel.stage2_attended, funnel.admitted, funnel.waitlisted, funnel.enrolled])
    }
    for (const y of yearly) {
      funnelAoa.push([y.year, y.applicants, y.stage1_attended, y.stage2_attended, y.admitted, y.waitlisted, y.enrolled])
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(funnelAoa), '招生漏斗與歷年')

    const detailCols = [
      ['account', '帳號'], ['name', '中文姓名'], ['name_english', '英文姓名'],
      ['department', '系所'], ['preference_order', '志願序'], ['nationality', '國籍'],
      ['gender', '性別'], ['birth_date', '生日'], ['passport_number', '護照號碼'],
      ['phone', '行動電話'], ['email', 'Email'], ['high_school', '畢業學校'],
      ['graduation_year', '畢業年'], ['status', '狀態'],
    ]
    const detailAoa = [detailCols.map((c) => c[1])]
    for (const r of apps) detailAoa.push(detailCols.map((c) => r[c[0]] ?? ''))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(detailAoa), '報名明細')

    XLSX.writeFile(wb, `報名統計報表_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const pct = (n) => stats.totalPeople ? (n / stats.totalPeople * 100).toFixed(1) + '%' : '—'

  return (
    <PageShell
      title="報名統計儀表板"
      subtitle={loading ? '載入中…' : `${stats.totalPeople} 人報名・${stats.totalApps} 筆志願`}
      accent={ACCENT}
      intlBack
      right={<Btn variant="primary" onClick={downloadReport} disabled={loading || !apps.length}>⬇ 下載完整統計報表</Btn>}
    >
      {err && (
        <Card style={{ marginBottom: 16, borderColor: '#fca5a5', background: '#fef2f2' }}>
          <div style={{ padding: 16, color: '#991b1b', fontSize: 13 }}>載入失敗：{err}</div>
        </Card>
      )}

      {loading ? (
        <div style={{ color: '#999', fontSize: 14, padding: 40, textAlign: 'center' }}>載入報名資料中…</div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
            <StatBox label="實際報名人數" value={stats.totalPeople} sub="不重複帳號" />
            <StatBox label="總志願數" value={stats.totalApps} sub="一人最多 3 志願" color="#1e40af" />
            <StatBox label="報名系所數" value={stats.deptCount} color="#7e22ce" />
            <StatBox label="國籍數" value={stats.natCount} color="#c2410c" />
          </div>

          {funnelSteps.length > 0 && (
            <Card style={{ marginBottom: 20 }}>
              <CardHead left="招生漏斗（本年度）" right="各階段不重複帳號人數，% 為相對上一階轉換率" />
              <div style={{ display: 'flex', gap: 0, alignItems: 'stretch', padding: '16px 18px', overflowX: 'auto' }}>
                {funnelSteps.map((st, i) => (
                  <div key={st.label} style={{ display: 'flex', alignItems: 'center', flex: '1 1 0', minWidth: 130 }}>
                    {i > 0 && <div style={{ color: '#ccc', fontSize: 18, padding: '0 8px' }}>→</div>}
                    <div style={{ flex: 1, background: '#faf9f6', border: '1px solid #e8e7e3', borderRadius: 10, padding: '12px 14px' }}>
                      <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>{st.label}</div>
                      <div style={{ fontSize: 26, fontWeight: 700, color: st.color, lineHeight: 1.1 }}>{st.n}</div>
                      <div style={{ fontSize: 11, marginTop: 4, minHeight: 14 }}>
                        {st.rate && <span style={{ color: '#0f766e', fontWeight: 600 }}>{st.rate}</span>}
                        {st.sub && <span style={{ color: '#7e22ce', marginLeft: st.rate ? 8 : 0 }}>{st.sub}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card style={{ marginBottom: 20 }}>
            <CardHead left="歷年統計" right="年度清空時自動寫入快照" />
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>年份</th>
                    <th style={thNum}>報名人數</th>
                    <th style={thNum}>一階報到</th>
                    <th style={thNum}>二階報到</th>
                    <th style={thNum}>最終錄取</th>
                    <th style={thNum}>備取</th>
                    <th style={thNum}>確定就讀</th>
                  </tr>
                </thead>
                <tbody>
                  {funnel && (
                    <tr style={{ background: '#fefce8' }}>
                      <td style={{ ...td, fontWeight: 700 }}>{thisYear}（進行中）</td>
                      <td style={tdNum}>{funnel.applicants}</td>
                      <td style={tdNum}>{funnel.stage1_attended}</td>
                      <td style={tdNum}>{funnel.stage2_attended}</td>
                      <td style={tdNum}>{funnel.admitted}</td>
                      <td style={tdNum}>{funnel.waitlisted}</td>
                      <td style={tdNum}>{funnel.enrolled}</td>
                    </tr>
                  )}
                  {yearly.map((y) => (
                    <tr key={y.year}>
                      <td style={td}>{y.year}</td>
                      <td style={tdNum}>{y.applicants}</td>
                      <td style={tdNum}>{y.stage1_attended}</td>
                      <td style={tdNum}>{y.stage2_attended}</td>
                      <td style={tdNum}>{y.admitted}</td>
                      <td style={tdNum}>{y.waitlisted}</td>
                      <td style={tdNum}>{y.enrolled}</td>
                    </tr>
                  ))}
                  {!yearly.length && !funnel && (
                    <tr><td colSpan={7} style={{ ...td, textAlign: 'center', color: '#aaa', padding: 24 }}>尚無歷年資料</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          <Card style={{ marginBottom: 20 }}>
            <CardHead left="各系報名統計" right="第一志願人數由多到少" />
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>系所</th>
                    <th style={thNum}>第一志願</th>
                    <th style={thNum}>第二志願</th>
                    <th style={thNum}>第三志願</th>
                    <th style={thNum}>總志願數</th>
                    <th style={thNum}>預計錄取</th>
                    <th style={thNum}>一志願/名額</th>
                  </tr>
                </thead>
                <tbody>
                  {CAMPUS_OPTIONS.map((camp) => {
                    const list = byCampus[camp] || []
                    if (!list.length) return null
                    const sub = list.reduce((a, d) => ({
                      p1: a.p1 + d.p1, p2: a.p2 + d.p2, p3: a.p3 + d.p3, total: a.total + d.total,
                    }), { p1: 0, p2: 0, p3: 0, total: 0 })
                    return <FragmentRows key={camp} camp={camp} list={list} sub={sub} quotas={quotas} />
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 20 }}>
            <Card style={{ flex: '1 1 320px' }}>
              <CardHead left="國籍分布" right={`${stats.natCount} 國`} />
              <div style={{ overflowX: 'auto', maxHeight: 360, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr><th style={th}>國籍</th><th style={thNum}>人數</th><th style={thNum}>占比</th></tr></thead>
                  <tbody>
                    {natSorted.map(([n, c]) => (
                      <tr key={n}><td style={td}>{n}</td><td style={tdNum}>{c}</td><td style={tdNum}>{pct(c)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card style={{ flex: '1 1 280px' }}>
              <CardHead left="性別分布" />
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={th}>性別</th><th style={thNum}>人數</th><th style={thNum}>占比</th></tr></thead>
                <tbody>
                  {genderSorted.map(([g, c]) => (
                    <tr key={g}><td style={td}>{g}</td><td style={tdNum}>{c}</td><td style={tdNum}>{pct(c)}</td></tr>
                  ))}
                </tbody>
              </table>
              <CardHead left="志願序分布" right="全部志願列" />
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={th}>志願序</th><th style={thNum}>志願數</th></tr></thead>
                <tbody>
                  {prefSorted.map(([p, c]) => (
                    <tr key={p}>
                      <td style={td}>{Number.isNaN(Number(p)) ? p : `第 ${p} 志願`}</td>
                      <td style={tdNum}>{c}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>

          <div style={{ fontSize: 12, color: '#aaa', textAlign: 'center', marginTop: 8 }}>
            完整報名明細（含護照、聯絡方式等個資）請使用右上角「下載完整統計報表」匯出，內含總覽／各系統計／國籍分布／報名明細四個分頁。
          </div>
        </>
      )}
    </PageShell>
  )
}

function FragmentRows({ camp, list, sub, quotas }) {
  return (
    <>
      <tr>
        <td colSpan={7} style={{ padding: '8px 10px', fontSize: 12, fontWeight: 700, color: ACCENT, background: '#f0fdfa', borderBottom: '1px solid #e8e7e3' }}>
          {camp}
        </td>
      </tr>
      {list.map((d) => {
        const quota = quotas[d.dept]
        const ratio = quota ? (d.p1 / quota).toFixed(1) : '—'
        return (
          <tr key={d.dept}>
            <td style={td}>{d.dept}</td>
            <td style={tdNum}><strong>{d.p1}</strong></td>
            <td style={tdNum}>{d.p2}</td>
            <td style={tdNum}>{d.p3}</td>
            <td style={tdNum}>{d.total}</td>
            <td style={tdNum}>{quota ?? '—'}</td>
            <td style={tdNum}>{ratio}</td>
          </tr>
        )
      })}
      <tr>
        <td style={{ ...td, fontWeight: 700, color: '#666' }}>{camp} 小計</td>
        <td style={{ ...tdNum, fontWeight: 700 }}>{sub.p1}</td>
        <td style={{ ...tdNum, fontWeight: 700 }}>{sub.p2}</td>
        <td style={{ ...tdNum, fontWeight: 700 }}>{sub.p3}</td>
        <td style={{ ...tdNum, fontWeight: 700 }}>{sub.total}</td>
        <td style={tdNum}>—</td>
        <td style={tdNum}>—</td>
      </tr>
    </>
  )
}
