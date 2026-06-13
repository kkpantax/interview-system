import { useState, useEffect, useMemo } from 'react'
import * as XLSX from 'xlsx'
import {
  ResponsiveContainer, BarChart, Bar, Cell, XAxis, YAxis, LabelList, ReferenceLine,
  PieChart, Pie, LineChart, Line, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import { PageShell } from '../components/PageShell'
import { Card, CardHead, Btn, s } from '../components/UI'
import {
  getAllApplications, getDepartmentQuotas, getDepartmentCampuses,
  getYearlyStats, getDashboardData,
} from '../api'
import { CAMPUS_OPTIONS, deptShort } from '../constants'
import { buildDashboard, AGE_BUCKETS } from '../statsCompute'
import { getTeacher } from '../auth'

const ACCENT = '#0f766e'
const C = {
  teal: '#0f766e', blue: '#1e40af', green: '#15803d', purple: '#7e22ce',
  orange: '#c2410c', red: '#dc2626', amber: '#d97706', slate: '#64748b',
  track: '#eceae4',
}
// 國籍配色（循環）
const NAT_COLORS = ['#0f766e', '#1e40af', '#c2410c', '#7e22ce', '#15803d', '#d97706', '#0891b2', '#be123c', '#64748b']
const FILTERS = ['全部', ...CAMPUS_OPTIONS]
const rateColor = (r) => (r >= 85 ? C.green : r >= 60 ? C.amber : C.red)
const fmtPct = (n, d) => (d > 0 ? Math.round((n / d) * 100) + '%' : '—')

// ── 小元件 ──────────────────────────────────────────────────────────────────
function Kpi({ label, value, sub, color = '#1a1a18' }) {
  return (
    <div style={{ flex: '1 1 150px', minWidth: 150, background: 'white', border: '1px solid #e8e7e3', borderRadius: 12, padding: '16px 18px' }}>
      <div style={{ fontSize: 12, color: '#999', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#aaa', marginTop: 7 }}>{sub}</div>}
    </div>
  )
}

function ChartTip({ active, payload, label, render }) {
  if (!active || !payload || !payload.length) return null
  return (
    <div style={{ background: 'white', border: '1px solid #e8e7e3', borderRadius: 8, padding: '8px 12px', fontSize: 12, boxShadow: '0 4px 14px -8px rgba(0,0,0,.3)' }}>
      {render ? render(payload, label) : (
        <>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>{label}</div>
          {payload.map((p) => (
            <div key={p.dataKey} style={{ color: p.color }}>{p.name}：<b>{p.value}</b></div>
          ))}
        </>
      )}
    </div>
  )
}

const th = { textAlign: 'left', padding: '8px 10px', fontSize: 12, color: '#888', fontWeight: 600, borderBottom: '1px solid #e8e7e3', whiteSpace: 'nowrap' }
const td = { padding: '8px 10px', fontSize: 13, borderBottom: '1px solid #f4f3ef', whiteSpace: 'nowrap' }
const tdNum = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }
const thNum = { ...th, textAlign: 'right' }

export default function StatsApp() {
  const [raw, setRaw] = useState(null)         // getDashboardData 原始資料
  const [apps, setApps] = useState([])         // 完整 applications（匯出明細用）
  const [quotas, setQuotas] = useState({})
  const [campusMap, setCampusMap] = useState({})
  const [yearly, setYearly] = useState([])
  const [campus, setCampus] = useState('全部')
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const teacher = getTeacher()
  useEffect(() => {
    if (!teacher || teacher.role !== 'superadmin') window.location.hash = '#/login?stage=stats'
  }, [teacher])

  useEffect(() => {
    (async () => {
      try {
        const [d, a, q, c, y] = await Promise.all([
          getDashboardData(),
          getAllApplications().catch(() => []),
          getDepartmentQuotas().catch(() => ({})),
          getDepartmentCampuses().catch(() => ({})),
          getYearlyStats().catch(() => []),
        ])
        setRaw(d); setApps(a || []); setQuotas(q || {}); setCampusMap(c || {}); setYearly(y || [])
      } catch (e) {
        setErr(e?.message || '載入失敗')
      } finally { setLoading(false) }
    })()
  }, [])

  // 依篩選後的儀表板（漏斗 / 各系 / demographic），以及一份「全部」供歷年趨勢的今年點
  const dash = useMemo(() => (raw ? buildDashboard(raw, campusMap, campus) : null), [raw, campusMap, campus])
  const dashAll = useMemo(() => (raw ? buildDashboard(raw, campusMap, '全部') : null), [raw, campusMap])

  const thisYear = new Date().getFullYear()

  // ── 漏斗資料 ──
  const funnelData = useMemo(() => {
    if (!dash) return []
    const f = dash.funnel
    const steps = [
      { name: '報名', value: f.applicants, fill: C.teal },
      { name: '一階報到', value: f.stage1, fill: C.blue },
      { name: '二階報到', value: f.stage2, fill: C.green },
      { name: '正取錄取', value: f.admitted, fill: C.purple, extra: `備取 ${f.waitlisted}` },
      { name: '確定就讀', value: f.enrolled, fill: C.orange },
    ]
    return steps.map((st, i) => ({ ...st, conv: i > 0 && steps[i - 1].value > 0 ? Math.round(st.value / steps[i - 1].value * 100) : null }))
  }, [dash])

  // ── 各系名額達成 ──
  const deptData = useMemo(() => {
    if (!dash) return []
    return [...dash.deptRows]
      .map((d) => {
        const quota = quotas[d.dept] || 0
        const rate = quota > 0 ? Math.round((d.enrolled / quota) * 100) : null
        return { ...d, short: deptShort(d.dept), quota, rate }
      })
      .sort((a, b) => {
        const ci = CAMPUS_OPTIONS.indexOf(a.campus) - CAMPUS_OPTIONS.indexOf(b.campus)
        if (ci !== 0) return ci
        return (b.rate ?? -1) - (a.rate ?? -1)
      })
  }, [dash, quotas])

  const totalQuota = useMemo(() => deptData.reduce((s2, d) => s2 + (d.quota || 0), 0), [deptData])

  // ── 國籍（前 8 + 其他）──
  const natData = useMemo(() => {
    if (!dash) return []
    const sorted = Object.entries(dash.natStats).sort((a, b) => b[1] - a[1])
    const top = sorted.slice(0, 8)
    const restSum = sorted.slice(8).reduce((s2, [, v]) => s2 + v, 0)
    const arr = top.map(([name, value], i) => ({ name, value, fill: NAT_COLORS[i % NAT_COLORS.length] }))
    if (restSum) arr.push({ name: '其他', value: restSum, fill: '#cbd5e1' })
    return arr
  }, [dash])

  const genderData = useMemo(() => (dash ? Object.entries(dash.genderStats).map(([name, value]) => ({ name, value })) : []), [dash])
  const ageData = useMemo(() => (dash ? AGE_BUCKETS.map((b) => ({ name: b, value: dash.ageStats[b] || 0 })) : []), [dash])

  // ── 歷年趨勢（機構層級，不受校區篩選影響）──
  const trendData = useMemo(() => {
    const rows = [...yearly].sort((a, b) => a.year - b.year).map((y) => ({
      year: String(y.year), 報名: y.applicants, 正取: y.admitted, 就讀: y.enrolled,
    }))
    if (dashAll) rows.push({ year: `${thisYear}*`, 報名: dashAll.funnel.applicants, 正取: dashAll.funnel.admitted, 就讀: dashAll.funnel.enrolled })
    return rows
  }, [yearly, dashAll, thisYear])

  const f = dash?.funnel
  const enrollRate = f ? fmtPct(f.enrolled, f.admitted) : '—'
  const quotaRate = f ? fmtPct(f.enrolled, totalQuota) : '—'

  // ── 匯出（完整、機構層級）──────────────────────────────────────────────────
  const downloadReport = () => {
    if (!dashAll) return
    const wb = XLSX.utils.book_new()
    const af = dashAll.funnel
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['項目', '數值'],
      ['報名人數', af.applicants], ['一階報到', af.stage1], ['二階報到', af.stage2],
      ['正取', af.admitted], ['備取', af.waitlisted], ['確定就讀', af.enrolled],
      ['報到率（就讀/正取）', fmtPct(af.enrolled, af.admitted)],
      ['匯出時間', new Date().toLocaleString('zh-TW')],
    ]), '招生漏斗')

    const dAoa = [['校區', '系所', '第一志願', '總志願', '正取', '備取', '確定就讀', '名額', '達成率']]
    for (const d of [...dashAll.deptRows].sort((a, b) => CAMPUS_OPTIONS.indexOf(a.campus) - CAMPUS_OPTIONS.indexOf(b.campus))) {
      const quota = quotas[d.dept] || 0
      dAoa.push([d.campus, d.dept, d.p1, d.total, d.admitted, d.waitlisted, d.enrolled, quota || '', quota ? Math.round(d.enrolled / quota * 100) + '%' : ''])
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dAoa), '各系產出')

    const natAoa = [['國籍', '人數', '占比']]
    for (const [n, c] of Object.entries(dashAll.natStats).sort((a, b) => b[1] - a[1])) {
      natAoa.push([n, c, fmtPct(c, dashAll.totalPeople)])
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(natAoa), '國籍分布')

    const ageAoa = [['年齡層', '人數']]
    for (const b of AGE_BUCKETS) ageAoa.push([b, dashAll.ageStats[b] || 0])
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ageAoa), '年齡分布')

    const yAoa = [['年份', '報名', '正取', '就讀']]
    for (const r of trendData) yAoa.push([r.year, r.報名, r.正取, r.就讀])
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(yAoa), '歷年趨勢')

    const cols = [['account', '帳號'], ['name', '中文姓名'], ['name_english', '英文姓名'], ['department', '系所'], ['preference_order', '志願序'], ['nationality', '國籍'], ['gender', '性別'], ['birth_date', '生日'], ['passport_number', '護照號碼'], ['phone', '行動電話'], ['email', 'Email'], ['high_school', '畢業學校'], ['graduation_year', '畢業年'], ['status', '狀態']]
    const detail = [cols.map((c) => c[1])]
    for (const r of apps) detail.push(cols.map((c) => r[c[0]] ?? ''))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(detail), '報名明細')

    XLSX.writeFile(wb, `招生統計報表_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  return (
    <PageShell
      title="招生統計儀表板"
      subtitle={loading ? '載入中…' : `${dash?.funnel.applicants ?? 0} 人報名・${dash?.funnel.enrolled ?? 0} 人就讀`}
      accent={ACCENT}
      intlBack
      stageKey="stats"
      right={<Btn variant="primary" onClick={downloadReport} disabled={loading || !raw}>⬇ 下載完整統計報表</Btn>}
    >
      {err && (
        <Card style={{ marginBottom: 16, borderColor: '#fca5a5', background: '#fef2f2' }}>
          <div style={{ padding: 16, color: '#991b1b', fontSize: 13 }}>載入失敗：{err}</div>
        </Card>
      )}

      {loading || !dash ? (
        <div style={{ color: '#999', fontSize: 14, padding: 40, textAlign: 'center' }}>載入統計資料中…</div>
      ) : (
        <>
          {/* 校區篩選 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: '#888', marginRight: 2 }}>校區：</span>
            {FILTERS.map((cf) => (
              <button
                key={cf}
                onClick={() => setCampus(cf)}
                style={{
                  ...s.btn, ...s.btnSm,
                  ...(campus === cf ? { background: ACCENT, color: 'white', borderColor: ACCENT } : {}),
                }}
              >{cf}</button>
            ))}
            <span style={{ fontSize: 11, color: '#bbb', marginLeft: 'auto' }}>漏斗與人口統計依「第一志願校區」歸屬；各系產出依系所校區</span>
          </div>

          {/* KPI */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
            <Kpi label="報名人數" value={f.applicants} sub="不重複帳號" color={C.teal} />
            <Kpi label="確定就讀（報到）" value={f.enrolled} sub={`正取 ${f.admitted}・備取 ${f.waitlisted}`} color={C.orange} />
            <Kpi label="報到率" value={enrollRate} sub="就讀 ÷ 正取" color={C.green} />
            <Kpi label="名額達成率" value={quotaRate} sub={`就讀 ${f.enrolled} ÷ 名額 ${totalQuota || '—'}`} color={C.amber} />
          </div>

          {/* 漏斗 */}
          <Card style={{ marginBottom: 20 }}>
            <CardHead left="招生漏斗" right="各階段不重複人數，% 為相對上一階轉換率" />
            <div style={{ padding: '14px 18px' }}>
              <div style={{ width: '100%', height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart layout="vertical" data={funnelData} margin={{ left: 8, right: 48, top: 4, bottom: 4 }}>
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="name" width={72} tick={{ fontSize: 12, fill: '#555' }} axisLine={false} tickLine={false} />
                    <Tooltip cursor={{ fill: '#f7f6f3' }} content={<ChartTip render={(p) => {
                      const d = p[0].payload
                      return (<>
                        <div style={{ fontWeight: 700, marginBottom: 2 }}>{d.name}</div>
                        <div>人數：<b>{d.value}</b></div>
                        {d.conv != null && <div style={{ color: C.teal }}>轉換率：{d.conv}%</div>}
                        {d.extra && <div style={{ color: C.purple }}>{d.extra}</div>}
                      </>)
                    }} />} />
                    <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={26} isAnimationActive={false}>
                      {funnelData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                      <LabelList dataKey="value" position="right" style={{ fontSize: 13, fontWeight: 700, fill: '#333' }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                {funnelData.filter((d) => d.conv != null).map((d) => (
                  <span key={d.name} style={{ fontSize: 11, color: '#888', background: '#faf9f6', borderRadius: 6, padding: '3px 8px' }}>
                    → {d.name} <b style={{ color: C.teal }}>{d.conv}%</b>
                  </span>
                ))}
              </div>
            </div>
          </Card>

          {/* 各系名額達成率 */}
          <Card style={{ marginBottom: 20 }}>
            <CardHead left="各系名額達成率" right="確定就讀 ÷ 名額；綠≥85% 黃60–84% 紅<60%" />
            <div style={{ padding: '14px 18px' }}>
              {deptData.length ? (
                <div style={{ width: '100%', height: Math.max(180, deptData.length * 40 + 40) }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart layout="vertical" data={deptData} margin={{ left: 8, right: 64, top: 4, bottom: 4 }}>
                      <XAxis type="number" domain={[0, 120]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v) => v + '%'} tick={{ fontSize: 11, fill: '#999' }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="short" width={56} tick={{ fontSize: 12, fill: '#555' }} axisLine={false} tickLine={false} />
                      <ReferenceLine x={100} stroke="#bbb" strokeDasharray="3 3" />
                      <Tooltip cursor={{ fill: '#f7f6f3' }} content={<ChartTip render={(p) => {
                        const d = p[0].payload
                        return (<>
                          <div style={{ fontWeight: 700, marginBottom: 2 }}>{d.dept}</div>
                          <div>名額：<b>{d.quota || '未設'}</b>　達成率：<b style={{ color: rateColor(d.rate ?? 0) }}>{d.rate != null ? d.rate + '%' : '—'}</b></div>
                          <div style={{ color: '#666' }}>正取 {d.admitted}・備取 {d.waitlisted}・就讀 {d.enrolled}</div>
                          <div style={{ color: '#999' }}>第一志願 {d.p1}・總志願 {d.total}</div>
                        </>)
                      }} />} />
                      <Bar dataKey="rate" radius={[0, 6, 6, 0]} barSize={22} isAnimationActive={false}>
                        {deptData.map((d, i) => <Cell key={i} fill={d.rate == null ? '#cbd5e1' : rateColor(d.rate)} />)}
                        <LabelList dataKey="rate" position="right" content={(props) => {
                          const { x = 0, y = 0, width = 0, height = 22, index } = props
                          const d = deptData[index]
                          if (!d) return null
                          const label = d.rate != null ? `${d.rate}%（${d.enrolled}/${d.quota}）` : '未設名額'
                          return <text x={x + width + 6} y={y + height / 2} dy={4} fontSize={11} fontWeight={700} fill={d.rate != null ? rateColor(d.rate) : '#999'}>{label}</text>
                        }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : <div style={{ color: '#aaa', fontSize: 13, padding: 20, textAlign: 'center' }}>此校區尚無產出資料</div>}
            </div>
          </Card>

          {/* 國籍 + 性別/年齡 */}
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 20 }}>
            <Card style={{ flex: '1 1 340px', minWidth: 300 }}>
              <CardHead left="報名國籍分布" right={`${Object.keys(dash.natStats).length} 國・${dash.totalPeople} 人`} />
              <div style={{ padding: '14px 18px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ width: 180, height: 180 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={natData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={48} outerRadius={80} paddingAngle={1} isAnimationActive={false}>
                        {natData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                      </Pie>
                      <Tooltip content={<ChartTip render={(p) => <div><b>{p[0].name}</b>：{p[0].value} 人（{fmtPct(p[0].value, dash.totalPeople)}）</div>} />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ flex: 1, minWidth: 140 }}>
                  {natData.map((d) => (
                    <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '2px 0' }}>
                      <span style={{ width: 10, height: 10, borderRadius: 2, background: d.fill, flex: '0 0 auto' }} />
                      <span style={{ flex: 1 }}>{d.name}</span>
                      <b>{d.value}</b>
                      <span style={{ color: '#aaa', width: 38, textAlign: 'right' }}>{fmtPct(d.value, dash.totalPeople)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            <Card style={{ flex: '1 1 300px', minWidth: 280 }}>
              <CardHead left="性別與年齡" right="≥23 歲為偏大族群" />
              <div style={{ padding: '14px 18px' }}>
                <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>性別</div>
                <div style={{ display: 'flex', gap: 16, marginBottom: 14 }}>
                  {genderData.map((g) => (
                    <div key={g.name} style={{ flex: 1, background: '#faf9f6', borderRadius: 8, padding: '8px 10px' }}>
                      <div style={{ fontSize: 12, color: '#999' }}>{g.name}</div>
                      <div style={{ fontSize: 20, fontWeight: 700 }}>{g.value}<span style={{ fontSize: 11, color: '#bbb', marginLeft: 4 }}>{fmtPct(g.value, dash.totalPeople)}</span></div>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>年齡分布</div>
                <div style={{ width: '100%', height: 150 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={ageData} margin={{ left: -20, right: 8, top: 4, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0efeb" />
                      <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#888' }} axisLine={false} tickLine={false} interval={0} />
                      <YAxis tick={{ fontSize: 10, fill: '#aaa' }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip cursor={{ fill: '#f7f6f3' }} content={<ChartTip />} />
                      <Bar dataKey="value" name="人數" radius={[4, 4, 0, 0]} barSize={34} isAnimationActive={false}>
                        {ageData.map((d, i) => <Cell key={i} fill={d.name === '23 歲以上' ? C.red : C.teal} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </Card>
          </div>

          {/* 歷年趨勢 */}
          {trendData.length > 1 && (
            <Card style={{ marginBottom: 20 }}>
              <CardHead left="歷年招生趨勢" right={`${thisYear}* 為今年進行中（全校）`} />
              <div style={{ padding: '14px 18px', width: '100%', height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData} margin={{ left: -16, right: 12, top: 6, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0efeb" />
                    <XAxis dataKey="year" tick={{ fontSize: 12, fill: '#888' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#aaa' }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip content={<ChartTip />} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="報名" stroke={C.teal} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
                    <Line type="monotone" dataKey="正取" stroke={C.purple} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
                    <Line type="monotone" dataKey="就讀" stroke={C.orange} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}

          {/* 各系明細表 */}
          <Card style={{ marginBottom: 20 }}>
            <CardHead left="各系明細" right="報名熱度與最終產出" />
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>系所</th><th style={thNum}>第一志願</th><th style={thNum}>總志願</th>
                    <th style={thNum}>正取</th><th style={thNum}>備取</th><th style={thNum}>就讀</th>
                    <th style={thNum}>名額</th><th style={thNum}>達成率</th>
                  </tr>
                </thead>
                <tbody>
                  {deptData.map((d) => (
                    <tr key={d.dept}>
                      <td style={td}>{d.dept}</td>
                      <td style={tdNum}><strong>{d.p1}</strong></td>
                      <td style={tdNum}>{d.total}</td>
                      <td style={tdNum}>{d.admitted}</td>
                      <td style={tdNum}>{d.waitlisted}</td>
                      <td style={tdNum}>{d.enrolled}</td>
                      <td style={tdNum}>{d.quota || '—'}</td>
                      <td style={{ ...tdNum, fontWeight: 700, color: d.rate == null ? '#999' : rateColor(d.rate) }}>{d.rate != null ? d.rate + '%' : '—'}</td>
                    </tr>
                  ))}
                  {!deptData.length && <tr><td colSpan={8} style={{ ...td, textAlign: 'center', color: '#aaa', padding: 20 }}>無資料</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>

          <div style={{ fontSize: 12, color: '#aaa', textAlign: 'center', marginTop: 8 }}>
            含護照、聯絡方式等個資的完整名單請用右上角「下載完整統計報表」匯出（招生漏斗／各系產出／國籍／年齡／歷年／報名明細六分頁，為全校資料）。
          </div>
        </>
      )}
    </PageShell>
  )
}
