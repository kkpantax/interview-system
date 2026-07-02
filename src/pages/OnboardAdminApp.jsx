import { useState, useEffect, useCallback, useRef } from 'react'
import * as XLSX from 'xlsx'
import { PageShell } from '../components/PageShell'
import { Btn, Card, CardHead, Pill, s } from '../components/UI'
import { onboardAdminList, onboardAdminConfirm, onboardAdminAbandon, onboardAdminReactivate,
  onboardAdminGetSettings, onboardAdminSaveSettings, onboardAdminSaveLineQr, onboardAdminSaveContacts,
  onboardAdminImportStudents, onboardAdminNameRequests, onboardAdminNameReview } from '../api'
import { getTeacher, logoutTeacher } from '../auth'
import { ENROLL_STEPS, deptZhFull } from '../constants'

// 入學準備後台（superadmin 專用）。掛 #/onboard-admin，StageNav 顯示「⑤ 入學準備」。
// 資料經 /api/onboard-admin（service role），操作需帶超管帳密——本頁用一次性密碼閘門
// 取得密碼後快取於記憶體（不落地 storage）重用。整體結構鏡像 Stage4App。
// 頂部兩維度篩選：梯次（伺服器端）× 校區（前端，讓總覽分校區小計恆能並列兩校區）。
const ACCENT = '#7c2d12'

// enroll_progress.state → 顯示
const STATE_META = {
  locked:    { label: '未開放', color: '#9ca3af', bg: '#f3f4f6' },
  open:      { label: '待處理', color: '#7c2d12', bg: '#fff7ed' },
  submitted: { label: '待確認', color: '#b45309', bg: '#fef3c7' },
  confirmed: { label: '已完成', color: '#15803d', bg: '#dcfce7' },
}

const TABS = [
  { key: 'overview',  label: '總覽' },
  ...ENROLL_STEPS.map((st) => ({ key: String(st.step), label: `${'①②③④⑤'[st.step - 1]} ${st.zh}` })),
  { key: 'abandoned', label: '✕ 已放棄' },
  { key: 'settings',  label: '⚙ 設定' },
  { key: 'import',    label: '⇪ 匯入' },
]

// 步驟2/3 需要行政確認（步驟1/4 學生送出即過、步驟5 學生閱讀即過）
const NEEDS_CONFIRM = new Set([2, 3])

const fmtTime = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d)) return String(iso)
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const stepStateOf = (stu, step) => stu.steps?.[step]?.state || 'locked'

// timestamptz ISO → 台北時區的日期字串（YYYY-MM-DD，供 <input type="date">）
// 截止日一律存為當日台北 23:59:59，這裡固定 +8h 取 UTC 日期，不受瀏覽器時區影響
const isoToTpeDate = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d)) return ''
  const t = new Date(d.getTime() + 8 * 3600 * 1000)
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`
}

const CAMPUSES = ['台北', '高雄']
const NOTICE_LANGS = [['zh', '中文'], ['en', 'English'], ['vi', 'Tiếng Việt'], ['id', 'Bahasa Indonesia']]
const emptyLangs = () => ({ zh: '', en: '', vi: '', id: '' })
const emptyContact = () => ({ name: '', email: '', phone: '' })

// 批次匯入的欄位定義：中文標題（Excel 表頭）↔ enroll_students 欄名；account 為對應鍵
const IMPORT_COLS = [
  { key: 'account',    label: '帳號' },
  { key: 'student_id', label: '學號' },
  { key: 'dorm_room',  label: '房號' },
  { key: 'dorm_bed',   label: '床位號' },
  { key: 'classroom',  label: '上課教室' },
]
const IMPORT_FIELD_KEYS = IMPORT_COLS.slice(1).map((c) => c.key)
const importLabel = (key) => IMPORT_COLS.find((c) => c.key === key)?.label || key

// 頂端統計卡片（同 Stage4App 風格）
function StatStrip({ items }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
      {items.map((it) => (
        <div key={it.label} style={{ flex: '1 1 120px', minWidth: 104, background: it.bg || '#faf9f6',
          border: '1px solid ' + (it.border || '#eceae5'), borderRadius: 12, padding: '10px 14px' }}>
          <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.1, color: it.color || '#1a1a18' }}>{it.value}</div>
          <div style={{ fontSize: 12, color: '#888', marginTop: 3 }}>{it.label}</div>
          {it.sub != null && <div style={{ fontSize: 11, color: '#aaa', marginTop: 1 }}>{it.sub}</div>}
        </div>
      ))}
    </div>
  )
}

export default function OnboardAdminApp() {
  const teacher = getTeacher()
  useEffect(() => { if (!teacher || teacher.role !== 'superadmin') window.location.hash = '#/login?stage=admin' }, [teacher])

  const [pw, setPw] = useState('')          // 快取的超管密碼（記憶體）
  const [pwInput, setPwInput] = useState('')
  const [authed, setAuthed] = useState(false)
  const [data, setData] = useState([])
  const [tab, setTab] = useState('overview')
  const [batch, setBatch] = useState('all')
  const [campus, setCampus] = useState('all')   // 校區在前端篩：分校區小計需同時看到兩校區
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState(null)

  const showToast = useCallback((msg, type = 'ok') => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3500)
  }, [])

  const load = useCallback(async (b, password) => {
    const bb = b ?? batch
    const pp = password ?? pw
    setLoading(true)
    try {
      const res = await onboardAdminList(teacher.username, pp, bb)
      setData(res.list || [])
      setAuthed(true)
    } catch (e) {
      if (e.status === 401 || e.status === 403) { setAuthed(false); showToast(e.message, 'error') }
      else showToast('載入失敗：' + e.message, 'error')
    } finally { setLoading(false) }
  }, [batch, pw, teacher, showToast])

  const doAuth = async () => {
    if (!pwInput.trim() || busy) return
    setBusy(true)
    setPw(pwInput)
    await load(batch, pwInput)
    setBusy(false)
  }

  const changeBatch = (b) => { setBatch(b); if (authed) load(b, pw) }

  const doConfirm = async (stu, step) => {
    if (busy) return
    if (!window.confirm(`確認「${stu.name || stu.account}」的『${ENROLL_STEPS[step - 1]?.zh}』已完成？\n將標記為已確認並開啟下一步。`)) return
    setBusy(true)
    try {
      await onboardAdminConfirm(teacher.username, pw, stu.account, step)
      showToast(`已確認 ${stu.name || stu.account} 的${ENROLL_STEPS[step - 1]?.zh}`)
      await load()
    } catch (e) { showToast('確認失敗：' + e.message, 'error') }
    finally { setBusy(false) }
  }

  const doAbandon = async (stu) => {
    if (busy) return
    const reason = window.prompt(`確定要將「${stu.name || stu.account}」標記為放棄入學？\n可填寫原因（將記錄於稽核軌跡，可留空）：`, '')
    if (reason === null) return   // 取消
    setBusy(true)
    try {
      await onboardAdminAbandon(teacher.username, pw, stu.account, reason.trim())
      showToast(`已將 ${stu.name || stu.account} 標記為放棄`)
      await load()
    } catch (e) { showToast('操作失敗：' + e.message, 'error') }
    finally { setBusy(false) }
  }

  // ── 中文姓名更改待審（步驟1分頁內）─────────────────────────────────────────
  const [nameReqs, setNameReqs] = useState([])
  const loadNameReqs = useCallback(async (password) => {
    try {
      const res = await onboardAdminNameRequests(teacher.username, password ?? pw)
      setNameReqs(res.list || [])
    } catch (e) { showToast('載入更名申請失敗：' + e.message, 'error') }
  }, [pw, teacher, showToast])

  useEffect(() => { if (authed && tab === '1') loadNameReqs() }, [authed, tab, loadNameReqs])

  const doNameReview = async (r, decision) => {
    if (busy) return
    let note = ''
    if (decision === 'approve') {
      if (!window.confirm(`核准更名「${r.old_name || '—'} → ${r.new_name}」？\n將直接更新學生（${r.account}）的中文姓名。`)) return
    } else {
      const v = window.prompt(`駁回「${r.old_name || '—'} → ${r.new_name}」的更名申請？\n可填寫備註（將記錄於申請，可留空）：`, '')
      if (v === null) return   // 取消
      note = v.trim()
    }
    setBusy(true)
    try {
      await onboardAdminNameReview(teacher.username, pw, { id: r.id, decision, note })
      showToast(decision === 'approve' ? `已核准更名：${r.old_name || r.account} → ${r.new_name}` : '已駁回更名申請')
      await Promise.all([loadNameReqs(), load()])   // 名單姓名可能已變，一併重抓
    } catch (e) { showToast('操作失敗：' + e.message, 'error') }
    finally { setBusy(false) }
  }

  const doReactivate = async (stu) => {
    if (busy) return
    if (!window.confirm(`確定要復原「${stu.name || stu.account}」？將把狀態改回「進行中」。`)) return
    setBusy(true)
    try {
      await onboardAdminReactivate(teacher.username, pw, stu.account)
      showToast(`已復原 ${stu.name || stu.account}`)
      await load()
    } catch (e) { showToast('復原失敗：' + e.message, 'error') }
    finally { setBusy(false) }
  }

  // ── 設定分頁：每步截止日 + 承辦窗口（分校區） + 步驟5行前須知（校區×四語） + LINE QR ──
  const [cfgLoaded, setCfgLoaded] = useState(false)
  const [rowForm, setRowForm] = useState({})   // { `${batch}-${step}`: {deadline: 'YYYY-MM-DD'} }
  const [notice, setNotice] = useState({ 台北: emptyLangs(), 高雄: emptyLangs() })
  const [contacts, setContacts] = useState({ 台北: emptyContact(), 高雄: emptyContact() })
  const [qrForm, setQrForm] = useState({ 台北: '', 高雄: '' })

  const loadSettings = useCallback(async (password) => {
    const pp = password ?? pw
    setLoading(true)
    try {
      const res = await onboardAdminGetSettings(teacher.username, pp)
      const rows = res.settings || []
      const f = {}
      for (const r of rows) f[`${r.batch}-${r.step}`] = { deadline: isoToTpeDate(r.deadline) }
      setRowForm(f)
      // 行前須知以第一梯 step5 為準（兩梯共通儲存）。舊格式相容：
      // 純字串 → 兩校區 zh；{台北:"字串"} → 該校區 zh；{台北:{zh,...}} → 原樣帶入
      const n5 = rows.find((r) => String(r.batch) === '1' && Number(r.step) === 5)?.extra?.notice
      const next = { 台北: emptyLangs(), 高雄: emptyLangs() }
      if (typeof n5 === 'string') { next['台北'].zh = n5; next['高雄'].zh = n5 }
      else if (n5 && typeof n5 === 'object') {
        for (const c of CAMPUSES) {
          const v = n5[c]
          if (typeof v === 'string') next[c].zh = v
          else if (v && typeof v === 'object') for (const [lk] of NOTICE_LANGS) next[c][lk] = v[lk] || ''
        }
      }
      setNotice(next)
      // 承辦窗口以 enroll_config 為準（enroll_settings 的舊 contact_* 欄不搬、不再顯示）
      setContacts({
        台北: { ...emptyContact(), ...(res.contacts?.['台北'] || {}) },
        高雄: { ...emptyContact(), ...(res.contacts?.['高雄'] || {}) },
      })
      setQrForm({ 台北: res.line_qr?.['台北'] || '', 高雄: res.line_qr?.['高雄'] || '' })
      setCfgLoaded(true)
    } catch (e) { showToast('載入設定失敗：' + e.message, 'error') }
    finally { setLoading(false) }
  }, [pw, teacher, showToast])

  useEffect(() => {
    if (authed && tab === 'settings' && !cfgLoaded) loadSettings()
  }, [authed, tab, cfgLoaded, loadSettings])

  const saveRow = async (b, step) => {
    if (busy) return
    const f = rowForm[`${b}-${step}`] || {}
    setBusy(true)
    try {
      // deadline 傳日期字串（YYYY-MM-DD），由後端組成當日台北 23:59:59
      await onboardAdminSaveSettings(teacher.username, pw, { batch: b, step, deadline: f.deadline || null })
      showToast(`已儲存 ${b === '1' ? '第一梯' : '第二梯'}「${ENROLL_STEPS[step - 1]?.zh}」截止日`)
      await loadSettings()
    } catch (e) { showToast('儲存失敗：' + e.message, 'error') }
    finally { setBusy(false) }
  }

  const saveContacts = async () => {
    if (busy) return
    setBusy(true)
    try {
      await onboardAdminSaveContacts(teacher.username, pw, contacts)
      showToast('已儲存承辦窗口')
      await loadSettings()
    } catch (e) { showToast('儲存失敗：' + e.message, 'error') }
    finally { setBusy(false) }
  }

  const saveNotice = async () => {
    if (busy) return
    setBusy(true)
    try {
      const n = { 台北: notice['台北'], 高雄: notice['高雄'] }
      await onboardAdminSaveSettings(teacher.username, pw, { batch: '1', step: 5, notice: n })
      await onboardAdminSaveSettings(teacher.username, pw, { batch: '2', step: 5, notice: n })
      showToast('已儲存行前須知（兩梯次共通）')
      await loadSettings()
    } catch (e) { showToast('儲存失敗：' + e.message, 'error') }
    finally { setBusy(false) }
  }

  const saveLineQr = async () => {
    if (busy) return
    setBusy(true)
    try {
      await onboardAdminSaveLineQr(teacher.username, pw, { 台北: qrForm['台北'].trim(), 高雄: qrForm['高雄'].trim() })
      showToast('已儲存 LINE 群組 QR 設定')
      await loadSettings()
    } catch (e) { showToast('儲存失敗：' + e.message, 'error') }
    finally { setBusy(false) }
  }

  // ── 匯入分頁：Excel 解析 → 預覽 → 確認 → 批次 upsert ──────────────────────────
  const [impFileName, setImpFileName] = useState('')
  const [impError, setImpError] = useState('')
  const [impPreview, setImpPreview] = useState(null)  // { updates:[{account,name,fields}], notFound:[account], emptyN }
  const [impResult, setImpResult] = useState(null)    // { updated, skipped:[account] }
  const impFileRef = useRef()

  const downloadTemplate = () => {
    const aoa = [
      IMPORT_COLS.map((c) => c.label),
      ['11510001', '', 'A-512', '2', 'M301'],
    ]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), '匯入')
    XLSX.writeFile(wb, 'enroll_import_template.xlsx')
  }

  const handleImportFile = (e) => {
    const file = e.target.files[0]
    e.target.value = ''   // 清掉 value，允許重選同一個檔案
    if (!file || busy) return
    setImpFileName(file.name); setImpError(''); setImpPreview(null); setImpResult(null)
    const reader = new FileReader()
    reader.onload = async (evt) => {
      setBusy(true)
      try {
        // 1) 解析第一個工作表，認中文標題對欄（欄序不拘）
        const wb = XLSX.read(evt.target.result, { type: 'array', cellDates: true })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false, blankrows: false })
        const normH = (v) => String(v ?? '').replace(/\s+/g, '')
        let hIdx = -1
        for (let i = 0; i < Math.min(aoa.length, 10); i++) {
          if ((aoa[i] || []).some((c) => normH(c) === '帳號')) { hIdx = i; break }
        }
        if (hIdx < 0) throw new Error('找不到標題列：工作表需含「帳號」欄（可先下載範本）')
        const header = (aoa[hIdx] || []).map(normH)
        const colIdx = Object.fromEntries(IMPORT_COLS.map((c) => [c.key, header.indexOf(c.label)]))

        // 2) 逐列收集：以帳號合併（同帳號多列時，後列有值欄覆蓋前列），空欄不納入
        const byAcct = new Map()
        for (const r of aoa.slice(hIdx + 1)) {
          const account = String(r[colIdx.account] ?? '').trim()
          if (!account) continue
          const cur = byAcct.get(account) || {}
          for (const k of IMPORT_FIELD_KEYS) {
            const v = colIdx[k] >= 0 ? String(r[colIdx[k]] ?? '').trim() : ''
            if (v !== '') cur[k] = v
          }
          byAcct.set(account, cur)
        }
        if (!byAcct.size) throw new Error('檔案裡沒有任何含帳號的資料列')

        // 3) 撈完整名單比對帳號（batch=all，不受上方梯次/校區篩選影響）
        const res = await onboardAdminList(teacher.username, pw, 'all')
        const known = new Map((res.list || []).map((x) => [x.account, x]))
        const updates = [], notFound = []
        let emptyN = 0
        for (const [account, fields] of byAcct) {
          if (!known.has(account)) { notFound.push(account); continue }
          if (!Object.keys(fields).length) { emptyN++; continue }
          updates.push({ account, name: known.get(account)?.name, fields })
        }
        setImpPreview({ updates, notFound, emptyN })
      } catch (err) { setImpError(err.message) }
      finally { setBusy(false) }
    }
    reader.readAsArrayBuffer(file)
  }

  const doImport = async () => {
    if (!impPreview?.updates.length || busy) return
    if (!window.confirm(`確認匯入？將更新 ${impPreview.updates.length} 筆學生的學號／宿舍資訊（空欄不覆蓋）。`)) return
    setBusy(true)
    try {
      const res = await onboardAdminImportStudents(teacher.username, pw,
        impPreview.updates.map((u) => ({ account: u.account, fields: u.fields })))
      setImpResult({ updated: res.updated ?? 0, skipped: res.skipped || [] })
      setImpPreview(null); setImpFileName('')
      showToast(`匯入完成：更新 ${res.updated ?? 0} 筆`)
      await load()   // 重抓名單
    } catch (e) { showToast('匯入失敗：' + e.message, 'error') }
    finally { setBusy(false) }
  }

  const headerBtn = { background: 'none', borderColor: '#ffffff44', color: '#fde7d4' }
  const th = { padding: '9px 10px', textAlign: 'left', borderBottom: '1px solid #e8e7e3', color: '#666', fontWeight: 500, fontSize: 12 }
  const td = { padding: '8px 10px', borderBottom: '1px solid #f5f4f0', fontSize: 13 }

  // ── 密碼閘門（尚未通過驗證）─────────────────────────────────────────────────
  if (!authed) {
    return (
      <PageShell title="實踐大學" subtitle="入學準備 · 後台管理" accent={ACCENT} toast={toast} intlBack stageKey="onboard"
        right={<span style={{ fontSize: 12, color: '#fde7d4' }}>{teacher?.display_name || teacher?.username}</span>}>
        <Card style={{ maxWidth: 420, margin: '40px auto' }}>
          <CardHead left="超級管理員驗證" />
          <div style={{ padding: '4px 2px' }}>
            <div style={{ fontSize: 13, color: '#666', lineHeight: 1.7, marginBottom: 12 }}>
              入學準備後台涉及學生資料與放棄操作，請再次輸入您的超管密碼以載入。
            </div>
            <input type="password" value={pwInput} autoFocus
              onChange={(e) => setPwInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') doAuth() }}
              placeholder="超級管理員密碼"
              style={{ ...s.input, width: '100%', boxSizing: 'border-box', marginBottom: 12 }} />
            <Btn variant="primary" style={{ width: '100%' }} disabled={busy || !pwInput.trim()} onClick={doAuth}>
              {busy ? '驗證中…' : '載入後台'}
            </Btn>
          </div>
        </Card>
      </PageShell>
    )
  }

  // ── 已驗證：統計與名單 ──────────────────────────────────────────────────────
  // 梯次已在伺服器端篩過（data 即該梯次），校區於此處前端篩，兩維度同時作用於所有數字與名單
  const visible = campus === 'all' ? data : data.filter((x) => x.campus === campus)
  const active = visible.filter((x) => x.status !== 'abandoned')
  const completedN = visible.filter((x) => x.status === 'completed').length
  const abandonedList = visible.filter((x) => x.status === 'abandoned')
  const denom = active.length   // 分母排除已放棄

  // 各步「卡關中」= 該步 open/submitted（非放棄）
  const stuckAt = (step) => active.filter((x) => x.status !== 'completed'
    && ['open', 'submitted'].includes(stepStateOf(x, step)))
  const countState = (step, state) => active.filter((x) => stepStateOf(x, step) === state).length

  // 分校區小計：從 data（僅梯次篩過）計算，切到單一校區時仍能並列台北/高雄對照
  const campusStats = (c) => {
    const rows = data.filter((x) => x.campus === c)
    const act = rows.filter((x) => x.status !== 'abandoned')
    return {
      total: act.length,
      stuck: ENROLL_STEPS.map((st) => act.filter((x) => x.status !== 'completed'
        && ['open', 'submitted'].includes(stepStateOf(x, st.step))).length),
      completed: rows.filter((x) => x.status === 'completed').length,
      abandoned: rows.filter((x) => x.status === 'abandoned').length,
    }
  }

  const right = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {loading && <span style={{ fontSize: 12, color: '#fde7d4' }}>載入中…</span>}
      <Btn style={headerBtn} disabled={busy} onClick={() => { if (tab === 'settings') loadSettings(); else { load(); if (tab === '1') loadNameReqs() } }}>↻</Btn>
      <span style={{ fontSize: 12, color: '#fde7d4' }}>{teacher.display_name || teacher.username}</span>
      <Btn style={headerBtn} onClick={logoutTeacher}>登出</Btn>
    </div>
  )

  // 中文姓名更改待審區塊（只出現在步驟1分頁；核准才真的改 enroll_students.name）
  const nameReqBlock = (
    <Card style={{ marginBottom: 16 }}>
      <CardHead left={`中文姓名更改待審（${nameReqs.length}）`} />
      {nameReqs.length ? (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: '#faf9f6' }}>
              {['帳號', '原名 → 新名', '系所', '校區', '原因', '申請時間', '操作'].map((h) => <th key={h} style={th}>{h}</th>)}
            </tr></thead>
            <tbody>
              {nameReqs.map((r) => (
                <tr key={r.id}>
                  <td style={{ ...td, color: '#888', whiteSpace: 'nowrap' }}>{r.account}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    <span style={{ color: '#888' }}>{r.old_name || '—'}</span>
                    <span style={{ margin: '0 6px', color: '#bbb' }}>→</span>
                    <b>{r.new_name}</b>
                  </td>
                  <td style={td}>{deptZhFull(r.department) || r.department || '—'}</td>
                  <td style={td}>{r.campus || '—'}</td>
                  <td style={{ ...td, color: '#666' }}>{r.reason || '—'}</td>
                  <td style={{ ...td, color: '#888', whiteSpace: 'nowrap' }}>{fmtTime(r.created_at)}</td>
                  <td style={td}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => doNameReview(r, 'approve')} disabled={busy}
                        style={{ ...s.btn, ...s.btnSm, background: '#15803d', color: '#fff', borderColor: '#15803d' }}>核准</button>
                      <button onClick={() => doNameReview(r, 'reject')} disabled={busy}
                        style={{ ...s.btn, ...s.btnSm, color: '#b91c1c', borderColor: '#fecaca' }}>駁回</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ padding: '12px 2px', fontSize: 13, color: '#aaa' }}>目前無待審的更名申請</div>
      )}
    </Card>
  )

  // 名單表（每個步驟分頁共用）
  const stepTable = (step) => {
    const rows = stuckAt(step)
    return (
      <>
        {step === 1 && nameReqBlock}
        <StatStrip items={[
          { label: '待處理', value: countState(step, 'open'), color: '#7c2d12', bg: '#fff7ed', border: '#fed7aa' },
          { label: '待確認', value: countState(step, 'submitted'), color: '#b45309', bg: '#fffbeb', border: '#fde68a' },
          { label: '已完成', value: countState(step, 'confirmed'), color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' },
        ]} />
        <Card>
          <CardHead left={`當前卡在「${ENROLL_STEPS[step - 1]?.zh}」的學生（${rows.length}）`} />
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: '#faf9f6' }}>
                {['帳號', '姓名', '系所', '校區', '狀態', '送出時間', '檔案', '操作'].map((h) => <th key={h} style={th}>{h}</th>)}
              </tr></thead>
              <tbody>
                {rows.map((stu) => {
                  const st = stepStateOf(stu, step)
                  const meta = STATE_META[st] || STATE_META.locked
                  const files = (stu.files || []).filter((f) => f.step === step)
                  const canConfirm = NEEDS_CONFIRM.has(step) && st === 'submitted'
                  return (
                    <tr key={stu.account}>
                      <td style={{ ...td, color: '#888' }}>{stu.account}</td>
                      <td style={{ ...td, fontWeight: 500 }}>{stu.name || '—'}</td>
                      <td style={td}>{deptZhFull(stu.department) || stu.department || '—'}</td>
                      <td style={td}>{stu.campus || '—'}</td>
                      <td style={td}><Pill color={meta.color} bg={meta.bg}>{meta.label}</Pill></td>
                      <td style={{ ...td, color: '#888', whiteSpace: 'nowrap' }}>{fmtTime(stu.steps?.[step]?.submitted_at)}</td>
                      <td style={td}>
                        {files.length
                          ? files.map((f, i) => (
                            <a key={i} href={f.drive_url} target="_blank" rel="noreferrer" style={{ color: ACCENT, marginRight: 8 }}>檔案{files.length > 1 ? i + 1 : ''}</a>
                          ))
                          : <span style={{ color: '#ccc' }}>—</span>}
                      </td>
                      <td style={td}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {canConfirm && <button onClick={() => doConfirm(stu, step)} disabled={busy} style={{ ...s.btn, ...s.btnSm, background: ACCENT, color: '#fff', borderColor: ACCENT }}>確認</button>}
                          <button onClick={() => doAbandon(stu)} disabled={busy} style={{ ...s.btn, ...s.btnSm, color: '#b91c1c', borderColor: '#fecaca' }}>放棄</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {!rows.length && <tr><td colSpan={8} style={{ ...td, textAlign: 'center', color: '#aaa', padding: 28 }}>{loading ? '載入中…' : '目前沒有卡在這步的學生'}</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      </>
    )
  }

  return (
    <PageShell title="實踐大學" subtitle="入學準備 · 後台管理" accent={ACCENT} toast={toast} intlBack stageKey="onboard" right={right}>
      {/* 分頁列 + 梯次篩選 */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ ...s.btn, background: tab === t.key ? ACCENT : 'white', color: tab === t.key ? '#fff' : '#555',
              borderColor: tab === t.key ? ACCENT : '#ddd', fontWeight: tab === t.key ? 600 : 400 }}>
            {t.label}
          </button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, color: '#999' }}>梯次</span>
          <select style={{ ...s.sel, padding: '5px 8px' }} value={batch} onChange={(e) => changeBatch(e.target.value)}>
            <option value="all">全部</option><option value="1">第一梯</option><option value="2">第二梯</option>
          </select>
          <span style={{ fontSize: 12, color: '#999', marginLeft: 4 }}>校區</span>
          <select style={{ ...s.sel, padding: '5px 8px' }} value={campus} onChange={(e) => setCampus(e.target.value)}>
            <option value="all">全部</option><option value="台北">台北</option><option value="高雄">高雄</option>
          </select>
        </div>
      </div>

      {/* ── 總覽 ── */}
      {tab === 'overview' && (
        <>
          <StatStrip items={[
            { label: '總人數（不含放棄）', value: denom },
            { label: '已完成全部', value: completedN, color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0', sub: denom ? `${Math.round((completedN / denom) * 100)}%` : null },
            { label: '進行中', value: denom - completedN, color: '#b45309', bg: '#fffbeb', border: '#fde68a' },
            { label: '已放棄', value: abandonedList.length, color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
          ]} />
          <Card>
            <CardHead left="各步驟卡關人數（漏斗）" />
            <div style={{ padding: '4px 2px' }}>
              {ENROLL_STEPS.map((st) => {
                const n = stuckAt(st.step).length
                const pct = denom ? Math.round((n / denom) * 100) : 0
                return (
                  <div key={st.step} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid #f5f4f0' }}>
                    <div style={{ width: 130, fontSize: 13, fontWeight: 500 }}>{'①②③④⑤'[st.step - 1]} {st.zh}</div>
                    <div style={{ flex: 1, height: 10, background: '#f3f4f6', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: ACCENT }} />
                    </div>
                    <div style={{ width: 70, textAlign: 'right', fontSize: 13, color: '#555' }}>{n} 人</div>
                    <button onClick={() => setTab(String(st.step))} style={{ ...s.btn, ...s.btnSm }}>查看</button>
                  </div>
                )
              })}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0' }}>
                <div style={{ width: 130, fontSize: 13, fontWeight: 500, color: '#15803d' }}>🎉 已完成全部</div>
                <div style={{ flex: 1, height: 10, background: '#f3f4f6', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ width: `${denom ? Math.round((completedN / denom) * 100) : 0}%`, height: '100%', background: '#15803d' }} />
                </div>
                <div style={{ width: 70, textAlign: 'right', fontSize: 13, color: '#555' }}>{completedN} 人</div>
                <span style={{ width: 52 }} />
              </div>
            </div>
          </Card>

          {/* 分校區小計：台北/高雄 並列對照（不受校區切換影響，僅隨梯次篩選） */}
          {(() => {
            const tp = campusStats('台北')
            const ks = campusStats('高雄')
            const noCampusN = data.filter((x) => !x.campus).length
            const thC = { ...th, textAlign: 'center', width: 110 }
            const tdC = { ...td, textAlign: 'center', fontWeight: 600 }
            return (
              <Card style={{ marginTop: 16 }}>
                <CardHead left="分校區小計（台北 ↔ 高雄 對照）" />
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr style={{ background: '#faf9f6' }}>
                      <th style={th}>項目</th><th style={thC}>台北</th><th style={thC}>高雄</th>
                    </tr></thead>
                    <tbody>
                      <tr>
                        <td style={{ ...td, color: '#666' }}>總人數（不含放棄）</td>
                        <td style={tdC}>{tp.total}</td><td style={tdC}>{ks.total}</td>
                      </tr>
                      {ENROLL_STEPS.map((st, i) => (
                        <tr key={st.step}>
                          <td style={td}>{'①②③④⑤'[i]} {st.zh} 卡關中</td>
                          <td style={{ ...tdC, color: tp.stuck[i] ? '#b45309' : '#bbb' }}>{tp.stuck[i]}</td>
                          <td style={{ ...tdC, color: ks.stuck[i] ? '#b45309' : '#bbb' }}>{ks.stuck[i]}</td>
                        </tr>
                      ))}
                      <tr>
                        <td style={{ ...td, color: '#15803d', fontWeight: 500 }}>🎉 已完成全部</td>
                        <td style={{ ...tdC, color: '#15803d' }}>{tp.completed}</td>
                        <td style={{ ...tdC, color: '#15803d' }}>{ks.completed}</td>
                      </tr>
                      <tr>
                        <td style={{ ...td, color: '#dc2626' }}>已放棄</td>
                        <td style={{ ...tdC, color: tp.abandoned ? '#dc2626' : '#bbb' }}>{tp.abandoned}</td>
                        <td style={{ ...tdC, color: ks.abandoned ? '#dc2626' : '#bbb' }}>{ks.abandoned}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                {noCampusN > 0 && (
                  <div style={{ fontSize: 12, color: '#999', padding: '8px 2px 2px' }}>
                    另有 {noCampusN} 位學生尚未設定校區，未計入上表兩欄。
                  </div>
                )}
              </Card>
            )
          })()}
        </>
      )}

      {/* ── 步驟分頁 ── */}
      {['1', '2', '3', '4', '5'].includes(tab) && stepTable(Number(tab))}

      {/* ── 已放棄 ── */}
      {tab === 'abandoned' && (
        <Card>
          <CardHead left={`已放棄名單（${abandonedList.length}）`} />
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: '#faf9f6' }}>
                {['帳號', '姓名', '系所', '校區', '放棄時間', '原因', '操作'].map((h) => <th key={h} style={th}>{h}</th>)}
              </tr></thead>
              <tbody>
                {abandonedList.map((stu) => (
                  <tr key={stu.account}>
                    <td style={{ ...td, color: '#888' }}>{stu.account}</td>
                    <td style={{ ...td, fontWeight: 500 }}>{stu.name || '—'}</td>
                    <td style={td}>{deptZhFull(stu.department) || stu.department || '—'}</td>
                    <td style={td}>{stu.campus || '—'}</td>
                    <td style={{ ...td, color: '#888', whiteSpace: 'nowrap' }}>{fmtTime(stu.abandoned_at)}</td>
                    <td style={{ ...td, color: '#666' }}>{stu.abandon_reason || '—'}</td>
                    <td style={td}><button onClick={() => doReactivate(stu)} disabled={busy} style={{ ...s.btn, ...s.btnSm }}>復原</button></td>
                  </tr>
                ))}
                {!abandonedList.length && <tr><td colSpan={7} style={{ ...td, textAlign: 'center', color: '#aaa', padding: 28 }}>沒有已放棄的學生</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── 設定 ── */}
      {tab === 'settings' && (!cfgLoaded ? (
        <Card><div style={{ padding: 28, textAlign: 'center', color: '#aaa' }}>{loading ? '載入設定中…' : '設定載入失敗，請按右上 ↻ 重試'}</div></Card>
      ) : (
        <>
          {/* A. 每步截止日（依梯次分兩組；期限固定為當日台北 23:59） */}
          {['1', '2'].map((b) => (
            <Card key={b} style={{ marginBottom: 16 }}>
              <CardHead left={`${b === '1' ? '第一梯' : '第二梯'}：各步驟截止日`}
                right="期限為當日台北時間 23:59" />
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr style={{ background: '#faf9f6' }}>
                    {['步驟', '截止日', ''].map((h, i) => <th key={i} style={th}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {ENROLL_STEPS.map((st) => {
                      const k = `${b}-${st.step}`
                      const f = rowForm[k] || { deadline: '' }
                      return (
                        <tr key={st.step}>
                          <td style={{ ...td, whiteSpace: 'nowrap', fontWeight: 500 }}>{'①②③④⑤'[st.step - 1]} {st.zh}</td>
                          <td style={td}>
                            <input type="date" value={f.deadline}
                              onChange={(e) => setRowForm((p) => ({ ...p, [k]: { deadline: e.target.value } }))}
                              style={{ ...s.input, padding: '6px 8px', fontSize: 13, boxSizing: 'border-box' }} />
                          </td>
                          <td style={td}><button onClick={() => saveRow(b, st.step)} disabled={busy} style={{ ...s.btn, ...s.btnSm, background: ACCENT, color: '#fff', borderColor: ACCENT }}>儲存</button></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}

          {/* 承辦窗口：全域兩組、只分校區（存 enroll_config，不再逐步驟設定） */}
          <Card style={{ marginBottom: 16 }}>
            <CardHead left="承辦窗口（分校區，全部步驟共用）" />
            <div style={{ padding: '4px 2px' }}>
              <div style={{ fontSize: 12.5, color: '#888', lineHeight: 1.7, marginBottom: 10 }}>
                學生端各步驟顯示的聯絡窗口，依學生校區取對應一組（不分梯次、不分步驟）。
              </div>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                {CAMPUSES.map((c) => (
                  <div key={c} style={{ flex: '1 1 280px' }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: ACCENT, marginBottom: 6 }}>{c}校區</div>
                    {[['name', '承辦人姓名'], ['email', 'Email'], ['phone', '電話']].map(([fk, fl]) => (
                      <div key={fk} style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: 11.5, color: '#888', marginBottom: 3 }}>{fl}</div>
                        <input value={contacts[c][fk]}
                          onChange={(e) => setContacts((p) => ({ ...p, [c]: { ...p[c], [fk]: e.target.value } }))}
                          style={{ ...s.input, width: '100%', boxSizing: 'border-box', fontSize: 13 }} />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 10 }}>
                <Btn variant="primary" disabled={busy} onClick={saveContacts}>儲存承辦窗口</Btn>
              </div>
            </div>
          </Card>

          {/* B. 步驟5 行前須知（校區 × 四語，兩梯次共通儲存） */}
          <Card style={{ marginBottom: 16 }}>
            <CardHead left="⑤ 行前須知（校區 × 四語，兩梯次共通）" />
            <div style={{ padding: '4px 2px' }}>
              <div style={{ fontSize: 12.5, color: '#888', lineHeight: 1.7, marginBottom: 10 }}>
                學生端「⑤ 行前通知」依學生校區＋介面語言顯示對應內容（該語言留空時顯示中文）；
                儲存時同步寫入第一、二梯的步驟5設定。
              </div>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                {CAMPUSES.map((c) => (
                  <div key={c} style={{ flex: '1 1 320px' }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: ACCENT, marginBottom: 6 }}>{c}校區</div>
                    {NOTICE_LANGS.map(([lk, ll]) => (
                      <div key={lk} style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: 11.5, color: '#888', marginBottom: 3 }}>{ll}</div>
                        <textarea rows={5} value={notice[c][lk]}
                          onChange={(e) => setNotice((p) => ({ ...p, [c]: { ...p[c], [lk]: e.target.value } }))}
                          style={{ ...s.input, width: '100%', boxSizing: 'border-box', fontFamily: 'inherit', fontSize: 13, lineHeight: 1.7, resize: 'vertical' }} />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 10 }}>
                <Btn variant="primary" disabled={busy} onClick={saveNotice}>儲存行前須知</Btn>
              </div>
            </div>
          </Card>

          {/* C. LINE 群組 QR（學生端步驟①依校區顯示） */}
          <Card>
            <CardHead left="LINE 群組 QR Code（學生端步驟①）" />
            <div style={{ padding: '4px 2px' }}>
              <div style={{ fontSize: 12.5, color: '#888', lineHeight: 1.7, marginBottom: 10 }}>
                貼上 QR 圖片網址（公開可讀的圖片連結），學生端步驟①會依學生校區顯示對應 QR Code。
              </div>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                {CAMPUSES.map((c) => (
                  <div key={c} style={{ flex: '1 1 320px' }}>
                    <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>{c}校區</div>
                    <input value={qrForm[c]} placeholder="https://…（圖片網址）"
                      onChange={(e) => setQrForm((p) => ({ ...p, [c]: e.target.value }))}
                      style={{ ...s.input, width: '100%', boxSizing: 'border-box', fontSize: 13 }} />
                    {qrForm[c].trim() ? (
                      <img src={qrForm[c].trim()} alt={`${c} LINE QR`}
                        style={{ width: 140, height: 140, objectFit: 'contain', border: '1px solid #eee', borderRadius: 8, marginTop: 8, background: 'white' }} />
                    ) : (
                      <div style={{ width: 140, height: 140, marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed #ccc', borderRadius: 8, color: '#bbb', fontSize: 12 }}>尚未設定</div>
                    )}
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 10 }}>
                <Btn variant="primary" disabled={busy} onClick={saveLineQr}>儲存 QR 設定</Btn>
              </div>
            </div>
          </Card>
        </>
      ))}

      {/* ── 匯入 ── */}
      {tab === 'import' && (
        <>
          <Card style={{ marginBottom: 16 }}>
            <CardHead left="批次匯入：學號＋宿舍資訊"
              right={<Btn onClick={downloadTemplate}>⬇ 下載範本</Btn>} />
            <div style={{ fontSize: 12.5, color: '#888', lineHeight: 1.8, marginBottom: 12, padding: '0 2px' }}>
              上傳 Excel（.xlsx / .xls），以<b>帳號</b>對應學生，一次帶入<b>學號、房號、床位號、上課教室</b>。
              標題列需用中文欄名（帳號／學號／房號／床位號／上課教室，欄序不拘）。
              <b>空欄不會覆蓋</b>既有資料；重傳同一份檔會覆蓋有值的欄。先預覽、按「確認匯入」才寫入。
            </div>
            <div
              style={{ border: '2px dashed #ddd', borderRadius: 10, padding: 24, textAlign: 'center', background: '#fafaf8', cursor: 'pointer' }}
              onClick={() => !busy && impFileRef.current.click()}>
              <input ref={impFileRef} type="file" accept=".xls,.xlsx" style={{ display: 'none' }} onChange={handleImportFile} />
              <div style={{ fontSize: 26, marginBottom: 6 }}>⇪</div>
              <div style={{ fontSize: 14, color: '#555' }}>{busy ? '處理中…' : (impFileName || '點此選擇 Excel 檔（.xls / .xlsx）')}</div>
              <div style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>選檔後先顯示預覽，不會立即寫入</div>
            </div>
            {impError && <div style={{ color: '#dc2626', fontSize: 13, marginTop: 12, whiteSpace: 'pre-line' }}>{impError}</div>}
          </Card>

          {impPreview && (
            <>
              <StatStrip items={[
                { label: '將更新', value: impPreview.updates.length, color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' },
                { label: '跳過（帳號不在庫）', value: impPreview.notFound.length, color: impPreview.notFound.length ? '#dc2626' : '#1a1a18', bg: '#fef2f2', border: '#fecaca' },
                ...(impPreview.emptyN ? [{ label: '略過（整列無可寫入值）', value: impPreview.emptyN, color: '#b45309', bg: '#fffbeb', border: '#fde68a' }] : []),
              ]} />
              {impPreview.notFound.length > 0 && (
                <Card style={{ marginBottom: 16 }}>
                  <CardHead left={`跳過的帳號（庫裡查無，共 ${impPreview.notFound.length} 筆）`} />
                  <div style={{ fontSize: 13, color: '#b45309', lineHeight: 2, padding: '4px 2px', wordBreak: 'break-all' }}>
                    {impPreview.notFound.join('、')}
                  </div>
                </Card>
              )}
              <Card style={{ marginBottom: 16 }}>
                <CardHead left={`將更新的學生（${impPreview.updates.length}）`} />
                <div style={{ overflowX: 'auto', maxHeight: 420, overflowY: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr style={{ background: '#faf9f6' }}>
                      {['帳號', '姓名', '將寫入的欄位'].map((h) => <th key={h} style={th}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {impPreview.updates.map((u) => (
                        <tr key={u.account}>
                          <td style={{ ...td, color: '#888', whiteSpace: 'nowrap' }}>{u.account}</td>
                          <td style={{ ...td, fontWeight: 500, whiteSpace: 'nowrap' }}>{u.name || '—'}</td>
                          <td style={td}>
                            {Object.entries(u.fields).map(([k, v]) => (
                              <span key={k} style={{ display: 'inline-block', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, padding: '2px 8px', margin: '2px 6px 2px 0', fontSize: 12 }}>
                                {importLabel(k)}＝{v}
                              </span>
                            ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
                  <Btn disabled={busy} onClick={() => { setImpPreview(null); setImpFileName(''); setImpError('') }}>取消</Btn>
                  <Btn variant="primary" disabled={busy || !impPreview.updates.length} onClick={doImport}>
                    {busy ? '匯入中…' : `確認匯入（${impPreview.updates.length} 筆）`}
                  </Btn>
                </div>
              </Card>
            </>
          )}

          {impResult && (
            <Card>
              <CardHead left="匯入結果" />
              <div style={{ fontSize: 13.5, lineHeight: 2, padding: '4px 2px' }}>
                <div style={{ color: '#15803d', fontWeight: 600 }}>✓ 成功更新 {impResult.updated} 筆</div>
                {impResult.skipped.length > 0 && (
                  <div style={{ color: '#b45309', wordBreak: 'break-all' }}>
                    後端跳過 {impResult.skipped.length} 筆：{impResult.skipped.join('、')}
                  </div>
                )}
              </div>
            </Card>
          )}
        </>
      )}
    </PageShell>
  )
}
