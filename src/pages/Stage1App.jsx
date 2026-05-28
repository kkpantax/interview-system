import { useState, useEffect, useCallback } from 'react'
import { PageShell } from '../components/PageShell'
import { Btn, Card, CardHead, s } from '../components/UI'
import ExportBtn from '../components/ExportBtn'
import Stage1List from '../components/Stage1List'
import Stage1ScoreForm from '../components/Stage1ScoreForm'
import { getStage1List, getStage1Pending, getStage1Records, saveStage1Checkin, saveStage1Score, markStage1PassedByAccount } from '../api'
import { getTeacher, logoutTeacher } from '../auth'
import { DECISIONS_STAGE1 } from '../constants'

const localToday = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const recLabel = (v) => DECISIONS_STAGE1.find((d) => d.v === v)?.label || ''

const EXPORT_COLS = [
  { key: 'account',        label: '帳號' },
  { key: 'name',           label: '中文姓名' },
  { key: 'name_english',   label: '英文姓名' },
  { key: 'departments',    label: '報考志願' },
  { key: 'nationality',    label: '國籍' },
  { key: 'center',         label: '中心' },
  { key: 'appeared',       label: '出席' },
  { key: 'total_score',    label: '評分總分' },
  { key: 'recommendation', label: '建議' },
  { key: 'note',           label: '備註' },
]

export default function Stage1App() {
  const teacher = getTeacher()
  const [date, setDate]         = useState(localToday)
  const [showAll, setShowAll]   = useState(false)
  const [students, setStudents] = useState([])
  const [records, setRecords]   = useState({})   // { [account]: stage1_record }
  const [draft, setDraft]       = useState({})
  const [loading, setLoading]   = useState(false)
  const [savingId, setSavingId] = useState(null)
  const [scoringStu, setScoringStu] = useState(null)  // 評分中的學生
  const [scoreSaving, setScoreSaving] = useState(false)
  const [producing, setProducing] = useState(false)
  const [search, setSearch]     = useState('')
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
      const recList = (await getStage1Records(date)) || []
      // 以 account 建 map（一個人一筆簽到/評分）。忽略尚未帶 account 的舊資料。
      const recMap = Object.fromEntries(recList.filter((r) => r.account).map((r) => [r.account, r]))
      setStudents(list)
      setRecords(recMap)
      // 既有簽到的 appeared / 備註帶回草稿
      setDraft(Object.fromEntries(list.map((stu) => {
        const rec = recMap[stu.account]
        return [stu.account, { appeared: !!rec?.appeared, note: rec?.teacher_note || '' }]
      })))
    } catch (e) {
      showToast('載入失敗：' + e.message, 'error')
    } finally {
      setLoading(false)
    }
  }, [date, showAll, showToast])

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
      if (saved) setRecords((m) => ({ ...m, [stu.account]: { ...m[stu.account], ...saved } }))
      showToast(`已儲存 ${stu.name} 的簽到`)
    } catch (e) {
      showToast('儲存失敗：' + e.message, 'error')
    } finally {
      setSavingId(null)
    }
  }

  const handleSaveScore = async (payload) => {
    const rec = records[scoringStu.account]
    if (!rec?.id) { showToast('找不到簽到紀錄，請先儲存簽到', 'error'); return }
    setScoreSaving(true)
    try {
      const res = await saveStage1Score(rec.id, payload)
      const saved = Array.isArray(res) ? res[0] : res
      if (saved) setRecords((m) => ({ ...m, [scoringStu.account]: { ...m[scoringStu.account], ...saved } }))
      showToast(`已儲存 ${scoringStu.name} 的評分`)
      setScoringStu(null)
    } catch (e) {
      showToast('儲存評分失敗：' + e.message, 'error')
    } finally {
      setScoreSaving(false)
    }
  }

  const produce = async () => {
    // 只把「建議通過」的學生標記為通過一階；同帳號所有志願一起標記
    const passed = students.filter((stu) => records[stu.account]?.recommendation === 'pass')
    if (!passed.length) { showToast('尚未有評分為「建議通過」的學生', 'warn'); return }
    setProducing(true)
    try {
      for (const stu of passed) await markStage1PassedByAccount(stu.account, date)
      showToast(`已產出今日通過名單：${passed.length} 位`)
      await load()
    } catch (e) {
      showToast('產出失敗：' + e.message, 'error')
    } finally {
      setProducing(false)
    }
  }

  const exportRows = students.map((stu) => {
    const rec = records[stu.account]
    return {
      account: stu.account, name: stu.name, name_english: stu.name_english,
      departments: (stu.allDepts || []).map((d) => `${d.preference_order ?? '?'}.${d.department}`).join(' / '),
      nationality: stu.nationality,
      center: stu.center || '',
      appeared: draft[stu.account]?.appeared ? '已到' : '未到',
      total_score: rec?.total_score ?? '',
      recommendation: recLabel(rec?.recommendation),
      note: draft[stu.account]?.note || '',
    }
  })

  // 搜尋（帳號 / 姓名，不分大小寫）；只影響名單顯示，統計與產出仍以完整名單為準
  const q = search.trim().toLowerCase()
  const filtered = students.filter((stu) =>
    !q ||
    (stu.account || '').toLowerCase().includes(q) ||
    (stu.name || '').toLowerCase().includes(q),
  )

  const appearedCount = students.filter((stu) => draft[stu.account]?.appeared).length
  const passCount = students.filter((stu) => records[stu.account]?.recommendation === 'pass').length

  if (!teacher) return null

  return (
    <PageShell
      title="實踐大學" subtitle="第一階段 · 簽到評分" accent="#1e3a8a" toast={toast}
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
          initial={records[scoringStu.account]}
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
          <ExportBtn columns={EXPORT_COLS} rows={exportRows} filename={`第一階段簽到評分表_${date}.xlsx`}
            label="⬇ 下載名單" disabled={!students.length} onEmpty={() => showToast('沒有可下載的名單', 'warn')} />
          <Btn variant="green" onClick={produce} disabled={producing || !passCount}>
            {producing ? '產出中…' : `產出今日通過名單（${passCount}）`}
          </Btn>
        </div>
      </div>

      <Card>
        <CardHead left={showAll ? '未通過名單' : `${date} 應試名單`} right={`${filtered.length} / ${students.length} 位`} />
        <Stage1List
          students={filtered} draft={draft} onChange={patch}
          onSaveRow={saveRow} savingId={savingId} loading={loading}
          records={records} onScore={setScoringStu}
        />
      </Card>

      <div style={{ fontSize: 12, color: '#aaa', marginTop: 12, lineHeight: 1.6 }}>
        說明：學生的中心已由行政人員事先登記，此處唯讀顯示。逐列確認出席、填備註後按「儲存簽到」；
        簽到後出席者可按「評分 →」開啟評分表，完成後狀態列顯示建議；
        最後按「產出今日通過名單」把所有「建議通過」的學生標記為通過第一階段。
      </div>
       </>
      )}
    </PageShell>
  )
}
