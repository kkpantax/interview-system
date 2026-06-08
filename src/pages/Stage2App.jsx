import { useState, useEffect, useCallback } from 'react'
import { PageShell } from '../components/PageShell'
import { Card, CardHead, Btn, Modal, Pill, s } from '../components/UI'
import { writeXlsx } from '../components/ExportBtn'
import Stage2List from '../components/Stage2List'
import ScoreForm from '../components/ScoreForm'
import { SCORE_ITEMS, DECISIONS, CAMPUSES, campusOf } from '../constants'
import {
  getStage2List, getStage2Stats, saveEvaluation,
  getStage2DeptSummary, getStage2EvalsByDate, getDepartmentQuotas,
} from '../api'

const localToday = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const EMPTY_STATS = { admit: 0, waitlist: 0, reject: 0, pending: 0 }

// 評分老師的「當日工作階段」存 localStorage：重新整理／返回各系都不必重輸入。
// EVAL_SESSION_KEY 存 { name, date }，按「完成今日評分」時清除；只在 date === 今天 時自動沿用，
// 避免跨日後仍以昨天日期記錄評分。EVAL_NAME_KEY 記住老師姓名（同一台電腦長期保留，供預填）。
const EVAL_SESSION_KEY = 'stage2_evaluator'
const EVAL_NAME_KEY    = 'stage2_evaluator_name'

const readEvaluatorSession = () => {
  try {
    const v = JSON.parse(localStorage.getItem(EVAL_SESSION_KEY) || 'null')
    if (v && v.name && v.date === localToday()) return v
  } catch { /* ignore */ }
  return null
}
const readRememberedName = () => {
  try { return localStorage.getItem(EVAL_NAME_KEY) || '' } catch { return '' }
}

const ghostBtn = { background: 'none', border: '1px solid #ffffff33', color: '#f5f4f0', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }

function DeptPicker() {
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr]         = useState('')

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [data, quotas] = await Promise.all([getStage2DeptSummary(), getDepartmentQuotas()])
        if (alive) setRows((data || []).map((r) => ({ ...r, quota: quotas[r.department] ?? null })))
      } catch (e) {
        if (alive) setErr(e.message)
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [])

  const pick = (dept) => { window.location.hash = '#/stage2?dept=' + encodeURIComponent(dept) }

  const groups = [
    ...CAMPUSES.map((c) => ({ name: c.name, items: rows.filter((r) => campusOf(r.department) === c.name) })),
    { name: '其他', items: rows.filter((r) => campusOf(r.department) === '其他') },
  ].filter((g) => g.items.length)

  const card = (r) => (
    <button key={r.department} onClick={() => pick(r.department)}
      style={{
        display: 'flex', flexDirection: 'column', gap: 10, padding: '16px 18px',
        border: '1px solid #e8e7e3', borderRadius: 14, background: 'white',
        cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', transition: 'all .15s',
      }}
      onMouseEnter={(ev) => { ev.currentTarget.style.borderColor = '#15803d'; ev.currentTarget.style.transform = 'translateY(-2px)' }}
      onMouseLeave={(ev) => { ev.currentTarget.style.borderColor = '#e8e7e3'; ev.currentTarget.style.transform = 'none' }}
    >
      <div style={{ fontSize: 16, fontWeight: 600, color: '#1a1a18', lineHeight: 1.35 }}>{r.department}</div>
      <div style={{ fontSize: 12, color: '#475569' }}>
        預計錄取：<b style={{ color: '#15803d' }}>{r.quota == null ? '未設定' : `${r.quota} 人`}</b>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {[
          { label: '等待評分', n: r.waiting,   bg: '#eff6ff', color: '#1e40af' },
          { label: '已評選',   n: r.evaluated, bg: '#f1f5f9', color: '#475569' },
          { label: '建議錄取', n: r.admitted,  bg: '#dcfce7', color: '#15803d' },
        ].map((c) => (
          <div key={c.label} style={{ flex: 1, background: c.bg, color: c.color, borderRadius: 8, padding: '8px 6px', textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.1 }}>{c.n}</div>
            <div style={{ fontSize: 11, marginTop: 2 }}>{c.label}</div>
          </div>
        ))}
      </div>
    </button>
  )

  return (
    <PageShell
      title="實踐大學" subtitle="第二階段 · 選擇科系" accent="#14532d"
      right={<button onClick={() => { window.location.hash = '#/' }} style={ghostBtn}>← 返回首頁</button>}
    >
      {loading ? (
        <Card><div style={{ padding: 40, textAlign: 'center', color: '#888', fontSize: 14 }}>載入中…</div></Card>
      ) : err ? (
        <Card><div style={{ padding: 40, textAlign: 'center', color: '#dc2626', fontSize: 14 }}>載入失敗：{err}</div></Card>
      ) : (
        groups.map((g) => (
          <div key={g.name} style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid #e8e7e3' }}>
              <div style={{ fontSize: 17, fontWeight: 700 }}>{g.name}</div>
              <div style={{ fontSize: 12, color: '#aaa' }}>{g.items.length} 系</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
              {g.items.map(card)}
            </div>
          </div>
        ))
      )}
    </PageShell>
  )
}

function EvaluatorGate({ dept, onStart, initialName = '' }) {
  const [name, setName] = useState(initialName)
  const [date, setDate] = useState(localToday())
  const start = () => { if (name.trim()) onStart({ name: name.trim(), date }) }

  return (
    <PageShell
      title="實踐大學" subtitle={`第二階段 · ${dept}`} accent="#14532d"
      right={<button onClick={() => { window.location.hash = '#/stage2' }} style={ghostBtn}>← 返回各系</button>}
    >
      <Card style={{ maxWidth: 460, margin: '0 auto' }}>
        <CardHead left="評分人員資料" />
        <div style={{ padding: '18px 20px' }}>
          <div style={{ fontSize: 13, color: '#666', marginBottom: 16, lineHeight: 1.6 }}>
            進入「{dept}」評分前，請填寫評分老師姓名與評分日期。此資料會記錄在每一筆評分上，並可下載當日評分 Excel 供行政人員查核。
          </div>
          <span style={s.secLabel}>評分老師姓名</span>
          <input style={s.input} placeholder="請輸入姓名" value={name} autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') start() }} />
          <span style={s.secLabel}>評分日期</span>
          <input type="date" style={s.input} value={date} onChange={(e) => setDate(e.target.value)} />
          <Btn variant="primary" onClick={start} disabled={!name.trim()}
            style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}>
            開始評分
          </Btn>
        </div>
      </Card>
    </PageShell>
  )
}

// 唯讀檢視某學生在本系的所有評分內容（不進入再評分頁）
function EvalDetailModal({ student, onClose }) {
  const decInfo = (v) => DECISIONS.find((d) => d.v === v) || DECISIONS.find((d) => d.v === 'pending')
  const evs = [...(student.evaluations || [])].sort(
    (a, b) => String(b.eval_date || '').localeCompare(String(a.eval_date || '')),
  )
  return (
    <Modal title={`${student.name} 的評分紀錄`} onClose={onClose} width={560}>
      <div style={{ fontSize: 13, color: '#666', marginBottom: 14 }}>
        {student.name_english} · {student.account} · {student.department}
      </div>
      {evs.length === 0 && (
        <div style={{ color: '#aaa', fontSize: 13, textAlign: 'center', padding: 20 }}>尚無評分紀錄</div>
      )}
      {evs.map((e, idx) => {
        const info = decInfo(e.recommendation)
        const sc = e.scores || {}
        const cqs = Array.isArray(e.custom_questions) ? e.custom_questions : []
        return (
          <div key={e.id || idx} style={{ border: '1px solid #e8e7e3', borderRadius: 10, padding: '12px 14px', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              <b style={{ fontSize: 14 }}>{e.evaluator_name || '（未填老師）'}</b>
              <span style={{ fontSize: 12, color: '#888' }}>{e.eval_date || ''}</span>
              <Pill color={info.color} bg={info.bg}>{info.label}</Pill>
              <span style={{ marginLeft: 'auto', fontSize: 13 }}>
                總分 <b style={{ fontSize: 16 }}>{e.total_score ?? '—'}</b> / 40
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 16px', fontSize: 13 }}>
              {SCORE_ITEMS.map((it) => (
                <div key={it.key} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                  <span style={{ color: '#666' }}>{it.label}</span>
                  <span style={{ fontWeight: 600 }}>{sc[it.key] ?? 0}</span>
                </div>
              ))}
            </div>
            {e.teacher_note && (
              <div style={{ marginTop: 10, fontSize: 13, color: '#555', background: '#faf9f6', borderRadius: 6, padding: '8px 10px', whiteSpace: 'pre-wrap' }}>
                備註：{e.teacher_note}
              </div>
            )}
            {cqs.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>自訂題目</div>
                {cqs.map((c, i) => (
                  <div key={i} style={{ padding: '4px 0', borderTop: i ? '1px solid #f5f4f0' : 'none', fontSize: 13 }}>
                    <div style={{ fontWeight: 500 }}>{i + 1}. {c.question}</div>
                    {c.note && <div style={{ color: '#666', marginTop: 2 }}>{c.note}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </Modal>
  )
}

export default function Stage2App({ dept = '' }) {
  if (!dept) return <DeptPicker />
  return <Stage2Scoring dept={dept} />
}

function Stage2Scoring({ dept }) {
  const [evaluator, setEvaluator] = useState(readEvaluatorSession)
  const [students, setStudents]   = useState([])
  const [stats, setStats]         = useState(EMPTY_STATS)
  const [quota, setQuota]         = useState(null)
  const [search, setSearch]       = useState('')
  const [active, setActive]       = useState(null)
  const [viewing, setViewing]     = useState(null)
  const [loading, setLoading]     = useState(false)
  const [saving, setSaving]       = useState(false)
  const [toast, setToast]         = useState(null)
  const [finishing, setFinishing] = useState(null)   // 今日總結 { total, admit, waitlist, reject, pending }

  const showToast = useCallback((msg, type = 'ok') => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3500)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [list, st, quotas] = await Promise.all([getStage2List(dept), getStage2Stats(dept), getDepartmentQuotas()])
      setStudents(list || [])
      setStats(st || EMPTY_STATS)
      setQuota(quotas?.[dept] ?? null)
    } catch (e) {
      showToast('載入失敗：' + e.message, 'error')
    } finally {
      setLoading(false)
    }
  }, [dept, showToast])

  useEffect(() => { if (evaluator) load() }, [evaluator, load])

  if (!evaluator) {
    const startEvaluator = (v) => {
      try {
        localStorage.setItem(EVAL_SESSION_KEY, JSON.stringify(v))
        localStorage.setItem(EVAL_NAME_KEY, v.name)
      } catch { /* ignore */ }
      setEvaluator(v)
    }
    return <EvaluatorGate dept={dept} onStart={startEvaluator} initialName={readRememberedName()} />
  }

  const q = search.trim().toLowerCase()
  const filtered = students.filter((stu) =>
    !q ||
    (stu.account || '').toLowerCase().includes(q) ||
    (stu.name || '').toLowerCase().includes(q),
  )
  const unscored = filtered.filter((stu) => !stu.evaluations || stu.evaluations.length === 0)
  const scored   = filtered.filter((stu) => stu.evaluations && stu.evaluations.length > 0)

  const statCards = [
    { label: '預計錄取',   n: quota == null ? '—' : quota, bg: '#ecfdf5', color: '#047857', target: true },
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
        eval_date: evaluator.date,
        evaluator_name: evaluator.name,
        department: dept,
        ...payload,
      })
      showToast(`已儲存 ${active.name} 的評分`)
      setActive(null)
      await load()
    } catch (e) {
      showToast('儲存失敗：' + e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const downloadToday = async () => {
    try {
      const evs = await getStage2EvalsByDate(dept, evaluator.date)
      if (!evs || !evs.length) { showToast('該日期尚無評分可下載', 'error'); return }
      const decLabel = (v) => (DECISIONS.find((d) => d.v === v) || {}).label || v || ''
      const columns = [
        { key: 'evaluator_name', label: '評分老師' },
        { key: 'eval_date',      label: '評分日期' },
        { key: 'account',        label: '帳號' },
        { key: 'name',           label: '中文姓名' },
        { key: 'name_english',   label: '英文姓名' },
        { key: 'nationality',    label: '國籍' },
        { key: 'department',     label: '系所' },
        ...SCORE_ITEMS.map((it) => ({ key: it.key, label: it.label })),
        { key: 'total_score',    label: '總分' },
        { key: 'recommendation', label: '建議' },
        { key: 'teacher_note',   label: '備註' },
      ]
      const rows = evs.map((e) => ({
        evaluator_name: e.evaluator_name || '',
        eval_date:      e.eval_date || '',
        account:        e.applications?.account || '',
        name:           e.applications?.name || '',
        name_english:   e.applications?.name_english || '',
        nationality:    e.applications?.nationality || '',
        department:     e.department || '',
        ...Object.fromEntries(SCORE_ITEMS.map((it) => [it.key, e.scores?.[it.key] ?? ''])),
        total_score:    e.total_score ?? '',
        recommendation: decLabel(e.recommendation),
        teacher_note:   e.teacher_note || '',
      }))
      writeXlsx(columns, rows, `第二階段評分_${dept}_${evaluator.date}.xlsx`)
    } catch (err) {
      showToast('下載失敗：' + err.message, 'error')
    }
  }

  // 收尾：彈出今日總結，確認「今天都評完了嗎」
  const openFinish = async () => {
    try {
      const evs = await getStage2EvalsByDate(dept, evaluator.date)
      const c = { total: (evs || []).length, admit: 0, waitlist: 0, reject: 0, pending: 0 }
      for (const e of (evs || [])) { if (c[e.recommendation] !== undefined) c[e.recommendation]++; else c.pending++ }
      setFinishing(c)
    } catch (err) {
      showToast('讀取今日評分失敗：' + err.message, 'error')
    }
  }
  const leave = () => {
    try { localStorage.removeItem(EVAL_SESSION_KEY) } catch { /* ignore */ }
    window.location.hash = '#/stage2'
  }
  const finishAndDownload = async () => { await downloadToday(); leave() }

  return (
    <PageShell
      title="實踐大學" subtitle="第二階段 · 評分" accent="#14532d" toast={toast}
      right={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {!active && (
            <input
              style={{ ...s.input, marginBottom: 0, width: 160 }}
              placeholder="搜尋帳號 / 姓名"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          )}
          <span style={{ fontSize: 13, fontWeight: 600, color: '#f5f4f0', padding: '4px 10px', background: '#ffffff1a', borderRadius: 6 }}>
            {dept}
          </span>
          <span style={{ fontSize: 12, color: '#cbd5e1' }}>評分：{evaluator.name} · {evaluator.date}</span>
          {!active && <button onClick={downloadToday} style={ghostBtn}>下載今日評分</button>}
          {!active && <button onClick={openFinish} style={{ ...ghostBtn, background: '#ffffff22', fontWeight: 600 }}>完成今日評分</button>}
          <button onClick={() => { window.location.hash = '#/stage2' }} style={ghostBtn}>← 返回各系</button>
        </div>
      }
    >
      {active ? (
        <ScoreForm student={active} evaluator={evaluator} onSave={handleSave} onBack={() => setActive(null)} saving={saving} />
      ) : (
        <>
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            {statCards.map((c) => (
              <div key={c.label} style={{
                flex: '1 1 120px', minWidth: 110, background: c.bg, color: c.color,
                borderRadius: 10, padding: '12px 16px',
                border: c.target ? '2px solid #047857' : '2px solid transparent',
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
            <Stage2List students={scored} onOpen={setActive} onView={setViewing} loading={loading} showEvalSummary />
          </Card>
        </>
      )}

      {viewing && <EvalDetailModal student={viewing} onClose={() => setViewing(null)} />}

      {finishing && (
        <Modal title="完成今日評分" onClose={() => setFinishing(null)} width={420}>
          <div style={{ fontSize: 13, color: '#555', marginBottom: 12, lineHeight: 1.6 }}>
            今日（{evaluator.date}）於「{dept}」共評 <b>{finishing.total}</b> 位。今日的評分都確定完成了嗎？
          </div>
          <div style={{ background: '#faf9f6', borderRadius: 8, padding: '12px 14px', fontSize: 13 }}>
            {[
              { label: '建議錄取',   n: finishing.admit,    color: '#15803d' },
              { label: '備取',       n: finishing.waitlist, color: '#b45309' },
              { label: '不建議錄取', n: finishing.reject,   color: '#dc2626' },
              { label: '待定',       n: finishing.pending,  color: '#6b7280' },
            ].map((c) => (
              <div key={c.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                <span style={{ color: '#666' }}>{c.label}</span>
                <span style={{ fontWeight: 600, color: c.color }}>{c.n}</span>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 12, color: '#999', marginTop: 10, lineHeight: 1.6 }}>
            每位學生的評分在送出時即已存檔，這裡是收尾確認；建議下載查核表交給行政人員。
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <Btn onClick={() => setFinishing(null)} style={{ flex: 1, justifyContent: 'center' }}>尚未，繼續評分</Btn>
            <Btn variant="primary" onClick={finishAndDownload} style={{ flex: 1, justifyContent: 'center' }}>下載查核表並離開</Btn>
          </div>
          <div style={{ textAlign: 'center', marginTop: 10 }}>
            <button onClick={leave} style={{ background: 'none', border: 'none', color: '#888', fontSize: 12, cursor: 'pointer', textDecoration: 'underline', fontFamily: 'inherit' }}>
              不需下載，直接離開
            </button>
          </div>
        </Modal>
      )}
    </PageShell>
  )
}
