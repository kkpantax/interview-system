import { useState, useEffect, useCallback } from 'react'
import { PageShell } from '../components/PageShell'
import { Btn, Card, CardHead, s } from '../components/UI'
import ExportBtn from '../components/ExportBtn'
import Stage1List from '../components/Stage1List'
import { getStage1List, getStage1Pending, saveStage1Record, markStage1Passed } from '../api'
import { getTeacher, logoutTeacher } from '../auth'

const localToday = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const EXPORT_COLS = [
  { key: 'account',          label: '帳號' },
  { key: 'name',             label: '中文姓名' },
  { key: 'name_english',     label: '英文姓名' },
  { key: 'department',       label: '系所' },
  { key: 'preference_order', label: '志願序' },
  { key: 'nationality',      label: '國籍' },
  { key: 'appeared',         label: '出席' },
  { key: 'center',           label: '中心' },
  { key: 'note',             label: '備註' },
]

export default function Stage1App() {
  const teacher = getTeacher()
  const [date, setDate]         = useState(localToday)
  const [showAll, setShowAll]   = useState(false)
  const [students, setStudents] = useState([])
  const [draft, setDraft]       = useState({})
  const [loading, setLoading]   = useState(false)
  const [savingId, setSavingId] = useState(null)
  const [producing, setProducing] = useState(false)
  const [toast, setToast]       = useState(null)

  // 守衛：未登入導回登入頁
  useEffect(() => { if (!teacher) window.location.hash = '#/login?stage=1' }, [teacher])

  const showToast = useCallback((msg, type = 'ok') => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3500)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const list = (showAll ? await getStage1Pending() : await getStage1List(date)) || []
      setStudents(list)
      setDraft(Object.fromEntries(list.map((r) => [r.id, { appeared: false, center: '', note: '' }])))
    } catch (e) {
      showToast('載入失敗：' + e.message, 'error')
    } finally {
      setLoading(false)
    }
  }, [date, showAll, showToast])

  useEffect(() => { load() }, [load])

  const patch = (id, p) => setDraft((d) => ({ ...d, [id]: { ...d[id], ...p } }))

  const saveRow = async (stu) => {
    setSavingId(stu.id)
    try {
      const d = draft[stu.id] || {}
      await saveStage1Record({
        application_id: stu.id,
        record_date: date,
        appeared: !!d.appeared,
        center: d.center || null,
        confirmed_dept: stu.department || null,
        teacher_note: d.note || null,
      })
      showToast(`已儲存 ${stu.name} 的簽到`)
    } catch (e) {
      showToast('儲存失敗：' + e.message, 'error')
    } finally {
      setSavingId(null)
    }
  }

  const produce = async () => {
    const passed = students.filter((stu) => draft[stu.id]?.appeared)
    if (!passed.length) { showToast('尚未有標記「已到」的學生', 'warn'); return }
    setProducing(true)
    try {
      for (const stu of passed) await markStage1Passed(stu.id, date)
      showToast(`已產出今日通過名單：${passed.length} 位`)
      await load()
    } catch (e) {
      showToast('產出失敗：' + e.message, 'error')
    } finally {
      setProducing(false)
    }
  }

  const exportRows = students.map((stu) => ({
    account: stu.account, name: stu.name, name_english: stu.name_english,
    department: stu.department, preference_order: stu.preference_order ?? '',
    nationality: stu.nationality,
    appeared: draft[stu.id]?.appeared ? '已到' : '未到',
    center: draft[stu.id]?.center || '',
    note: draft[stu.id]?.note || '',
  }))

  const appearedCount = students.filter((stu) => draft[stu.id]?.appeared).length

  if (!teacher) return null

  return (
    <PageShell
      title="實踐大學" subtitle="第一階段 · 簽到確認" accent="#1e3a8a" toast={toast}
      right={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {loading && <span style={{ fontSize: 12, color: '#cbd5e1' }}>載入中…</span>}
          <span style={{ fontSize: 12, color: '#cbd5e1' }}>{teacher.display_name || teacher.username}</span>
          <button onClick={logoutTeacher}
            style={{ background: 'none', border: '1px solid #ffffff33', color: '#f5f4f0', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
            登出
          </button>
        </div>
      }
    >
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 13, color: '#555' }}>面試日期</label>
        <input type="date" style={{ ...s.input, marginBottom: 0, width: 'auto' }}
          value={date} onChange={(e) => setDate(e.target.value)} disabled={showAll} />
        <label style={{ fontSize: 13, color: '#555', display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
          顯示全部未排期 / 未通過
        </label>
        <span style={{ fontSize: 12, color: '#aaa' }}>應試 {students.length} 位 · 已到 {appearedCount} 位</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <ExportBtn columns={EXPORT_COLS} rows={exportRows} filename={`第一階段簽到表_${date}.xlsx`}
            label="⬇ 下載簽到表" disabled={!students.length} onEmpty={() => showToast('沒有可下載的名單', 'warn')} />
          <Btn variant="green" onClick={produce} disabled={producing || !appearedCount}>
            {producing ? '產出中…' : `產出今日名單（${appearedCount}）`}
          </Btn>
        </div>
      </div>

      <Card>
        <CardHead left={showAll ? '未通過名單' : `${date} 應試名單`} right={`${students.length} 位`} />
        <Stage1List
          students={students} draft={draft} onChange={patch}
          onSaveRow={saveRow} savingId={savingId} loading={loading}
        />
      </Card>

      <div style={{ fontSize: 12, color: '#aaa', marginTop: 12, lineHeight: 1.6 }}>
        說明：逐列確認出席、選擇中心、填備註後按「儲存」寫入簽到紀錄；
        最後按「產出今日名單」把所有「已到」的學生標記為通過第一階段（寫入通過日期）。
      </div>
    </PageShell>
  )
}
