import { useState, useEffect, useCallback } from 'react'
import { PageShell } from '../components/PageShell'
import { Card, CardHead, s } from '../components/UI'
import Stage1List from '../components/Stage1List'
import Stage1ScoreForm from '../components/Stage1ScoreForm'
import Stage1EvalDetailModal from '../components/Stage1EvalDetailModal'
import MailComposer from '../components/MailComposer'
import { getStage1List, getStage1Pending, getStage1Records, saveStage1Checkin, saveStage1Score } from '../api'
import { getTeacher, logoutTeacher } from '../auth'

const localToday = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// records[account] 現為陣列（多老師各一筆）。把儲存後的單筆 saved 併回對應帳號的陣列：
// 已有同 id / 同 teacher_id 的就取代，否則 append。
function mergeRec(map, account, saved) {
  const list = map[account] || []
  const idx = list.findIndex((r) => (saved.id && r.id === saved.id) || r.teacher_id === saved.teacher_id)
  const next = idx >= 0 ? list.map((r, i) => (i === idx ? { ...r, ...saved } : r)) : [...list, saved]
  return { ...map, [account]: next }
}

export default function Stage1App() {
  const teacher = getTeacher()
  const [date, setDate]         = useState(localToday)
  const [showAll, setShowAll]   = useState(false)
  const [students, setStudents] = useState([])
  const [records, setRecords]   = useState({})   // { [account]: stage1_record[] }（多老師各一筆）
  const [draft, setDraft]       = useState({})
  const [loading, setLoading]   = useState(false)
  const [savingId, setSavingId] = useState(null)
  const [scoringStu, setScoringStu] = useState(null)  // 評分中的學生
  const [scoreSaving, setScoreSaving] = useState(false)
  const [viewing, setViewing]   = useState(null)  // 查看評分中的學生 { account, ... }
  const [search, setSearch]     = useState('')
  const [toast, setToast]       = useState(null)
  const [showMail, setShowMail] = useState(false)
  const isAdmin = teacher?.role === 'superadmin'

  const myId = teacher?.id
  // 目前登入老師對該帳號的那筆評分紀錄（每位老師只看/改自己的）
  const ownRec = (account) => (records[account] || []).find((r) => r.teacher_id === myId)
  // 該帳號是否有任一老師建議通過（產出名單以此為準）
  const anyPass = (account) => (records[account] || []).some((r) => r.recommendation === 'pass')

  // 守衛：未登入導回登入頁
  useEffect(() => { if (!teacher) window.location.hash = '#/login?stage=1' }, [teacher])

  const showToast = useCallback((msg, type = 'ok') => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3500)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const list = (showAll ? await getStage1Pending() : await getStage1List(date)) || []
      const recList = (await getStage1Records(date)) || []
      // 以 account 建 map，值為陣列（同帳號可有多位老師各一筆）。忽略尚未帶 account 的舊資料。
      const recMap = {}
      for (const r of recList) {
        if (!r.account) continue
        if (!recMap[r.account]) recMap[r.account] = []
        recMap[r.account].push(r)
      }
      setStudents(list)
      setRecords(recMap)
      // 既有簽到的 appeared / 備註帶回草稿（取目前登入老師自己的那筆）
      setDraft(Object.fromEntries(list.map((stu) => {
        const own = (recMap[stu.account] || []).find((r) => r.teacher_id === myId)
        return [stu.account, { appeared: !!own?.appeared, note: own?.teacher_note || '' }]
      })))
    } catch (e) {
      showToast('載入失敗：' + e.message, 'error')
    } finally {
      setLoading(false)
    }
  }, [date, showAll, showToast, myId])

  useEffect(() => { load() }, [load])

  const patch = (id, p) => setDraft((d) => ({ ...d, [id]: { ...d[id], ...p } }))

  const saveRow = async (stu) => {
    setSavingId(stu.account)
    try {
      const d = draft[stu.account] || {}
      const res = await saveStage1Checkin({
        account: stu.account,
        application_id: stu.id,            // 主志願 id（備查）
        record_date: date,
        appeared: !!d.appeared,
        confirmed_dept: stu.department || null,
        teacher_note: d.note || null,
      })
      const saved = Array.isArray(res) ? res[0] : res
      if (saved) setRecords((m) => mergeRec(m, stu.account, saved))
      showToast(`已儲存 ${stu.name} 的簽到`)
    } catch (e) {
      showToast('儲存失敗：' + e.message, 'error')
    } finally {
      setSavingId(null)
    }
  }

  const handleSaveScore = async (payload) => {
    setScoreSaving(true)
    try {
      // 評分寫入該老師自己的那筆 stage1_records；若尚未簽到先建立一筆（帶入草稿的出席/備註）
      let own = ownRec(scoringStu.account)
      if (!own?.id) {
        const d = draft[scoringStu.account] || {}
        const res0 = await saveStage1Checkin({
          account: scoringStu.account,
          application_id: scoringStu.id,
          record_date: date,
          appeared: !!d.appeared,
          confirmed_dept: scoringStu.department || null,
          teacher_note: d.note || null,
        })
        own = Array.isArray(res0) ? res0[0] : res0
        if (own) setRecords((m) => mergeRec(m, scoringStu.account, own))
      }
      if (!own?.id) { showToast('建立簽到紀錄失敗，請重試', 'error'); return }
      const res = await saveStage1Score(own.id, payload)
      const saved = Array.isArray(res) ? res[0] : res
      if (saved) setRecords((m) => mergeRec(m, scoringStu.account, saved))
      showToast(`已儲存 ${scoringStu.name} 的評分`)
      setScoringStu(null)
    } catch (e) {
      showToast('儲存評分失敗：' + e.message, 'error')
    } finally {
      setScoreSaving(false)
    }
  }

  // 搜尋（帳號 / 姓名，不分大小寫）；只影響名單顯示，統計仍以完整名單為準
  const q = search.trim().toLowerCase()
  const filtered = students.filter((stu) =>
    !q ||
    (stu.account || '').toLowerCase().includes(q) ||
    (stu.name || '').toLowerCase().includes(q),
  )

  const appearedCount = students.filter((stu) => draft[stu.account]?.appeared).length
  const passCount = students.filter((stu) => anyPass(stu.account)).length

  if (!teacher) return null

  return (
    <PageShell
      title="實踐大學" subtitle="第一階段 · 簽到評分" accent="#1e3a8a" toast={toast} intlBack stageKey="stage1"
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
      {scoringStu ? (
        <Stage1ScoreForm
          student={scoringStu}
          initial={ownRec(scoringStu.account)}
          onSave={handleSaveScore}
          onBack={() => setScoringStu(null)}
          saving={scoreSaving}
        />
      ) : (
       <>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 13, color: '#555' }}>面試日期</label>
        <input type="date" style={{ ...s.input, marginBottom: 0, width: 'auto' }}
          value={date} onChange={(e) => setDate(e.target.value)} disabled={showAll} />
        <label style={{ fontSize: 13, color: '#555', display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
          顯示全部未排期 / 未通過
        </label>
        <input
          style={{ ...s.input, marginBottom: 0, width: 180 }}
          placeholder="搜尋帳號 / 姓名"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span style={{ fontSize: 12, color: '#aaa' }}>應試 {students.length} 位 · 已到 {appearedCount} 位 · 建議通過 {passCount} 位</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {isAdmin && <button onClick={() => setShowMail(true)} style={{ ...s.btn }}>✉ 寄送一階通知</button>}
        </div>
      </div>

      <Card>
        <CardHead left={showAll ? '未通過名單' : `${date} 應試名單`} right={`${filtered.length} / ${students.length} 位`} />
        <Stage1List
          students={filtered} draft={draft} onChange={patch}
          onSaveRow={saveRow} savingId={savingId} loading={loading}
          records={records} myId={myId} onScore={setScoringStu} onView={setViewing}
        />
      </Card>

      <div style={{ fontSize: 12, color: '#aaa', marginTop: 12, lineHeight: 1.6 }}>
        說明：學生的中心已由行政人員事先登記，此處唯讀顯示。逐列確認出席、填備註後按「儲存簽到」；
        簽到後出席者可按「評分 →」開啟評分表，可按「查看」檢視各老師的評分內容。
        實體面試結果由行政人員在「實體面試確認名單」階段確認後，才會進入第二階段各系評分。
      </div>
       </>
      )}
      {viewing && (
        <Stage1EvalDetailModal student={viewing} recs={records[viewing.account] || []} onClose={() => setViewing(null)} />
      )}
      {showMail && (
        <MailComposer stage="1" kind="s1_invite" recipients={students}
          onClose={() => setShowMail(false)} onToast={showToast} />
      )}
    </PageShell>
  )
}
