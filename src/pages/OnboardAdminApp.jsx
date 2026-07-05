import { useState, useEffect, useCallback, useRef } from 'react'
import * as XLSX from 'xlsx'
import { PageShell } from '../components/PageShell'
import { Btn, Card, CardHead, Pill, Modal, s } from '../components/UI'
import OnboardMailComposer, { VISA_MAIL_TYPES } from '../components/OnboardMailComposer'
import { onboardAdminList, onboardAdminConfirm, onboardAdminAbandon, onboardAdminReactivate,
  onboardAdminGetSettings, onboardAdminSaveSettings, onboardAdminSaveLineQr, onboardAdminSaveContacts,
  onboardAdminImportStudents, onboardAdminNameRequests, onboardAdminNameReview,
  onboardAdminMailRecipients, onboardAdminMailMarkSent, onboardAdminMailLogDraft, onboardAdminStep1Data,
  onboardAdminReopenStep1, onboardAdminReopenStep2,
  onboardAdminSetVisaStage, onboardAdminVisaUpload, onboardAdminSaveVisaData } from '../api'
import { getTeacher, logoutTeacher } from '../auth'
import { calcAge, driveImageUrl } from '../utils'
import { ENROLL_STEPS, batchInfo, deptZhFull, ONBOARD_STEP1_FIELDS } from '../constants'
import { exportBA0203 } from '../lib/ba0203'

// 入學準備後台（superadmin 專用）。掛 #/onboard-admin，StageNav 顯示「⑤ 入學準備」。
// 資料經 /api/onboard-admin（service role），操作需帶超管帳密——本頁用一次性密碼閘門
// 取得密碼後快取於記憶體（不落地 storage）重用。整體結構鏡像 Stage4App。
// 頂部兩維度篩選：梯次（伺服器端）× 校區（前端，讓總覽分校區小計恆能並列兩校區）。
// 主題色用深莓紅（學生端 OnboardApp 仍是棕色 #7c2d12，只有後台換色以區別 ④ 就學確認）。
const ACCENT = '#9d174d'

// enroll_progress.state → 顯示
const STATE_META = {
  locked:    { label: '未開放', color: '#9ca3af', bg: '#f3f4f6' },
  open:      { label: '待處理', color: '#9d174d', bg: '#fce7f3' },
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

// ── 步驟③ 簽證階段（enroll_progress[3].data.visa_stage）中文標籤 ─────────────
// supplement（補件中）為送件後旁支；目前由上方批次簽證補件信處理，不列入推進下拉。
const VISA_STAGE_META = {
  pending:    { label: '待通知',     color: '#9ca3af', bg: '#f3f4f6' },
  notified:   { label: '已通知辦理', color: '#9d174d', bg: '#fce7f3' },
  collected:  { label: '現場收件',   color: '#7c3aed', bg: '#ede9fe' },
  submitted:  { label: '已送件',     color: '#2563eb', bg: '#dbeafe' },
  supplement: { label: '補件中',     color: '#b45309', bg: '#fef3c7' },
  obtained:   { label: '已取得簽證', color: '#0d9488', bg: '#ccfbf1' },
  uploaded:   { label: '已上傳待審', color: '#c2410c', bg: '#ffedd5' },
}
// 推進下拉的階段序（越南軌含「現場收件」，非越南軌無）
const VISA_STAGES_VN    = ['pending', 'notified', 'collected', 'submitted', 'obtained', 'uploaded']
const VISA_STAGES_OTHER = ['pending', 'notified', 'submitted', 'obtained', 'uploaded']
const visaTrackOf = (stu) => (stu.steps?.[3]?.data?.visa_track === 'vn' ? 'vn' : 'other')
const visaStageOf = (stu) => stu.steps?.[3]?.data?.visa_stage || 'pending'
const visaSignalOf = (stuOrData) => {
  const d = stuOrData?.steps?.[3]?.data || stuOrData || {}
  const track = d.visa_track === 'vn' ? 'vn' : 'other'
  if (track === 'vn') {
    if (d.vn_documents_collected_at) return { label: '已現場收件', color: '#15803d', bg: '#dcfce7' }
    if (d.vn_student_ack_at) return { label: '學生已確認會到', color: '#0369a1', bg: '#e0f2fe' }
    if (d.vn_collection_date || d.vn_collection_place) return { label: '待學生確認', color: '#b45309', bg: '#fef3c7' }
    return { label: '待排收件時間', color: '#6b7280', bg: '#f3f4f6' }
  }
  if (d.paper_letter_help_requested_at) return { label: '紙本未收到', color: '#b45309', bg: '#fef3c7' }
  if (d.paper_letter_received_at) {
    if (d.other_visa_apply_date || d.other_visa_expected_date) return { label: '已回報簽證日期', color: '#15803d', bg: '#dcfce7' }
    return { label: '已收到紙本', color: '#0369a1', bg: '#e0f2fe' }
  }
  if (d.paper_letter_sent_at) return { label: '待回報紙本', color: '#b45309', bg: '#fef3c7' }
  return { label: '紙本尚未寄出', color: '#6b7280', bg: '#f3f4f6' }
}

// 通知信：狀態欄的次別簡稱（寄送流程都在 OnboardMailComposer 內）
const MAIL_TIER_SHORT = { first: '首次', second: '二次', final: '最後' }
const VISA_MAIL_SHORT = {
  admission_letter_e: '電子',
  vn_collection: '收件',
  vn_supplement: '補件',
  paper_letter_sent: '紙本',
  visa_date_reminder: '日期',
}

const fmtTime = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d)) return String(iso)
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// 日期字串（YYYY-MM-DD，date input 存的格式）只顯示日期；ISO timestamptz 顯示到分
const fmtD = (v) => {
  if (!v) return '—'
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return m ? `${m[1]}/${m[2]}/${m[3]}` : fmtTime(v)
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
        <div key={it.label} style={{ flex: '1 1 130px', minWidth: 110, background: it.bg || '#faf9f6',
          border: '1px solid ' + (it.border || '#eceae5'), borderRadius: 12, padding: '14px 16px' }}>
          <div style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.1, color: it.color || '#1a1a18' }}>{it.value}</div>
          <div style={{ fontSize: 12, color: '#888', marginTop: 5 }}>{it.label}</div>
          {it.sub != null && <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>{it.sub}</div>}
        </div>
      ))}
    </div>
  )
}

export default function OnboardAdminApp() {
  const [teacher] = useState(() => getTeacher())
  useEffect(() => { if (!teacher || teacher.role !== 'superadmin') window.location.hash = '#/login?stage=admin' }, [teacher])

  const [pw, setPw] = useState('')          // 快取的超管密碼（記憶體）
  const [pwInput, setPwInput] = useState('')
  const [authed, setAuthed] = useState(false)
  const [data, setData] = useState([])
  const [tab, setTab] = useState('overview')
  const [batch, setBatch] = useState('all')
  const [campus, setCampus] = useState('all')   // 校區在前端篩：分校區小計需同時看到兩校區
  const [search, setSearch] = useState('')      // 清單即時篩選（帳號／中文姓名／英文姓名），切分頁清空
  const [showPassed, setShowPassed] = useState(false)   // 步驟分頁：是否展開「已通過本步」摺疊清單，切分頁收合
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [exporting, setExporting] = useState(false)   // BA0203 匯出中
  const [detail, setDetail] = useState(null)          // 檢視資料彈窗：{account,name,loading,step1_state,data,department,campus}
  const [preview, setPreview] = useState(null)        // 上傳檔案站內預覽彈窗：{url,name}
  const [visaUp, setVisaUp] = useState(null)          // 步驟③ 上傳簽證彈窗：{account,name}
  const [visaEdit, setVisaEdit] = useState(null)      // 步驟③ 簽證辦理追蹤彈窗：{account,name,data}
  const [centerFilter, setCenterFilter] = useState('all')   // 各步驟名單的中心下拉篩選（批次寄信跟著篩），切分頁重置
  const [chartSel, setChartSel] = useState(null)      // 步驟③ 日期長條圖選取：{track,date}，點長條展開當日名單
  const [stageFilter, setStageFilter] = useState(null) // 步驟③ 簽證階段統計點選過濾：{track,stage}，僅影響顯示，切分頁重置
  const [batchVn, setBatchVn] = useState(null)        // 步驟③ 批次設定越南現場收件彈窗：{fields,targets,prog}
  const [toast, setToast] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)   // 名單最後一次成功刷新的時間（含自動刷新），標頭顯示

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
      setLastUpdated(new Date())
      setAuthed(true)
    } catch (e) {
      if (e.status === 401 || e.status === 403) { setAuthed(false); showToast(e.message, 'error') }
      else showToast('載入失敗：' + e.message, 'error')
    } finally { setLoading(false) }
  }, [batch, pw, teacher, showToast])

  const loadingRef = useRef(loading)
  const busyRef = useRef(busy)
  useEffect(() => { loadingRef.current = loading }, [loading])
  useEffect(() => { busyRef.current = busy }, [busy])

  // 已驗證後每 30 秒自動刷新名單（設定／匯入分頁不刷，避免干擾表單）；
  // 分頁隱藏／載入中／操作中時跳過，從背景切回前景立即刷新一次。
  useEffect(() => {
    if (!authed || tab === 'settings' || tab === 'import') return
    const id = setInterval(() => {
      if (document.hidden || loadingRef.current || busyRef.current) return
      load()
    }, 30000)
    const onVisible = () => { if (!document.hidden && authed) load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [authed, tab, load])

  const doAuth = async () => {
    if (!pwInput.trim() || busy) return
    setBusy(true)
    setPw(pwInput)
    await load(batch, pwInput)
    setBusy(false)
  }

  const changeBatch = (b) => { setBatch(b); setCenterFilter('all'); setStageFilter(null); if (authed) load(b, pw) }

  const doConfirm = async (stu, step) => {
    if (busy) return
    if (!window.confirm(`確認「${stu.name || stu.account}」的『${ENROLL_STEPS[step - 1]?.zh}』已完成？\n將標記為已確認並開啟下一步。`)) return
    setBusy(true)
    try {
      const res = await onboardAdminConfirm(teacher.username, pw, stu.account, step)
      if (step === 2 && res?.auto_mail_error) showToast(`已確認繳費，但第一封通知信寄送失敗：${res.auto_mail_error}`, 'warn')
      else if (step === 2 && res?.auto_mail_sent) showToast(`已確認繳費，並已自動寄出簽證流程說明信`)
      else showToast(`已確認 ${stu.name || stu.account} 的${ENROLL_STEPS[step - 1]?.zh}`)
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

  // BA0203「外生」匯出：抓全體 step①資料 → 只留在籍(active)且已完成資料確認(step1 有資料)者 →
  // 出 49 欄版面（只填學生自填 20 欄、其餘留空）。放棄學生不進新生匯入。
  const doExportBA0203 = async () => {
    if (exporting || busy) return
    setExporting(true)
    try {
      const res = await onboardAdminStep1Data(teacher.username, pw)
      const pick = (res.rows || []).filter((r) => r.status === 'active' && r.step1)
      if (!pick.length) { showToast('目前沒有已完成「資料確認」的在籍學生可匯出', 'warn'); return }
      const t = new Date()
      const ymd = `${t.getFullYear()}${String(t.getMonth() + 1).padStart(2, '0')}${String(t.getDate()).padStart(2, '0')}`
      exportBA0203(pick, `BA0203_外生_${ymd}.xlsx`)
      showToast(`已匯出 ${pick.length} 位學生（BA0203 外生）`)
    } catch (e) {
      showToast('匯出失敗：' + e.message, 'error')
    } finally { setExporting(false) }
  }

  // 檢視某生步驟①已填資料（單筆撈 step1-data）；退回補件在彈窗內。
  const openDetail = async (stu) => {
    setDetail({ account: stu.account, name: stu.name, loading: true })
    try {
      const res = await onboardAdminStep1Data(teacher.username, pw, stu.account)
      const row = (res.rows || [])[0] || {}
      setDetail({
        account: stu.account, name: stu.name, loading: false,
        step1_state: row.step1_state || 'locked', data: row.step1 || null,
        department: row.department || stu.department, campus: row.campus || stu.campus,
      })
    } catch (e) {
      showToast('讀取資料失敗：' + e.message, 'error')
      setDetail(null)
    }
  }

  // 退回補件：步驟①→open（保留原填、學生可修正）、步驟②未確認則收回 locked。
  const doReopenStep1 = async (account, name) => {
    if (busy) return
    const reason = window.prompt(`確定要將「${name || account}」的資料退回補件？\n學生的「資料確認」會重新開啟、可修正；若已進到繳費(未確認)會一併收回。\n可填退回原因（記錄於稽核，可留空）：`, '')
    if (reason === null) return
    setBusy(true)
    try {
      await onboardAdminReopenStep1(teacher.username, pw, account, reason.trim())
      showToast(`已退回 ${name || account} 補件`)
      setDetail(null)
      await load()
      if (window.confirm(`要現在寄信通知「${name || account}」補件嗎？（走公務信箱，可預覽後再送出）`)) {
        const m = await loadMailRecips(1)
        await openComposer(0, [account], m)
      }
    } catch (e) { showToast('退回失敗：' + e.message, 'error') }
    finally { setBusy(false) }
  }

  // 退回收據：步驟②→open（學生重新上傳）；不動步驟①，步驟③未確認則收回 locked。
  const doReopenStep2 = async (account, name) => {
    if (busy) return
    const reason = window.prompt(`確定要退回「${name || account}」的繳費收據？\n步驟②會重新開啟讓學生重新上傳；已上傳的舊收據會保留供對照。\n可填退回原因（記錄於稽核，可留空）：`, '')
    if (reason === null) return
    setBusy(true)
    try {
      await onboardAdminReopenStep2(teacher.username, pw, account, reason.trim())
      showToast(`已退回 ${name || account} 的收據`)
      await load()
      if (window.confirm(`要現在寄信通知「${name || account}」重新上傳收據嗎？（走公務信箱，可預覽後再送出）`)) {
        const m = await loadMailRecips(2)
        await openComposer(0, [account], m)
      }
    } catch (e) { showToast('退回失敗：' + e.message, 'error') }
    finally { setBusy(false) }
  }

  // ── 步驟③ 簽證：推進階段（可回退修正；選『補件中』時可帶備註）──────────────
  const doSetVisaStage = async (stu, stage) => {
    if (busy) return
    if (stage === visaStageOf(stu)) return
    let note
    if (stage === 'supplement') {
      note = window.prompt(`將「${stu.name || stu.account}」標記為『補件中』？\n可填補件說明（記錄於稽核，之後可再改回送件；可留空）：`, stu.steps?.[3]?.data?.supplement_note || '')
      if (note === null) return
    } else if (!window.confirm(`將「${stu.name || stu.account}」的簽證階段改為『${VISA_STAGE_META[stage]?.label || stage}』？`)) {
      return
    }
    setBusy(true)
    try {
      await onboardAdminSetVisaStage(teacher.username, pw, { account: stu.account, stage, ...(note !== undefined ? { note } : {}) })
      showToast(`已更新 ${stu.name || stu.account} 的簽證階段為「${VISA_STAGE_META[stage]?.label || stage}」`)
      await load()
    } catch (e) { showToast('更新失敗：' + e.message, 'error') }
    finally { setBusy(false) }
  }

  // ── 步驟③ 簽證：上傳簽證檔 → visa_stage=uploaded（不自動確認）────────────
  const doVisaUpload = async (file) => {
    if (!visaUp || !file || busy) return
    const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
    if (!ALLOWED.includes(file.type)) { showToast('只接受 JPG / PNG / WEBP / HEIC / PDF', 'error'); return }
    if (file.size > 3 * 1024 * 1024) { showToast('檔案過大（上限約 3MB）', 'error'); return }
    setBusy(true)
    try {
      const dataBase64 = await new Promise((res, rej) => {
        const r = new FileReader()
        r.onload = () => res(String(r.result).split(',')[1] || '')
        r.onerror = () => rej(new Error('讀取檔案失敗'))
        r.readAsDataURL(file)
      })
      await onboardAdminVisaUpload(teacher.username, pw, { account: visaUp.account, filename: file.name, mimeType: file.type, dataBase64 })
      showToast(`已為 ${visaUp.name || visaUp.account} 上傳簽證檔`)
      setVisaUp(null)
      await load()
    } catch (e) { showToast('上傳失敗：' + e.message, 'error') }
    finally { setBusy(false) }
  }

  const openVisaEdit = (stu) => {
    setVisaEdit({
      account: stu.account,
      name: stu.name,
      data: { ...(stu.steps?.[3]?.data || {}) },
    })
  }

  const saveVisaEdit = async () => {
    if (!visaEdit || busy) return
    setBusy(true)
    try {
      await onboardAdminSaveVisaData(teacher.username, pw, { account: visaEdit.account, fields: visaEdit.data })
      showToast(`已更新 ${visaEdit.name || visaEdit.account} 的簽證追蹤資料`)
      setVisaEdit(null)
      await load()
    } catch (e) { showToast('儲存失敗：' + e.message, 'error') }
    finally { setBusy(false) }
  }

  // ── 步驟③ 簽證：批次設定越南軌現場收件資訊（對目前篩選下的越南軌學生逐筆寫入）──
  const openBatchVn = (targets) => {
    if (!targets.length) { showToast('目前篩選下沒有越南學生', 'warn'); return }
    setBatchVn({
      fields: { vn_collection_date: '', vn_collection_time: '', vn_collection_city: '', vn_collection_place: '', vn_collection_note: '' },
      targets: targets.map((x) => ({
        account: x.account, name: x.name, center: x.center,
        cur: x.steps?.[3]?.data?.vn_collection_date || '', checked: true,
      })),
      prog: null,
    })
  }

  const doBatchVn = async () => {
    if (!batchVn || busy) return
    const picked = batchVn.targets.filter((t) => t.checked)
    const fields = Object.fromEntries(
      Object.entries(batchVn.fields).filter(([, v]) => String(v).trim() !== ''))
    if (!picked.length) { showToast('沒有勾選任何學生', 'warn'); return }
    if (!Object.keys(fields).length) { showToast('請至少填一個要更新的欄位（空欄不會覆蓋）', 'warn'); return }
    if (!window.confirm(`將為 ${picked.length} 位越南學生批次更新現場收件資訊？\n（只更新有填的欄位，空欄不覆蓋既有資料）`)) return
    setBusy(true)
    let okN = 0
    const fails = []
    try {
      for (let i = 0; i < picked.length; i++) {
        setBatchVn((p) => (p ? { ...p, prog: { done: i + 1, total: picked.length } } : p))
        try {
          await onboardAdminSaveVisaData(teacher.username, pw, { account: picked[i].account, fields })
          okN++
        } catch (e) { fails.push(`${picked[i].name || picked[i].account}（${e.message}）`) }
      }
      if (fails.length) {
        showToast(`已更新 ${okN} 位、失敗 ${fails.length} 位：${fails.join('、')}`, 'warn')
        setBatchVn((p) => (p ? { ...p, prog: null } : p))
      } else {
        showToast(`已批次更新 ${okN} 位越南學生的現場收件資訊`)
        setBatchVn(null)
      }
      await load()
    } finally { setBusy(false) }
  }

  // ── 中文姓名更改待審（步驟1分頁內）─────────────────────────────────────────
  const [nameReqs, setNameReqs] = useState([])
  const nameReqErrorShownRef = useRef(false)
  const loadNameReqs = useCallback(async (password) => {
    try {
      const res = await onboardAdminNameRequests(teacher.username, password ?? pw)
      setNameReqs(res.list || [])
      nameReqErrorShownRef.current = false
    } catch (e) {
      if (!nameReqErrorShownRef.current) {
        nameReqErrorShownRef.current = true
        showToast('載入更名申請失敗：' + e.message, 'error')
      }
    }
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
      if (r.email && r.confirm_token && window.confirm(`要現在寄信通知「${r.name || r.account}」到頁面查看結果嗎？（走公務信箱，可預覽後再送出）`)) {
        await openComposer(0, [r.account], { [r.account]: {
          account: r.account, email: r.email, name: r.name || '', name_english: r.name_english || '',
          nationality: r.nationality || '', campus: r.campus || '', confirm_token: r.confirm_token,
        } })
      }
    } catch (e) { showToast('操作失敗：' + e.message, 'error') }
    finally { setBusy(false) }
  }

  // ── 通知信：收件名單（含已寄次數）＋ 系統內寄信視窗（OnboardMailComposer）─────────
  const [mailRecips, setMailRecips] = useState({})   // account → { email, reminder_count, ... }
  const [composer, setComposer] = useState(null)     // { step, recipients, cfg }
  const [visaMailKind, setVisaMailKind] = useState(VISA_MAIL_TYPES[0]?.key || '')

  const loadMailRecips = useCallback(async (step) => {
    try {
      const res = await onboardAdminMailRecipients(teacher.username, pw, { step, batch, campus: 'all' })
      const m = {}
      for (const r of res.list || []) m[r.account] = r
      setMailRecips(m)
      return m
    } catch { /* 收件名單載入失敗不擋主功能（欄位顯示 — 即可） */ }
  }, [pw, teacher, batch])

  useEffect(() => {
    if (authed && ['1', '2', '3', '4', '5'].includes(tab)) loadMailRecips(Number(tab))
  }, [authed, tab, loadMailRecips])

  // 開寄信視窗：accounts＝群發（當前篩選下卡在此步全名單）或個別（[account]）。
  // 先載入設定（承辦窗口 / 放榜連結 / 該步各梯截止日）供 composer 唯讀帶入。
  const openComposer = async (step, accounts, recipsMap, opts = {}) => {
    if (busy) return
    const src = recipsMap || mailRecips
    const recips = accounts.map((a) => src[a]).filter(Boolean)
    if (!recips.length) { showToast('收件名單載入中或沒有可寄送的對象，請稍候再試', 'warn'); return }
    setBusy(true)
    try {
      const res = await onboardAdminGetSettings(teacher.username, pw)
      const deadlines = {}
      for (const r of res.settings || []) {
        if (Number(r.step) === step) deadlines[String(r.batch)] = isoToTpeDate(r.deadline).replace(/-/g, '/')
      }
      setComposer({
        step, mailKind: opts.mailKind || '', recipients: recips,
        cfg: { contacts: res.contacts || {}, resultLink: res.result_link || {}, deadlines },
      })
    } catch (e) { showToast('載入寄信設定失敗：' + e.message, 'error') }
    finally { setBusy(false) }
  }

  // composer 每批寄成功後回報：reminder_count+1 / last_reminder_*（enroll_log 記 mail_sent）
  const markMailSent = async (accounts, tier) => {
    if (composer.step === 0) return
    await onboardAdminMailMarkSent(teacher.username, pw, { step: composer.step, tier, accounts, mail_kind: composer.mailKind || undefined })
  }
  // composer 每批草稿建立成功後回報：只寫 enroll_log mail_draft，不加提醒計數
  const markMailDraft = async (accounts, tier) => {
    if (composer.step === 0) return
    await onboardAdminMailLogDraft(teacher.username, pw, { step: composer.step, tier, accounts, mail_kind: composer.mailKind || undefined })
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

  const headerBtn = { background: 'none', borderColor: '#ffffff44', color: '#fce7f3' }
  const th = { padding: '10px 14px', textAlign: 'left', borderBottom: '1px solid #e8e7e3', color: '#666', fontWeight: 500, fontSize: 12, whiteSpace: 'nowrap' }
  const td = { padding: '10px 14px', borderBottom: '1px solid #f5f4f0', fontSize: 13, lineHeight: 1.5, verticalAlign: 'middle' }

  // 清單搜尋（帳號／中文姓名／英文姓名 contains、不分大小寫）＋ 姓名欄整合學生身分資訊
  const q = search.trim().toLowerCase()
  const matchText = (...vals) => !q || vals.some((v) => String(v || '').toLowerCase().includes(q))
  const studentMeta = (x) => {
    const age = calcAge(x.birth_date)
    const bi = batchInfo(x.account)
    const parts = [
      x.account,
      bi.short,
      x.gender,
      age != null ? `${age}歲` : '',
    ].filter(Boolean)
    return parts.length ? parts.join('·') : '—'
  }
  const searchInput = (
    <input value={search} onChange={(e) => setSearch(e.target.value)}
      placeholder="🔍 搜尋：帳號／中文姓名／英文姓名…"
      style={{ ...s.input, maxWidth: 360, width: '100%', boxSizing: 'border-box',
        padding: '9px 14px', borderRadius: 99, background: 'white' }} />
  )
  const searchBox = <div style={{ marginBottom: 14 }}>{searchInput}</div>
  const nameCell = (x) => (
    <td style={{ ...td, whiteSpace: 'nowrap', minWidth: 160 }}>
      <div style={{ fontWeight: 600 }}>{x.name || '—'}</div>
      {x.name_english && <div style={{ color: '#999', fontSize: 11.5 }}>{x.name_english}</div>}
      <div style={{ color: '#aaa', fontSize: 11.5 }}>{studentMeta(x)}</div>
    </td>
  )

  // ── 密碼閘門（尚未通過驗證）─────────────────────────────────────────────────
  if (!authed) {
    return (
      <PageShell title="實踐大學" subtitle="入學準備 · 後台管理" accent={ACCENT} toast={toast} intlBack stageKey="onboard"
        right={<span style={{ fontSize: 12, color: '#fce7f3' }}>{teacher?.display_name || teacher?.username}</span>}>
        <Card style={{ maxWidth: 420, margin: '40px auto' }}>
          <CardHead left="超級管理員驗證" />
          <div style={{ padding: '14px 18px' }}>
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
  // 已通過本步（confirmed）＝累計通過此步的人，含已往後面步驟移動者
  const passedAt = (step) => active.filter((x) => stepStateOf(x, step) === 'confirmed')

  // 分校區小計：從 data（僅梯次篩過）計算，切到單一校區時仍能並列台北/高雄對照
  const campusStats = (c) => {
    const rows = data.filter((x) => x.campus === c)
    const act = rows.filter((x) => x.status !== 'abandoned')
    return {
      total: rows.length,
      stuck: ENROLL_STEPS.map((st) => act.filter((x) => x.status !== 'completed'
        && ['open', 'submitted'].includes(stepStateOf(x, st.step))).length),
      completed: rows.filter((x) => x.status === 'completed').length,
      abandoned: rows.filter((x) => x.status === 'abandoned').length,
    }
  }

  const right = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {loading && <span style={{ fontSize: 12, color: '#fce7f3' }}>載入中…</span>}
      {lastUpdated && !loading && (
        <span style={{ fontSize: 11, color: '#fbcfe8', whiteSpace: 'nowrap' }}>
          更新於 {lastUpdated.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })} · 每 30 秒自動
        </span>
      )}
      <Btn style={headerBtn} disabled={busy} onClick={() => { if (tab === 'settings') loadSettings(); else { load(); if (tab === '1') loadNameReqs() } }}>↻</Btn>
      <span style={{ fontSize: 12, color: '#fce7f3' }}>{teacher.display_name || teacher.username}</span>
      <Btn style={headerBtn} onClick={logoutTeacher}>登出</Btn>
    </div>
  )

  // 中文姓名更改待審區塊（只出現在步驟1分頁；核准才真的改 enroll_students.name）
  // 搜尋沿用頁頂搜尋框：帳號／中文姓名（原名/新名）／英文姓名（由名單 data 以帳號查回）
  const engByAcct = {}
  for (const x of data) engByAcct[x.account] = x.name_english
  const nameReqsShown = nameReqs.filter((r) =>
    matchText(r.account, r.name, r.old_name, r.new_name, engByAcct[r.account]))
  const nameReqBlock = (
    <Card style={{ marginBottom: 16 }}>
      <CardHead left={`中文姓名更改待審（${nameReqsShown.length}${q ? ` / ${nameReqs.length}` : ''}）`} />
      {nameReqsShown.length ? (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: '#faf9f6' }}>
              {['帳號', '原名 → 新名', '系所', '校區', '原因', '申請時間', '操作'].map((h) => <th key={h} style={th}>{h}</th>)}
            </tr></thead>
            <tbody>
              {nameReqsShown.map((r) => (
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
        <div style={{ padding: '16px 18px', fontSize: 13, color: '#aaa' }}>
          {q && nameReqs.length ? '沒有符合搜尋的更名申請' : '目前無待審的更名申請'}
        </div>
      )}
    </Card>
  )

  // 通知信控制列（每個步驟分頁的名單上方）：開 OnboardMailComposer 系統內預覽＋批次寄出
  const mailControl = (step, rows) => {
    const selectedVisaType = VISA_MAIL_TYPES.find((x) => x.key === visaMailKind) || VISA_MAIL_TYPES[0]
    const visaTargets = step === 3 && selectedVisaType
      ? rows.filter((x) => !selectedVisaType.track || visaTrackOf(x) === selectedVisaType.track)
      : rows
    return (
      <Card style={{ marginBottom: 16 }}>
        <CardHead left="✉ 通知信" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '14px 18px' }}>
          {step === 3 && (
            <select style={{ ...s.sel, maxWidth: 260 }} value={visaMailKind} onChange={(e) => setVisaMailKind(e.target.value)}>
              {VISA_MAIL_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          )}
          <Btn variant="primary" disabled={busy || !visaTargets.length}
            onClick={() => openComposer(step, visaTargets.map((x) => x.account), undefined, step === 3 ? { mailKind: visaMailKind } : {})}>
            ✉ {step === 3 ? `寄送${selectedVisaType?.label || '簽證通知'}（${visaTargets.length} 人）` : `寄送通知信（${rows.length} 人）`}
          </Btn>
          {step === 1 && (
            <Btn disabled={busy || exporting} onClick={doExportBA0203}>
              {exporting ? '匯出中…' : '⬇ 匯出 BA0203 外生 Excel'}
            </Btn>
          )}
          <span style={{ fontSize: 12, color: '#888', lineHeight: 1.6 }}>
            {step === 3
              ? '簽證批次信依信件類型分開追蹤寄送次數；已寄過同類型的學生預設不勾，避免重複寄送。名單會吃上方「中心」下拉篩選（搜尋框只影響顯示）。'
              : '開啟寄信視窗：對「目前梯次×校區×中心篩選下、卡在此步」的名單逐人組雙語信（外語在前、中文在後），可逐列預覽、改語言、選次別（首次／二次／最後）後「① 建立草稿 → ② 送出本批」（公務信箱）。搜尋框只影響顯示。'}
          </span>
        </div>
      </Card>
    )
  }

  // 上傳檔案格：預覽鈕（站內看圖，走 driveImageUrl 的 lh3 圖片端點，繞過 Drive「需下載才能看」的預覽卡關）＋ Drive 原檔連結
  const fileCell = (files) => (
    files.length
      ? files.map((f, i) => (
        <span key={i} style={{ marginRight: 10, whiteSpace: 'nowrap', display: 'inline-block' }}>
          <button onClick={() => setPreview({ url: f.drive_url, name: `檔案${files.length > 1 ? i + 1 : ''}` })} disabled={busy}
            style={{ ...s.btn, ...s.btnSm, color: ACCENT, borderColor: '#f0d0dd' }}>預覽{files.length > 1 ? i + 1 : ''}</button>
          <a href={f.drive_url} target="_blank" rel="noreferrer" title="在 Drive 開啟原檔"
            style={{ color: '#bbb', marginLeft: 4, fontSize: 12, textDecoration: 'none' }}>↗</a>
        </span>
      ))
      : <span style={{ color: '#ccc' }}>—</span>
  )
  const visaMailCell = (stu) => {
    const vm = stu.steps?.[3]?.data?.visa_mail || {}
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxWidth: 170 }}>
        {VISA_MAIL_TYPES.map((t) => {
          const n = vm[t.key]?.sent_count || 0
          return (
            <span key={t.key} title={t.label}
              style={{ fontSize: 11.5, color: n ? '#15803d' : '#bbb', background: n ? '#f0fdf4' : '#fafafa',
                border: '1px solid ' + (n ? '#bbf7d0' : '#eee'), borderRadius: 6, padding: '2px 5px' }}>
              {VISA_MAIL_SHORT[t.key] || t.label} {n}
            </span>
          )
        })}
      </div>
    )
  }

  // ── 步驟③ 簽證日期統計：依軌道把 active 學生（含已通過本步）按日期分組 ─────────
  //   vn → vn_collection_date（現場收件日）；other → other_visa_apply_date（學生回報預計辦簽證日）
  const visaDateGroups = (track) => {
    const key = track === 'vn' ? 'vn_collection_date' : 'other_visa_apply_date'
    const m = {}
    for (const x of active) {
      const d = x.steps?.[3]?.data || {}
      if ((d.visa_track === 'vn' ? 'vn' : 'other') !== track) continue
      const v = String(d[key] || '').slice(0, 10)
      if (!v) continue
      ;(m[v] ||= []).push(x)
    }
    return Object.entries(m).sort(([a], [b]) => (a < b ? -1 : 1))
  }

  const visaChartCard = () => {
    const section = (track, title, dateLabel, color, last) => {
      const groups = visaDateGroups(track)
      const total = groups.reduce((n, [, xs]) => n + xs.length, 0)
      const max = Math.max(1, ...groups.map(([, xs]) => xs.length))
      const sel = chartSel?.track === track ? chartSel.date : null
      const selStudents = sel ? (groups.find(([d]) => d === sel)?.[1] || []) : []
      return (
        <div style={{ padding: '14px 18px', borderBottom: last ? 'none' : '1px solid #f5f4f0' }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 3 }}>{title}</div>
          <div style={{ fontSize: 11.5, color: '#999', marginBottom: 10 }}>
            {groups.length ? `共 ${total} 人、${groups.length} 個日期；點長條可展開當日名單` : `目前沒有已填「${dateLabel}」的學生`}
          </div>
          {groups.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
              {groups.map(([date, xs]) => {
                const on = sel === date
                return (
                  <div key={date} onClick={() => setChartSel(on ? null : { track, date })}
                    title={`${date}：${xs.length} 人`}
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, cursor: 'pointer', flex: '0 0 auto', width: 48 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: on ? color : '#888' }}>{xs.length}</div>
                    <div style={{ width: 26, height: Math.max(6, Math.round((xs.length / max) * 90)),
                      background: on ? color : color + '55', borderRadius: '4px 4px 0 0' }} />
                    <div style={{ fontSize: 10, color: on ? color : '#999', fontWeight: on ? 700 : 400, whiteSpace: 'nowrap' }}>
                      {date.slice(5).replace('-', '/')}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          {sel && (
            <div style={{ marginTop: 10, border: '1px solid #eee', borderRadius: 10, padding: '10px 14px', background: '#faf9f6' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color }}>
                  {sel.replace(/-/g, '/')}（{selStudents.length} 人）{track === 'vn' ? ' 現場收件名單' : ' 預計辦簽證名單'}
                </span>
                <button onClick={() => setChartSel(null)} style={{ ...s.btn, ...s.btnSm, marginLeft: 'auto' }}>收合</button>
              </div>
              <div style={{ display: 'grid', gap: 4 }}>
                {selStudents.map((x) => {
                  const vm = VISA_STAGE_META[visaStageOf(x)] || VISA_STAGE_META.pending
                  return (
                    <div key={x.account} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600, minWidth: 88 }}>{x.name || '—'}</span>
                      <span style={{ color: '#999' }}>{x.account}</span>
                      <span style={{ color: '#888' }}>{deptZhFull(x.department) || x.department || '—'}</span>
                      <span style={{ color: '#888' }}>{x.center || x.campus || '—'}</span>
                      <Pill color={vm.color} bg={vm.bg}>{vm.label}</Pill>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )
    }
    return (
      <Card style={{ marginBottom: 16 }}>
        <CardHead left="📊 簽證日期統計" right="含已通過本步的學生，隨上方梯次×校區篩選" />
        {section('vn', '🇻🇳 越南學生 · 現場收件日期', '收件日期', '#be123c', false)}
        {section('other', '🌐 其他學生 · 回報預計辦簽證日期', '預計辦理簽證日期', '#0369a1', true)}
      </Card>
    )
  }

  // ── 步驟③ 簽證階段統計：卡在本步的學生依軌道 × visa_stage 計數，點格過濾下方名單 ──
  //   母體＝stuckAt(3)（open/submitted），不含已通過本步；補件中為旁支固定放最後一格
  const visaStageStrip = (rows) => {
    const TRACKS = [
      ['vn', '🇻🇳 越南學生', [...VISA_STAGES_VN, 'supplement'], '#be123c'],
      ['other', '🌐 其他學生', [...VISA_STAGES_OTHER, 'supplement'], '#0369a1'],
    ]
    return (
      <Card style={{ marginBottom: 16, padding: '12px 16px' }}>
        {TRACKS.map(([tk, tLabel, stages, tColor]) => {
          const trackRows = rows.filter((x) => visaTrackOf(x) === tk)
          return (
            <div key={tk} style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', padding: '5px 0' }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: tColor, width: 118, flexShrink: 0 }}>
                {tLabel}（{trackRows.length}）
              </span>
              {stages.map((sg) => {
                const m = VISA_STAGE_META[sg]
                const n = trackRows.filter((x) => visaStageOf(x) === sg).length
                const on = stageFilter?.track === tk && stageFilter?.stage === sg
                return (
                  <button key={sg} onClick={() => setStageFilter(on ? null : { track: tk, stage: sg })}
                    disabled={busy || (!n && !on)}
                    title={n || on ? '點選過濾下方名單，再點一次取消' : '目前沒有學生在此階段'}
                    style={{ border: '1.5px solid ' + (on ? m.color : (n ? m.bg : '#f0efeb')), borderRadius: 99,
                      padding: '4px 10px', fontSize: 12, cursor: (n || on) ? 'pointer' : 'default',
                      background: (n || on) ? m.bg : '#fbfaf8', color: (n || on) ? m.color : '#c4c1ba',
                      fontWeight: on ? 700 : 500, whiteSpace: 'nowrap' }}>
                    {m.label} {n}
                  </button>
                )
              })}
            </div>
          )
        })}
        <div style={{ fontSize: 11.5, color: '#a8a49c', marginTop: 6 }}>
          卡在本步學生的簽證階段分布（不含已通過本步），隨上方梯次×校區與「中心」下拉篩選；搜尋框不影響統計數字。
          點階段格可過濾下方名單，再點一次取消；此過濾僅影響顯示，不影響批次收件與寄信按鈕的對象。
        </div>
      </Card>
    )
  }

  // 步驟③「辦理時間」欄：列出簽證流程各節點的發生時間（只列有值的節點）
  const visaTimeCell = (stu) => {
    const d = stu.steps?.[3]?.data || {}
    const vFiles = (stu.files || []).filter((f) => f.step === 3 && f.kind === 'visa')
    const upAt = vFiles.length ? vFiles[0].uploaded_at : null   // 後端已按 uploaded_at desc 排序
    const items = (visaTrackOf(stu) === 'vn' ? [
      ['流程說明信', d.payment_pass_notice_sent_at],
      ['學生確認到場', d.vn_student_ack_at],
      ['現場收件', d.vn_documents_collected_at],
      ['簽證上傳', upAt],
    ] : [
      ['流程說明信', d.payment_pass_notice_sent_at],
      ['紙本寄出', d.paper_letter_sent_at],
      ['回報未收到', d.paper_letter_help_requested_at],
      ['回報已收到', d.paper_letter_received_at],
      ['回報簽證日期', d.other_visa_dates_submitted_at],
      ['簽證上傳', upAt],
    ]).filter(([, v]) => v)
    if (!items.length) return <span style={{ color: '#ccc' }}>—</span>
    return (
      <div style={{ display: 'grid', gap: 2 }}>
        {items.map(([l, v]) => (
          <div key={l} style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
            <span style={{ color: '#aaa' }}>{l}</span>{' '}
            <span style={{ color: '#555' }}>{fmtD(v)}</span>
          </div>
        ))}
      </div>
    )
  }

  // 名單表（每個步驟分頁共用）；搜尋框在最上方，同時篩此頁清單（步驟1含更名待審）
  const stepTable = (step) => {
    const rows = stuckAt(step)
    const matchCenter = (x) => centerFilter === 'all' || x.center === centerFilter
    const filtered = q || centerFilter !== 'all'
    const shown = rows.filter((x) => matchText(x.account, x.name, x.name_english) && matchCenter(x))
    // 簽證階段點選過濾只作用於表格顯示；批次收件（吃 shown）與寄信（吃 rows×中心）範圍不受影響
    const matchStage = (x) => step !== 3 || !stageFilter || (visaTrackOf(x) === stageFilter.track && visaStageOf(x) === stageFilter.stage)
    const listed = shown.filter(matchStage)
    const centers = [...new Set(active.map((x) => x.center).filter(Boolean))].sort()
    return (
      <>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
          <div style={{ flex: '1 1 260px', maxWidth: 360 }}>{searchInput}</div>
          <select value={centerFilter} onChange={(e) => setCenterFilter(e.target.value)}
            title="依面試中心篩選名單（批次寄信也會跟著篩）"
            style={{ ...s.sel, padding: '8px 12px', borderRadius: 99, background: 'white' }}>
            <option value="all">全部中心</option>
            {centers.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          {step === 3 && (
            <Btn disabled={busy} onClick={() => openBatchVn(shown.filter((x) => visaTrackOf(x) === 'vn'))}>
              🇻🇳 批次設定現場收件（{shown.filter((x) => visaTrackOf(x) === 'vn').length} 人）
            </Btn>
          )}
        </div>
        {step === 1 && nameReqBlock}
        <StatStrip items={[
          { label: '待處理', value: countState(step, 'open'), color: '#9d174d', bg: '#fdf2f8', border: '#fbcfe8' },
          { label: '待確認', value: countState(step, 'submitted'), color: '#b45309', bg: '#fffbeb', border: '#fde68a' },
          { label: '已通過本步', value: countState(step, 'confirmed'), color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' },
        ]} />
        {step === 3 && visaStageStrip(rows.filter(matchCenter))}
        {step === 3 && visaChartCard()}
        {mailControl(step, rows.filter(matchCenter))}
        <Card>
          <CardHead left={`當前卡在「${ENROLL_STEPS[step - 1]?.zh}」的學生（${listed.length}${(filtered || (step === 3 && stageFilter)) ? ` / ${rows.length}` : ''}）`} />
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: '#faf9f6' }}>
                {['姓名', '系所', '校區', '中心', '狀態', step === 3 ? '辦理時間' : '送出時間', '檔案', step === 3 ? '簽證通知' : '已寄通知', '操作'].map((h) => <th key={h} style={th}>{h}</th>)}
              </tr></thead>
              <tbody>
                {listed.map((stu) => {
                  const st = stepStateOf(stu, step)
                  const meta = STATE_META[st] || STATE_META.locked
                  const files = (stu.files || []).filter((f) => f.step === step)
                  const canConfirm = NEEDS_CONFIRM.has(step) && st === 'submitted'
                  const mr = mailRecips[stu.account]
                  return (
                    <tr key={stu.account}>
                      {nameCell(stu)}
                      <td style={td}>{deptZhFull(stu.department) || stu.department || '—'}</td>
                      <td style={td}>{stu.campus || '—'}</td>
                      <td style={td}>{stu.center || '—'}</td>
                      <td style={td}>
                        {step === 3 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start' }}>
                            <span style={{ fontSize: 11, fontWeight: 600, color: visaTrackOf(stu) === 'vn' ? '#be123c' : '#0369a1' }}>
                              {visaTrackOf(stu) === 'vn' ? '🇻🇳 越南學生' : '🌐 其他學生'}
                            </span>
                            {(() => { const vm = VISA_STAGE_META[visaStageOf(stu)] || VISA_STAGE_META.pending; return <Pill color={vm.color} bg={vm.bg}>{vm.label}</Pill> })()}
                            {(() => { const sig = visaSignalOf(stu); return <Pill color={sig.color} bg={sig.bg}>● {sig.label}</Pill> })()}
                          </div>
                        ) : (
                          <Pill color={meta.color} bg={meta.bg}>{meta.label}</Pill>
                        )}
                      </td>
                      <td style={{ ...td, color: '#888', whiteSpace: 'nowrap' }}>
                        {step === 3 ? visaTimeCell(stu) : fmtTime(stu.steps?.[step]?.submitted_at)}
                      </td>
                      <td style={td}>
                        {fileCell(files)}
                      </td>
                      <td style={{ ...td, whiteSpace: step === 3 ? 'normal' : 'nowrap', color: mr?.reminder_count ? '#555' : '#ccc' }}>
                        {step === 3 ? visaMailCell(stu) : (
                          mr?.reminder_count
                            ? `${mr.reminder_count} 次（${MAIL_TIER_SHORT[mr.last_reminder_kind] || '—'}）`
                            : '—'
                        )}
                      </td>
                      <td style={td}>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                          {step === 3 ? (
                            <>
                              <select value={visaStageOf(stu)} disabled={busy}
                                onChange={(e) => doSetVisaStage(stu, e.target.value)}
                                title="推進／修正簽證階段"
                                style={{ ...s.btn, ...s.btnSm, paddingRight: 4, cursor: 'pointer' }}>
                                {(visaTrackOf(stu) === 'vn' ? VISA_STAGES_VN : VISA_STAGES_OTHER).map((sg) => (
                                  <option key={sg} value={sg}>{VISA_STAGE_META[sg]?.label || sg}</option>
                                ))}
                                {/* 補件中為旁支不在推進序，但作為當前值時需有對應 option 才能正確顯示 */}
                                {visaStageOf(stu) === 'supplement' && <option value="supplement">{VISA_STAGE_META.supplement.label}</option>}
                              </select>
                              <button onClick={() => openVisaEdit(stu)} disabled={busy} title="查看／編輯此生的簽證辦理追蹤資料"
                                style={{ ...s.btn, ...s.btnSm }}>簽證辦理追蹤</button>
                              <button onClick={() => setVisaUp({ account: stu.account, name: stu.name })} disabled={busy}
                                style={{ ...s.btn, ...s.btnSm }}>⬆ 上傳簽證</button>
                              {visaStageOf(stu) === 'uploaded' && st !== 'confirmed' && (
                                <button onClick={() => doConfirm(stu, 3)} disabled={busy}
                                  style={{ ...s.btn, ...s.btnSm, background: ACCENT, color: '#fff', borderColor: ACCENT }}>確認</button>
                              )}
                              <button onClick={() => doAbandon(stu)} disabled={busy} style={{ ...s.btn, ...s.btnSm, color: '#b91c1c', borderColor: '#fecaca' }}>放棄</button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => openDetail(stu)} disabled={busy}
                                style={{ ...s.btn, ...s.btnSm }}>檢視</button>
                              {canConfirm && <button onClick={() => doConfirm(stu, step)} disabled={busy} style={{ ...s.btn, ...s.btnSm, background: ACCENT, color: '#fff', borderColor: ACCENT }}>確認</button>}
                              {step === 2 && st === 'submitted' && (
                                <button onClick={() => doReopenStep2(stu.account, stu.name)} disabled={busy}
                                  style={{ ...s.btn, ...s.btnSm, color: '#b45309', borderColor: '#fde68a' }}>↩ 退回</button>
                              )}
                              <button onClick={() => openComposer(step, [stu.account])} disabled={busy}
                                style={{ ...s.btn, ...s.btnSm }}>✉ 寄信</button>
                              <button onClick={() => doAbandon(stu)} disabled={busy} style={{ ...s.btn, ...s.btnSm, color: '#b91c1c', borderColor: '#fecaca' }}>放棄</button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {!listed.length && <tr><td colSpan={9} style={{ ...td, textAlign: 'center', color: '#aaa', padding: 28 }}>{loading ? '載入中…' : ((filtered || (step === 3 && stageFilter)) && rows.length ? '沒有符合搜尋／篩選的學生' : '目前沒有卡在這步的學生')}</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>

        {/* 已通過本步（confirmed）：預設摺疊。步驟① 提供「檢視 → 退回補件」入口；其餘步驟僅供對照。 */}
        {(() => {
          const passed = passedAt(step)
          const shownP = passed.filter((x) => matchText(x.account, x.name, x.name_english) && matchCenter(x))
          const canView = step === 1
          return (
            <Card style={{ marginTop: 16 }}>
              <div onClick={() => setShowPassed((v) => !v)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '14px 18px', userSelect: 'none' }}>
                <span style={{ fontSize: 13.5, color: '#15803d', fontWeight: 600 }}>{showPassed ? '▾' : '▸'} 已通過本步（{shownP.length}{filtered ? ` / ${passed.length}` : ''}）</span>
                <span style={{ fontSize: 12, color: '#999' }}>{showPassed ? '點此收合' : (canView ? '點此展開（含退回補件入口）' : '點此展開')}</span>
              </div>
              {showPassed && (
                <div style={{ overflowX: 'auto', borderTop: '1px solid #f0efeb' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr style={{ background: '#faf9f6' }}>
                      {['姓名', '系所', '校區', '中心', '通過時間', '檔案', ...(canView ? ['操作'] : [])].map((h) => <th key={h} style={th}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {shownP.map((stu) => {
                        const files = (stu.files || []).filter((f) => f.step === step)
                        return (
                          <tr key={stu.account}>
                            {nameCell(stu)}
                            <td style={td}>{deptZhFull(stu.department) || stu.department || '—'}</td>
                            <td style={td}>{stu.campus || '—'}</td>
                            <td style={td}>{stu.center || '—'}</td>
                            <td style={{ ...td, color: '#888', whiteSpace: 'nowrap' }}>{fmtTime(stu.steps?.[step]?.confirmed_at || stu.steps?.[step]?.submitted_at)}</td>
                            <td style={td}>
                              {fileCell(files)}
                            </td>
                            {canView && (
                              <td style={td}>
                                <button onClick={() => openDetail(stu)} disabled={busy}
                                  style={{ ...s.btn, ...s.btnSm }}>檢視</button>
                              </td>
                            )}
                          </tr>
                        )
                      })}
                      {!shownP.length && <tr><td colSpan={canView ? 7 : 6} style={{ ...td, textAlign: 'center', color: '#aaa', padding: 22 }}>{filtered && passed.length ? '沒有符合篩選的學生' : '目前還沒有人通過這步'}</td></tr>}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )
        })()}
      </>
    )
  }

  return (
    <PageShell title="實踐大學" subtitle="入學準備 · 後台管理" accent={ACCENT} toast={toast} intlBack stageKey="onboard" right={right}>
      {/* 分頁列 + 梯次篩選 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        {TABS.map((t) => (
          <button key={t.key} onClick={() => { setTab(t.key); setSearch(''); setShowPassed(false); setCenterFilter('all'); setChartSel(null); setStageFilter(null) }}
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
          <select style={{ ...s.sel, padding: '5px 8px' }} value={campus} onChange={(e) => { setCampus(e.target.value); setCenterFilter('all'); setStageFilter(null) }}>
            <option value="all">全部</option><option value="台北">台北</option><option value="高雄">高雄</option>
          </select>
        </div>
      </div>

      {/* ── 總覽 ── */}
      {tab === 'overview' && (
        <>
          <StatStrip items={[
            { label: '總人數（含放棄）', value: visible.length, sub: abandonedList.length ? `不含放棄 ${denom}` : null },
            { label: '已完成全部', value: completedN, color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0', sub: denom ? `${Math.round((completedN / denom) * 100)}%` : null },
            { label: '進行中', value: denom - completedN, color: '#b45309', bg: '#fffbeb', border: '#fde68a' },
            { label: '已放棄', value: abandonedList.length, color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
          ]} />
          <Card>
            <CardHead left="各步驟卡關人數（漏斗）" />
            <div style={{ padding: '14px 18px' }}>
              {ENROLL_STEPS.map((st) => {
                const n = stuckAt(st.step).length
                const passed = passedAt(st.step).length
                const pct = denom ? Math.round((n / denom) * 100) : 0
                return (
                  <div key={st.step} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 0', borderBottom: '1px solid #f5f4f0' }}>
                    <div style={{ width: 150, fontSize: 13.5, fontWeight: 500, whiteSpace: 'nowrap' }}>{'①②③④⑤'[st.step - 1]} {st.zh}</div>
                    <div style={{ flex: 1, height: 10, background: '#f3f4f6', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: ACCENT }} />
                    </div>
                    <div style={{ width: 78, textAlign: 'right', fontSize: 13, color: '#555', whiteSpace: 'nowrap' }}>卡關 {n}</div>
                    <div style={{ width: 82, textAlign: 'right', fontSize: 12.5, color: passed ? '#15803d' : '#bbb', whiteSpace: 'nowrap' }}>已通過 {passed}</div>
                    <button onClick={() => setTab(String(st.step))} style={{ ...s.btn, ...s.btnSm }}>查看</button>
                  </div>
                )
              })}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 0' }}>
                <div style={{ width: 150, fontSize: 13.5, fontWeight: 500, color: '#15803d', whiteSpace: 'nowrap' }}>🎉 已完成全部</div>
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
                        <td style={{ ...td, color: '#666' }}>總人數（含放棄）</td>
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
                  <div style={{ fontSize: 12, color: '#999', padding: '10px 18px 14px' }}>
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
      {tab === 'abandoned' && (() => {
        const shown = abandonedList.filter((x) => matchText(x.account, x.name, x.name_english))
        return (
          <>
            {searchBox}
            <Card>
              <CardHead left={`已放棄名單（${shown.length}${q ? ` / ${abandonedList.length}` : ''}）`} />
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr style={{ background: '#faf9f6' }}>
                    {['姓名', '系所', '校區', '中心', '放棄時間', '原因', '來源', '操作'].map((h) => <th key={h} style={th}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {shown.map((stu) => (
                      <tr key={stu.account}>
                        {nameCell(stu)}
                        <td style={td}>{deptZhFull(stu.department) || stu.department || '—'}</td>
                        <td style={td}>{stu.campus || '—'}</td>
                        <td style={td}>{stu.center || '—'}</td>
                        <td style={{ ...td, color: '#888', whiteSpace: 'nowrap' }}>{fmtTime(stu.abandoned_at)}</td>
                        <td style={{ ...td, color: '#666' }}>{stu.abandon_reason || '—'}</td>
                        <td style={td}>
                          {stu.abandoned_by === 'student'
                            ? <Pill color="#b45309" bg="#fffbeb">學生自行放棄</Pill>
                            : <span style={{ color: '#666' }}>行政{stu.abandoned_by ? `（${stu.abandoned_by}）` : ''}</span>}
                        </td>
                        <td style={td}><button onClick={() => doReactivate(stu)} disabled={busy} style={{ ...s.btn, ...s.btnSm }}>復原</button></td>
                      </tr>
                    ))}
                    {!shown.length && <tr><td colSpan={8} style={{ ...td, textAlign: 'center', color: '#aaa', padding: 28 }}>{q && abandonedList.length ? '沒有符合搜尋的學生' : '沒有已放棄的學生'}</td></tr>}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )
      })()}

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
            <div style={{ padding: '14px 18px' }}>
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
            <div style={{ padding: '14px 18px' }}>
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
            <div style={{ padding: '14px 18px' }}>
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
                      <img src={driveImageUrl(qrForm[c].trim())} alt={`${c} LINE QR`}
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
            <div style={{ padding: '14px 18px' }}>
              <div style={{ fontSize: 12.5, color: '#888', lineHeight: 1.8, marginBottom: 12 }}>
                上傳 Excel（.xlsx / .xls），以<b>帳號</b>對應學生，一次帶入<b>學號、房號、床位號、上課教室</b>。
                標題列需用中文欄名（帳號／學號／房號／床位號／上課教室，欄序不拘）。
                <b>空欄不會覆蓋</b>既有資料；重傳同一份檔會覆蓋有值的欄。先預覽、按「確認匯入」才寫入。
              </div>
              <div
                style={{ border: '2px dashed #ddd', borderRadius: 10, padding: 28, textAlign: 'center', background: '#fafaf8', cursor: 'pointer' }}
                onClick={() => !busy && impFileRef.current.click()}>
                <input ref={impFileRef} type="file" accept=".xls,.xlsx" style={{ display: 'none' }} onChange={handleImportFile} />
                <div style={{ fontSize: 26, marginBottom: 6 }}>⇪</div>
                <div style={{ fontSize: 14, color: '#555' }}>{busy ? '處理中…' : (impFileName || '點此選擇 Excel 檔（.xls / .xlsx）')}</div>
                <div style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>選檔後先顯示預覽，不會立即寫入</div>
              </div>
              {impError && <div style={{ color: '#dc2626', fontSize: 13, marginTop: 12, whiteSpace: 'pre-line' }}>{impError}</div>}
            </div>
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
                  <div style={{ fontSize: 13, color: '#b45309', lineHeight: 2, padding: '14px 18px', wordBreak: 'break-all' }}>
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
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: '14px 18px' }}>
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
              <div style={{ fontSize: 13.5, lineHeight: 2, padding: '14px 18px' }}>
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

      {/* 寄信視窗（系統內預覽＋批次寄出；關閉時重抓已寄次數） */}
      {composer && (
        <OnboardMailComposer
          step={composer.step}
          mailKind={composer.mailKind}
          recipients={composer.recipients}
          cfg={composer.cfg}
          markDraft={markMailDraft}
          markSent={markMailSent}
          onClose={() => { setComposer(null); if (['1','2','3','4','5'].includes(tab)) loadMailRecips(Number(tab)) }}
          onToast={showToast}
        />
      )}

      {/* 檢視資料彈窗（步驟①已填內容）＋ 退回補件 */}
      {detail && (
        <Modal title={`檢視資料 — ${detail.name || ''}（${detail.account}）`} onClose={() => setDetail(null)} width={640}>
          {detail.loading ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#999' }}>載入中…</div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12, fontSize: 13 }}>
                <span><b>學系</b>：{deptZhFull(detail.department) || detail.department || '—'}</span>
                <span><b>校區</b>：{detail.campus || '—'}</span>
                <span><b>資料確認</b>：{detail.step1_state === 'confirmed' ? '已完成' : '未完成'}</span>
              </div>
              {detail.data ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px', fontSize: 13 }}>
                  {[...ONBOARD_STEP1_FIELDS.prefill, ...ONBOARD_STEP1_FIELDS.fill].map((f) => {
                    let v = detail.data[f.key]
                    if (f.key === 'nationality' && v === '其他') v = detail.data.nationality_other || '其他'
                    return (
                      <div key={f.key} style={{ display: 'flex', gap: 6, padding: '5px 0', borderBottom: '1px solid #f5f4f0' }}>
                        <span style={{ color: '#999', flexShrink: 0, minWidth: 96 }}>{f.zh}</span>
                        <span style={{ fontWeight: 500, wordBreak: 'break-all' }}>{v == null || v === '' ? '—' : String(v)}</span>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div style={{ padding: 16, color: '#888', fontSize: 13 }}>此生尚未填寫「資料確認」，無可檢視內容。</div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
                <Btn onClick={() => doReopenStep1(detail.account, detail.name)}
                  disabled={busy || detail.step1_state !== 'confirmed'}>↩ 退回補件</Btn>
                <span style={{ fontSize: 12, color: '#888', lineHeight: 1.6, flex: 1 }}>
                  {detail.step1_state === 'confirmed'
                    ? '退回後學生的「資料確認」重新開啟可修正；若已進到繳費(未確認)會一併收回。之後到步驟①分頁寄信催補。'
                    : '此生尚未完成資料確認，無需退回。'}
                </span>
              </div>
            </>
          )}
        </Modal>
      )}

      {/* 上傳檔案站內預覽：走 driveImageUrl 的 lh3 圖片端點直接顯圖，繞過 Drive「需下載才能看」的預覽卡關 */}
      {preview && (
        <Modal title={`預覽 — ${preview.name}`} onClose={() => setPreview(null)} width={720}>
          <div style={{ padding: 12, textAlign: 'center' }}>
            <img src={driveImageUrl(preview.url)} alt={preview.name}
              style={{ maxWidth: '100%', maxHeight: '72vh', borderRadius: 8, boxShadow: '0 1px 6px rgba(0,0,0,.12)' }}
              onError={(e) => { e.currentTarget.style.display = 'none' }} />
            <div style={{ marginTop: 12, fontSize: 12.5, color: '#888', lineHeight: 1.7 }}>
              若上方沒有顯示（例如多頁 PDF），請 <a href={preview.url} target="_blank" rel="noreferrer" style={{ color: ACCENT }}>在 Drive 開啟原檔 ↗</a>
            </div>
          </div>
        </Modal>
      )}

      {visaEdit && (() => {
        const d = visaEdit.data || {}
        const setD = (k, v) => setVisaEdit((p) => ({ ...p, data: { ...(p.data || {}), [k]: v } }))
        const isVn = (d.visa_track === 'vn')
        const field = (key, label, type = 'text') => (
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 11.5, color: '#888', marginBottom: 3 }}>{label}</div>
            <input type={type} value={d[key] || ''} onChange={(e) => setD(key, e.target.value)}
              style={{ ...s.input, width: '100%', boxSizing: 'border-box', fontSize: 13 }} />
          </div>
        )
        return (
          <Modal title={`簽證辦理追蹤 — ${visaEdit.name || ''}（${visaEdit.account}）`} onClose={() => busy ? null : setVisaEdit(null)} width={620}>
            <div style={{ display: 'grid', gap: 14 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: ACCENT, marginBottom: 8 }}>基本設定</div>
                <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 11.5, color: '#888', marginBottom: 3 }}>簽證軌道</div>
                    <select value={d.visa_track || 'other'} onChange={(e) => setD('visa_track', e.target.value)}
                      style={{ ...s.sel, width: '100%', boxSizing: 'border-box' }}>
                      <option value="vn">越南學生</option>
                      <option value="other">其他學生</option>
                    </select>
                  </div>
                  {field('admission_letter_url', '錄取通知書電子檔連結')}
                </div>
                {d.payment_pass_notice_sent_at && <div style={{ fontSize: 12, color: '#15803d' }}>繳費通過通知已寄出：{fmtTime(d.payment_pass_notice_sent_at)}</div>}
                {d.payment_pass_notice_error && <div style={{ fontSize: 12, color: '#b91c1c' }}>繳費通過通知寄送失敗：{d.payment_pass_notice_error}</div>}
                {(d.payment_pass_notice_subject || d.payment_pass_notice_body) && (
                  <details style={{ marginTop: 8 }}>
                    <summary style={{ cursor: 'pointer', fontSize: 12.5, fontWeight: 700, color: ACCENT }}>查看寄出信件內容</summary>
                    <div style={{ marginTop: 8, border: '1px solid #eee', borderRadius: 10, overflow: 'hidden' }}>
                      <div style={{ padding: '10px 12px', background: '#faf9f6', borderBottom: '1px solid #eee' }}>
                        <div style={{ fontSize: 11.5, color: '#888', marginBottom: 4 }}>主旨</div>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: '#333', lineHeight: 1.5 }}>{d.payment_pass_notice_subject || '—'}</div>
                      </div>
                      <div style={{ padding: '10px 12px' }}>
                        <div style={{ fontSize: 11.5, color: '#888', marginBottom: 6 }}>信件內容</div>
                        <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 12.5, color: '#444', lineHeight: 1.75, margin: 0, maxHeight: 320, overflow: 'auto' }}>{d.payment_pass_notice_body || '—'}</pre>
                      </div>
                    </div>
                  </details>
                )}
              </div>

              {isVn ? (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: ACCENT, marginBottom: 8 }}>越南收件安排</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 10px' }}>
                    {field('vn_collection_date', '收件日期', 'date')}
                    {field('vn_collection_time', '收件時間', 'time')}
                    {field('vn_collection_city', '城市')}
                    {field('vn_collection_place', '收件地點')}
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 11.5, color: '#888', marginBottom: 3 }}>備註</div>
                    <textarea rows={3} value={d.vn_collection_note || ''} onChange={(e) => setD('vn_collection_note', e.target.value)}
                      style={{ ...s.input, width: '100%', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit', fontSize: 13 }} />
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <button onClick={() => setD('vn_documents_collected_at', d.vn_documents_collected_at ? '' : new Date().toISOString())}
                      style={{ ...s.btn, ...s.btnSm, ...(d.vn_documents_collected_at ? { background: '#dcfce7', color: '#15803d', borderColor: '#86efac' } : {}) }}>
                      {d.vn_documents_collected_at ? '已收件' : '標記已收件'}
                    </button>
                    {d.vn_student_ack_at && <span style={{ fontSize: 12, color: '#15803d' }}>學生已確認會到場：{fmtTime(d.vn_student_ack_at)}</span>}
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: ACCENT, marginBottom: 8 }}>非越南紙本與簽證日期</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 10px' }}>
                    {field('paper_letter_sent_at', '紙本寄出日期', 'date')}
                    {field('paper_letter_deadline', '未收到聯繫期限', 'date')}
                    {field('paper_letter_tracking_no', '掛號 / 追蹤號碼')}
                    {field('other_visa_apply_date', '學生回報辦理日期', 'date')}
                    {field('other_visa_expected_date', '學生回報預計取得日期', 'date')}
                  </div>
                  <div style={{ fontSize: 12, color: '#666', lineHeight: 1.8 }}>
                    {d.paper_letter_received_at && <div style={{ color: '#15803d' }}>學生已回報收到紙本：{fmtTime(d.paper_letter_received_at)}</div>}
                    {d.paper_letter_help_requested_at && <div style={{ color: '#b45309' }}>學生回報尚未收到、需要協助：{fmtTime(d.paper_letter_help_requested_at)}</div>}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <Btn disabled={busy} onClick={() => setVisaEdit(null)}>取消</Btn>
                <Btn variant="primary" disabled={busy} onClick={saveVisaEdit}>儲存追蹤資料</Btn>
              </div>
            </div>
          </Modal>
        )
      })()}

      {/* 步驟③ 批次設定越南軌現場收件資訊：對開啟時的篩選名單逐筆寫入（空欄不覆蓋） */}
      {batchVn && (
        <Modal title={`批次設定現場收件 — 越南學生 ${batchVn.targets.length} 人`} onClose={() => busy ? null : setBatchVn(null)} width={640}>
          <div style={{ fontSize: 12.5, color: '#888', lineHeight: 1.7, marginBottom: 12 }}>
            將下方收件資訊寫入所有勾選的越南學生（依開啟時的搜尋／中心篩選帶入）。
            <b>只更新有填的欄位</b>，空欄不會覆蓋學生既有資料；寫入後可再逐人用「簽證辦理追蹤」微調。
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 10px' }}>
            {[['vn_collection_date', '收件日期', 'date'], ['vn_collection_time', '收件時間', 'time'],
              ['vn_collection_city', '收件城市', 'text'], ['vn_collection_place', '收件地點', 'text']].map(([k, label, type]) => (
              <div key={k} style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 11.5, color: '#888', marginBottom: 3 }}>{label}</div>
                <input type={type} value={batchVn.fields[k]}
                  onChange={(e) => setBatchVn((p) => ({ ...p, fields: { ...p.fields, [k]: e.target.value } }))}
                  style={{ ...s.input, width: '100%', boxSizing: 'border-box', fontSize: 13 }} />
              </div>
            ))}
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11.5, color: '#888', marginBottom: 3 }}>備註（會顯示在學生端與通知信）</div>
            <textarea rows={2} value={batchVn.fields.vn_collection_note}
              onChange={(e) => setBatchVn((p) => ({ ...p, fields: { ...p.fields, vn_collection_note: e.target.value } }))}
              style={{ ...s.input, width: '100%', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit', fontSize: 13 }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: ACCENT }}>
              套用對象（已勾 {batchVn.targets.filter((t) => t.checked).length} / {batchVn.targets.length} 人）
            </span>
            <label style={{ marginLeft: 'auto', fontSize: 12, color: '#666', cursor: 'pointer', userSelect: 'none' }}>
              <input type="checkbox" checked={batchVn.targets.every((t) => t.checked)}
                onChange={(e) => setBatchVn((p) => ({ ...p, targets: p.targets.map((t) => ({ ...t, checked: e.target.checked })) }))} /> 全選
            </label>
          </div>
          <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid #eee', borderRadius: 8, padding: '6px 10px', marginBottom: 14 }}>
            {batchVn.targets.map((t) => (
              <label key={t.account} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 12.5, cursor: 'pointer', borderBottom: '1px solid #f7f6f2' }}>
                <input type="checkbox" checked={t.checked}
                  onChange={(e) => setBatchVn((p) => ({ ...p, targets: p.targets.map((x) => (x.account === t.account ? { ...x, checked: e.target.checked } : x)) }))} />
                <span style={{ fontWeight: 600, minWidth: 88 }}>{t.name || '—'}</span>
                <span style={{ color: '#999' }}>{t.account}</span>
                <span style={{ color: '#888' }}>{t.center || '—'}</span>
                <span style={{ marginLeft: 'auto', color: t.cur ? '#b45309' : '#bbb', fontSize: 11.5 }}>
                  {t.cur ? `現排 ${t.cur.replace(/-/g, '/')}` : '未排收件'}
                </span>
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
            {busy && batchVn.prog && <span style={{ fontSize: 12, color: ACCENT }}>寫入中 {batchVn.prog.done}/{batchVn.prog.total}…</span>}
            <Btn disabled={busy} onClick={() => setBatchVn(null)}>取消</Btn>
            <Btn variant="primary" disabled={busy} onClick={doBatchVn}>
              批次寫入（{batchVn.targets.filter((t) => t.checked).length} 人）
            </Btn>
          </div>
        </Modal>
      )}

      {visaUp && (
        <Modal title={`上傳簽證 — ${visaUp.name || ''}（${visaUp.account}）`} onClose={() => busy ? null : setVisaUp(null)} width={480}>
          <div style={{ padding: 4, fontSize: 13, color: '#555', lineHeight: 1.85 }}>
            <p style={{ margin: '0 0 14px' }}>
              為此學生上傳簽證頁掃描／清晰照片（JPG／PNG／WEBP／HEIC／PDF，上限約 3&nbsp;MB）。
              上傳成功後簽證階段自動變為「已上傳待審」，仍須另按「確認」才會開啟下一步。
            </p>
            <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,application/pdf" disabled={busy}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) doVisaUpload(f); e.target.value = '' }} />
            {busy && <p style={{ color: ACCENT, marginTop: 12, fontWeight: 600 }}>上傳中…請稍候</p>}
          </div>
        </Modal>
      )}
    </PageShell>
  )
}
