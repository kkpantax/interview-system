import { useState, useEffect, useCallback } from 'react'
import { PageShell } from '../components/PageShell'
import { Btn, Card, CardHead, Pill, s } from '../components/UI'
import ImportModal from '../components/ImportModal'
import { writeXlsx } from '../components/ExportBtn'
import { getAllApplications, upsertApplications, getFinalList, setInterviewDate } from '../api'
import { STATUS } from '../constants'

const localToday = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const statusInfo = (st) => ({
  pending:       { label: STATUS.pending,       color: '#6b7280', bg: '#f3f4f6' },
  stage1_passed: { label: STATUS.stage1_passed, color: '#15803d', bg: '#dcfce7' },
  rejected:      { label: STATUS.rejected,      color: '#991b1b', bg: '#fee2e2' },
}[st] || { label: st || '待面試', color: '#6b7280', bg: '#f3f4f6' })

const FINAL_COLS = [
  { key: 'account',            label: '帳號' },
  { key: 'name',               label: '中文姓名' },
  { key: 'name_english',       label: '英文姓名' },
  { key: 'department',         label: '科系' },
  { key: 'stage1_passed_date', label: '通過第一階段日期' },
  { key: 'total_score',        label: '評分總分' },
  { key: 'recommendation',     label: '建議' },
]

export default function AdminApp() {
  const [apps, setApps]           = useState([])
  const [loading, setLoading]     = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [toast, setToast]         = useState(null)
  const [kw, setKw]               = useState('')
  const [deptFilter, setDeptFilter]     = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [selected, setSelected]   = useState(() => new Set())
  const [assignDate, setAssignDate] = useState(localToday)
  const [assigning, setAssigning] = useState(false)

  const showToast = useCallback((msg, type = 'ok') => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3500)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try { setApps((await getAllApplications()) || []) }
    catch (e) { showToast('載入失敗：' + e.message, 'error') }
    finally { setLoading(false) }
  }, [showToast])

  useEffect(() => { load() }, [load])

  const handleImport = async (rows, skipped, onProgress) => {
    const { added, updated } = await upsertApplications(rows, onProgress)
    showToast(`匯入完成：新增 ${added}、更新 ${updated}、略過 ${skipped}（無帳號）`)
    await load()
  }

  const exportFinal = async () => {
    try {
      const evals = (await getFinalList()) || []
      if (!evals.length) { showToast('目前沒有建議錄取的學生', 'warn'); return }
      const rows = evals.map((e) => ({
        account:            e.applications?.account ?? '',
        name:               e.applications?.name ?? '',
        name_english:       e.applications?.name_english ?? '',
        department:         e.department ?? e.applications?.department ?? '',
        stage1_passed_date: e.applications?.stage1_passed_date ?? '',
        total_score:        e.total_score ?? '',
        recommendation:     '建議錄取',
      }))
      writeXlsx(FINAL_COLS, rows, '最終建議錄取名單.xlsx')
      showToast(`已匯出 ${rows.length} 筆`)
    } catch (e) { showToast('匯出失敗：' + e.message, 'error') }
  }

  const depts = [...new Set(apps.map((a) => a.department).filter(Boolean))].sort()
  const filtered = apps.filter((a) => {
    if (deptFilter && a.department !== deptFilter) return false
    if (statusFilter && (a.status || 'pending') !== statusFilter) return false
    if (kw) {
      const q = kw.toLowerCase()
      const hay = [a.name, a.name_english, a.account, a.passport_number]
        .filter(Boolean).map((x) => String(x).toLowerCase())
      if (!hay.some((h) => h.includes(q))) return false
    }
    return true
  })

  // ── 選取 / 指派面試日期 ─────────────────────────────────────────────────────
  const toggle = (id) => setSelected((prev) => {
    const n = new Set(prev)
    n.has(id) ? n.delete(id) : n.add(id)
    return n
  })
  const allSelected = filtered.length > 0 && filtered.every((a) => selected.has(a.id))
  const toggleAll = () => setSelected((prev) => {
    const n = new Set(prev)
    if (filtered.every((a) => n.has(a.id))) filtered.forEach((a) => n.delete(a.id))
    else filtered.forEach((a) => n.add(a.id))
    return n
  })

  const handleAssign = async () => {
    const ids = [...selected]
    if (!ids.length) { showToast('請先勾選學生', 'warn'); return }
    if (!assignDate)  { showToast('請選擇面試日期', 'warn'); return }
    setAssigning(true)
    try {
      const res = await setInterviewDate(ids, assignDate)
      const n = Array.isArray(res) ? res.length : 0
      if (!n) { showToast('指派失敗：0 筆更新（請確認 applications 的 UPDATE RLS 政策）', 'error'); return }
      showToast(`已指派 ${n} 位面試日期：${assignDate}`)
      setSelected(new Set())
      await load()
    } catch (e) {
      showToast('指派失敗：' + e.message, 'error')
    } finally {
      setAssigning(false)
    }
  }

  const td = { padding: '8px 10px', borderBottom: '1px solid #f5f4f0', fontSize: 13 }
  const th = { padding: '9px 10px', textAlign: 'left', borderBottom: '1px solid #e8e7e3', color: '#666', fontWeight: 500, fontSize: 12 }

  return (
    <PageShell
      title="實踐大學"
      subtitle="行政人員"
      toast={toast}
      right={
        <>
          {loading && <span style={{ fontSize: 12, color: '#aaa' }}>載入中…</span>}
          <Btn variant="primary" style={{ background: '#2a2a28', borderColor: '#444', color: '#f5f4f0' }} onClick={() => setShowImport(true)}>＋ 上傳名單</Btn>
          <Btn style={{ background: 'none', borderColor: '#444', color: '#ccc' }} onClick={exportFinal}>⬇ 匯出最終名單</Btn>
          <Btn style={{ background: 'none', borderColor: '#444', color: '#ccc' }} onClick={load}>↻</Btn>
        </>
      }
    >
      {/* 摘要 */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          { label: '志願總數', value: apps.length },
          { label: '已排面試', value: apps.filter((a) => a.interview_date).length },
          { label: '通過一階', value: apps.filter((a) => a.status === 'stage1_passed').length },
          { label: '科系數',   value: depts.length },
        ].map((c) => (
          <div key={c.label} style={{ ...s.card, padding: '12px 18px', minWidth: 110 }}>
            <div style={{ fontSize: 12, color: '#aaa' }}>{c.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* 篩選 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <input style={{ ...s.input, width: 220, marginBottom: 0 }} placeholder="搜尋姓名 / 帳號 / 護照"
          value={kw} onChange={(e) => setKw(e.target.value)} />
        <select style={s.sel} value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}>
          <option value="">全部科系</option>
          {depts.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select style={s.sel} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">全部狀態</option>
          {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <span style={{ fontSize: 12, color: '#aaa', alignSelf: 'center' }}>共 {filtered.length} 筆</span>
      </div>

      {/* 指派面試日期 */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', background: '#eff6ff', border: '1px solid #dbeafe', borderRadius: 8, padding: '10px 12px' }}>
        <span style={{ fontSize: 13, color: '#1e40af', fontWeight: 600 }}>指派面試日期</span>
        <input type="date" style={{ ...s.input, marginBottom: 0, width: 'auto' }}
          value={assignDate} onChange={(e) => setAssignDate(e.target.value)} />
        <Btn variant="blue" onClick={handleAssign} disabled={assigning || !selected.size}>
          {assigning ? '指派中…' : `指派給已選 ${selected.size} 位`}
        </Btn>
        {selected.size > 0 && (
          <button onClick={() => setSelected(new Set())} style={{ ...s.btn, ...s.btnSm }}>清除選取</button>
        )}
        <span style={{ fontSize: 12, color: '#7b8794' }}>勾選下方學生後指派，第一階段老師即可依日期看到名單</span>
      </div>

      <Card>
        <CardHead left="學生總覽" right={`${filtered.length} / ${apps.length}`} />
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#faf9f6' }}>
                <th style={{ ...th, width: 32 }}>
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                </th>
                {['帳號', '中文姓名', '英文姓名', '系所', '志願序', '國籍', '面試日', '狀態', '通過一階日'].map((h) => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => {
                const si = statusInfo(a.status)
                return (
                  <tr key={a.id} style={selected.has(a.id) ? { background: '#f5faff' } : undefined}>
                    <td style={td}>
                      <input type="checkbox" checked={selected.has(a.id)} onChange={() => toggle(a.id)} />
                    </td>
                    <td style={{ ...td, color: '#888' }}>{a.account}</td>
                    <td style={{ ...td, fontWeight: 500 }}>{a.name}</td>
                    <td style={{ ...td, color: '#777' }}>{a.name_english}</td>
                    <td style={{ ...td, color: '#777' }}>{a.department}</td>
                    <td style={td}>{a.preference_order ?? '—'}</td>
                    <td style={td}>{a.nationality}</td>
                    <td style={{ ...td, color: a.interview_date ? '#1e40af' : '#ccc' }}>{a.interview_date || '—'}</td>
                    <td style={td}><Pill color={si.color} bg={si.bg}>{si.label}</Pill></td>
                    <td style={{ ...td, color: '#888' }}>{a.stage1_passed_date || '—'}</td>
                  </tr>
                )
              })}
              {!filtered.length && (
                <tr><td colSpan={10} style={{ ...td, textAlign: 'center', color: '#aaa', padding: 32 }}>
                  {loading ? '載入中…' : '沒有資料，請先上傳報名名單'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {showImport && <ImportModal onImport={handleImport} onClose={() => setShowImport(false)} />}
    </PageShell>
  )
}
