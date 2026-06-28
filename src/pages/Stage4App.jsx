import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { PageShell } from '../components/PageShell'
import { Btn, Card, CardHead, Pill, s } from '../components/UI'
import { writeXlsx, writeXlsxMulti } from '../components/ExportBtn'
import AdmitMailComposer from '../components/AdmitMailComposer'
import TransferModal from '../components/TransferModal'
import { buildMessage } from '../mailTemplates'
import {
  getStage4Data, getStage4Rejected, syncStage4FromStage3, updateStage4Status,
  getDepartmentQuotas, getDepartmentCampuses,
  getStage4Settings, saveStage4Settings, getMailLog,
  upsertStage4TestRow, createDrafts, sendDraftBatch,
  getTransferTargets, doTransfer,
} from '../api'
import { getTeacher, logoutTeacher } from '../auth'
import { batchInfo, batchOf, deptZhFull, deptI18n, DEPT_I18N, resolveCampus } from '../constants'

const ACCENT = '#7c2d12'
const CAMP_ORDER = { '台北校區': 0, '高雄校區': 1, '其他': 2 }

const TABS = [
  { key: 'admit',    label: '正取' },
  { key: 'wait',     label: '備取' },
  { key: 'declined', label: '正取拒絕' },
  { key: 'reject',   label: '不錄取' },
  { key: 'tools',    label: '發送設定' },
]

// 設定列(DB) ↔ composer defaults
const defaultsFromSettings = (st) => ({
  replyBy:       st?.reply_by || '',
  announceDate:  st?.announce_date || '',
  contactPerson: st?.contact_person || '',
  contactEmail:  st?.contact_email || 'shihchien_ifp@g2.usc.edu.tw',
  unitName:      st?.unit_name || '國際事務處 Office of International Affairs',
})

// 工具頁用
const KIND_LABEL = {
  s4_admit: '預錄取意願調查（正取・含連結）',
  s4_promote: '備取遞補意願調查（含連結）',
  s4_admit_declined: '放棄後感謝信（單向）',
  s4_reject: '不錄取感謝信（單向）',
}
const CS_LABEL = {
  pending: '未回應', enrolled: '就讀/遞補就讀', declined: '放棄', transferred: '已轉報',
  negotiating: '遞補詢問中', settled_elsewhere: '已確認他系', passed: '已略過', standby: '備取待機',
}
const TEST_ACCOUNT = 'S4TEST0001'
const genTestToken = () => ('s4test' + (crypto?.randomUUID?.().replace(/-/g, '') || Math.random().toString(36).slice(2) + Date.now().toString(36))).slice(0, 40)
const sampleMailData = (kind, lang) => {
  const il = { EN: 'en', VI: 'vi', ID: 'id' }[lang] || 'en'
  const isPromote = kind === 's4_promote'
  return {
    中文姓名: '測試 同學', 英文姓名: 'Test Student',
    系所中: '資訊管理學系(專)', 系所外: deptI18n('資訊管理學系(專)', il),
    類別中: isPromote ? '備取1' : '正取', 類別外: isPromote ? 'Waitlist No. 1' : 'Admitted',
    確認連結: `${window.location.origin}/#/confirm?t=（測試占位）`,
    回覆期限: '2026/07/20', 正式放榜日期: '2026/07/25',
    自訂中: '（自訂段落：本校其他學程／下一梯次仍在招生…）',
    自訂外: '(Custom block: our other program is still open for the next intake…)',
    承辦人: '測試承辦', 聯絡信箱: 'shihchien_ifp@g2.usc.edu.tw', 單位名稱: '國際事務處 Office of International Affairs',
  }
}

// 頁面頂端統計總覽列（純呈現）。items: [{ label, value, color?, bg?, border?, sub? }]
function StatStrip({ items }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
      {items.map((it) => (
        <div key={it.label} style={{
          flex: '1 1 120px', minWidth: 104,
          background: it.bg || '#faf9f6',
          border: '1px solid ' + (it.border || '#eceae5'),
          borderRadius: 12, padding: '10px 14px',
        }}>
          <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.1, color: it.color || '#1a1a18' }}>{it.value}</div>
          <div style={{ fontSize: 12, color: '#888', marginTop: 3 }}>{it.label}</div>
          {it.sub != null && <div style={{ fontSize: 11, color: '#aaa', marginTop: 1 }}>{it.sub}</div>}
        </div>
      ))}
    </div>
  )
}

// 單一校區的彙總（欄位與 admitTotals 一致）
function campusTotals(list) {
  const t = list.reduce((a, x) => ({
    total: a.total + x.total, enrolled: a.enrolled + x.enrolled,
    declined: a.declined + x.declined, pending: a.pending + x.pending,
    promoted: a.promoted + x.promotedEnrolled,
  }), { total: 0, enrolled: 0, declined: 0, pending: 0, promoted: 0 })
  const responded = t.enrolled + t.declined
  return { ...t, finalEnroll: t.enrolled + t.promoted, responded,
    rate: t.total ? Math.round((responded / t.total) * 100) : null }
}

export default function Stage4App() {
  const teacher = getTeacher()
  const [tab, setTab]         = useState('admit')
  const [data, setData]       = useState([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy]       = useState(false)
  const [toast, setToast]     = useState(null)
  const [quotas, setQuotas]   = useState({})
  const [campusOv, setCampusOv] = useState({})
  const [settings, setSettings] = useState({})       // { '1': {...}, '2': {...} }
  const [rejectedData, setRejectedData] = useState([]) // 不錄取（即時計算，扁平列）
  const [mailLogs, setMailLogs] = useState({})         // { 's4_admit_declined': {acct:{status}}, 's4_reject': {...} }
  // 工具頁狀態
  const [testForm, setTestForm] = useState({ dept: DEPT_I18N[0][0], cat: 'admitted', rank: 1, status: 'pending', deadline: '', expired: false })
  const [testLink, setTestLink] = useState('')
  const testTokenRef = useRef({})  // { 系所: token } 每系所穩定一組 token
  const [pvKind, setPvKind] = useState('s4_admit')
  const [pvLang, setPvLang] = useState('EN')
  const [selfEmail, setSelfEmail] = useState('shihchien_ifp@g2.usc.edu.tw')
  const [settingsForm, setSettingsForm] = useState({ 1: {}, 2: {} }) // 梯次設定編輯暫存
  const [batchFilter, setBatchFilter] = useState('') // '' 全部 / '1' / '2'
  const [selDept, setSelDept] = useState('')         // 展開中的系所（正取頁）
  const [mail, setMail]       = useState(null)        // { kind, recipients, batch }
  const [transfer, setTransfer] = useState(null)      // { row, depts }
  const [updatedAt, setUpdatedAt] = useState('')
  const busyRef = useRef(false)
  useEffect(() => { busyRef.current = busy }, [busy])

  useEffect(() => { if (!teacher || teacher.role !== 'superadmin') window.location.hash = '#/login?stage=stage4' }, [teacher])

  const showToast = useCallback((msg, type = 'ok') => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3500)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await getStage4Data()
      setData((rows || []).filter((r) => !r.is_test))   // 測試列不進正式統計
      setUpdatedAt(new Date().toLocaleTimeString('zh-TW', { hour12: false }))
    } catch (e) {
      showToast('載入失敗：' + e.message, 'error')
    } finally { setLoading(false) }
  }, [showToast])
  useEffect(() => { load() }, [load])

  const refreshThanks = useCallback(async () => {
    try {
      const [rej, dl, rj] = await Promise.all([
        getStage4Rejected(),
        getMailLog('s4_admit_declined'),
        getMailLog('s4_reject'),
      ])
      setRejectedData(rej || [])
      setMailLogs({ s4_admit_declined: dl || {}, s4_reject: rj || {} })
    } catch { /* 靜默 */ }
  }, [])

  useEffect(() => {
    getDepartmentQuotas().then((q) => setQuotas(q || {})).catch(() => {})
    getDepartmentCampuses().then((o) => setCampusOv(o || {})).catch(() => {})
    getStage4Settings().then((m) => setSettings(m || {})).catch(() => {})
    refreshThanks()
  }, [refreshThanks])

  // 設定載入後，填入梯次設定編輯暫存
  useEffect(() => {
    setSettingsForm({
      1: { ...(settings['1'] || {}) },
      2: { ...(settings['2'] || {}) },
    })
  }, [settings])

  // 30 秒自動輪詢（正取/備取頁需即時統計）
  useEffect(() => {
    const tick = () => { if (document.hidden || loading || busyRef.current) return; load() }
    const timer = setInterval(tick, 30000)
    const onVis = () => { if (!document.hidden) tick() }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVis) }
  }, [load, loading])

  // 梯次篩選
  const inBatch = useCallback((r) => !batchFilter || String(batchOf(r.account)) === batchFilter, [batchFilter])

  // 正取列（套梯次）
  const admitRows = useMemo(
    () => data.filter((r) => r.stage3_status === 'admitted' && inBatch(r)),
    [data, inBatch],
  )

  // 各系統計（正取頁卡片）
  const admitSummary = useMemo(() => {
    const m = {}
    const ensure = (dept) => (m[dept] ||= { dept, total: 0, enrolled: 0, declined: 0, pending: 0, promotedEnrolled: 0 })
    for (const r of admitRows) {
      const x = ensure(r.department); x.total += 1
      if (r.contact_status === 'enrolled') x.enrolled += 1
      else if (r.contact_status === 'declined') x.declined += 1
      else x.pending += 1
    }
    // 遞補就讀：同系 waitlisted 且 enrolled（也套梯次）
    for (const r of data) {
      if (r.stage3_status === 'waitlisted' && r.contact_status === 'enrolled' && inBatch(r)) {
        ensure(r.department).promotedEnrolled += 1
      }
    }
    return Object.values(m).sort((a, b) => a.dept.localeCompare(b.dept, 'zh-TW'))
  }, [admitRows, data, inBatch])

  // 依校區分組
  const admitByCampus = useMemo(() => {
    const g = {}
    for (const su of admitSummary) {
      const camp = resolveCampus(su.dept, campusOv)
      ;(g[camp] ||= []).push(su)
    }
    return Object.entries(g).sort((a, b) => (CAMP_ORDER[a[0]] ?? 9) - (CAMP_ORDER[b[0]] ?? 9))
  }, [admitSummary, campusOv])

  // 正取頁整體彙總
  const admitTotals = useMemo(() => {
    const t = admitSummary.reduce((a, x) => ({
      total: a.total + x.total, enrolled: a.enrolled + x.enrolled,
      declined: a.declined + x.declined, pending: a.pending + x.pending,
      promoted: a.promoted + x.promotedEnrolled,
    }), { total: 0, enrolled: 0, declined: 0, pending: 0, promoted: 0 })
    const responded = t.enrolled + t.declined
    return { ...t, finalEnroll: t.enrolled + t.promoted, responded,
      rate: t.total ? Math.round((responded / t.total) * 100) : null }
  }, [admitSummary])

  // 展開系所的學生列
  const selRows = useMemo(
    () => admitRows.filter((r) => r.department === selDept)
      .sort((a, b) => (a.preference_order || 99) - (b.preference_order || 99) || (b.stage2_score || 0) - (a.stage2_score || 0)),
    [admitRows, selDept],
  )

  // 寄信名單（正取意願調查：正取・未回應・有 Email・套梯次）
  const notifyList = useMemo(
    () => admitRows.filter((r) => r.contact_status === 'pending' && r.appInfo?.email),
    [admitRows],
  )

  const settingsBatch = batchFilter || '1'   // 全部時設定預設綁第一梯
  const openMail = (recipients, kind = 's4_admit') => {
    if (!recipients.length) { showToast('沒有可寄送的對象（需有 Email）', 'warn'); return }
    setMail({ kind, recipients, batch: settingsBatch })
  }

  const setStatus = async (row, status) => {
    if (busy) return
    setBusy(true)
    try {
      await updateStage4Status(row.id, { contact_status: status })
      // 放棄不自動遞補；遞補一律在「備取」頁手動處理
      showToast(`已將 ${row.appInfo?.name || row.account} 標記為${status === 'enrolled' ? '就讀' : '放棄'}`)
      await load()
    } catch (e) { showToast('操作失敗：' + e.message, 'error') }
    finally { setBusy(false) }
  }

  const openTransfer = async (row) => {
    try {
      const depts = await getTransferTargets(row.account)
      if (!depts.length) { showToast('查無可轉報的系所（已報考所有系所）', 'warn'); return }
      setTransfer({ row, depts })
    } catch (e) { showToast('載入可轉報系所失敗：' + e.message, 'error') }
  }

  const confirmTransfer = async (toDepartment, note) => {
    if (busy || !transfer) return
    setBusy(true)
    try {
      await doTransfer({ row: transfer.row, toDepartment, note })
      const nm = transfer.row.appInfo?.name || transfer.row.account
      setTransfer(null)
      showToast(`已將 ${nm} 轉報至 ${toDepartment}，請至第二階段重新評分`)
      await load()
    } catch (e) { showToast('轉報失敗：' + e.message, 'error') }
    finally { setBusy(false) }
  }

  const saveNote = async (row, value) => {
    if ((row.admin_note || '') === value) return
    try {
      await updateStage4Status(row.id, { admin_note: value })
      setData((prev) => prev.map((r) => (r.id === row.id ? { ...r, admin_note: value } : r)))
    } catch (e) { showToast('備注儲存失敗：' + e.message, 'error') }
  }

  const doSync = async () => {
    if (busy) return
    if (!window.confirm('將從第三階段（正取 + 備取）同步名單到第四階段。\n已在進行中（就讀 / 放棄 / 遞補…）的資料不會被覆蓋。\n確定要同步嗎？')) return
    setBusy(true)
    try { const n = await syncStage4FromStage3(); showToast(`已同步 ${n} 筆名單`); await load() }
    catch (e) { showToast('同步失敗：' + e.message, 'error') }
    finally { setBusy(false) }
  }

  const exportEnrolled = () => {
    const out = data.filter((r) => r.contact_status === 'enrolled').map((r) => ({
      account: r.account ?? '', batch_label: batchInfo(r.account).label,
      name: r.appInfo?.name ?? '', name_english: r.appInfo?.name_english ?? '',
      department: r.department ?? '', center: r.center ?? '',
      category: r.stage3_status === 'admitted' ? '正取就讀' : '遞補就讀',
    }))
    if (!out.length) { showToast('目前沒有確認就讀的學生', 'warn'); return }
    writeXlsx(
      [
        { key: 'account', label: '帳號' }, { key: 'batch_label', label: '梯次' },
        { key: 'name', label: '中文姓名' }, { key: 'name_english', label: '英文姓名' },
        { key: 'department', label: '科系' }, { key: 'center', label: '中心' }, { key: 'category', label: '類別' },
      ], out, '第四階段最終就讀名單.xlsx',
    )
    showToast(`已匯出 ${out.length} 筆就讀名單`)
  }

  // ── 工具頁處理器 ──
  const setSF = (b, k, v) => setSettingsForm((f) => ({ ...f, [b]: { ...(f[b] || {}), [k]: v } }))
  const saveBatchSettings = async (b) => {
    if (busy) return
    setBusy(true)
    try {
      const f = settingsForm[b] || {}
      await saveStage4Settings(b, {
        announce_date: f.announce_date || '',
        reply_by: f.reply_by || '',
        contact_person: f.contact_person || '',
        contact_email: f.contact_email || '',
      })
      const m = await getStage4Settings(); setSettings(m || {})
      showToast(`已儲存第${b === '2' ? '二' : '一'}梯設定`)
    } catch (e) { showToast('儲存設定失敗：' + e.message, 'error') }
    finally { setBusy(false) }
  }

  const createTestRow = async () => {
    if (busy) return
    setBusy(true)
    try {
      const dept = testForm.dept || DEPT_I18N[0][0]
      const map = testTokenRef.current || {}
      if (!map[dept]) map[dept] = genTestToken()
      testTokenRef.current = map
      const deadlineIso = testForm.expired
        ? '2000-01-01T23:59:59+08:00'
        : (testForm.deadline ? `${testForm.deadline.replace(/\//g, '-')}T23:59:59+08:00` : null)
      const row = {
        account: TEST_ACCOUNT, department: dept, center: '測試中心',
        stage3_status: testForm.cat,
        standby_rank: testForm.cat === 'waitlisted' ? Number(testForm.rank || 1) : null,
        contact_status: testForm.status,
        confirm_token: map[dept],
        confirm_deadline: deadlineIso,
      }
      const saved = await upsertStage4TestRow(row)
      const token = saved?.confirm_token || map[dept]
      map[dept] = token
      setTestLink(`${window.location.origin}/#/confirm?t=${token}`)
      showToast('測試帳號已建立/更新，可開啟下方連結檢視落地頁')
    } catch (e) { showToast('建立測試帳號失敗：' + e.message, 'error') }
    finally { setBusy(false) }
  }

  const sendSelf = async () => {
    if (!selfEmail.trim()) { showToast('請填收件信箱', 'warn'); return }
    if (busy) return
    setBusy(true)
    try {
      const m = buildMessage({ kind: pvKind, lang: pvLang, data: sampleMailData(pvKind, pvLang) })
      const res = await createDrafts([{ to: selfEmail.trim(), subject: m.subject, body: m.body }])
      const id = res.drafts?.[0]?.draftId
      if (!id) throw new Error('草稿建立失敗')
      await sendDraftBatch([id])
      showToast(`已寄出測試信到 ${selfEmail.trim()}`)
    } catch (e) { showToast('寄送失敗：' + e.message, 'error') }
    finally { setBusy(false) }
  }

  const exportAll = () => {
    const main = data.map((r) => ({
      account: r.account ?? '', batch: batchInfo(r.account).label,
      name: r.appInfo?.name ?? '', name_english: r.appInfo?.name_english ?? '', email: r.appInfo?.email ?? '',
      department: r.department ?? '', center: r.center ?? '',
      stage3: r.stage3_status === 'admitted' ? '正取' : r.stage3_status === 'waitlisted' ? `備取${r.standby_rank ?? ''}` : (r.stage3_status ?? ''),
      contact: CS_LABEL[r.contact_status] || r.contact_status || '',
      score: r.stage2_score ?? '', preference: r.preference_order ?? '',
      confirmed_at: r.confirmed_at ?? '', deadline: r.confirm_deadline ?? '', note: r.admin_note ?? '',
    }))
    const rej = (rejectedData || []).map((r) => ({
      account: r.account, batch: batchInfo(r.account).label,
      name: r.name, name_english: r.name_english, email: r.email,
      department: r.department, center: r.center,
    }))
    const mainCols = [
      { key: 'account', label: '帳號' }, { key: 'batch', label: '梯次' },
      { key: 'name', label: '中文姓名' }, { key: 'name_english', label: '英文姓名' }, { key: 'email', label: 'Email' },
      { key: 'department', label: '系所' }, { key: 'center', label: '中心' },
      { key: 'stage3', label: '放榜身分' }, { key: 'contact', label: '回應狀態' },
      { key: 'score', label: '二階分數' }, { key: 'preference', label: '志願序' },
      { key: 'confirmed_at', label: '回覆時間' }, { key: 'deadline', label: '回覆期限' }, { key: 'note', label: '備注' },
    ]
    const rejCols = [
      { key: 'account', label: '帳號' }, { key: 'batch', label: '梯次' },
      { key: 'name', label: '中文姓名' }, { key: 'name_english', label: '英文姓名' }, { key: 'email', label: 'Email' },
      { key: 'department', label: '最高志願系所' }, { key: 'center', label: '中心' },
    ]
    if (!main.length && !rej.length) { showToast('目前沒有可匯出的資料', 'warn'); return }
    writeXlsxMulti([
      { name: '第四階段全名單', columns: mainCols, rows: main },
      { name: '不錄取名單', columns: rejCols, rows: rej },
    ], '第四階段全部資料.xlsx')
    showToast(`已匯出（正取備取 ${main.length} 筆、不錄取 ${rej.length} 筆）`)
  }

  // ── 備取頁資料 ──
  const waitRows = useMemo(
    () => data.filter((r) => r.stage3_status === 'waitlisted' && inBatch(r)),
    [data, inBatch],
  )
  // 各系備取統計 + 可遞補缺額（缺額 = 正取放棄數 − 已詢問 − 已遞補就讀）
  const waitSummary = useMemo(() => {
    const m = {}
    const ensure = (dept) => (m[dept] ||= { dept, total: 0, negotiating: 0, enrolled: 0, declined: 0, pending: 0, declinesAdmit: 0, openSlots: 0 })
    for (const r of waitRows) {
      const x = ensure(r.department); x.total += 1
      if (r.contact_status === 'negotiating') x.negotiating += 1
      else if (r.contact_status === 'enrolled') x.enrolled += 1
      else if (r.contact_status === 'declined') x.declined += 1
      else x.pending += 1
    }
    for (const r of admitRows) { if (r.contact_status === 'declined' || r.contact_status === 'transferred') ensure(r.department).declinesAdmit += 1 }
    for (const x of Object.values(m)) { x.openSlots = Math.max(0, x.declinesAdmit - x.negotiating - x.enrolled) }
    return Object.values(m).sort((a, b) => a.dept.localeCompare(b.dept, 'zh-TW'))
  }, [waitRows, admitRows])

  const waitByCampus = useMemo(() => {
    const g = {}
    for (const su of waitSummary) { const camp = resolveCampus(su.dept, campusOv); (g[camp] ||= []).push(su) }
    return Object.entries(g).sort((a, b) => (CAMP_ORDER[a[0]] ?? 9) - (CAMP_ORDER[b[0]] ?? 9))
  }, [waitSummary, campusOv])

  const totalOpenSlots = useMemo(() => waitSummary.reduce((n, x) => n + x.openSlots, 0), [waitSummary])

  // 備取頁整體彙總
  const waitTotals = useMemo(() => waitSummary.reduce((a, x) => ({
    total: a.total + x.total, negotiating: a.negotiating + x.negotiating,
    enrolled: a.enrolled + x.enrolled, declined: a.declined + x.declined,
    pending: a.pending + x.pending,
  }), { total: 0, negotiating: 0, enrolled: 0, declined: 0, pending: 0 }), [waitSummary])

  // 展開系所的備取生（依 standby_rank）
  const selWaitRows = useMemo(
    () => waitRows.filter((r) => r.department === selDept)
      .sort((a, b) => (a.standby_rank || 99) - (b.standby_rank || 99)),
    [waitRows, selDept],
  )
  const selOpenSlots = useMemo(() => waitSummary.find((x) => x.dept === selDept)?.openSlots || 0, [waitSummary, selDept])
  // 可遞補候選 id：pending 中名次最前的 openSlots 位
  const eligibleIds = useMemo(() => {
    const pend = selWaitRows.filter((r) => r.contact_status === 'pending')
    return new Set(pend.slice(0, selOpenSlots).map((r) => r.id))
  }, [selWaitRows, selOpenSlots])

  // 遞補通知：先轉 negotiating（佔住缺額），再開 s4_promote 寄信視窗
  const promoteNotify = async (rows) => {
    const withEmail = rows.filter((r) => r.appInfo?.email)
    if (!withEmail.length) { showToast('這些備取生沒有 Email，無法寄送', 'warn'); return }
    setBusy(true)
    try {
      for (const r of withEmail.filter((r) => r.contact_status === 'pending')) {
        await updateStage4Status(r.id, { contact_status: 'negotiating' })
      }
      await load()
      setMail({ kind: 's4_promote', recipients: withEmail.map((r) => ({ ...r, contact_status: 'negotiating' })), batch: settingsBatch })
    } catch (e) { showToast('遞補通知失敗：' + e.message, 'error') }
    finally { setBusy(false) }
  }

  // ── 正取拒絕頁 / 不錄取頁 資料（正規化成共用 item 形狀）──
  const declinedItems = useMemo(() => data
    .filter((r) => r.contact_status === 'declined' && inBatch(r))
    .map((r) => ({
      key: r.id, dept: r.department, account: r.account, center: r.center || '',
      name: r.appInfo?.name || '', name_english: r.appInfo?.name_english || '',
      email: r.appInfo?.email || '',
      category: r.stage3_status === 'admitted' ? '正取放棄' : '備取放棄',
      _raw: r,
    })), [data, inBatch])
  const rejectedItems = useMemo(() => (rejectedData || [])
    .filter((r) => inBatch(r))
    .map((r) => ({
      key: r.account, dept: r.department, account: r.account, center: r.center || '',
      name: r.name || '', name_english: r.name_english || '',
      email: r.email || '', category: '不錄取', _raw: r,
    })), [rejectedData, inBatch])

  if (!teacher || teacher.role !== 'superadmin') return null
  const headerBtn = { background: 'none', borderColor: '#ffffff44', color: '#fde7d4' }
  const th = { padding: '9px 10px', textAlign: 'left', borderBottom: '1px solid #e8e7e3', color: '#666', fontWeight: 500, fontSize: 12 }
  const td = { padding: '8px 10px', borderBottom: '1px solid #f5f4f0', fontSize: 13 }
  const lbl = { fontSize: 12, color: '#666', display: 'block', marginBottom: 3 }

  // 名額徽章
  const quotaBadge = (dept, admittedN) => {
    const q = quotas[dept]
    if (q == null) return null
    const diff = q - admittedN
    const txt = diff > 0 ? `尚可錄取 ${diff}` : diff === 0 ? '已達預計' : `超收 ${-diff}`
    const col = diff > 0 ? { c: '#0f766e', b: '#ccfbf1' } : diff === 0 ? { c: '#6b7280', b: '#f3f4f6' } : { c: '#b91c1c', b: '#fee2e2' }
    return <Pill color={col.c} bg={col.b}>{txt}</Pill>
  }

  // 感謝信分頁（正取拒絕 / 不錄取 共用）：系所卡片 + 單向寄信 + 已寄/未寄
  const renderThanksTab = (items, kind, emptyMsg) => {
    const sumMap = {}
    for (const it of items) {
      const x = (sumMap[it.dept] ||= { dept: it.dept, total: 0, mailable: 0 })
      x.total += 1; if (it.email) x.mailable += 1
    }
    const summary = Object.values(sumMap).sort((a, b) => a.dept.localeCompare(b.dept, 'zh-TW'))
    const g = {}
    for (const su of summary) { const camp = resolveCampus(su.dept, campusOv); (g[camp] ||= []).push(su) }
    const groups = Object.entries(g).sort((a, b) => (CAMP_ORDER[a[0]] ?? 9) - (CAMP_ORDER[b[0]] ?? 9))
    const selItems = items.filter((it) => it.dept === selDept)
    const logMap = mailLogs[kind] || {}
    const rawMailable = (arr) => arr.filter((it) => it.email).map((it) => it._raw)
    const sentN = items.filter((it) => logMap[it.account]?.status === 'sent').length
    const mailableN = items.filter((it) => it.email).length
    const kindLabel = kind === 's4_reject' ? '不錄取' : '放棄錄取'

    return (
      <>
        <StatStrip items={[
          { label: `${kindLabel}總人數`, value: items.length },
          { label: '可寄 Email', value: mailableN, color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' },
          { label: '已寄送', value: sentN, color: '#0f766e', bg: '#f0fdfa', border: '#99f6e4', sub: `未寄 ${Math.max(0, mailableN - sentN)}` },
          { label: '缺 Email', value: items.length - mailableN, color: (items.length - mailableN) ? '#dc2626' : '#6b7280', bg: (items.length - mailableN) ? '#fef2f2' : '#faf9f6', border: (items.length - mailableN) ? '#fecaca' : '#eceae5' },
        ]} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 12, color: '#999' }}>已寄 {sentN} / {items.length}</span>
          <Btn variant="primary" disabled={busy || !items.some((it) => it.email)} onClick={() => openMail(rawMailable(items), kind)}>
            ✉ 寄送感謝信（可寄 {items.filter((it) => it.email).length}）
          </Btn>
        </div>
        {groups.map(([camp, list]) => (
          <div key={camp} style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#7c2d12', marginBottom: 8 }}>
              {camp}<span style={{ color: '#bbb', fontWeight: 400 }}> · {list.reduce((s2, x) => s2 + x.total, 0)} 人</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 10 }}>
              {list.map((su) => {
                const open = selDept === su.dept
                return (
                  <button key={su.dept} onClick={() => setSelDept(open ? '' : su.dept)}
                    style={{ textAlign: 'left', cursor: 'pointer', background: open ? '#fff7ed' : 'white',
                      border: '1px solid ' + (open ? ACCENT : '#e8e7e3'), borderRadius: 12, padding: 14 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>{deptZhFull(su.dept)}</div>
                    <div style={{ fontSize: 12, color: '#666', lineHeight: 1.7 }}>
                      {su.total} 人 · <span style={{ color: '#15803d' }}>可寄 {su.mailable}</span>
                      {su.total - su.mailable ? <> · <span style={{ color: '#dc2626' }}>缺 Email {su.total - su.mailable}</span></> : null}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
        {!summary.length && <div style={{ fontSize: 13, color: '#aaa', padding: 24, textAlign: 'center' }}>{loading ? '載入中…' : emptyMsg}</div>}

        {selDept && (
          <Card>
            <CardHead left={selDept}
              right={<Btn style={{ ...s.btn, ...s.btnSm }} disabled={busy || !selItems.some((it) => it.email)}
                onClick={() => openMail(rawMailable(selItems), kind)}>✉ 寄本系感謝信</Btn>} />
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr style={{ background: '#faf9f6' }}>{['姓名', '帳號', '中心', '梯次', '類別', 'Email', '寄送狀態', '操作'].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
                <tbody>
                  {selItems.map((it) => {
                    const bi = batchInfo(it.account)
                    const sent = logMap[it.account]?.status === 'sent'
                    return (
                      <tr key={it.key}>
                        <td style={td}><div style={{ fontWeight: 500 }}>{it.name || '—'}</div><div style={{ fontSize: 11, color: '#888' }}>{it.name_english || '—'}</div></td>
                        <td style={{ ...td, color: '#888' }}>{it.account || '—'}</td>
                        <td style={td}>{it.center || '—'}</td>
                        <td style={td}><Pill color={bi.color} bg={bi.bg}>{bi.short}</Pill></td>
                        <td style={td}>{it.category}</td>
                        <td style={{ ...td, color: it.email ? '#555' : '#dc2626' }}>{it.email || '（無）'}</td>
                        <td style={td}>{sent ? <Pill color="#15803d" bg="#dcfce7">已寄送</Pill> : <span style={{ color: '#ccc' }}>未寄</span>}</td>
                        <td style={td}><button onClick={() => openMail([it._raw], kind)} disabled={busy || !it.email} style={{ ...s.btn, ...s.btnSm }}>{sent ? '重寄' : '寄送'}</button></td>
                      </tr>
                    )
                  })}
                  {!selItems.length && <tr><td colSpan={8} style={{ ...td, textAlign: 'center', color: '#aaa', padding: 28 }}>本系無資料</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
        )}
        <div style={{ fontSize: 12, color: '#aaa', marginTop: 12, lineHeight: 1.6 }}>
          說明：此頁寄送單向感謝信（無確認連結），寄信視窗可編輯「自訂段落（中／外語）」帶入其他方案／管道。「已寄送」依寄信紀錄判定，可重寄。
        </div>
      </>
    )
  }

  return (
    <PageShell
      title="實踐大學" subtitle="第四階段 · 預錄取意願調查 / 就讀確認" accent={ACCENT} toast={toast} intlBack stageKey="stage4"
      right={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {loading && <span style={{ fontSize: 12, color: '#fde7d4' }}>載入中…</span>}
          <Btn style={headerBtn} disabled={busy} onClick={doSync}>從Stage3同步名單</Btn>
          <Btn style={headerBtn} onClick={exportEnrolled}>⬇ 匯出就讀名單</Btn>
          <Btn style={headerBtn} disabled={busy} onClick={load}>↻</Btn>
          <span style={{ fontSize: 12, color: '#fde7d4' }}>{teacher.display_name || teacher.username}</span>
          <Btn style={headerBtn} onClick={logoutTeacher}>登出</Btn>
        </div>
      }
    >
      {/* 分頁列 */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {TABS.map((t) => (
          <button key={t.key} onClick={() => { setTab(t.key); setSelDept('') }}
            style={{ ...s.btn, background: tab === t.key ? ACCENT : 'white', color: tab === t.key ? '#fff' : '#555',
              borderColor: tab === t.key ? ACCENT : '#ddd', fontWeight: tab === t.key ? 600 : 400 }}>
            {t.label}
          </button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, color: '#999' }}>梯次</span>
          <select style={{ ...s.sel, padding: '5px 8px' }} value={batchFilter} onChange={(e) => setBatchFilter(e.target.value)}>
            <option value="">全部</option><option value="1">第一梯（報名）</option><option value="2">第二梯（加報）</option>
          </select>
          {updatedAt && <span style={{ fontSize: 11, color: '#bbb' }}>更新 {updatedAt}</span>}
        </div>
      </div>

      {/* ── 正取頁 ── */}
      {tab === 'admit' && (
        <>
          <StatStrip items={[
            { label: '正取總數', value: admitTotals.total },
            { label: '已接受就讀', value: admitTotals.enrolled, color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' },
            { label: '已拒絕', value: admitTotals.declined, color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
            { label: '尚未回應', value: admitTotals.pending, color: '#b45309', bg: '#fffbeb', border: '#fde68a' },
            { label: '回應率', value: admitTotals.rate == null ? '—' : admitTotals.rate + '%', sub: `已回應 ${admitTotals.responded}/${admitTotals.total}` },
            { label: '最終就讀', value: admitTotals.finalEnroll, color: '#7c2d12', bg: '#fff7ed', border: '#fed7aa', sub: admitTotals.promoted ? `含遞補 ${admitTotals.promoted}` : null },
          ]} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <Btn variant="primary" disabled={busy || !notifyList.length}
              onClick={() => openMail(notifyList)}>
              ✉ 寄送預錄取意願調查{notifyList.length ? `（未回應 ${notifyList.length}）` : ''}
            </Btn>
          </div>

          {admitByCampus.map(([camp, list]) => {
            const ct = campusTotals(list)
            return (
            <div key={camp} style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#7c2d12', marginBottom: 8 }}>
                {camp}<span style={{ color: '#bbb', fontWeight: 400 }}> · {ct.total} 位正取</span>
              </div>
              <StatStrip items={[
                { label: '正取總數', value: ct.total },
                { label: '已接受就讀', value: ct.enrolled, color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' },
                { label: '已拒絕', value: ct.declined, color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
                { label: '尚未回應', value: ct.pending, color: '#b45309', bg: '#fffbeb', border: '#fde68a' },
                { label: '回應率', value: ct.rate == null ? '—' : ct.rate + '%', sub: `已回應 ${ct.responded}/${ct.total}` },
                { label: '最終就讀', value: ct.finalEnroll, color: '#7c2d12', bg: '#fff7ed', border: '#fed7aa', sub: ct.promoted ? `含遞補 ${ct.promoted}` : null },
              ]} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 10 }}>
                {list.map((su) => {
                  const open = selDept === su.dept
                  const finalEnroll = su.enrolled + su.promotedEnrolled
                  return (
                    <button key={su.dept} onClick={() => setSelDept(open ? '' : su.dept)}
                      style={{ textAlign: 'left', cursor: 'pointer', background: open ? '#fff7ed' : 'white',
                        border: '1px solid ' + (open ? ACCENT : '#e8e7e3'), borderRadius: 12, padding: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontWeight: 600, fontSize: 14 }}>{deptZhFull(su.dept)}</span>
                        {quotaBadge(su.dept, su.total)}
                      </div>
                      <div style={{ fontSize: 12, color: '#666', lineHeight: 1.7 }}>
                        正取 <b>{su.total}</b> · <span style={{ color: '#15803d' }}>已接受 {su.enrolled}</span>
                        {' · '}<span style={{ color: '#dc2626' }}>已拒絕 {su.declined}</span>
                        {' · '}<span style={{ color: '#b45309' }}>未回應 {su.pending}</span>
                      </div>
                      <div style={{ fontSize: 12, color: '#7c2d12', marginTop: 4, fontWeight: 600 }}>
                        最終就讀 {finalEnroll}
                        {su.promotedEnrolled ? <span style={{ color: '#999', fontWeight: 400 }}>（含遞補 {su.promotedEnrolled}）</span> : null}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )})}
          {!admitSummary.length && (
            <div style={{ fontSize: 13, color: '#aaa', padding: 24, textAlign: 'center' }}>
              {loading ? '載入中…' : '尚無正取資料，請先點右上角「從Stage3同步名單」'}
            </div>
          )}

          {/* 展開系所學生名單 */}
          {selDept && (
            <Card>
              <CardHead left={`${selDept}`}
                right={
                  <Btn style={{ ...s.btn, ...s.btnSm }} disabled={busy || !selRows.some((r) => r.contact_status === 'pending' && r.appInfo?.email)}
                    onClick={() => openMail(selRows.filter((r) => r.contact_status === 'pending' && r.appInfo?.email))}>
                    ✉ 通知本系未回應
                  </Btn>
                } />
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#faf9f6' }}>
                      {['姓名', '帳號', '中心', '梯次', '志願序', '二階分數', '回應狀態', '備注', '操作'].map((h) => <th key={h} style={th}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {selRows.map((r) => {
                      const cs = r.contact_status
                      const resp = cs === 'enrolled' ? { t: '✓ 願意就讀', c: '#15803d', b: '#dcfce7' }
                        : cs === 'declined' ? { t: '放棄', c: '#dc2626', b: '#fee2e2' }
                        : cs === 'transferred' ? { t: '已轉報', c: '#c2410c', b: '#ffedd5' }
                        : { t: '未回應', c: '#b45309', b: '#fef3c7' }
                      const bi = batchInfo(r.account)
                      return (
                        <tr key={r.id}>
                          <td style={td}><div style={{ fontWeight: 500 }}>{r.appInfo?.name || '—'}</div><div style={{ fontSize: 11, color: '#888' }}>{r.appInfo?.name_english || '—'}</div></td>
                          <td style={{ ...td, color: '#888' }}>{r.account || '—'}</td>
                          <td style={td}>{r.center || '—'}</td>
                          <td style={td}><Pill color={bi.color} bg={bi.bg}>{bi.short}</Pill></td>
                          <td style={td}>{r.preference_order ?? '—'}</td>
                          <td style={td}>{r.stage2_score ?? '—'}</td>
                          <td style={td}><Pill color={resp.c} bg={resp.b}>{resp.t}</Pill></td>
                          <td style={td}><input defaultValue={r.admin_note || ''} onBlur={(e) => saveNote(r, e.target.value)} placeholder="備注" style={{ ...s.input, marginBottom: 0, minWidth: 120 }} /></td>
                          <td style={td}>
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button onClick={() => openMail([r])} disabled={busy || !r.appInfo?.email} title={r.appInfo?.email ? '' : '無 Email'}
                                style={{ ...s.btn, ...s.btnSm }}>通知</button>
                              <button onClick={() => setStatus(r, 'enrolled')} disabled={busy || cs === 'enrolled'}
                                style={{ ...s.btn, ...s.btnSm, background: '#dcfce7', color: '#15803d', borderColor: '#86efac' }}>就讀</button>
                              <button onClick={() => setStatus(r, 'declined')} disabled={busy || cs === 'declined'}
                                style={{ ...s.btn, ...s.btnSm, background: '#fee2e2', color: '#991b1b', borderColor: '#fca5a5' }}>放棄</button>
                              <button onClick={() => openTransfer(r)} disabled={busy || cs === 'transferred'}
                                style={{ ...s.btn, ...s.btnSm, background: '#ffedd5', color: '#9a3412', borderColor: '#fdba74' }}>轉報</button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                    {!selRows.length && <tr><td colSpan={9} style={{ ...td, textAlign: 'center', color: '#aaa', padding: 28 }}>本系無正取資料</td></tr>}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          <div style={{ fontSize: 12, color: '#aaa', marginTop: 12, lineHeight: 1.6 }}>
            說明：此頁寄送「預錄取意願調查」給正取生（依梯次帶入該梯放榜日期與回覆期限，可在寄信視窗設定並儲存）。學生於落地頁表達意願後即時回到此頁統計。「放棄」僅標記，不自動遞補；遞補請至「備取」頁手動處理。「最終就讀」＝正取接受 ＋ 遞補就讀。
          </div>
        </>
      )}

      {/* ── 備取頁 ── */}
      {tab === 'wait' && (
        <>
          <StatStrip items={[
            { label: '備取總數', value: waitTotals.total },
            { label: '可遞補待通知', value: totalOpenSlots, color: totalOpenSlots ? '#b91c1c' : '#6b7280', bg: totalOpenSlots ? '#fef2f2' : '#faf9f6', border: totalOpenSlots ? '#fecaca' : '#eceae5' },
            { label: '遞補詢問中', value: waitTotals.negotiating, color: '#1e40af', bg: '#eff6ff', border: '#bfdbfe' },
            { label: '已遞補就讀', value: waitTotals.enrolled, color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' },
            { label: '放棄', value: waitTotals.declined, color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
            { label: '備取待機', value: waitTotals.pending, color: '#6b7280' },
          ]} />
          {totalOpenSlots > 0 && (
            <div style={{ background: '#fff7ed', border: '1px solid #fdba74', borderRadius: 10, padding: '10px 16px', marginBottom: 12, fontSize: 13, color: '#9a3412', fontWeight: 600 }}>
              ⚠ 目前共有 {totalOpenSlots} 位備取生「可遞補待通知」，請至對應系所逐一或批次寄送遞補通知。
            </div>
          )}

          {waitByCampus.map(([camp, list]) => (
            <div key={camp} style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#7c2d12', marginBottom: 8 }}>
                {camp}<span style={{ color: '#bbb', fontWeight: 400 }}> · {list.reduce((s2, x) => s2 + x.total, 0)} 位備取</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 10 }}>
                {list.map((su) => {
                  const open = selDept === su.dept
                  return (
                    <button key={su.dept} onClick={() => setSelDept(open ? '' : su.dept)}
                      style={{ textAlign: 'left', cursor: 'pointer', background: open ? '#fff7ed' : 'white',
                        border: '1px solid ' + (open ? ACCENT : '#e8e7e3'), borderRadius: 12, padding: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontWeight: 600, fontSize: 14 }}>{deptZhFull(su.dept)}</span>
                        {su.openSlots > 0 && <Pill color="#b91c1c" bg="#fee2e2">可遞補 {su.openSlots}</Pill>}
                      </div>
                      <div style={{ fontSize: 12, color: '#666', lineHeight: 1.7 }}>
                        備取 <b>{su.total}</b> · <span style={{ color: '#1e40af' }}>已詢問 {su.negotiating}</span>
                        {' · '}<span style={{ color: '#15803d' }}>已遞補就讀 {su.enrolled}</span>
                        {su.declined ? <> · <span style={{ color: '#dc2626' }}>放棄 {su.declined}</span></> : null}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
          {!waitSummary.length && (
            <div style={{ fontSize: 13, color: '#aaa', padding: 24, textAlign: 'center' }}>
              {loading ? '載入中…' : '尚無備取資料'}
            </div>
          )}

          {selDept && (
            <Card>
              <CardHead left={`${selDept}`}
                right={
                  <Btn style={{ ...s.btn, ...s.btnSm }} disabled={busy || !eligibleIds.size}
                    onClick={() => promoteNotify(selWaitRows.filter((r) => eligibleIds.has(r.id)))}>
                    ✉ 通知可遞補者{eligibleIds.size ? `（${eligibleIds.size}）` : ''}
                  </Btn>
                } />
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#faf9f6' }}>
                      {['備取序', '姓名', '帳號', '中心', '梯次', '二階分數', '狀態', '操作'].map((h) => <th key={h} style={th}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {selWaitRows.map((r) => {
                      const cs = r.contact_status
                      const eligible = cs === 'pending' && eligibleIds.has(r.id)
                      const st = cs === 'enrolled' ? { t: '✓ 已遞補就讀', c: '#15803d', b: '#dcfce7' }
                        : cs === 'declined' ? { t: '放棄', c: '#dc2626', b: '#fee2e2' }
                        : cs === 'transferred' ? { t: '已轉報', c: '#c2410c', b: '#ffedd5' }
                        : cs === 'negotiating' ? { t: '遞補詢問中', c: '#1e40af', b: '#dbeafe' }
                        : eligible ? { t: '可遞補', c: '#b91c1c', b: '#fee2e2' }
                        : { t: '備取待機', c: '#6b7280', b: '#f3f4f6' }
                      const bi = batchInfo(r.account)
                      return (
                        <tr key={r.id}>
                          <td style={td}>備取 {r.standby_rank ?? '—'}</td>
                          <td style={td}><div style={{ fontWeight: 500 }}>{r.appInfo?.name || '—'}</div><div style={{ fontSize: 11, color: '#888' }}>{r.appInfo?.name_english || '—'}</div></td>
                          <td style={{ ...td, color: '#888' }}>{r.account || '—'}</td>
                          <td style={td}>{r.center || '—'}</td>
                          <td style={td}><Pill color={bi.color} bg={bi.bg}>{bi.short}</Pill></td>
                          <td style={td}>{r.stage2_score ?? '—'}</td>
                          <td style={td}><Pill color={st.c} bg={st.b}>{st.t}</Pill></td>
                          <td style={td}>
                            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                              {eligible ? (
                                <button onClick={() => promoteNotify([r])} disabled={busy || !r.appInfo?.email} title={r.appInfo?.email ? '' : '無 Email'}
                                  style={{ ...s.btn, ...s.btnSm, background: '#fee2e2', color: '#991b1b', borderColor: '#fca5a5' }}>遞補通知</button>
                              ) : cs === 'negotiating' ? (
                                <button onClick={() => setMail({ kind: 's4_promote', recipients: [r], batch: settingsBatch })} disabled={busy || !r.appInfo?.email}
                                  style={{ ...s.btn, ...s.btnSm }}>重寄通知</button>
                              ) : null}
                              <button onClick={() => openTransfer(r)} disabled={busy || cs === 'transferred'}
                                style={{ ...s.btn, ...s.btnSm, background: '#ffedd5', color: '#9a3412', borderColor: '#fdba74' }}>轉報</button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                    {!selWaitRows.length && <tr><td colSpan={8} style={{ ...td, textAlign: 'center', color: '#aaa', padding: 28 }}>本系無備取資料</td></tr>}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          <div style={{ fontSize: 12, color: '#aaa', marginTop: 12, lineHeight: 1.6 }}>
            說明：「可遞補 N」＝該系正取放棄數 − 已詢問 − 已遞補就讀；系統只「顯示」可遞補者，由承辦逐一或批次按「遞補通知」才寄送（寄出即轉「遞補詢問中」並寫入確認連結）。被詢問的備取生於落地頁表達意願；若放棄，缺額會重新開放給下一位。不自動遞補、不自動寄信。
          </div>
        </>
      )}

      {/* ── 正取拒絕頁 / 不錄取頁 ── */}
      {tab === 'declined' && renderThanksTab(declinedItems, 's4_admit_declined', '目前沒有放棄錄取的學生')}
      {tab === 'reject' && renderThanksTab(rejectedItems, 's4_reject', '目前沒有不錄取名單')}

      {/* ── 工具頁 ── */}
      {tab === 'tools' && (
        <div style={{ display: 'grid', gap: 16 }}>
          {/* 0. 梯次設定 */}
          <Card>
            <CardHead left="梯次設定 · 放榜日期 / 回覆期限 / 承辦資訊" />
            <div style={{ padding: 16 }}>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 12, lineHeight: 1.6 }}>
                兩梯各自設定一次。寄送意願調查／遞補通知時，寄信視窗會依「梯次」自動帶入該梯的放榜日期、回覆期限與承辦資訊。
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
                {['1', '2'].map((b) => {
                  const f = settingsForm[b] || {}
                  return (
                    <div key={b} style={{ border: '1px solid #e8e7e3', borderRadius: 10, padding: 14 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10, color: '#7c2d12' }}>
                        {b === '1' ? '第一梯（報名）' : '第二梯（加報）'}
                      </div>
                      <div style={{ display: 'grid', gap: 8 }}>
                        <div><label style={lbl}>正式放榜日期</label><input style={{ ...s.input, marginBottom: 0 }} placeholder="2026/07/25" value={f.announce_date || ''} onChange={(e) => setSF(b, 'announce_date', e.target.value)} /></div>
                        <div><label style={lbl}>意願調查回覆期限</label><input style={{ ...s.input, marginBottom: 0 }} placeholder="2026/07/20" value={f.reply_by || ''} onChange={(e) => setSF(b, 'reply_by', e.target.value)} /></div>
                        <div><label style={lbl}>承辦人</label><input style={{ ...s.input, marginBottom: 0 }} value={f.contact_person || ''} onChange={(e) => setSF(b, 'contact_person', e.target.value)} /></div>
                        <div><label style={lbl}>聯絡信箱</label><input style={{ ...s.input, marginBottom: 0 }} value={f.contact_email || ''} onChange={(e) => setSF(b, 'contact_email', e.target.value)} /></div>
                      </div>
                      <div style={{ marginTop: 10, textAlign: 'right' }}>
                        <Btn variant="primary" disabled={busy} onClick={() => saveBatchSettings(b)}>儲存第{b === '2' ? '二' : '一'}梯</Btn>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </Card>

          {/* 1. 測試帳號 */}
          <Card>
            <CardHead left="測試帳號 · 落地頁檢視" />
            <div style={{ padding: 16 }}>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 12, lineHeight: 1.6 }}>
                建立一筆測試列（is_test，不進任何正式統計）。選系所、切換類別／狀態／期限後開啟連結，即可檢視學生落地頁在各情境的樣式（系所名會依語言翻譯）；落地頁右上角可自行切換語言。
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 12 }}>
                <div>
                  <label style={lbl}>系所</label>
                  <select style={s.sel} value={testForm.dept} onChange={(e) => setTestForm((f) => ({ ...f, dept: e.target.value }))}>
                    {DEPT_I18N.map(([k]) => <option key={k} value={k}>{k}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>類別</label>
                  <select style={s.sel} value={testForm.cat} onChange={(e) => setTestForm((f) => ({ ...f, cat: e.target.value }))}>
                    <option value="admitted">正取</option><option value="waitlisted">備取</option>
                  </select>
                </div>
                {testForm.cat === 'waitlisted' && (
                  <div><label style={lbl}>備取序</label>
                    <input style={{ ...s.input, marginBottom: 0 }} type="number" min="1" value={testForm.rank} onChange={(e) => setTestForm((f) => ({ ...f, rank: e.target.value }))} />
                  </div>
                )}
                <div>
                  <label style={lbl}>狀態</label>
                  <select style={s.sel} value={testForm.status} onChange={(e) => setTestForm((f) => ({ ...f, status: e.target.value }))}>
                    <option value="pending">未回應</option><option value="enrolled">就讀</option>
                    <option value="declined">放棄</option><option value="negotiating">遞補詢問中</option>
                  </select>
                </div>
                <div>
                  <label style={lbl}>回覆期限</label>
                  <input style={{ ...s.input, marginBottom: 0 }} placeholder="2026/07/20" value={testForm.deadline}
                    disabled={testForm.expired} onChange={(e) => setTestForm((f) => ({ ...f, deadline: e.target.value }))} />
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <label style={{ fontSize: 12, color: '#666', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input type="checkbox" checked={testForm.expired} onChange={(e) => setTestForm((f) => ({ ...f, expired: e.target.checked }))} /> 設為已過期
                  </label>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <Btn variant="primary" disabled={busy} onClick={createTestRow}>建立 / 更新測試帳號</Btn>
                {testLink && <Btn onClick={() => window.open(testLink, '_blank')}>開啟落地頁 ↗</Btn>}
              </div>
              {testLink && <div style={{ fontSize: 11, color: '#999', marginTop: 8, wordBreak: 'break-all' }}>{testLink}</div>}
            </div>
          </Card>

          {/* 2. 信件預覽 / 寄給自己 */}
          <Card>
            <CardHead left="信件預覽 · 寄給自己" />
            <div style={{ padding: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 12 }}>
                <div><label style={lbl}>信件種類</label>
                  <select style={s.sel} value={pvKind} onChange={(e) => setPvKind(e.target.value)}>
                    {Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div><label style={lbl}>語言</label>
                  <select style={s.sel} value={pvLang} onChange={(e) => setPvLang(e.target.value)}>
                    <option value="EN">中英</option><option value="VI">中越</option><option value="ID">中印尼</option>
                  </select>
                </div>
                <div><label style={lbl}>寄給自己（測試信箱）</label>
                  <input style={{ ...s.input, marginBottom: 0 }} value={selfEmail} onChange={(e) => setSelfEmail(e.target.value)} />
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <Btn disabled={busy} onClick={sendSelf}>寄一封給自己</Btn>
                </div>
              </div>
              {(() => {
                const m = buildMessage({ kind: pvKind, lang: pvLang, data: sampleMailData(pvKind, pvLang) })
                return (
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>{m?.subject}</div>
                    <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 12.5, background: '#faf9f6', padding: 14, borderRadius: 8, margin: 0, maxHeight: '40vh', overflow: 'auto' }}>{m?.body}</pre>
                  </div>
                )
              })()}
              <div style={{ fontSize: 11, color: '#aaa', marginTop: 8 }}>※ 預覽用範例資料填入變數；自訂段落為占位示意。</div>
            </div>
          </Card>

          {/* 3. 匯出 */}
          <Card>
            <CardHead left="匯出 · 第四階段全部資料" />
            <div style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <Btn variant="primary" onClick={exportAll}>⬇ 匯出全部資料（含不錄取）</Btn>
              <span style={{ fontSize: 12, color: '#888' }}>正取備取 {data.length} 筆 · 不錄取 {rejectedData.length} 筆（測試列已排除）</span>
            </div>
          </Card>
        </div>
      )}

      {transfer && (
        <TransferModal
          row={transfer.row}
          depts={transfer.depts}
          busy={busy}
          onConfirm={confirmTransfer}
          onClose={() => setTransfer(null)}
        />
      )}

      {mail && (
        <AdmitMailComposer
          kind={mail.kind}
          recipients={mail.recipients}
          defaults={defaultsFromSettings(settings[mail.batch])}
          settingsByBatch={settings}
          onClose={() => { setMail(null); load(); refreshThanks() }}
          onToast={showToast}
        />
      )}
    </PageShell>
  )
}
