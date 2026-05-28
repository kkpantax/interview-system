import { useState, useEffect, useCallback } from 'react'
import { PageShell } from '../components/PageShell'
import { Card, CardHead, s } from '../components/UI'
import Stage2List from '../components/Stage2List'
import ScoreForm from '../components/ScoreForm'
import { getStage2List, getStage2Stats, saveEvaluation } from '../api'
import { getTeacher, logoutTeacher } from '../auth'

const localToday = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const EMPTY_STATS = { admit: 0, waitlist: 0, reject: 0, pending: 0 }

export default function Stage2App() {
  const teacher = getTeacher()
  // 科系綁定老師帳號，不再讓老師現場切換
  const [dept]                  = useState(teacher?.department || '')
  const [students, setStudents] = useState([])
  const [stats, setStats]       = useState(EMPTY_STATS)
  const [search, setSearch]     = useState('')
  const [active, setActive]     = useState(null)   // 評分中的學生
  const [loading, setLoading]   = useState(false)
  const [saving, setSaving]     = useState(false)
  const [toast, setToast]       = useState(null)

  // 守衛：未登入導回登入頁
  useEffect(() => { if (!teacher) window.location.hash = '#/login?stage=2' }, [teacher])

  const showToast = useCallback((msg, type = 'ok') => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3500)
  }, [])

  const load = useCallback(async () => {
    if (!dept) { setStudents([]); setStats(EMPTY_STATS); return }
    setLoading(true)
    try {
      const [list, st] = await Promise.all([getStage2List(dept), getStage2Stats(dept)])
      setStudents(list || [])
      setStats(st || EMPTY_STATS)
    } catch (e) {
      showToast('載入失敗：' + e.message, 'error')
    } finally {
      setLoading(false)
    }
  }, [dept, showToast])

  useEffect(() => { load() }, [load])

  // 搜尋（帳號 / 姓名，不分大小寫），再分待評 / 已評兩區
  const q = search.trim().toLowerCase()
  const filtered = students.filter((stu) =>
    !q ||
    (stu.account || '').toLowerCase().includes(q) ||
    (stu.name || '').toLowerCase().includes(q),
  )
  const unscored = filtered.filter((stu) => !stu.evaluations || stu.evaluations.length === 0)
  const scored   = filtered.filter((stu) => stu.evaluations && stu.evaluations.length > 0)

  const statCards = [
    { label: '建議錄取',   n: stats.admit,    bg: '#dcfce7', color: '#15803d' },
    { label: '備取',       n: stats.waitlist, bg: '#fef3c7', color: '#b45309' },
    { label: '不建議錄取', n: stats.reject,   bg: '#fee2e2', color: '#dc2626' },
    { label: '待定',       n: stats.pending,  bg: '#f3f4f6', color: '#6b7280' },
    { label: '尚未評分',   n: unscored.length, bg: '#eff6ff', color: '#1e40af' },
  ]

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

  if (!teacher) return null

  return (
    <PageShell
      title="實踐大學" subtitle="第二階段 · 評分" accent="#14532d" toast={toast}
      right={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {dept && !active && (
            <input
              style={{ ...s.input, marginBottom: 0, width: 180 }}
              placeholder="搜尋帳號 / 姓名"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          )}
          {dept ? (
            <span style={{ fontSize: 13, fontWeight: 600, color: '#f5f4f0', padding: '4px 10px', background: '#ffffff1a', borderRadius: 6 }}>
              {dept}
            </span>
          ) : (
            <span style={{ fontSize: 12, color: '#fca5a5' }}>此帳號尚未設定科系，請聯絡行政人員</span>
          )}
          <span style={{ fontSize: 12, color: '#cbd5e1' }}>{teacher.display_name || teacher.username}</span>
          <button onClick={logoutTeacher}
            style={{ background: 'none', border: '1px solid #ffffff33', color: '#f5f4f0', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
            登出
          </button>
        </div>
      }
    >
      {!dept ? (
        <Card>
          <div style={{ padding: 40, textAlign: 'center', color: '#888', fontSize: 14 }}>
            此帳號尚未設定科系，請聯絡行政人員
          </div>
        </Card>
      ) : active ? (
        <ScoreForm student={active} onSave={handleSave} onBack={() => setActive(null)} saving={saving} />
      ) : (
        <>
          {/* 統計 Dashboard */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            {statCards.map((c) => (
              <div key={c.label} style={{
                flex: '1 1 120px', minWidth: 110, background: c.bg, color: c.color,
                borderRadius: 10, padding: '12px 16px',
              }}>
                <div style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.1 }}>{c.n}</div>
                <div style={{ fontSize: 12, marginTop: 2 }}>{c.label}</div>
              </div>
            ))}
          </div>

          <Card style={{ marginBottom: 16 }}>
            <CardHead left={`${dept} · 待評分`} right={`${unscored.length} 位`} />
            <Stage2List students={unscored} onOpen={setActive} loading={loading} />
          </Card>

          <Card>
            <CardHead left={`${dept} · 已評分`} right={`${scored.length} 位`} />
            <Stage2List students={scored} onOpen={setActive} loading={loading} showEvalSummary />
          </Card>
        </>
      )}
    </PageShell>
  )
}
