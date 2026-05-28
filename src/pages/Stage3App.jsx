import { useState, useEffect, useCallback, useMemo } from 'react'
import { PageShell } from '../components/PageShell'
import { Btn, Card, CardHead, Pill, s } from '../components/UI'
import { writeXlsx } from '../components/ExportBtn'
import { getStage3Data, getFinalAdmissions, upsertFinalAdmission } from '../api'
import { DECISIONS } from '../constants'
import { getTeacher, logoutTeacher } from '../auth'

// 最終錄取狀態（對應 final_admissions.final_status 的 CHECK）
const FINAL_STATUSES = [
  { v: 'admitted',   label: '正取',   color: '#16a34a', bg: '#dcfce7' },
  { v: 'waitlisted', label: '備取',   color: '#d97706', bg: '#fef3c7' },
  { v: 'rejected',   label: '不錄取', color: '#dc2626', bg: '#fee2e2' },
  { v: 'pending',    label: '待定',   color: '#6b7280', bg: '#f3f4f6' },
]
const statusInfo = (v) => FINAL_STATUSES.find((x) => x.v === v) || FINAL_STATUSES[3]
const recInfo    = (v) => DECISIONS.find((x) => x.v === v) || DECISIONS[3]

// 從一筆 evaluation 取出帳號 / 系所（以評分自身的 department 為準，缺則用 application 的）
const acctOf = (e) => e.applications?.account ?? null
const deptOf = (e) => e.department || e.applications?.department || ''
const keyOf  = (e) => `${acctOf(e)}__${deptOf(e)}`

const EXPORT_COLS = [
  { key: 'account',      label: '帳號' },
  { key: 'name',         label: '中文姓名' },
  { key: 'name_english', label: '英文姓名' },
  { key: 'department',   label: '科系' },
  { key: 'center',       label: '面試中心' },
  { key: 'status_label', label: '最終狀態' },
]

// 依中心匯出用的欄位（中心放第一欄）
const CENTER_EXPORT_COLS = [
  { key: 'center',       label: '面試中心' },
  { key: 'department',   label: '科系' },
  { key: 'account',      label: '帳號' },
  { key: 'name',         label: '中文姓名' },
  { key: 'name_english', label: '英文姓名' },
  { key: 'status_label', label: '最終狀態' },
]

export default function Stage3App() {
  const teacher = getTeacher()
  const [evals, setEvals]       = useState([])
  const [finals, setFinals]     = useState(() => new Map())   // key(account__dept) → final row
  const [dept, setDept]         = useState('')
  const [loading, setLoading]   = useState(false)
  const [savingKey, setSavingKey] = useState(null)
  const [toast, setToast]       = useState(null)

  // 守衛：只有 admin 能進
  useEffect(() => { if (!teacher || teacher.role !== 'admin') window.location.hash = '#/login?stage=admin' }, [teacher])

  const showToast = useCallback((msg, type = 'ok') => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3500)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [ev, fa] = await Promise.all([getStage3Data(), getFinalAdmissions()])
      setEvals(ev || [])
      setFinals(new Map((fa || []).map((r) => [`${r.account}__${r.department}`, r])))
    } catch (e) {
      showToast('載入失敗：' + e.message, 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => { load() }, [load])

  const deptList = useMemo(
    () => [...new Set(evals.map(deptOf).filter(Boolean))].sort(),
    [evals],
  )

  // 預設選第一個科系
  useEffect(() => {
    if (deptList.length && !deptList.includes(dept)) setDept(deptList[0])
  }, [deptList, dept])

  const statusOf = (e) => finals.get(keyOf(e))?.final_status || 'pending'

  // 衝突偵測：同帳號在多個系所都被建議錄取（recommendation = admit）
  const conflicts = useMemo(() => {
    const byAcct = new Map()
    for (const e of evals) {
      if (e.recommendation !== 'admit') continue
      const a = acctOf(e); if (!a) continue
      if (!byAcct.has(a)) byAcct.set(a, { name: e.applications?.name, depts: new Set() })
      byAcct.get(a).depts.add(deptOf(e))
    }
    return [...byAcct.entries()]
      .filter(([, v]) => v.depts.size >= 2)
      .map(([account, v]) => ({ account, name: v.name, depts: [...v.depts] }))
  }, [evals])

  // 衝突帳號集合：表格內這些學生的名字旁標註「第 N 志願」
  const conflictAccts = useMemo(() => new Set(conflicts.map((c) => c.account)), [conflicts])

  // 各系正/備取總覽
  const summary = useMemo(() => deptList.map((d) => {
    const inDept = evals.filter((e) => deptOf(e) === d)
    return {
      dept: d,
      total: inDept.length,
      admitted:   inDept.filter((e) => statusOf(e) === 'admitted').length,
      waitlisted: inDept.filter((e) => statusOf(e) === 'waitlisted').length,
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [deptList, evals, finals])

  const rows = evals.filter((e) => deptOf(e) === dept)

  const setStatus = async (e, final_status) => {
    const account = acctOf(e), department = deptOf(e)
    if (!account) { showToast('此筆缺少帳號，無法設定', 'warn'); return }
    const key = keyOf(e)
    setSavingKey(key)
    try {
      const row = {
        account, department, final_status,
        stage2_score: e.total_score ?? null,
        stage2_recommendation: e.recommendation ?? null,
        confirmed_at: new Date().toISOString(),
      }
      const res = await upsertFinalAdmission(row)
      const saved = (Array.isArray(res) ? res[0] : res) || row
      setFinals((prev) => { const m = new Map(prev); m.set(key, saved); return m })
      showToast(`已設定 ${e.applications?.name || account}（${department}）為「${statusInfo(final_status).label}」`)
    } catch (err) {
      showToast('設定失敗：' + err.message, 'error')
    } finally {
      setSavingKey(null)
    }
  }

  const exportAdmitted = () => {
    const out = []
    for (const e of evals) {
      if (statusOf(e) !== 'admitted') continue
      out.push({
        account:      acctOf(e) ?? '',
        name:         e.applications?.name ?? '',
        name_english: e.applications?.name_english ?? '',
        department:   deptOf(e),
        center:       e.applications?.center ?? '',
        status_label: '正取',
      })
    }
    if (!out.length) { showToast('目前沒有正取的學生', 'warn'); return }
    writeXlsx(EXPORT_COLS, out, '第三階段正取名單.xlsx')
    showToast(`已匯出 ${out.length} 筆正取名單`)
  }

  const exportWaitlisted = () => {
    const out = []
    for (const e of evals) {
      if (statusOf(e) !== 'waitlisted') continue
      out.push({
        account:      acctOf(e) ?? '',
        name:         e.applications?.name ?? '',
        name_english: e.applications?.name_english ?? '',
        department:   deptOf(e),
        center:       e.applications?.center ?? '',
        status_label: '備取',
      })
    }
    if (!out.length) { showToast('目前沒有備取的學生', 'warn'); return }
    writeXlsx(EXPORT_COLS, out, '第三階段備取名單.xlsx')
    showToast(`已匯出 ${out.length} 筆備取名單`)
  }

  // 依中心匯出（正取 + 備取），同中心歸為一組、組間以空行隔開
  const exportByCenter = () => {
    const labelOf = { admitted: '正取', waitlisted: '備取' }
    const groups = new Map()   // center → rows
    for (const e of evals) {
      const st = statusOf(e)
      if (st !== 'admitted' && st !== 'waitlisted') continue
      const center = e.applications?.center || '未指定'
      if (!groups.has(center)) groups.set(center, [])
      groups.get(center).push({
        center,
        department:   deptOf(e),
        account:      acctOf(e) ?? '',
        name:         e.applications?.name ?? '',
        name_english: e.applications?.name_english ?? '',
        status_label: labelOf[st],
      })
    }
    if (!groups.size) { showToast('目前沒有正取或備取的學生', 'warn'); return }
    const centers = [...groups.keys()].sort()
    const out = []
    centers.forEach((c, i) => {
      if (i > 0) out.push({})   // 中心之間空一行
      out.push(...groups.get(c))
    })
    writeXlsx(CENTER_EXPORT_COLS, out, '第三階段錄取名單_依中心.xlsx')
    showToast(`已匯出依中心名單（${centers.length} 個中心）`)
  }

  const th = { padding: '9px 10px', textAlign: 'left', borderBottom: '1px solid #e8e7e3', color: '#666', fontWeight: 500, fontSize: 12 }
  const td = { padding: '8px 10px', borderBottom: '1px solid #f5f4f0', fontSize: 13 }

  if (!teacher || teacher.role !== 'admin') return null

  return (
    <PageShell
      title="實踐大學" subtitle="第三階段 · 最終錄取" accent="#581c87" toast={toast}
      right={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {loading && <span style={{ fontSize: 12, color: '#e9d5ff' }}>載入中…</span>}
          <Btn style={{ background: 'none', borderColor: '#ffffff44', color: '#f3e8ff' }} onClick={() => { window.location.hash = '#/admin' }}>← 行政後台</Btn>
          <Btn style={{ background: 'none', borderColor: '#ffffff44', color: '#f3e8ff' }} onClick={exportAdmitted}>⬇ 匯出正取名單</Btn>
          <Btn style={{ background: 'none', borderColor: '#ffffff44', color: '#f3e8ff' }} onClick={exportWaitlisted}>⬇ 匯出備取名單</Btn>
          <Btn style={{ background: 'none', borderColor: '#ffffff44', color: '#f3e8ff' }} onClick={exportByCenter}>⬇ 匯出依中心名單</Btn>
          <Btn style={{ background: 'none', borderColor: '#ffffff44', color: '#f3e8ff' }} onClick={load}>↻</Btn>
          <span style={{ fontSize: 12, color: '#e9d5ff' }}>{teacher.display_name || teacher.username}</span>
          <Btn style={{ background: 'none', borderColor: '#ffffff44', color: '#f3e8ff' }} onClick={logoutTeacher}>登出</Btn>
        </div>
      }
    >
      {/* 衝突警示 */}
      {conflicts.length > 0 && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#b91c1c', marginBottom: 8 }}>
            ⚠ 跨系重複建議錄取（{conflicts.length} 人）
          </div>
          {conflicts.map((c) => (
            <div key={c.account} style={{ fontSize: 13, color: '#7f1d1d', padding: '3px 0' }}>
              帳號 <b>{c.account}</b>（{c.name || '—'}）同時在以下科系被建議錄取：{c.depts.join('、')}
            </div>
          ))}
        </div>
      )}

      {/* 各系總覽 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {summary.map((su) => (
          <button key={su.dept} onClick={() => setDept(su.dept)}
            style={{
              ...s.card, padding: '10px 14px', minWidth: 150, textAlign: 'left', cursor: 'pointer',
              border: dept === su.dept ? '2px solid #7e22ce' : '1px solid #e8e7e3', fontFamily: 'inherit',
            }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{su.dept}</div>
            <div style={{ fontSize: 12, color: '#666' }}>
              <span style={{ color: '#16a34a' }}>正 {su.admitted}</span> ·{' '}
              <span style={{ color: '#d97706' }}>備 {su.waitlisted}</span> ·{' '}
              <span style={{ color: '#aaa' }}>共 {su.total}</span>
            </div>
          </button>
        ))}
        {!summary.length && (
          <div style={{ fontSize: 13, color: '#aaa' }}>{loading ? '載入中…' : '尚無第二階段評分資料'}</div>
        )}
      </div>

      <Card>
        <CardHead left={dept ? `${dept} · 通過兩階段名單` : '請選擇科系'} right={`${rows.length} 位`} />
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#faf9f6' }}>
                {['中文姓名', '帳號', '一階', '二階分數', '老師建議', '最終狀態', '設定'].map((h) => <th key={h} style={th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => {
                const cur = statusOf(e)
                const ri = recInfo(e.recommendation)
                const passed = !!e.applications?.stage1_passed_date
                return (
                  <tr key={e.id}>
                    <td style={{ ...td, fontWeight: 500 }}>
                      {e.applications?.name || '—'}
                      {conflictAccts.has(acctOf(e)) && e.applications?.preference_order != null && (
                        <span style={{ ...s.pill, marginLeft: 6, background: '#fef3c7', color: '#b45309' }}>
                          第 {e.applications.preference_order} 志願
                        </span>
                      )}
                    </td>
                    <td style={{ ...td, color: '#888' }}>{acctOf(e) || '—'}</td>
                    <td style={td}>{passed ? <span style={{ color: '#15803d' }}>通過</span> : '—'}</td>
                    <td style={td}>{e.total_score ?? '—'}</td>
                    <td style={td}><Pill color={ri.color} bg={ri.bg}>{ri.label}</Pill></td>
                    <td style={td}><Pill color={statusInfo(cur).color} bg={statusInfo(cur).bg}>{statusInfo(cur).label}</Pill></td>
                    <td style={td}>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {FINAL_STATUSES.map((st) => (
                          <button key={st.v} onClick={() => setStatus(e, st.v)}
                            disabled={savingKey === keyOf(e)}
                            style={{
                              ...s.btn, ...s.btnSm,
                              background: cur === st.v ? st.bg : 'white',
                              borderColor: cur === st.v ? st.color : '#ddd',
                              color: cur === st.v ? st.color : '#777',
                              fontWeight: cur === st.v ? 600 : 400,
                            }}>
                            {st.label}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {!rows.length && (
                <tr><td colSpan={7} style={{ ...td, textAlign: 'center', color: '#aaa', padding: 32 }}>
                  {loading ? '載入中…' : '此科系尚無第二階段評分'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div style={{ fontSize: 12, color: '#aaa', marginTop: 12, lineHeight: 1.6 }}>
        說明：一階為簽到通過制（無分數）；二階分數與老師建議來自各系評分。設定最終狀態後即時寫入；
        上方警示區會列出同一帳號在多個科系都被建議錄取者，請擇一正取。
      </div>
    </PageShell>
  )
}
