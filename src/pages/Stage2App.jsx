import { useState, useEffect, useCallback } from 'react'
import { PageShell } from '../components/PageShell'
import { Card, CardHead, s } from '../components/UI'
import Stage2List from '../components/Stage2List'
import ScoreForm from '../components/ScoreForm'
import { getStage2List, getDepartments, saveEvaluation } from '../api'

const localToday = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function Stage2App({ dept: initialDept }) {
  const [dept, setDept]         = useState(initialDept || '')
  const [depts, setDepts]       = useState([])
  const [students, setStudents] = useState([])
  const [active, setActive]     = useState(null)   // 評分中的學生
  const [loading, setLoading]   = useState(false)
  const [saving, setSaving]     = useState(false)
  const [toast, setToast]       = useState(null)

  const showToast = useCallback((msg, type = 'ok') => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3500)
  }, [])

  // 科系清單（供切換）
  useEffect(() => { getDepartments().then(setDepts).catch(() => {}) }, [])

  const load = useCallback(async () => {
    if (!dept) { setStudents([]); return }
    setLoading(true)
    try {
      setStudents((await getStage2List(dept)) || [])
    } catch (e) {
      showToast('載入失敗：' + e.message, 'error')
    } finally {
      setLoading(false)
    }
  }, [dept, showToast])

  useEffect(() => { load() }, [load])

  // 切換科系時同步 hash，並回到名單
  const changeDept = (d) => {
    setDept(d); setActive(null)
    window.location.hash = `#/stage2?dept=${encodeURIComponent(d)}`
  }

  const handleSave = async (payload) => {
    setSaving(true)
    try {
      await saveEvaluation({
        application_id: active.id,
        eval_date: localToday(),
        department: dept,
        ...payload,
      })
      showToast(`已儲存 ${active.name} 的評分`)
      setActive(null)
      await load()          // 評分後該生從待評名單移除
    } catch (e) {
      showToast('儲存失敗：' + e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <PageShell
      title="實踐大學" subtitle="第二階段 · 評分" accent="#14532d" toast={toast}
      right={
        <select
          style={{ ...s.sel, background: '#ffffff', maxWidth: 220 }}
          value={dept}
          onChange={(e) => changeDept(e.target.value)}
        >
          <option value="">選擇科系…</option>
          {depts.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      }
    >
      {!dept ? (
        <Card>
          <div style={{ padding: 40, textAlign: 'center', color: '#888', fontSize: 14 }}>
            請從右上角選擇您的科系
          </div>
        </Card>
      ) : active ? (
        <ScoreForm student={active} onSave={handleSave} onBack={() => setActive(null)} saving={saving} />
      ) : (
        <Card>
          <CardHead left={`${dept} · 待評分`} right={`${students.length} 位`} />
          <Stage2List students={students} onOpen={setActive} loading={loading} />
        </Card>
      )}
    </PageShell>
  )
}
