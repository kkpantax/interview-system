import { useState, useEffect, useCallback, useRef } from 'react'
import { PageShell } from '../components/PageShell'
import { Card, CardHead, Btn, Modal, Pill, s } from '../components/UI'
import { writeXlsx } from '../components/ExportBtn'
import Stage2List from '../components/Stage2List'
import ScoreForm from '../components/ScoreForm'
import Stage2GuideModal from '../components/Stage2GuideModal'
import TranslatorSOPModal from '../components/TranslatorSOPModal'
import { SCORE_ITEMS, DECISIONS, CAMPUSES, resolveCampus } from '../constants'
import {
  getStage2List, getStage2Stats, saveEvaluation, deleteEvaluation,
  getStage2DeptSummary, getStage2EvalsByDate, getDepartmentQuotas, getDepartmentCampuses,
  getAllCheckins, upsertCheckin, deleteCheckin, resetStage2CheckinDept, getInfoLinks,
  addStage2Translator, getStage2TranslatorsByDate,
} from '../api'
import { getTeacher } from '../auth'

const localToday = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const EMPTY_STATS = { admit: 0, waitlist: 0, reject: 0, pending: 0 }

// 報到狀態 map：account → { arrived: 有主會議室總報到列, deptStatus: 本系那列的 status }
// 報到列以「該學生自己的面試日」比對（行政端是按排定面試日記錄報到，不一定是今天），
// 無排程者退回今天。改期後舊日期的列自動失效。
const buildDeptCheckinMap = (checkins, dept, students) => {
  const dateOf = {}
  for (const stu of (students || [])) dateOf[stu.account] = stu.stage2_date || localToday()
  const cm = {}
  for (const r of (checkins || [])) {
    if (r.checkin_date !== dateOf[r.account]) continue
    if (!cm[r.account]) cm[r.account] = { arrived: false, deptStatus: null }
    if (!r.department) cm[r.account].arrived = true
    else if (r.department === dept) cm[r.account].deptStatus = r.status
  }
  return cm
}

// 評分老師的「當日工作階段」存 localStorage：重新整理／返回各系都不必重輸入。
// EVAL_SESSION_KEY 存 { name, date }，按「完成今日評分」時清除；只在 date === 今天 時自動沿用，
// 避免跨日後仍以昨天日期記錄評分。EVAL_NAME_KEY 記住老師姓名（同一台電腦長期保留，供預填）。
const EVAL_SESSION_KEY = 'stage2_evaluator'
const EVAL_NAME_KEY    = 'stage2_evaluator_name'
const EVAL_TRANSLATOR_KEY = 'stage2_translator_name'

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
const readRememberedTranslator = () => {
  try { return localStorage.getItem(EVAL_TRANSLATOR_KEY) || '' } catch { return '' }
}

const ghostBtn = { background: 'none', border: '1px solid #ffffff33', color: '#f5f4f0', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }

function DeptPicker() {
  const [rows, setRows]       = useState([])
  const [campusMap, setCampusMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [err, setErr]         = useState('')
  const [showGuide, setShowGuide] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [data, quotas, cm] = await Promise.all([getStage2DeptSummary(), getDepartmentQuotas(), getDepartmentCampuses()])
        if (alive) {
          setCampusMap(cm || {})
          setRows((data || []).map((r) => ({ ...r, quota: quotas[r.department] ?? null })))
        }
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
    ...CAMPUSES.map((c) => ({ name: c.name, items: rows.filter((r) => resolveCampus(r.department, campusMap) === c.name) })),
    { name: '其他', items: rows.filter((r) => resolveCampus(r.department, campusMap) === '其他') },
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
      title="實踐大學" subtitle="第二階段 · 選擇科系" accent="#14532d" stageKey="stage2"
      right={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => setShowGuide(true)} style={{ ...ghostBtn, background: '#ffffff22', fontWeight: 600 }}>📖 操作說明</button>
          <button onClick={() => { window.location.hash = '#/' }} style={ghostBtn}>← 返回首頁</button>
        </div>
      }
    >
      {loading ? (
        <Card><div style={{ padding: 40, textAlign: 'center', color: '#888', fontSize: 14 }}>載入中…</div></Card>
      ) : err ? (
        <Card><div style={{ padding: 40, textAlign: 'center', color: '#dc2626', fontSize: 14 }}>載入失敗：{err}</div></Card>
      ) : (
        <>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
            background: '#ecfdf5', border: '1px solid #bbf7d0', borderRadius: 12,
            padding: '12px 16px', marginBottom: 22,
          }}>
            <span style={{ fontSize: 20 }}>📖</span>
            <div style={{ flex: 1, minWidth: 200, fontSize: 13.5, color: '#166534', lineHeight: 1.6 }}>
              <b>第一次評分，或想複習操作流程？</b> 點右側按鈕看完整的評分操作說明（選系、打分、送出、完成今日評分）。
            </div>
            <button onClick={() => setShowGuide(true)}
              style={{ background: '#15803d', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              查看操作說明
            </button>
          </div>
          {groups.map((g) => (
            <div key={g.name} style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid #e8e7e3' }}>
                <div style={{ fontSize: 17, fontWeight: 700 }}>{g.name}</div>
                <div style={{ fontSize: 12, color: '#aaa' }}>{g.items.length} 系</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
                {g.items.map(card)}
              </div>
            </div>
          ))}
        </>
      )}
      {showGuide && <Stage2GuideModal onClose={() => setShowGuide(false)} />}
    </PageShell>
  )
}

function EvaluatorGate({ dept, onStart, initialName = '', initialTranslator = '' }) {
  const [role, setRole] = useState('teacher')           // 'teacher' | 'translator'
  const [teacherName, setTeacherName] = useState(initialName)
  const [translatorName, setTranslatorName] = useState(initialTranslator)
  const [date, setDate] = useState(localToday())
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [errMsg, setErrMsg] = useState('')

  const startTeacher = () => { if (teacherName.trim()) onStart({ name: teacherName.trim(), date }) }
  const submitTranslator = async () => {
    if (!translatorName.trim() || submitting) return
    setSubmitting(true); setErrMsg('')
    try {
      await addStage2Translator({ department: dept, session_date: date, translator_name: translatorName.trim() })
      try { localStorage.setItem(EVAL_TRANSLATOR_KEY, translatorName.trim()) } catch { /* ignore */ }
      setDone(true)
    } catch (e) {
      setErrMsg('登記失敗，請再試一次 / Đăng ký thất bại, vui lòng thử lại：' + e.message)
    } finally {
      setSubmitting(false)
    }
  }

  const roleBtn = (v, zh, vi) => (
    <button key={v} onClick={() => { setRole(v); setDone(false); setErrMsg('') }} style={{
      flex: 1, padding: '9px 8px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', lineHeight: 1.3,
      border: role === v ? '1px solid #15803d' : '1px solid #d6d3cd',
      background: role === v ? '#ecfdf5' : '#fff',
      color: role === v ? '#15803d' : '#666',
    }}>
      <div style={{ fontSize: 13.5, fontWeight: role === v ? 700 : 500 }}>{zh}</div>
      <div style={{ fontSize: 11, fontWeight: 400, opacity: 0.85 }}>{vi}</div>
    </button>
  )

  return (
    <PageShell
      title="實踐大學" subtitle={`第二階段 · ${dept}`} accent="#14532d"
      right={<button onClick={() => { window.location.hash = '#/stage2' }} style={ghostBtn}>← 返回各系</button>}
    >
      <Card style={{ maxWidth: 460, margin: '0 auto' }}>
        <CardHead left="進入評分 / 翻譯登記" />
        <div style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {roleBtn('teacher', '我是評分老師', 'Tôi là giáo viên')}
            {roleBtn('translator', '我是翻譯同學', 'Tôi là phiên dịch')}
          </div>

          {role === 'teacher' ? (
            <>
              <div style={{ fontSize: 13, color: '#666', marginBottom: 16, lineHeight: 1.6 }}>
                進入「{dept}」評分前，請填寫評分老師姓名與評分日期。此資料會記錄在每一筆評分上，並可下載當日評分 Excel 供行政人員查核。
              </div>
              <span style={s.secLabel}>評分老師姓名</span>
              <input style={s.input} placeholder="請輸入姓名" value={teacherName} autoFocus
                onChange={(e) => setTeacherName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') startTeacher() }} />
              <span style={s.secLabel}>評分日期</span>
              <input type="date" style={s.input} value={date} onChange={(e) => setDate(e.target.value)} />
              <Btn variant="primary" onClick={startTeacher} disabled={!teacherName.trim()}
                style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}>
                開始評分
              </Btn>
            </>
          ) : done ? (
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <div style={{ fontSize: 40 }}>✅</div>
              <div style={{ fontSize: 16, fontWeight: 700, margin: '8px 0 2px' }}>已登記完成</div>
              <div style={{ fontSize: 13, color: '#15803d', marginBottom: 14 }}>Đã đăng ký thành công</div>
              <div style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>
                {translatorName}　·　{dept}　·　{date}
              </div>
              <div style={{ fontSize: 12.5, color: '#888', marginBottom: 16, lineHeight: 1.6 }}>
                你不需要評分，登記完成即可。<br/>
                Bạn không cần chấm điểm, đăng ký xong là được.
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Btn onClick={() => { setDone(false); setTranslatorName('') }}
                  style={{ flex: 1, justifyContent: 'center' }}>再登記一位 / Đăng ký người khác</Btn>
                <Btn onClick={() => { window.location.hash = '#/stage2' }}
                  style={{ flex: 1, justifyContent: 'center' }}>返回各系 / Quay lại</Btn>
              </div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 13, color: '#666', marginBottom: 16, lineHeight: 1.6 }}>
                你是「{dept}」的翻譯同學嗎？請填寫姓名與日期登記即可，<b>不需要評分</b>。<br/>
                <span style={{ color: '#15803d' }}>Bạn là phiên dịch của khoa「{dept}」? Vui lòng điền tên và ngày để đăng ký, <b>không cần chấm điểm</b>.</span>
              </div>
              <span style={s.secLabel}>翻譯同學姓名<span style={{ color: '#15803d', fontWeight: 400, marginLeft: 6 }}>· Tên của bạn phiên dịch</span></span>
              <input style={s.input} placeholder="請填寫你的姓名 / Điền tên của bạn" value={translatorName} autoFocus
                onChange={(e) => setTranslatorName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') submitTranslator() }} />
              <span style={s.secLabel}>日期<span style={{ color: '#15803d', fontWeight: 400, marginLeft: 6 }}>· Ngày</span></span>
              <input type="date" style={s.input} value={date} onChange={(e) => setDate(e.target.value)} />
              {errMsg && <div style={{ color: '#dc2626', fontSize: 12.5, marginBottom: 8, lineHeight: 1.5 }}>{errMsg}</div>}
              <Btn variant="primary" onClick={submitTranslator} disabled={!translatorName.trim() || submitting}
                style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}>
                {submitting ? '登記中… / Đang gửi…' : '送出登記 / Đăng ký'}
              </Btn>
            </>
          )}
        </div>
      </Card>
    </PageShell>
  )
}

// 唯讀檢視某學生在本系的所有評分內容（不進入再評分頁）；
// 超級管理員另傳 onDelete，可刪除誤送出的評分
function EvalDetailModal({ student, onDelete, onClose }) {
  const [busyId, setBusyId] = useState(null)
  const decInfo = (v) => DECISIONS.find((d) => d.v === v) || DECISIONS.find((d) => d.v === 'pending')
  const evs = [...(student.evaluations || [])].sort(
    (a, b) => String(b.eval_date || '').localeCompare(String(a.eval_date || '')),
  )
  const handleDelete = async (e) => {
    if (!onDelete) return
    const who = e.evaluator_name || '（未填老師）'
    if (!window.confirm(`確定刪除「${who}」於 ${e.eval_date || ''} 的這筆評分？\n刪除後該生可重新評分，此動作無法復原。`)) return
    setBusyId(e.id)
    try { await onDelete(e) } finally { setBusyId(null) }
  }
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
              {e.translator_name ? <span style={{ fontSize: 12, color: '#15803d' }}>翻譯：{e.translator_name}</span> : null}
              <span style={{ fontSize: 12, color: '#888' }}>{e.eval_date || ''}</span>
              <Pill color={info.color} bg={info.bg}>{info.label}</Pill>
              <span style={{ marginLeft: 'auto', fontSize: 13 }}>
                總分 <b style={{ fontSize: 16 }}>{e.total_score ?? '—'}</b> / 40
              </span>
              {onDelete && (
                <Btn onClick={() => handleDelete(e)} disabled={busyId === e.id}
                  style={{ background: '#fee2e2', borderColor: '#fecaca', color: '#b91c1c', padding: '4px 10px', fontSize: 12 }}>
                  {busyId === e.id ? '刪除中…' : '🗑 刪除此筆'}
                </Btn>
              )}
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
  const [checkinRows, setCheckinRows] = useState([])  // stage2_checkins 原始列，map 於 render 時依學生面試日推導
  const [search, setSearch]       = useState('')
  const [active, setActive]       = useState(null)
  const [viewing, setViewing]     = useState(null)
  const [loading, setLoading]     = useState(false)
  const [saving, setSaving]       = useState(false)
  const [toast, setToast]         = useState(null)
  const [finishing, setFinishing] = useState(null)   // 今日總結 { total, admit, waitlist, reject, pending }
  const [showSOP, setShowSOP]     = useState(false)  // 翻譯工讀生須知
  const [infoLinks, setInfoLinks] = useState(null)   // info_links（首次開啟 SOP 時才載入）
  const [marking, setMarking]     = useState(null)   // 正在更新面試中標記的帳號

  const showToast = useCallback((msg, type = 'ok') => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3500)
  }, [])

  // 超級管理員可刪除誤送出的評分（老師端維持唯讀，避免老師自行刪改）
  const isSuper = getTeacher()?.role === 'superadmin'
  const deleteEval = async (e) => {
    try {
      await deleteEvaluation(e.id)
      // 若刪後該生本系已無任何評分，連動清掉本系派遣狀態（stage2_checkins），
      // 報到頁該志願回到「⚪ 待面試」可重新派出；保留主會議室報到列不動。
      const remain = (viewing?.evaluations || []).filter((x) => x.id !== e.id).length
      if (remain === 0 && viewing?.account) {
        try { await resetStage2CheckinDept(viewing.account, dept) } catch { /* 派遣列可能本就不存在 */ }
      }
      // 同步移除彈窗內該筆，再重撈名單/統計（評分歸零的學生會回到待評分）
      setViewing((v) => (v ? { ...v, evaluations: (v.evaluations || []).filter((x) => x.id !== e.id) } : v))
      await load()
      showToast(remain === 0 ? '已刪除評分並重設派遣狀態，該生回到待評分／待面試' : '已刪除該筆評分，該生可重新評分')
    } catch (e2) {
      showToast('刪除失敗：' + e2.message, 'error')
    }
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [list, st, quotas, checkins] = await Promise.all([
        getStage2List(dept), getStage2Stats(dept), getDepartmentQuotas(), getAllCheckins(),
      ])
      setStudents(list || [])
      setStats(st || EMPTY_STATS)
      setQuota(quotas?.[dept] ?? null)
      setCheckinRows(checkins || [])
    } catch (e) {
      showToast('載入失敗：' + e.message, 'error')
    } finally {
      setLoading(false)
    }
  }, [dept, showToast])

  useEffect(() => { if (evaluator) load() }, [evaluator, load])

  // 輕量更新：只重抓報到列，不重載整個名單（失敗靜默）
  const refreshCheckins = useCallback(async () => {
    try {
      setCheckinRows(await getAllCheckins() || [])
    } catch { /* ignore */ }
  }, [])

  // 報到狀態每 30 秒自動更新：行政端按報到後，老師端不必手動按更新。
  // interval closure 讀 ref 鏡像，避免吃到舊的 active（評分表開啟時暫停輪詢）。
  const activeRef = useRef(active)
  useEffect(() => { activeRef.current = active }, [active])
  useEffect(() => {
    if (!evaluator) return
    const id = setInterval(() => {
      if (document.hidden || activeRef.current) return
      refreshCheckins()
    }, 30000)
    // 從背景回到前景時立即刷新一次，不等下一輪
    const onVisible = () => { if (!document.hidden && !activeRef.current) refreshCheckins() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [evaluator, refreshCheckins])

  // 標記「面試中」：寫入本系 status='sent'，行政報到頁同步顯示🔵面試中
  const markInterview = async (stu) => {
    if (!checkinMap[stu.account]?.arrived) {
      const ok = window.confirm(`「${stu.name}」尚未在主會議室完成總報到。若考生已直接進入本系會議室，仍可標記為面試中（行政端會同步看到）。確定標記為面試中？`)
      if (!ok) return
    }
    setMarking(stu.account)
    try {
      await upsertCheckin({ account: stu.account, checkin_date: stu.stage2_date || localToday(), department: dept, status: 'sent' })
      await refreshCheckins()
      showToast(`已標記 ${stu.name} 面試中`)
    } catch (e) {
      showToast('標記失敗：' + e.message, 'error')
    } finally {
      setMarking(null)
    }
  }

  // 誤按取消：刪除本系那筆進度列，回到待面試
  const cancelInterview = async (stu) => {
    if (!window.confirm(`取消「${stu.name}」的面試中標記？`)) return
    setMarking(stu.account)
    try {
      await deleteCheckin(stu.account, stu.stage2_date || localToday(), dept)
      await refreshCheckins()
      showToast(`已取消 ${stu.name} 的面試中標記`)
    } catch (e) {
      showToast('取消失敗：' + e.message, 'error')
    } finally {
      setMarking(null)
    }
  }

  if (!evaluator) {
    const startEvaluator = (v) => {
      try {
        localStorage.setItem(EVAL_SESSION_KEY, JSON.stringify(v))
        localStorage.setItem(EVAL_NAME_KEY, v.name)
      } catch { /* ignore */ }
      setEvaluator(v)
    }
    return <EvaluatorGate dept={dept} onStart={startEvaluator} initialName={readRememberedName()} initialTranslator={readRememberedTranslator()} />
  }

  // 報到狀態 map 於每次 render 依「各學生自己的面試日」即時推導
  const checkinMap = buildDeptCheckinMap(checkinRows, dept, students)

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
        translator_name: evaluator.translator || null,
        department: dept,
        ...payload,
      })
      // 靜默同步行政報到頁膠囊為「已完成」（updated_at 留下完成時間），失敗不影響評分結果
      try { await upsertCheckin({ account: active.account, checkin_date: active.stage2_date || localToday(), department: dept, status: 'done' }) } catch { /* ignore */ }
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
      let translatorNames = ''
      try {
        const tr = await getStage2TranslatorsByDate(dept, evaluator.date)
        translatorNames = (tr || []).map((t) => t.translator_name).filter(Boolean).join('、')
      } catch { /* 撈不到翻譯名單不影響評分下載 */ }
      const decLabel = (v) => (DECISIONS.find((d) => d.v === v) || {}).label || v || ''
      const columns = [
        { key: 'evaluator_name',  label: '評分老師' },
        { key: 'translator_names', label: '翻譯同學' },
        { key: 'eval_date',       label: '評分日期' },
        { key: 'account',         label: '帳號' },
        { key: 'name',            label: '中文姓名' },
        { key: 'name_english',    label: '英文姓名' },
        { key: 'nationality',     label: '國籍' },
        { key: 'department',      label: '系所' },
        ...SCORE_ITEMS.map((it) => ({ key: it.key, label: it.label })),
        { key: 'total_score',     label: '總分' },
        { key: 'recommendation',  label: '建議' },
        { key: 'teacher_note',    label: '備註' },
      ]
      const rows = evs.map((e) => ({
        evaluator_name:  e.evaluator_name || '',
        translator_names: translatorNames,
        eval_date:       e.eval_date || '',
        account:         e.applications?.account || '',
        name:            e.applications?.name || '',
        name_english:    e.applications?.name_english || '',
        nationality:     e.applications?.nationality || '',
        department:      e.department || '',
        ...Object.fromEntries(SCORE_ITEMS.map((it) => [it.key, e.scores?.[it.key] ?? ''])),
        total_score:     e.total_score ?? '',
        recommendation:  decLabel(e.recommendation),
        teacher_note:    e.teacher_note || '',
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
  const openSOP = () => {
    setShowSOP(true)
    if (infoLinks === null) {
      getInfoLinks().then((rows) => setInfoLinks(rows || [])).catch(() => setInfoLinks([]))
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
          <span style={{ fontSize: 13, fontWeight: 600, color: '#f5f4f0', padding: '4px 10px', background: '#ffffff1a', borderRadius: 6 }}>
            {dept}
          </span>
          <span style={{ fontSize: 12, color: '#cbd5e1' }}>評分：{evaluator.name} · {evaluator.date}{evaluator.translator ? ` · 翻譯：${evaluator.translator}` : ''}</span>
          {!active && <button onClick={openFinish} style={{ ...ghostBtn, background: '#ffffff22', fontWeight: 600 }}>完成今日評分</button>}
          <button onClick={() => { window.location.hash = '#/stage2' }} style={ghostBtn}>← 返回各系</button>
        </div>
      }
    >
      {active ? (
        <ScoreForm student={active} evaluator={evaluator} onSave={handleSave} onBack={() => setActive(null)} saving={saving} />
      ) : (
        <>
          {/* 工具列：搜尋＋報到狀態更新＋下載（從 header 移下來，header 只留主要動作） */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
            <input
              style={{ ...s.input, width: 220, marginBottom: 0 }}
              placeholder="搜尋帳號 / 姓名"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Btn onClick={load}>🔄 更新報到狀態</Btn>
            <Btn onClick={openSOP} style={{ background: '#ecfdf5', borderColor: '#86efac', color: '#15803d', fontWeight: 600 }}>🌐 翻譯工讀生須知</Btn>
            <span style={{ fontSize: 11, color: '#aaa' }}>報到狀態每 30 秒自動更新</span>
            <div style={{ flex: 1 }} />
            <Btn onClick={downloadToday}>⬇ 下載今日評分</Btn>
          </div>

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
            <Stage2List students={unscored} onOpen={setActive} loading={loading} checkinMap={checkinMap}
              onMarkInterview={markInterview} onCancelInterview={cancelInterview} markingAccount={marking} />
          </Card>

          <Card>
            <CardHead left={`${dept} · 已評分`} right={`${scored.length} 位`} />
            <Stage2List students={scored} onOpen={setActive} onView={setViewing} loading={loading} showEvalSummary />
          </Card>
        </>
      )}

      {viewing && (
        <EvalDetailModal
          student={viewing}
          onDelete={isSuper ? deleteEval : undefined}
          onClose={() => setViewing(null)}
        />
      )}

      {showSOP && (
        <TranslatorSOPModal dept={dept} links={infoLinks} onClose={() => setShowSOP(false)} />
      )}

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
