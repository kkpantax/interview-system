import { useState, useEffect, useCallback, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { PageShell } from '../components/PageShell'
import { Btn, Card, CardHead, Pill, s } from '../components/UI'
import ImportModal from '../components/ImportModal'
import TeacherManager from '../components/TeacherManager'
import CenterManager from '../components/CenterManager'
import DeptQuotaManager from '../components/DeptQuotaManager'
import CampusManager from '../components/CampusManager'
import InfoLinksManager from '../components/InfoLinksManager'
import StudentEditModal from '../components/StudentEditModal'
import ProgressOverview from '../components/ProgressOverview'
import { ExportMenu } from '../components/ExportMenu'
import DayBarChart from '../components/DayBarChart'
import CenterMatchModal from '../components/CenterMatchModal'
import InterviewDateModal from '../components/InterviewDateModal'
import PassportBirthImportModal from '../components/PassportBirthImportModal'
import { writeXlsx } from '../components/ExportBtn'
import { getAllApplications, upsertApplications, getFinalList, setInterviewDate, getCenters, batchSetCenter, setPaperPassed, countEvaluationsForApplication, exportAllData, clearAllData, updateBirthPassportByAccount, saveYearlySnapshot } from '../api'
import { getTeacher, logoutTeacher } from '../auth'
import { calcAge } from '../utils'
import { STATUS, batchInfo } from '../constants'

const localToday = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const statusInfo = (st) => ({
  pending:       { label: STATUS.pending,       color: '#6b7280', bg: '#f3f4f6' },
  stage1_passed: { label: STATUS.stage1_passed, color: '#15803d', bg: '#dcfce7' },
  rejected:      { label: STATUS.rejected,      color: '#991b1b', bg: '#fee2e2' },
}[st] || { label: st || '待面試', color: '#6b7280', bg: '#f3f4f6' })

const FINAL_COLS = [
  { key: 'account',            label: '帳號' },
  { key: 'batch_label',        label: '梯次' },
  { key: 'name',               label: '中文姓名' },
  { key: 'name_english',       label: '英文姓名' },
  { key: 'department',         label: '科系' },
  { key: 'stage1_passed_date', label: '通過第一階段日期' },
  { key: 'total_score',        label: '評分總分' },
  { key: 'recommendation',     label: '建議' },
]

// 同一帳號的多筆 application 合成一筆「人」。資料已按 preference_order 排序，
// 以志願序最小者作為代表（顯示姓名／護照／國籍等共用欄位）。
function groupByAccount(apps) {
  const map = new Map()
  for (const a of apps) {
    const key = a.account || `__noacct_${a.id}`
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(a)
  }
  return [...map.entries()].map(([key, list]) => {
    const sorted = [...list].sort((x, y) => (x.preference_order ?? 99) - (y.preference_order ?? 99))
    const rep = sorted[0]
    // 人的狀態取最「進展」者；日期取任一非空值
    const status = sorted.some((a) => a.status === 'stage1_passed') ? 'stage1_passed'
      : sorted.some((a) => a.status === 'rejected') ? 'rejected'
      : 'pending'
    return {
      key,
      account: rep.account,
      rep,
      apps: sorted,
      ids: sorted.map((a) => a.id),
      status,
      interview_date: sorted.find((a) => a.interview_date)?.interview_date || '',
      stage1_passed_date: sorted.find((a) => a.stage1_passed_date)?.stage1_passed_date || '',
      center: sorted.find((a) => a.center)?.center || '',
    }
  })
}

export default function AdminApp() {
  const teacher = getTeacher()
  const [apps, setApps]           = useState([])
  const [loading, setLoading]     = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [showCenterMatch, setShowCenterMatch] = useState(false)
  const [showDateImport, setShowDateImport] = useState(false)
  const [showBirthImport, setShowBirthImport] = useState(false)
  const [toast, setToast]         = useState(null)
  const [kw, setKw]               = useState('')
  const [deptFilter, setDeptFilter]     = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [centerFilter, setCenterFilter] = useState('')
  const [nationalityFilter, setNationalityFilter] = useState('')
  const [paperFilter, setPaperFilter] = useState(false)   // 僅顯示書審未全過
  const [selected, setSelected]   = useState(() => new Set())  // 選取的帳號群組 key
  const [expanded, setExpanded]   = useState(() => new Set())  // 展開的帳號群組 key
  const [assignDate, setAssignDate] = useState(localToday)
  const [assigning, setAssigning] = useState(false)
  const [tab, setTab]             = useState('students')  // students | teachers | centers | reset
  const [editGroup, setEditGroup] = useState(null)        // 編輯中的考生群組
  const [centers, setCenters]     = useState([])          // 面試中心清單
  const [batchCenter, setBatchCenter] = useState('')      // 批次設定中心：選定的中心名稱
  const [confirmText, setConfirmText] = useState('')      // 年度重置：清空確認字串
  const [clearPassword, setClearPassword] = useState('')  // 年度重置：行政密碼（再次驗證）
  const [clearing, setClearing]   = useState(false)       // 年度重置：清空進行中
  const [snapshotYear, setSnapshotYear] = useState(new Date().getFullYear())  // 年度重置：快照寫入年份

  const showToast = useCallback((msg, type = 'ok') => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3500)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try { setApps((await getAllApplications()) || []) }
    catch (e) { showToast('載入失敗：' + e.message, 'error') }
    finally { setLoading(false) }
  }, [showToast])

  useEffect(() => { load() }, [load])

  const loadCenters = useCallback(async () => {
    try { setCenters((await getCenters()) || []) }
    catch (e) { showToast('載入中心失敗：' + e.message, 'error') }
  }, [showToast])

  useEffect(() => { loadCenters() }, [loadCenters])

  // 守衛：未登入或非 admin 角色導回行政登入頁
  useEffect(() => {
    if (!teacher || (teacher.role !== 'superadmin'))
      window.location.hash = '#/login?stage=admin'
  }, [teacher])

  const handleImport = async (rows, skipped, onProgress) => {
    const { added, updated } = await upsertApplications(rows, onProgress)
    showToast(`匯入完成：新增 ${added}、更新 ${updated}、略過 ${skipped}（無帳號）`)
    await load()
  }

  const handleBirthPassportImport = async (rows, onProgress) => {
    const { updated, total } = await updateBirthPassportByAccount(rows, onProgress)
    showToast(`生日／護照匯入完成：更新 ${updated} 位（共比對 ${total} 位）`)
    await load()
  }

  const exportFinal = async () => {
    try {
      const evals = (await getFinalList()) || []
      if (!evals.length) { showToast('目前沒有建議錄取的學生', 'warn'); return }
      const rows = evals.map((e) => ({
        account:            e.applications?.account ?? '',
        batch_label:        batchInfo(e.applications?.account).label,
        name:               e.applications?.name ?? '',
        name_english:       e.applications?.name_english ?? '',
        department:         e.department ?? e.applications?.department ?? '',
        stage1_passed_date: e.applications?.stage1_passed_date ?? '',
        total_score:        e.total_score ?? '',
        recommendation:     '建議錄取',
      }))
      writeXlsx(FINAL_COLS, rows, '最終建議錄取名單.xlsx')
      showToast(`已匯出 ${rows.length} 筆`)
    } catch (e) { showToast('匯出失敗：' + e.message, 'error') }
  }

  // 年度備份：五張表各一個工作表，做成單一 Excel
  const exportBackup = async () => {
    try {
      const { apps: a, s1, s2, s3, s4, chk } = await exportAllData()
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(a || []),  '學生名單')
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(s1 || []), '第一階段評分')
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(s2 || []), '第二階段評分')
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(chk || []), '二階報到紀錄')
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(s3 || []), '第三階段錄取')
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(s4 || []), '第四階段確認')
      XLSX.writeFile(wb, `年度備份_${new Date().getFullYear()}.xlsx`)
      showToast('已匯出年度備份')
    } catch (e) { showToast('匯出失敗：' + e.message, 'error') }
  }

  // 年度重置：清空學生相關資料表。
  // 需輸入「確認清空」+ 再次輸入行政密碼，由 /api/reset 在伺服器端驗證後用 service key 刪除。
  // 刪除「之前」先以現有資料計算招生漏斗六數字、寫入 yearly_stats 快照（去重邏輯同 getFunnelStats）；
  // 快照寫入失敗則中止，不執行清空。
  const handleClear = async () => {
    if (confirmText !== '確認清空' || !clearPassword) return
    const year = Number(snapshotYear) || new Date().getFullYear()
    if (!window.confirm(`最後確認：即將寫入 ${year} 年度統計快照，並清空所有學生資料，此操作無法復原。確定繼續？`)) return
    setClearing(true)
    try {
      const { apps: a, s1, s3, s4, chk } = await exportAllData()
      const uniq = (rows, pred = () => true) =>
        new Set((rows || []).filter(pred).map((r) => r.account).filter(Boolean)).size
      await saveYearlySnapshot({
        year,
        applicants: uniq(a),
        stage1_attended: uniq(s1),
        stage2_attended: uniq(chk, (r) => !r.department && r.status === 'arrived'),
        admitted: uniq(s3, (r) => r.final_status === 'admitted'),
        waitlisted: uniq(s3, (r) => r.final_status === 'waitlisted'),
        enrolled: uniq(s4, (r) => r.contact_status === 'enrolled'),
      })
      await clearAllData(teacher.username, clearPassword)
      setConfirmText('')
      setClearPassword('')
      showToast(`已寫入 ${year} 年度統計快照，並清空本年度所有學生資料`)
      await load()
    } catch (e) {
      showToast('清空失敗：' + e.message, 'error')
    } finally {
      setClearing(false)
    }
  }

  const depts = [...new Set(apps.map((a) => a.department).filter(Boolean))].sort()
  const nationalities = [...new Set(apps.map((a) => a.nationality).filter(Boolean))].sort()

  // 先分組，再以群組為單位篩選（任一志願符合即顯示）
  const groups = useMemo(() => groupByAccount(apps), [apps])
  const groupMap = useMemo(() => new Map(groups.map((g) => [g.key, g])), [groups])

  // 各面試日的人數（以帳號群組＝人為單位；未排期另計）。日期字串為 YYYY-MM-DD，字典序即時間序。
  const dateCounts = useMemo(() => {
    const m = {}; let unscheduled = 0
    for (const g of groups) {
      if (g.interview_date) m[g.interview_date] = (m[g.interview_date] || 0) + 1
      else unscheduled++
    }
    return { dates: Object.keys(m).sort(), m, unscheduled }
  }, [groups])

  const filtered = groups.filter((g) => {
    if (deptFilter && !g.apps.some((a) => a.department === deptFilter)) return false
    if (statusFilter && g.status !== statusFilter) return false
    if (centerFilter === '__none__') {
      // 篩出「未設定中心」的學生
      if (g.center) return false
    } else if (centerFilter) {
      if (g.center !== centerFilter) return false
    }
    if (nationalityFilter && g.rep.nationality !== nationalityFilter) return false
    if (paperFilter && !g.apps.some((a) => a.paper_passed === false)) return false
    if (kw) {
      const q = kw.toLowerCase()
      const hay = [g.rep.name, g.rep.name_english, g.account, g.rep.passport_number]
        .filter(Boolean).map((x) => String(x).toLowerCase())
      if (!hay.some((h) => h.includes(q))) return false
    }
    return true
  })

  // ── 選取 / 指派面試日期（以帳號群組為單位）──────────────────────────────────
  const toggle = (key) => setSelected((prev) => {
    const n = new Set(prev)
    n.has(key) ? n.delete(key) : n.add(key)
    return n
  })
  const toggleExpand = (key) => setExpanded((prev) => {
    const n = new Set(prev)
    n.has(key) ? n.delete(key) : n.add(key)
    return n
  })
  const allSelected = filtered.length > 0 && filtered.every((g) => selected.has(g.key))
  const toggleAll = () => setSelected((prev) => {
    const n = new Set(prev)
    if (filtered.every((g) => n.has(g.key))) filtered.forEach((g) => n.delete(g.key))
    else filtered.forEach((g) => n.add(g.key))
    return n
  })

  const handleAssign = async () => {
    const keys = [...selected]
    // 對同帳號所有 application id 同步指派（一個人面一次）
    const ids = keys.flatMap((k) => groupMap.get(k)?.ids || [])
    if (!ids.length) { showToast('請先勾選學生', 'warn'); return }
    if (!assignDate)  { showToast('請選擇面試日期', 'warn'); return }
    setAssigning(true)
    try {
      const res = await setInterviewDate(ids, assignDate)
      const n = Array.isArray(res) ? res.length : 0
      if (!n) { showToast('指派失敗：0 筆更新（請確認 applications 的 UPDATE RLS 政策）', 'error'); return }
      showToast(`已指派 ${keys.length} 位（${n} 筆志願）面試日期：${assignDate}`)
      setSelected(new Set())
      await load()
    } catch (e) {
      showToast('指派失敗：' + e.message, 'error')
    } finally {
      setAssigning(false)
    }
  }

  // 各中心綁定的人數與志願數（給中心管理頁顯示與刪除前提示）
  const centerUsage = useMemo(() => {
    const m = {}                       // { center: { people:Set, prefs:int } }
    for (const a of apps) {
      if (!a.center) continue
      const e = (m[a.center] ||= { people: new Set(), prefs: 0 })
      e.people.add(a.account)
      e.prefs += 1
    }
    const out = {}
    for (const c in m) out[c] = { people: m[c].people.size, prefs: m[c].prefs }
    return out
  }, [apps])

  // 設定一位考生（同帳號所有志願）的中心，並就地更新本地狀態
  const setGroupCenter = async (g, center) => {
    try {
      const res = await batchSetCenter(g.ids, center)
      if (!Array.isArray(res) || !res.length) {
        showToast('設定中心失敗：0 筆更新（請確認 applications 的 UPDATE RLS 政策）', 'error'); return
      }
      setApps((prev) => prev.map((a) => (g.ids.includes(a.id) ? { ...a, center: center || null } : a)))
    } catch (e) {
      showToast('設定中心失敗：' + e.message, 'error')
    }
  }

  // 批次：把已勾選的考生全部設成同一個中心
  const handleBatchCenter = async () => {
    const keys = [...selected]
    const ids = keys.flatMap((k) => groupMap.get(k)?.ids || [])
    if (!ids.length)  { showToast('請先勾選學生', 'warn'); return }
    if (!batchCenter) { showToast('請選擇要套用的中心', 'warn'); return }
    try {
      const res = await batchSetCenter(ids, batchCenter)
      const n = Array.isArray(res) ? res.length : 0
      if (!n) { showToast('設定失敗：0 筆更新（請確認 applications 的 UPDATE RLS 政策）', 'error'); return }
      setApps((prev) => prev.map((a) => (ids.includes(a.id) ? { ...a, center: batchCenter } : a)))
      showToast(`已將 ${keys.length} 位（${n} 筆志願）的中心設為：${batchCenter}`)
      setSelected(new Set())
    } catch (e) {
      showToast('設定失敗：' + e.message, 'error')
    }
  }

  const handleCenterMatchApply = async (centerName, ids, peopleCount) => {
    if (!ids.length) { showToast('沒有可套用的人員', 'warn'); return }
    const res = await batchSetCenter(ids, centerName)
    const n = Array.isArray(res) ? res.length : 0
    if (!n) { showToast('套用失敗：0 筆更新（請確認 applications 的 UPDATE RLS 政策）', 'error'); throw new Error('0 rows updated') }
    setApps((prev) => prev.map((a) => (ids.includes(a.id) ? { ...a, center: centerName } : a)))
    showToast(`已依中心名單標註 ${peopleCount} 位（${n} 筆志願）→ ${centerName}`)
  }

  // 書審：paper_passed 預設視為通過（缺欄位 / null / true 都算通過，只有明確 false 才是未通過）
  const paperOK = (a) => a.paper_passed !== false
  const setAppPaper = async (appId, passed) => {
    try {
      if (!passed) {
        const n = await countEvaluationsForApplication(appId)
        if (n > 0 && !window.confirm(`此志願已有 ${n} 筆第二階段評分紀錄。\n標記為「書審未通過」後，該系將不再出現在二階名單（已存在的評分不會刪除）。\n確定要繼續？`)) {
          return
        }
      }
      const res = await setPaperPassed(appId, passed)
      if (!Array.isArray(res) || !res.length) {
        showToast('書審狀態更新失敗：0 筆（請確認 applications 的 UPDATE RLS 政策與 paper_passed 欄位）', 'error'); return
      }
      setApps((prev) => prev.map((a) => (a.id === appId ? { ...a, paper_passed: passed } : a)))
    } catch (e) {
      showToast('書審狀態更新失敗：' + e.message, 'error')
    }
  }

  const td = { padding: '8px 10px', borderBottom: '1px solid #f5f4f0', fontSize: 13 }
  const th = { padding: '9px 10px', textAlign: 'left', borderBottom: '1px solid #e8e7e3', color: '#666', fontWeight: 500, fontSize: 12 }

  if (!teacher || (teacher.role !== 'superadmin')) return null

  return (
    <PageShell
      title="實踐大學"
      subtitle="行政人員"
      stageKey="admin"
      toast={toast}
      right={
        <>
          {loading && <span style={{ fontSize: 12, color: '#aaa' }}>載入中…</span>}
          <Btn style={{ background: 'none', borderColor: '#444', color: '#ccc' }} onClick={() => { window.location.hash = '#/intl' }}>← 國際事務處</Btn>
          <Btn variant="primary" style={{ background: '#2a2a28', borderColor: '#444', color: '#f5f4f0' }} onClick={() => setShowImport(true)}>＋ 上傳名單</Btn>
          <Btn style={{ background: 'none', borderColor: '#444', color: '#ccc' }} onClick={exportFinal}>⬇ 匯出最終名單</Btn>
          <Btn style={{ background: 'none', borderColor: '#444', color: '#ccc' }} onClick={load}>↻</Btn>
          <span style={{ fontSize: 12, color: '#999' }}>{teacher.display_name || teacher.username}</span>
          <Btn style={{ background: 'none', borderColor: '#444', color: '#ccc' }} onClick={logoutTeacher}>登出</Btn>
        </>
      }
    >
      {/* 分頁 */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid #e8e7e3' }}>
        {[{ k: 'overview', label: '📊 進度總覽' }, { k: 'students', label: '學生總覽' }, { k: 'teachers', label: '帳號管理' }, { k: 'centers', label: '中心管理' }, { k: 'campus', label: '校區設定' }, { k: 'quota', label: '預計錄取人數' }, { k: 'links', label: '連結管理' }, { k: 'reset', label: '年度重置' }].map((t) => (
          <button key={t.k} onClick={() => setTab(t.k)}
            style={{
              padding: '8px 16px', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: 14, fontFamily: 'inherit', marginBottom: -1,
              color: tab === t.k ? '#1a1a18' : '#999',
              fontWeight: tab === t.k ? 600 : 400,
              borderBottom: tab === t.k ? '2px solid #1a1a18' : '2px solid transparent',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <ProgressOverview groups={groups} />}

      {tab === 'teachers' && <TeacherManager depts={depts} showToast={showToast} />}

      {tab === 'centers' && (
        <CenterManager centers={centers} usage={centerUsage} showToast={showToast} onReload={loadCenters} />
      )}

      {tab === 'campus' && <CampusManager depts={depts} showToast={showToast} />}
      {tab === 'quota' && <DeptQuotaManager depts={depts} showToast={showToast} />}

      {tab === 'links' && <InfoLinksManager showToast={showToast} />}

      {tab === 'reset' && (
        <div style={{ maxWidth: 720 }}>
          {/* 第一區塊：匯出年度備份 */}
          <Card>
            <CardHead left="匯出年度備份" />
            <div style={{ padding: 18 }}>
              <p style={{ fontSize: 13, color: '#555', margin: '0 0 14px', lineHeight: 1.7 }}>
                請先匯出今年度完整資料備份，再執行清空。備份檔為單一 Excel，內含六個工作表：
                學生名單、第一階段評分、第二階段評分、二階報到紀錄、第三階段錄取、第四階段確認。
              </p>
              <Btn variant="primary" style={{ background: '#2a2a28', borderColor: '#444', color: '#f5f4f0' }} onClick={exportBackup}>
                ⬇ 匯出年度備份 Excel
              </Btn>
            </div>
          </Card>

          {/* 第二區塊：清空資料（紅色警示） */}
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: 20, marginTop: 36 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#b91c1c', marginBottom: 10 }}>
              ⚠ 危險操作：清空本年度所有學生資料
            </div>
            <p style={{ fontSize: 12.5, color: '#dc2626', margin: '0 0 18px', lineHeight: 1.8 }}>
              此操作將清空以下資料表：學生名單、第一階段評分、第二階段評分、二階報到紀錄、第三階段錄取、第四階段確認、各系預計錄取名額、各系所屬校區設定。
              中心名單、老師帳號與歷年統計不受影響。此操作無法復原，請務必先完成上方備份。
              清空前會先以現有資料計算招生漏斗六項數字，寫入下方年份的歷年統計快照（可在統計儀表板查看），快照寫入成功後才執行清空。
              清空在伺服器端執行，需再次輸入您的行政密碼確認身分。
            </p>
            <label style={{ display: 'block', fontSize: 13, color: '#991b1b', fontWeight: 600, marginBottom: 6 }}>
              統計快照寫入年份
            </label>
            <input
              type="number"
              value={snapshotYear}
              onChange={(e) => setSnapshotYear(e.target.value)}
              style={{ ...s.input, maxWidth: 120, marginBottom: 12, borderColor: '#fca5a5', outlineColor: '#ef4444' }}
            />
            <label style={{ display: 'block', fontSize: 13, color: '#991b1b', fontWeight: 600, marginBottom: 6 }}>
              請輸入「確認清空」以啟用清空按鈕
            </label>
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="確認清空"
              style={{ ...s.input, maxWidth: 260, marginBottom: 12, borderColor: '#fca5a5', outlineColor: '#ef4444' }}
            />
            <label style={{ display: 'block', fontSize: 13, color: '#991b1b', fontWeight: 600, marginBottom: 6 }}>
              行政密碼（{teacher.display_name || teacher.username}）
            </label>
            <input
              type="password"
              value={clearPassword}
              onChange={(e) => setClearPassword(e.target.value)}
              placeholder="請輸入您的登入密碼"
              autoComplete="off"
              style={{ ...s.input, maxWidth: 260, marginBottom: 16, borderColor: '#fca5a5', outlineColor: '#ef4444' }}
            />
            <div>
              {(() => {
                const ready = confirmText === '確認清空' && !!clearPassword && !clearing
                return (
                  <button
                    onClick={handleClear}
                    disabled={!ready}
                    style={{
                      ...s.btn, fontWeight: 600,
                      background:  ready ? '#dc2626' : '#f3f4f6',
                      color:       ready ? '#fff'    : '#bbb',
                      borderColor: ready ? '#dc2626' : '#e5e7eb',
                      cursor:      ready ? 'pointer' : 'not-allowed',
                    }}
                  >
                    {clearing ? '清空中…' : '清空本年度資料'}
                  </button>
                )
              })()}
            </div>
          </div>
        </div>
      )}

      {tab === 'students' && (
       <>
      {/* 摘要 */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          { label: '報名人數', value: groups.length },
          { label: '志願總數', value: apps.length },
          { label: '已排面試', value: groups.filter((g) => g.interview_date).length },
          { label: '通過一階', value: groups.filter((g) => g.status === 'stage1_passed').length },
          { label: '書審未全過', value: groups.filter((g) => g.apps.some((a) => a.paper_passed === false)).length },
          { label: '科系數',   value: depts.length },
        ].map((c) => (
          <div key={c.label} style={{ ...s.card, padding: '12px 18px', minWidth: 110 }}>
            <div style={{ fontSize: 12, color: '#aaa' }}>{c.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* 篩選 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <input style={{ ...s.input, width: 220, marginBottom: 0 }} placeholder="搜尋姓名 / 帳號 / 護照"
          value={kw} onChange={(e) => setKw(e.target.value)} />
        <select style={s.sel} value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}>
          <option value="">全部科系</option>
          {depts.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select style={s.sel} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">全部狀態</option>
          {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select style={s.sel} value={centerFilter} onChange={(e) => setCenterFilter(e.target.value)}>
          <option value="">全部中心</option>
          <option value="__none__">（未設定中心）</option>
          {centers.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
        </select>
        <select style={s.sel} value={nationalityFilter} onChange={(e) => setNationalityFilter(e.target.value)}>
          <option value="">全部國籍</option>
          {nationalities.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: paperFilter ? '#dc2626' : '#666', alignSelf: 'center', cursor: 'pointer' }}>
          <input type="checkbox" checked={paperFilter} onChange={(e) => setPaperFilter(e.target.checked)} />
          僅顯示書審未全過
        </label>
        <span style={{ fontSize: 12, color: '#aaa', alignSelf: 'center' }}>共 {filtered.length} 人</span>
      </div>

      {/* 批次設定中心 */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', background: '#f5f3ff', border: '1px solid #ede9fe', borderRadius: 8, padding: '10px 12px' }}>
        <span style={{ fontSize: 13, color: '#6d28d9', fontWeight: 600 }}>批次設定中心</span>
        <select style={s.sel} value={batchCenter} onChange={(e) => setBatchCenter(e.target.value)}>
          <option value="">選擇中心…</option>
          {centers.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
        </select>
        <Btn style={{ background: '#ede9fe', borderColor: '#c4b5fd', color: '#6d28d9' }}
          onClick={handleBatchCenter} disabled={!selected.size || !batchCenter}>
          套用到已選 {selected.size} 位
        </Btn>
        <span style={{ fontSize: 12, color: '#7b8794' }}>同帳號的所有志願會一起套用同一個中心；亦可在下方每列直接設定</span>
      </div>

      {/* 指派面試日期 */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', background: '#eff6ff', border: '1px solid #dbeafe', borderRadius: 8, padding: '10px 12px' }}>
        <span style={{ fontSize: 13, color: '#1e40af', fontWeight: 600 }}>指派面試日期</span>
        <input type="date" style={{ ...s.input, marginBottom: 0, width: 'auto' }}
          value={assignDate} onChange={(e) => setAssignDate(e.target.value)} />
        <Btn variant="blue" onClick={handleAssign} disabled={assigning || !selected.size}>
          {assigning ? '指派中…' : `指派給已選 ${selected.size} 位`}
        </Btn>
        {selected.size > 0 && (
          <button onClick={() => setSelected(new Set())} style={{ ...s.btn, ...s.btnSm }}>清除選取</button>
        )}
        <span style={{ fontSize: 12, color: '#7b8794' }}>勾選下方學生後指派，同帳號的所有志願會一起排同一天（一人面一次）</span>
      </div>

      {/* 第一階段實體面試各日人數 */}
      <DayBarChart
        title="第一階段實體面試各日人數"
        data={dateCounts}
        activeDate={assignDate}
        onPick={setAssignDate}
        theme="blue"
        hint="點選日期可設為上方指派日期"
        style={{ marginBottom: 12 }}
      />

      <Card style={{ overflow: 'visible' }}>
        <CardHead left="學生總覽" right={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            <span>{`${filtered.length} / ${groups.length} 人`}</span>
            <ExportMenu
              label="⬆ 批次匯入"
              btnStyle={{ background: 'white', border: '1px solid #ddd', color: '#1a1a18', fontSize: 12.5, padding: '5px 11px' }}
              items={[
                { label: '📅 上傳第一階段面試時間表', onClick: () => setShowDateImport(true) },
                { label: '🪪 上傳學生生日／護照號碼', onClick: () => setShowBirthImport(true) },
                { label: '📋 上傳中心名單', onClick: () => setShowCenterMatch(true) },
              ]}
            />
          </span>
        } />
        <div style={{ overflowX: 'auto' }}>
          <table style={{ minWidth: '100%', borderCollapse: 'collapse', whiteSpace: 'nowrap' }}>
            <thead>
              <tr style={{ background: '#faf9f6' }}>
                <th style={{ ...th, width: 32 }}>
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                </th>
                {['帳號', '梯次', '中文姓名', '護照號碼', '年齡', '國籍', '中心', '第1志願系所', '書審', '面試日', '狀態', '操作'].map((h) => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((g) => {
                const si = statusInfo(g.status)
                const extra = g.apps.length - 1
                const isOpen = expanded.has(g.key)
                return (
                  <FragmentRow key={g.key}>
                    <tr style={selected.has(g.key) ? { background: '#f5faff' } : undefined}>
                      <td style={td}>
                        <input type="checkbox" checked={selected.has(g.key)} onChange={() => toggle(g.key)} />
                      </td>
                      <td style={{ ...td, color: '#888' }}>{g.account}</td>
                      {(() => { const bi = batchInfo(g.account); return <td style={td}><Pill color={bi.color} bg={bi.bg}>{bi.short}</Pill></td> })()}
                      <td style={td}>
                        <div style={{ fontWeight: 500 }}>{g.rep.name}</div>
                        <div style={{ color: '#999', fontSize: 12, whiteSpace: 'normal', maxWidth: 200 }}>{g.rep.name_english}</div>
                      </td>
                      <td style={td}>
                        <div style={{ color: '#555' }}>{g.rep.passport_number || '—'}</div>
                        <div style={{ color: '#999', fontSize: 12 }}>{g.rep.birth_date || '—'}</div>
                      </td>
                      {(() => {
                        const age = calcAge(g.rep.birth_date)
                        return (
                          <td style={age != null && age > 22 ? { ...td, color: '#dc2626', fontWeight: 700 } : td}>
                            {age != null ? `${age}${age > 22 ? ' ⚠' : ''}` : '—'}
                          </td>
                        )
                      })()}
                      <td style={td}>{g.rep.nationality}</td>
                      <td style={td}>
                        <select
                          style={{ ...s.sel, padding: '5px 8px' }}
                          value={g.center}
                          onChange={(e) => setGroupCenter(g, e.target.value)}
                        >
                          <option value="">—</option>
                          {/* 保留目前值（即使該中心已被刪除）也能顯示 */}
                          {[...new Set([g.center, ...centers.map((c) => c.name)].filter(Boolean))].map((name) => (
                            <option key={name} value={name}>{name}</option>
                          ))}
                        </select>
                      </td>
                      <td style={{ ...td, color: '#555' }}>
                        <div>{g.rep.department}</div>
                        <div style={{ marginTop: 3 }}>
                          {extra > 0 ? (
                            <button onClick={() => toggleExpand(g.key)}
                              style={{ ...s.btn, ...s.btnSm, background: '#f0fdf4', borderColor: '#bbf7d0', color: '#15803d' }}>
                              {isOpen ? '▼ 收合' : `＋${extra} 個志願`}
                            </button>
                          ) : (
                            <span style={{ fontSize: 12, color: '#ccc' }}>單一志願</span>
                          )}
                        </div>
                      </td>
                      <td style={td}>
                        {(() => {
                          const failed = g.apps.filter((a) => a.paper_passed === false)
                          return failed.length === 0 ? (
                            <button onClick={() => toggleExpand(g.key)}
                              style={{ ...s.btn, ...s.btnSm, background: '#f0fdf4', borderColor: '#bbf7d0', color: '#15803d' }}>
                              全通過 ▾
                            </button>
                          ) : (
                            <button onClick={() => toggleExpand(g.key)}
                              style={{ ...s.btn, ...s.btnSm, background: '#fee2e2', borderColor: '#fecaca', color: '#b91c1c' }}>
                              ✗ {failed.length} 系未過 ▾
                            </button>
                          )
                        })()}
                      </td>
                      <td style={{ ...td, color: g.interview_date ? '#1e40af' : '#ccc' }}>{g.interview_date || '—'}</td>
                      <td style={td}><Pill color={si.color} bg={si.bg}>{si.label}</Pill></td>
                      <td style={td}>
                        <button onClick={() => setEditGroup(g)} style={{ ...s.btn, ...s.btnSm }}>編輯</button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td></td>
                        <td colSpan={12} style={{ padding: '4px 10px 12px', background: '#fafafa' }}>
                          <div style={{ fontSize: 11, color: '#aaa', margin: '4px 0 6px' }}>該帳號全部志願（取消勾選＝該系書審未通過，第二階段將不會出現）</div>
                          {g.apps.map((a) => (
                            <div key={a.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '5px 0', borderBottom: '1px solid #f0efeb', fontSize: 13 }}>
                              <span style={{ width: 56, color: '#888' }}>第 {a.preference_order ?? '—'} 志願</span>
                              <span style={{ flex: 1 }}>{a.department}</span>
                              <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, minWidth: 96, color: paperOK(a) ? '#15803d' : '#dc2626', cursor: 'pointer' }}>
                                <input type="checkbox" checked={paperOK(a)} onChange={(e) => setAppPaper(a.id, e.target.checked)} />
                                書審{paperOK(a) ? '通過' : '未通過'}
                              </label>
                              {(() => { const s2 = statusInfo(a.status); return <Pill color={s2.color} bg={s2.bg}>{s2.label}</Pill> })()}
                              <span style={{ color: a.interview_date ? '#1e40af' : '#ccc', minWidth: 90 }}>{a.interview_date || '未排'}</span>
                            </div>
                          ))}
                        </td>
                      </tr>
                    )}
                  </FragmentRow>
                )
              })}
              {!filtered.length && (
                <tr><td colSpan={13} style={{ ...td, textAlign: 'center', color: '#aaa', padding: 32 }}>
                  {loading ? '載入中…' : '沒有資料，請先上傳報名名單'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
       </>
      )}

      {showImport && <ImportModal onImport={handleImport} onClose={() => setShowImport(false)} />}
      {showCenterMatch && (
        <CenterMatchModal
          centers={centers}
          groups={groups}
          onApply={handleCenterMatchApply}
          onClose={() => setShowCenterMatch(false)}
        />
      )}
      {showDateImport && (
        <InterviewDateModal
          groups={groups}
          onApply={async (ids, date) => {
            await setInterviewDate(ids, date)
          }}
          onClose={(count) => {
            setShowDateImport(false)
            if (count > 0) {
              showToast(`已成功指派 ${count} 位學生的面試日期`)
              load()
            }
          }}
        />
      )}
      {showBirthImport && (
        <PassportBirthImportModal
          groups={groups}
          onApply={handleBirthPassportImport}
          onClose={() => setShowBirthImport(false)}
        />
      )}
      {editGroup && (
        <StudentEditModal
          group={editGroup} depts={depts} showToast={showToast}
          onClose={() => setEditGroup(null)} onReload={load}
        />
      )}
    </PageShell>
  )
}

// 一個帳號群組要 render 主列 +（可選）展開列兩個 <tr>，用 Fragment 包起來
function FragmentRow({ children }) {
  return <>{children}</>
}
