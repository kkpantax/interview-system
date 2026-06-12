import { useState, useEffect, useCallback, useRef } from 'react'
import { PageShell } from '../components/PageShell'
import { Card, CardHead, Btn, s } from '../components/UI'
import {
  getStage2Roster, getStage2Unscheduled, setStage2Date,
  getCheckins, upsertCheckin, deleteCheckin,
  getStage2NoShows, getCheckinsBefore, getStage2DateCounts,
  getStage1RecordsByAccounts, getDepartmentCampuses,
} from '../api'
import { writeXlsxMulti } from '../components/ExportBtn'
import { DECISIONS_STAGE1, CAMPUS_OPTIONS, resolveCampus, deptShort } from '../constants'
import DayBarChart from '../components/DayBarChart'
import CheckinGuideModal from '../components/CheckinGuideModal'
import { getTeacher, logoutTeacher } from '../auth'
import { todayISO } from '../utils'

const ACCENT = '#15803d'

// 把 roster（一列＝一志願）依帳號合併成一位學生，附各志願的 evaluations。
function groupRoster(rows) {
  const map = {}
  for (const r of (rows || [])) {
    if (!r.account) continue
    if (!map[r.account]) {
      map[r.account] = {
        account: r.account, name: r.name, name_english: r.name_english,
        nationality: r.nationality, gender: r.gender,
        passport_number: r.passport_number, center: r.center,
        stage2_date: r.stage2_date, depts: [],
      }
    }
    map[r.account].depts.push({
      department: r.department,
      preference_order: r.preference_order,
      evaluations: r.evaluations || [],
    })
  }
  return Object.values(map)
    .map((g) => {
      g.depts.sort((a, b) => (a.preference_order ?? 99) - (b.preference_order ?? 99))
      return g
    })
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
}

// checkins 列 → { [account]: { main, byDept:{ [dept]: row } } }
function buildCheckinMap(rows) {
  const m = {}
  for (const r of (rows || [])) {
    if (!m[r.account]) m[r.account] = { main: null, byDept: {} }
    if (!r.department) m[r.account].main = r
    else m[r.account].byDept[r.department] = r
  }
  return m
}

// 取某帳號某志願的「有效狀態」：已評分 → done；否則看 checkins（sent/done），無列為 waiting。
const effStatus = (cmap, account, dept) => {
  if ((dept.evaluations || []).length > 0) return 'done'
  return cmap[account]?.byDept?.[dept.department]?.status || 'waiting'
}

// 取 updated_at 的本地 HH:MM
const hhmm = (ts) => {
  if (!ts) return ''
  try {
    return new Date(ts).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false })
  } catch { return '' }
}

// 各志願膠囊外觀
const PILL_STYLE = {
  waiting: { bg: '#f3f4f6', color: '#9ca3af', border: '#e5e7eb', icon: '⚪', label: '待面試' },
  sent:    { bg: '#dbeafe', color: '#1e40af', border: '#93c5fd', icon: '🔵', label: '面試中' },
  done:    { bg: '#dcfce7', color: '#15803d', border: '#86efac', icon: '✅', label: '已完成' },
}

// 漏網之魚：面試日已過者，依「原面試日當天」的報到／進度紀錄分類。
// 回傳 [{ ...student, arrived, kind: 'absent'|'incomplete', statuses: [{...dept, st}] }]，
// 所有系所皆完成者不列入。
function buildNoShows(rosterRows, checkinRows) {
  const ck = {}
  for (const r of (checkinRows || [])) ck[`${r.account}|${r.checkin_date}|${r.department || ''}`] = r
  const out = []
  for (const stu of groupRoster(rosterRows)) {
    const d = stu.stage2_date
    const arrived = ck[`${stu.account}|${d}|`]?.status === 'arrived'
    const stOf = (dept) => {
      if ((dept.evaluations || []).length > 0) return 'done'
      return ck[`${stu.account}|${d}|${dept.department}`]?.status || 'waiting'
    }
    const statuses = stu.depts.map((x) => ({ ...x, st: stOf(x) }))
    if (statuses.every((x) => x.st === 'done')) continue
    out.push({ ...stu, arrived, statuses, kind: arrived ? 'incomplete' : 'absent' })
  }
  return out
}

export default function CheckinApp() {
  const teacher = getTeacher()
  const [tab, setTab]         = useState('track')   // track | noshow | schedule
  const [date, setDate]       = useState(todayISO)
  const [roster, setRoster]   = useState([])        // grouped students
  const [cmap, setCmap]       = useState({})        // checkin map
  const [unsched, setUnsched] = useState([])        // 未排程（依帳號去重）
  const [noshows, setNoshows] = useState([])        // 漏網之魚（面試日已過未完成）
  const [nsDates, setNsDates] = useState({})        // 漏網之魚改期日期 { [account]: 'YYYY-MM-DD' }
  const [loading, setLoading] = useState(false)
  const [busy, setBusy]       = useState(false)
  const [search, setSearch]   = useState('')
  const [onlyNotArrived, setOnlyNotArrived] = useState(false)
  const [onlyUndone, setOnlyUndone]         = useState(false)
  const [picked, setPicked]   = useState({})        // 未排程勾選 { [account]: true }
  const [assignDate, setAssignDate] = useState(todayISO)
  const [toast, setToast]     = useState(null)
  const [dateCounts, setDateCounts] = useState(null)   // 二階各日人數統計
  const [showGuide, setShowGuide] = useState(false)     // 操作說明

  const loadDateCounts = async () => {
    try { setDateCounts(await getStage2DateCounts()) } catch { /* 統計失敗不影響主功能 */ }
  }
  useEffect(() => { loadDateCounts() }, [])

  // 守衛：只有 admin / superadmin 能進
  useEffect(() => {
    if (!teacher || (teacher.role !== 'admin' && teacher.role !== 'superadmin')) {
      window.location.hash = '#/login?stage=checkin2'
    }
  }, [teacher])

  const showToast = useCallback((msg, type = 'ok') => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3500)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [rosterRows, checkinRows] = await Promise.all([getStage2Roster(date), getCheckins(date)])
      setRoster(groupRoster(rosterRows))
      setCmap(buildCheckinMap(checkinRows))
    } catch (e) {
      showToast('載入失敗：' + e.message, 'error')
    } finally {
      setLoading(false)
    }
  }, [date, showToast])

  const loadUnscheduled = useCallback(async () => {
    try {
      const rows = await getStage2Unscheduled()
      const map = {}
      for (const r of (rows || [])) {
        if (!r.account) continue
        if (!map[r.account]) map[r.account] = { ...r, depts: [] }
        map[r.account].depts.push({ department: r.department, preference_order: r.preference_order })
      }
      const people = Object.values(map).map((g) => {
        g.depts.sort((a, b) => (a.preference_order ?? 99) - (b.preference_order ?? 99))
        return g
      })
      setUnsched(people)
    } catch (e) {
      showToast('載入未排程名單失敗：' + e.message, 'error')
    }
  }, [showToast])

  const loadNoShows = useCallback(async () => {
    try {
      const today = todayISO()
      const [rows, ckRows] = await Promise.all([getStage2NoShows(today), getCheckinsBefore(today)])
      setNoshows(buildNoShows(rows, ckRows))
    } catch (e) {
      showToast('載入漏網之魚名單失敗：' + e.message, 'error')
    }
  }, [showToast])

  useEffect(() => { load() }, [load])
  // 漏網之魚與未排程的人數徽章在任何分頁都常駐顯示，故一進頁就載入
  useEffect(() => { loadUnscheduled(); loadNoShows() }, [loadUnscheduled, loadNoShows])

  // 輪詢用的 state 鏡像：interval closure 會吃到舊的 loading/busy，改讀 ref 避免 stale closure
  const loadingRef = useRef(loading)
  const busyRef    = useRef(busy)
  useEffect(() => { loadingRef.current = loading }, [loading])
  useEffect(() => { busyRef.current = busy }, [busy])

  // 報到追蹤分頁每 30 秒自動刷新，系所老師標記的「面試中」會自動出現
  useEffect(() => {
    if (tab !== 'track') return
    const id = setInterval(() => {
      if (document.hidden || loadingRef.current || busyRef.current) return
      load()
    }, 30000)
    // 從背景回到前景時立即刷新一次，不等下一輪
    const onVisible = () => { if (!document.hidden) load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [tab, load])

  // ── 報到 / 進度動作 ──────────────────────────────────────────────────────
  const isArrived = (account) => !!cmap[account]?.main

  const reportArrive = async (account) => {
    setBusy(true)
    try {
      await upsertCheckin({ account, checkin_date: date, department: '', status: 'arrived' })
      await load()
    } catch (e) { showToast('報到失敗：' + e.message, 'error') } finally { setBusy(false) }
  }
  const cancelArrive = async (account) => {
    setBusy(true)
    try {
      await deleteCheckin(account, date, '')
      await load()
    } catch (e) { showToast('取消失敗：' + e.message, 'error') } finally { setBusy(false) }
  }

  // 膠囊循環：待面試 → sent → done → 刪除（回到待面試）
  const cyclePill = async (account, dept) => {
    if (!isArrived(account)) return
    if ((dept.evaluations || []).length > 0) return   // 已評分鎖定
    const cur = cmap[account]?.byDept?.[dept.department]?.status
    setBusy(true)
    try {
      if (!cur) await upsertCheckin({ account, checkin_date: date, department: dept.department, status: 'sent' })
      else if (cur === 'sent') await upsertCheckin({ account, checkin_date: date, department: dept.department, status: 'done' })
      else if (cur === 'done') await deleteCheckin(account, date, dept.department)
      else await upsertCheckin({ account, checkin_date: date, department: dept.department, status: 'sent' })
      await load()
    } catch (e) { showToast('更新失敗：' + e.message, 'error') } finally { setBusy(false) }
  }

  // 改期（單人）
  const reschedule = async (account, currentName) => {
    const next = window.prompt(`輸入「${currentName}」的新面試日期（YYYY-MM-DD），留空可取消排程：`, date)
    if (next === null) return
    setBusy(true)
    try {
      await setStage2Date([account], next.trim())
      showToast(next.trim() ? `已改期至 ${next.trim()}` : '已取消排程')
      await load()
    } catch (e) { showToast('改期失敗：' + e.message, 'error') } finally { setBusy(false) }
  }

  // 漏網之魚：改期（單人，列內 input date 指定新日期）
  const nsReschedule = async (account) => {
    const next = (nsDates[account] || '').trim()
    if (!next) { showToast('請先選擇新面試日期', 'warn'); return }
    setBusy(true)
    try {
      await setStage2Date([account], next)
      showToast(`已改期至 ${next}`)
      await Promise.all([loadNoShows(), load()])
    } catch (e) { showToast('改期失敗：' + e.message, 'error') } finally { setBusy(false) }
  }

  // 漏網之魚：移回未排程（stage2_date 設為 null）
  const nsUnschedule = async (account) => {
    setBusy(true)
    try {
      await setStage2Date([account], null)
      showToast('已移回未排程')
      await Promise.all([loadNoShows(), loadUnscheduled()])
    } catch (e) { showToast('更新失敗：' + e.message, 'error') } finally { setBusy(false) }
  }

  // 指派面試日（未排程勾選者）
  const assignPicked = async () => {
    const accounts = Object.keys(picked).filter((a) => picked[a])
    if (!accounts.length) { showToast('請先勾選學生', 'warn'); return }
    if (!assignDate) { showToast('請選擇面試日期', 'warn'); return }
    setBusy(true)
    try {
      await setStage2Date(accounts, assignDate)
      showToast(`已指派 ${accounts.length} 位至 ${assignDate}`)
      setPicked({})
      await loadUnscheduled()
      await load()
    } catch (e) { showToast('指派失敗：' + e.message, 'error') } finally { setBusy(false) }
  }

  // ── 下載當日名單（多分頁：總表 + 各系分頁，含一階出席／平均分／建議）──────
  const recLabel1 = (v) => DECISIONS_STAGE1.find((d) => d.v === v)?.label || ''
  const exportDayList = async () => {
    if (!roster.length) { showToast('本日無面試名單', 'warn'); return }
    setBusy(true)
    try {
      const accounts = roster.map((stu) => stu.account)
      const [s1rows, campusOv] = await Promise.all([
        getStage1RecordsByAccounts(accounts),
        getDepartmentCampuses().catch(() => ({})),
      ])
      // 一階紀錄依帳號彙整：出席 / 已評分者平均 / 建議統計
      const s1 = {}
      for (const r of (s1rows || [])) {
        if (!s1[r.account]) s1[r.account] = { appeared: false, scores: [], counts: {} }
        const g = s1[r.account]
        if (r.appeared) g.appeared = true
        const scored = r.scores && Object.keys(r.scores).length > 0
        if (scored) {
          const v = Number(r.total_score)
          if (Number.isFinite(v)) g.scores.push(v)
          if (r.recommendation) g.counts[r.recommendation] = (g.counts[r.recommendation] || 0) + 1
        }
      }
      const maxPrefs = Math.max(1, ...roster.map((stu) => stu.depts.length))
      const columns = [
        { key: 'account',      label: '帳號' },
        { key: 'name',         label: '中文姓名' },
        { key: 'name_english', label: '英文姓名' },
        ...Array.from({ length: maxPrefs }, (_, i) => ({ key: `pref${i + 1}`, label: `志願${i + 1}` })),
        { key: 'nationality',  label: '國籍' },
        { key: 'center',       label: '中心' },
        { key: 'appeared',     label: '出席' },
        { key: 'teacher_avg',  label: '老師平均分' },
        { key: 'teacher_recs', label: '老師建議' },
        { key: 'confirm',      label: '確認結果' },
      ]
      const rowOf = (stu) => {
        const g = s1[stu.account] || { appeared: false, scores: [], counts: {} }
        const avg = g.scores.length ? g.scores.reduce((a, b) => a + b, 0) / g.scores.length : null
        const recsText = ['pass', 'pending', 'fail']
          .filter((k) => g.counts[k]).map((k) => `${recLabel1(k)}×${g.counts[k]}`).join('、') || '未評分'
        return {
          account: stu.account, name: stu.name, name_english: stu.name_english,
          ...Object.fromEntries(stu.depts.map((d, i) => [`pref${i + 1}`, d.department || ''])),
          nationality: stu.nationality, center: stu.center || '',
          appeared: g.appeared ? '已到' : '未到',
          teacher_avg: avg != null ? avg.toFixed(1) : '',
          teacher_recs: recsText,
          confirm: '通過',   // 名單即「已通過一階」者
        }
      }
      // 總表：依中心、帳號排序
      const mainRows = [...roster]
        .sort((a, b) => (a.center || '').localeCompare(b.center || '') || (a.account || '').localeCompare(b.account || ''))
        .map(rowOf)
      const [, m = '', dd = ''] = date.split('-')
      const sheets = [{ name: `${m}.${dd}`, columns, rows: mainRows }]
      // 各系分頁：校區排序（台北→高雄→其他）、同校區依人數多到少；
      // 系內依該系所在志願序，再依中心、帳號排序
      const byDept = {}
      for (const stu of roster) {
        for (const d of stu.depts) {
          if (!byDept[d.department]) byDept[d.department] = []
          byDept[d.department].push({ stu, pref: d.preference_order ?? 99 })
        }
      }
      const deptNames = Object.keys(byDept).sort((a, b) => {
        const ca = CAMPUS_OPTIONS.indexOf(resolveCampus(a, campusOv))
        const cb = CAMPUS_OPTIONS.indexOf(resolveCampus(b, campusOv))
        if (ca !== cb) return ca - cb
        if (byDept[a].length !== byDept[b].length) return byDept[b].length - byDept[a].length
        return a.localeCompare(b)
      })
      for (const dep of deptNames) {
        const rows = byDept[dep]
          .sort((x, y) =>
            x.pref - y.pref ||
            (x.stu.center || '').localeCompare(y.stu.center || '') ||
            (x.stu.account || '').localeCompare(y.stu.account || ''))
          .map((x) => rowOf(x.stu))
        sheets.push({ name: deptShort(dep), columns, rows })
      }
      writeXlsxMulti(sheets, `面試名單${m}_${dd}.xlsx`)
      showToast(`已下載 ${date} 面試名單（${roster.length} 位 / ${deptNames.length} 系）`)
    } catch (e) {
      showToast('下載失敗：' + e.message, 'error')
    } finally { setBusy(false) }
  }

  // ── 衍生計算 ─────────────────────────────────────────────────────────────
  const allDone = (stu) => stu.depts.every((d) => effStatus(cmap, stu.account, d) === 'done')

  const total = roster.length
  const arrivedCount = roster.filter((stu) => isArrived(stu.account)).length
  const notArrivedCount = total - arrivedCount
  const doneCount = roster.filter((stu) => allDone(stu)).length

  // 各系即時狀態
  const deptStats = (() => {
    const m = {}
    for (const stu of roster) {
      for (const d of stu.depts) {
        if (!m[d.department]) m[d.department] = { sent: 0, done: 0, waiting: 0 }
        m[d.department][effStatus(cmap, stu.account, d)]++
      }
    }
    return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0]))
  })()

  // 篩選
  const q = search.trim().toLowerCase()
  const filtered = roster.filter((stu) => {
    if (q && !(
      (stu.name || '').toLowerCase().includes(q) ||
      (stu.name_english || '').toLowerCase().includes(q) ||
      (stu.account || '').toLowerCase().includes(q) ||
      (stu.passport_number || '').toLowerCase().includes(q)
    )) return false
    if (onlyNotArrived && isArrived(stu.account)) return false
    if (onlyUndone && allDone(stu)) return false
    return true
  })

  if (!teacher || (teacher.role !== 'admin' && teacher.role !== 'superadmin')) return null

  const th = { padding: '9px 10px', textAlign: 'left', borderBottom: '1px solid #e8e7e3', color: '#666', fontWeight: 500, fontSize: 12, whiteSpace: 'nowrap' }
  const td = { padding: '8px 10px', borderBottom: '1px solid #f5f4f0', fontSize: 13, verticalAlign: 'middle' }

  // 分頁籤；badge 為常駐人數徽章，alert=true 且 n>0 時紅底凸顯
  const tabBtn = (key, label, badge, alert = false) => (
    <button onClick={() => setTab(key)} style={{
      ...s.btn,
      display: 'inline-flex', alignItems: 'center', gap: 6,
      background: tab === key ? ACCENT : 'white',
      color: tab === key ? '#fff' : '#555',
      borderColor: tab === key ? ACCENT : '#ddd',
      fontWeight: tab === key ? 600 : 400,
    }}>
      {label}
      {badge != null && (
        <span style={{
          display: 'inline-block', minWidth: 18, padding: '1px 6px', borderRadius: 9,
          fontSize: 11, fontWeight: 700, textAlign: 'center',
          background: alert && badge > 0 ? '#dc2626' : (tab === key ? '#ffffff33' : '#f1f5f9'),
          color: alert && badge > 0 ? '#fff' : (tab === key ? '#fff' : '#64748b'),
        }}>{badge}</span>
      )}
    </button>
  )

  return (
    <PageShell
      title="實踐大學" subtitle="二階面試報到管理" accent={ACCENT} toast={toast} intlBack stageKey="checkin2"
      right={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {loading && <span style={{ fontSize: 12, color: '#d1fae5' }}>載入中…</span>}
          <Btn style={{ background: '#ffffff22', borderColor: '#ffffff44', color: '#fff', fontWeight: 600 }} onClick={() => setShowGuide(true)}>📖 操作說明</Btn>
          <span style={{ fontSize: 12, color: '#d1fae5' }}>{teacher.display_name || teacher.username}</span>
          <Btn style={{ background: 'none', borderColor: '#ffffff44', color: '#dcfce7' }} onClick={logoutTeacher}>登出</Btn>
        </div>
      }
    >
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {tabBtn('track', '📋 報到追蹤')}
        {tabBtn('noshow', '⚠ 漏網之魚', noshows.length, true)}
        {tabBtn('schedule', '📅 未排程', unsched.length)}
      </div>

      {tab === 'track' ? (
        <>
          {/* 第二階段面試各日人數 */}
          <DayBarChart
            title="第二階段面試各日人數"
            data={dateCounts}
            activeDate={date}
            onPick={setDate}
            theme="green"
            hint="點選日期可切換下方報到名單"
            style={{ marginBottom: 14 }}
          />

          {/* 工具列 */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, color: '#555' }}>面試日期</span>
            <input type="date" style={{ ...s.input, width: 160, marginBottom: 0 }} value={date} onChange={(e) => setDate(e.target.value)} />
            <Btn onClick={load}>🔄 重新整理</Btn>
            <Btn variant="primary" onClick={exportDayList} disabled={busy || loading}>⬇ 下載當日名單</Btn>
            <span style={{ fontSize: 11, color: '#aaa' }}>每 30 秒自動更新</span>
            <input style={{ ...s.input, width: 220, marginBottom: 0 }} placeholder="搜尋姓名 / 英文名 / 帳號 / 護照" value={search} onChange={(e) => setSearch(e.target.value)} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: '#555', cursor: 'pointer' }}>
              <input type="checkbox" checked={onlyNotArrived} onChange={(e) => setOnlyNotArrived(e.target.checked)} /> 只看未報到
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: '#555', cursor: 'pointer' }}>
              <input type="checkbox" checked={onlyUndone} onChange={(e) => setOnlyUndone(e.target.checked)} /> 只看未完成
            </label>
          </div>

          {/* 統計卡 */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
            {[
              { label: '應到人數', n: total,          bg: '#f1f5f9', color: '#475569' },
              { label: '已報到',   n: arrivedCount,    bg: '#dcfce7', color: '#15803d' },
              { label: '未報到',   n: notArrivedCount, bg: '#fee2e2', color: '#dc2626' },
              { label: '全部完成', n: doneCount,       bg: '#ecfdf5', color: '#047857' },
            ].map((c) => (
              <div key={c.label} style={{ flex: '1 1 130px', minWidth: 110, background: c.bg, color: c.color, borderRadius: 10, padding: '12px 16px' }}>
                <div style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.1 }}>{c.n}</div>
                <div style={{ fontSize: 12, marginTop: 2 }}>{c.label}</div>
              </div>
            ))}
          </div>

          {/* 各系即時狀態 */}
          {deptStats.length > 0 && (
            <Card style={{ marginBottom: 16 }}>
              <CardHead left="各系即時狀態" right="面試中／已完成／待面試" />
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', padding: '12px 16px' }}>
                {deptStats.map(([dep, c]) => (
                  <div key={dep} style={{ border: '1px solid #e8e7e3', borderRadius: 10, padding: '8px 12px', minWidth: 150 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{dep}</div>
                    <div style={{ display: 'flex', gap: 10, fontSize: 12 }}>
                      <span style={{ color: '#1e40af' }}>🔵 {c.sent}</span>
                      <span style={{ color: '#15803d' }}>✅ {c.done}</span>
                      <span style={{ color: '#9ca3af' }}>⚪ {c.waiting}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* 主表格 */}
          <Card>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1060 }}>
                <thead>
                  <tr style={{ background: '#faf9f6' }}>
                    {['姓名', '性別', '護照號碼', '中心', '國籍', '報到', '系所進度', ''].map((h, i) => <th key={i} style={th}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((stu) => {
                    const arrived = isArrived(stu.account)
                    const rowDone = allDone(stu)
                    const main = cmap[stu.account]?.main
                    return (
                      <tr key={stu.account} style={rowDone ? { background: '#f0fdf4' } : undefined}>
                        <td style={td}>
                          <div style={{ fontWeight: 500 }}>{stu.name}</div>
                          <div style={{ fontSize: 11, color: '#999' }}>{stu.name_english}</div>
                          <div style={{ fontSize: 11, color: '#bbb' }}>{stu.account}</div>
                        </td>
                        <td style={td}>{stu.gender || '—'}</td>
                        <td style={{ ...td, fontSize: 12, color: '#777' }}>{stu.passport_number || '—'}</td>
                        <td style={td}>{stu.center || '—'}</td>
                        <td style={td}>{stu.nationality}</td>
                        <td style={td}>
                          {arrived ? (
                            <div>
                              <span style={{ display: 'inline-block', background: '#dcfce7', color: '#15803d', borderRadius: 6, padding: '3px 9px', fontSize: 12, fontWeight: 600 }}>
                                已報到 {hhmm(main?.updated_at)}
                              </span>
                              <button onClick={() => cancelArrive(stu.account)} disabled={busy}
                                style={{ display: 'block', marginTop: 4, background: 'none', border: 'none', color: '#aaa', fontSize: 11, cursor: 'pointer', textDecoration: 'underline', fontFamily: 'inherit', padding: 0 }}>
                                取消
                              </button>
                            </div>
                          ) : (
                            <button onClick={() => reportArrive(stu.account)} disabled={busy}
                              style={{ ...s.btn, ...s.btnSm, background: '#15803d', color: '#fff', borderColor: '#15803d' }}>
                              ✅ 報到
                            </button>
                          )}
                        </td>
                        <td style={td}>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {stu.depts.map((d) => {
                              const locked = (d.evaluations || []).length > 0
                              const st = effStatus(cmap, stu.account, d)
                              const ps = PILL_STYLE[st]
                              const clickable = arrived && !locked
                              return (
                                <button key={d.department} onClick={() => cyclePill(stu.account, d)} disabled={!clickable || busy}
                                  title={locked ? '已評分，鎖定為已完成' : !arrived ? '請先完成總報到' : '點擊切換：待面試→面試中→已完成'}
                                  style={{
                                    display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                                    border: `1px solid ${ps.border}`, borderRadius: 8, padding: '4px 9px',
                                    background: ps.bg, color: ps.color, fontFamily: 'inherit',
                                    cursor: clickable ? 'pointer' : 'default',
                                    opacity: arrived ? 1 : 0.45,
                                  }}>
                                  <span style={{ fontSize: 12.5, fontWeight: 600 }}>
                                    {ps.icon} {d.department}{locked ? '（已評分）' : ''}
                                  </span>
                                  <span style={{ fontSize: 10, opacity: 0.8 }}>第{d.preference_order ?? '?'}志願 · {ps.label}</span>
                                </button>
                              )
                            })}
                          </div>
                        </td>
                        <td style={td}>
                          <button onClick={() => reschedule(stu.account, stu.name)} disabled={busy} style={{ ...s.btn, ...s.btnSm }}>改期</button>
                        </td>
                      </tr>
                    )
                  })}
                  {!filtered.length && (
                    <tr><td colSpan={8} style={{ ...td, textAlign: 'center', color: '#aaa', padding: 32 }}>
                      {loading ? '載入中…' : '此日期沒有排定二階面試的學生'}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ) : tab === 'noshow' ? (
        // ── 漏網之魚（面試日已過但未完成）──────────────────────────────────
        <>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, color: '#92400e', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 14px', lineHeight: 1.6 }}>
              以下學生面試日已過但未完成報到／面試，請改期或移回未排程，避免遺漏。
            </span>
            <Btn onClick={loadNoShows}>🔄 重新整理</Btn>
          </div>
          <Card>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1100 }}>
                <thead>
                  <tr style={{ background: '#faf9f6' }}>
                    {['姓名', '英文姓名', '帳號', '性別', '護照', '中心', '原面試日', '狀態', '各系進度', ''].map((h, i) => <th key={i} style={th}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {noshows.map((stu) => (
                    <tr key={stu.account}>
                      <td style={{ ...td, fontWeight: 500 }}>{stu.name}</td>
                      <td style={{ ...td, color: '#777' }}>{stu.name_english}</td>
                      <td style={{ ...td, color: '#999', fontSize: 12 }}>{stu.account}</td>
                      <td style={td}>{stu.gender || '—'}</td>
                      <td style={{ ...td, fontSize: 12, color: '#777' }}>{stu.passport_number || '—'}</td>
                      <td style={td}>{stu.center || '—'}</td>
                      <td style={{ ...td, color: '#dc2626', fontWeight: 600 }}>{stu.stage2_date}</td>
                      <td style={td}>
                        <span style={{
                          display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                          background: stu.kind === 'absent' ? '#fee2e2' : '#fef3c7',
                          color: stu.kind === 'absent' ? '#dc2626' : '#b45309',
                        }}>{stu.kind === 'absent' ? '缺席未報到' : '報到但未完成'}</span>
                      </td>
                      <td style={td}>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {stu.statuses.map((d) => {
                            const ps = PILL_STYLE[d.st]
                            return (
                              <span key={d.department} style={{
                                display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start',
                                border: `1px solid ${ps.border}`, borderRadius: 8, padding: '4px 9px',
                                background: ps.bg, color: ps.color,
                              }}>
                                <span style={{ fontSize: 12.5, fontWeight: 600 }}>{ps.icon} {d.department}</span>
                                <span style={{ fontSize: 10, opacity: 0.8 }}>第{d.preference_order ?? '?'}志願 · {ps.label}</span>
                              </span>
                            )
                          })}
                        </div>
                      </td>
                      <td style={td}>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                          <input type="date" value={nsDates[stu.account] || ''}
                            onChange={(e) => setNsDates((prev) => ({ ...prev, [stu.account]: e.target.value }))}
                            style={{ ...s.input, width: 140, marginBottom: 0, padding: '5px 8px', fontSize: 12 }} />
                          <Btn variant="primary" disabled={busy} onClick={() => nsReschedule(stu.account)}>改期</Btn>
                          <Btn disabled={busy} onClick={() => nsUnschedule(stu.account)}>移回未排程</Btn>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!noshows.length && (
                    <tr><td colSpan={10} style={{ ...td, textAlign: 'center', color: '#aaa', padding: 32 }}>
                      🎉 沒有漏網之魚，所有已過面試日的學生皆完成
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ) : (
        // ── 未排程名單 ──────────────────────────────────────────────────────
        <>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, color: '#555' }}>指派面試日</span>
            <input type="date" style={{ ...s.input, width: 160, marginBottom: 0 }} value={assignDate} onChange={(e) => setAssignDate(e.target.value)} />
            <Btn variant="primary" onClick={assignPicked} disabled={busy}>指派面試日（已勾選 {Object.values(picked).filter(Boolean).length} 位）</Btn>
            <Btn onClick={loadUnscheduled}>🔄 重新整理</Btn>
            <span style={{ fontSize: 12, color: '#aaa' }}>共 {unsched.length} 位尚未排程</span>
          </div>
          <Card>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 960 }}>
                <thead>
                  <tr style={{ background: '#faf9f6' }}>
                    <th style={{ ...th, width: 40 }}>
                      <input type="checkbox"
                        checked={unsched.length > 0 && unsched.every((p) => picked[p.account])}
                        onChange={(e) => {
                          const next = {}
                          if (e.target.checked) for (const p of unsched) next[p.account] = true
                          setPicked(next)
                        }} />
                    </th>
                    {['姓名', '性別', '護照號碼', '中心', '國籍', '報考志願'].map((h, i) => <th key={i} style={th}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {unsched.map((p) => (
                    <tr key={p.account}>
                      <td style={td}>
                        <input type="checkbox" checked={!!picked[p.account]}
                          onChange={(e) => setPicked((prev) => ({ ...prev, [p.account]: e.target.checked }))} />
                      </td>
                      <td style={td}>
                        <div style={{ fontWeight: 500 }}>{p.name}</div>
                        <div style={{ fontSize: 11, color: '#999' }}>{p.name_english}</div>
                        <div style={{ fontSize: 11, color: '#bbb' }}>{p.account}</div>
                      </td>
                      <td style={td}>{p.gender || '—'}</td>
                      <td style={{ ...td, fontSize: 12, color: '#777' }}>{p.passport_number || '—'}</td>
                      <td style={td}>{p.center || '—'}</td>
                      <td style={td}>{p.nationality}</td>
                      <td style={{ ...td, color: '#777' }}>
                        {(p.depts || []).map((d) => (
                          <div key={d.department} style={{ fontSize: 12 }}>
                            <span style={{ color: '#bbb' }}>{d.preference_order ?? '?'}.</span> {d.department}
                          </div>
                        ))}
                      </td>
                    </tr>
                  ))}
                  {!unsched.length && (
                    <tr><td colSpan={7} style={{ ...td, textAlign: 'center', color: '#aaa', padding: 32 }}>沒有未排程的學生</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
      {showGuide && <CheckinGuideModal onClose={() => setShowGuide(false)} />}
    </PageShell>
  )
}
