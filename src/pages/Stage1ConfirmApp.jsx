import { useState, useEffect, useCallback } from 'react'
import { PageShell } from '../components/PageShell'
import { Btn, Card, Pill, s } from '../components/UI'
import ExportBtn from '../components/ExportBtn'
import Stage1EvalDetailModal from '../components/Stage1EvalDetailModal'
import { getStage1List, getStage1Pending, getStage1Records, setStage1ConfirmByAccount } from '../api'
import { getTeacher, logoutTeacher } from '../auth'
import { DECISIONS_STAGE1 } from '../constants'

const ACCENT = '#0f766e'

const localToday = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const recLabel = (v) => DECISIONS_STAGE1.find((d) => d.v === v)?.label || ''
const isScored = (r) => !!r && !!r.scores && Object.keys(r.scores).length > 0

// 確認結果（由 applications 推導）：通過 / 不通過 / 待確認
const confirmStateOf = (stu) =>
  stu.stage1_passed_date ? 'pass' : stu.status === 'rejected' ? 'reject' : 'pending'

const EXPORT_COLS_BEFORE = [
  { key: 'account',      label: '帳號' },
  { key: 'name',         label: '中文姓名' },
  { key: 'name_english', label: '英文姓名' },
]
const EXPORT_COLS_AFTER = [
  { key: 'nationality',  label: '國籍' },
  { key: 'center',       label: '中心' },
  { key: 'appeared',     label: '出席' },
  { key: 'teacher_recs', label: '老師建議' },
  { key: 'confirm',      label: '確認結果' },
]

export default function Stage1ConfirmApp() {
  const teacher = getTeacher()
  const [date, setDate]       = useState(localToday)
  const [showAll, setShowAll] = useState(false)
  const [students, setStudents] = useState([])
  const [records, setRecords] = useState({})    // { [account]: stage1_record[] }
  const [loading, setLoading] = useState(false)
  const [busyKey, setBusyKey] = useState(null)
  const [viewing, setViewing] = useState(null)   // { stu, recs }
  const [search, setSearch]   = useState('')
  const [toast, setToast]     = useState(null)

  // 守衛：只有 admin 能進
  useEffect(() => {
    if (!teacher || (teacher.role !== 'admin' && teacher.role !== 'superadmin')) {
      window.location.hash = '#/login?stage=confirm1'
    }
  }, [teacher])

  const showToast = useCallback((msg, type = 'ok') => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3500)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const list = (showAll ? await getStage1Pending() : await getStage1List(date)) || []
      const recList = (await getStage1Records(date)) || []
      const recMap = {}
      for (const r of recList) {
        if (!r.account) continue
        if (!recMap[r.account]) recMap[r.account] = []
        recMap[r.account].push(r)
      }
      setStudents(list)
      setRecords(recMap)
    } catch (e) {
      showToast('載入失敗：' + e.message, 'error')
    } finally {
      setLoading(false)
    }
  }, [date, showAll, showToast])

  useEffect(() => { load() }, [load])

  const recsOf = (account) => records[account] || []
  const recSummary = (account) => {
    const scored = recsOf(account).filter(isScored)
    const c = { pass: 0, fail: 0, pending: 0 }
    for (const r of scored) c[r.recommendation] = (c[r.recommendation] || 0) + 1
    return { scored, counts: c }
  }

  const confirm = async (stu, result) => {
    setBusyKey(stu.account)
    try {
      const res = await setStage1ConfirmByAccount(stu.account, result, date)
      if (!Array.isArray(res) || !res.length) {
        showToast('確認失敗：0 筆更新（請確認 applications 的 UPDATE RLS 政策）', 'error'); return
      }
      const fields =
        result === 'pass'   ? { stage1_passed_date: date, status: 'stage1_passed' }
        : result === 'reject' ? { stage1_passed_date: null, status: 'rejected' }
        :                       { stage1_passed_date: null, status: 'pending' }
      setStudents((prev) => prev.map((g) => (g.account === stu.account ? { ...g, ...fields } : g)))
      showToast(`${stu.name}：${result === 'pass' ? '已確認通過，進入第二階段' : result === 'reject' ? '已標記不通過' : '已退回待確認'}`)
    } catch (e) {
      showToast('確認失敗：' + e.message, 'error')
    } finally {
      setBusyKey(null)
    }
  }

  // 搜尋（帳號 / 姓名）
  const q = search.trim().toLowerCase()
  const filtered = students.filter((stu) =>
    !q || (stu.account || '').toLowerCase().includes(q) || (stu.name || '').toLowerCase().includes(q),
  )

  const passCount    = students.filter((g) => confirmStateOf(g) === 'pass').length
  const rejectCount  = students.filter((g) => confirmStateOf(g) === 'reject').length
  const pendingCount = students.filter((g) => confirmStateOf(g) === 'pending').length

  // 下載名單（定稿）：身分 + 志願拆欄 + 出席 + 老師建議 + 確認結果
  const exportRows = students.map((stu) => {
    const { scored, counts } = recSummary(stu.account)
    const appeared = recsOf(stu.account).some((r) => r.appeared)
    const recsText = ['pass', 'pending', 'fail']
      .filter((k) => counts[k]).map((k) => `${recLabel(k)}×${counts[k]}`).join('、') || (scored.length ? '' : '未評分')
    const st = confirmStateOf(stu)
    return {
      account: stu.account, name: stu.name, name_english: stu.name_english,
      ...Object.fromEntries((stu.allDepts || []).map((d, i) => [`pref${i + 1}`, d.department || ''])),
      nationality: stu.nationality,
      center: stu.center || '',
      appeared: appeared ? '已到' : '未到',
      teacher_recs: recsText,
      confirm: st === 'pass' ? '通過' : st === 'reject' ? '不通過' : '待確認',
    }
  })
  const maxPrefs = Math.max(1, ...students.map((stu) => (stu.allDepts || []).length))
  const prefCols = Array.from({ length: maxPrefs }, (_, i) => ({ key: `pref${i + 1}`, label: `志願${i + 1}` }))
  const exportColumns = [...EXPORT_COLS_BEFORE, ...prefCols, ...EXPORT_COLS_AFTER]

  if (!teacher || (teacher.role !== 'admin' && teacher.role !== 'superadmin')) return null

  const th = { padding: '9px 10px', textAlign: 'left', borderBottom: '1px solid #e8e7e3', color: '#666', fontWeight: 500, fontSize: 12, whiteSpace: 'nowrap' }
  const td = { padding: '8px 10px', borderBottom: '1px solid #f5f4f0', fontSize: 13, verticalAlign: 'middle' }
  const cBtn = (active, activeBg, activeBorder, activeColor) => ({
    ...s.btn, ...s.btnSm,
    background: active ? activeBg : 'white',
    borderColor: active ? activeBorder : '#ddd',
    color: active ? activeColor : '#888',
  })

  return (
    <PageShell
      title="實踐大學" subtitle="實體面試確認名單" accent={ACCENT} toast={toast} intlBack
      right={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {loading && <span style={{ fontSize: 12, color: '#cbd5e1' }}>載入中…</span>}
          <span style={{ fontSize: 12, color: '#cbd5e1' }}>{teacher.display_name || teacher.username}</span>
          <Btn style={{ background: 'none', borderColor: '#ffffff44', color: '#ccfbf1' }} onClick={() => { window.location.hash = '#/stage1' }}>← 實體面試評分</Btn>
          <Btn style={{ background: 'none', borderColor: '#ffffff44', color: '#ccfbf1' }} onClick={logoutTeacher}>登出</Btn>
        </div>
      }
    >
      {/* 工具列 */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: '#555' }}>面試日期</span>
        <input type="date" style={{ ...s.input, width: 160, marginBottom: 0 }} value={date} onChange={(e) => setDate(e.target.value)} disabled={showAll} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: '#555', cursor: 'pointer' }}>
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
          顯示全部未確認
        </label>
        <input style={{ ...s.input, width: 200, marginBottom: 0 }} placeholder="搜尋帳號 / 姓名" value={search} onChange={(e) => setSearch(e.target.value)} />
        <span style={{ fontSize: 12, color: '#aaa' }}>
          應試 {students.length} 位 · 通過 {passCount} · 不通過 {rejectCount} · 待確認 {pendingCount}
        </span>
        <div style={{ marginLeft: 'auto' }}>
          <ExportBtn columns={exportColumns} rows={exportRows} filename={`實體面試確認名單_${date}.xlsx`}
            label="⬇ 下載名單" disabled={!students.length} onEmpty={() => showToast('沒有可下載的名單', 'warn')} />
        </div>
      </div>

      <Card>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 920 }}>
            <thead>
              <tr style={{ background: '#faf9f6' }}>
                {['姓名', '報考志願', '國籍', '中心', '出席', '老師評分', '確認結果'].map((h, i) => <th key={i} style={th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {filtered.map((stu) => {
                const { scored, counts } = recSummary(stu.account)
                const appeared = recsOf(stu.account).some((r) => r.appeared)
                const st = confirmStateOf(stu)
                return (
                  <tr key={stu.account}>
                    <td style={td}>
                      <div style={{ fontWeight: 500 }}>{stu.name}</div>
                      <div style={{ fontSize: 11, color: '#999' }}>{stu.name_english}</div>
                      <div style={{ fontSize: 11, color: '#bbb' }}>{stu.account}</div>
                    </td>
                    <td style={{ ...td, color: '#777', maxWidth: 220 }}>
                      {(stu.allDepts || []).map((dep) => (
                        <div key={dep.id} style={{ fontSize: 12 }}>
                          <span style={{ color: '#bbb' }}>{dep.preference_order ?? '?'}.</span> {dep.department}
                        </div>
                      ))}
                    </td>
                    <td style={td}>{stu.nationality}</td>
                    <td style={{ ...td, color: stu.center ? '#1e40af' : '#ccc' }}>{stu.center || '—'}</td>
                    <td style={td}>{appeared ? <span style={{ color: '#15803d' }}>✓ 已到</span> : <span style={{ color: '#bbb' }}>未到</span>}</td>
                    <td style={td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        {scored.length === 0 && <span style={{ fontSize: 12, color: '#bbb' }}>未評分</span>}
                        {['pass', 'pending', 'fail'].map((k) => counts[k] ? (() => {
                          const info = DECISIONS_STAGE1.find((d) => d.v === k)
                          return <Pill key={k} color={info.color} bg={info.bg}>{info.label}×{counts[k]}</Pill>
                        })() : null)}
                        {scored.length > 0 && (
                          <button onClick={() => setViewing({ stu, recs: recsOf(stu.account) })} style={{ ...s.btn, ...s.btnSm }}>查看</button>
                        )}
                      </div>
                    </td>
                    <td style={td}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        <button disabled={busyKey === stu.account} onClick={() => confirm(stu, 'pass')}
                          style={cBtn(st === 'pass', '#dcfce7', '#86efac', '#15803d')}>通過</button>
                        <button disabled={busyKey === stu.account} onClick={() => confirm(stu, 'pending')}
                          style={cBtn(st === 'pending', '#f3f4f6', '#d1d5db', '#4b5563')}>待確認</button>
                        <button disabled={busyKey === stu.account} onClick={() => confirm(stu, 'reject')}
                          style={cBtn(st === 'reject', '#fee2e2', '#fecaca', '#b91c1c')}>不通過</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {!filtered.length && (
                <tr><td colSpan={7} style={{ ...td, textAlign: 'center', color: '#aaa', padding: 32 }}>
                  {loading ? '載入中…' : '此日期沒有應試學生'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {viewing && (
        <Stage1EvalDetailModal student={viewing.stu} recs={viewing.recs} onClose={() => setViewing(null)} />
      )}
    </PageShell>
  )
}
