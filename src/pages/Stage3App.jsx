import { useState, useEffect, useCallback, useMemo } from 'react'
import { PageShell } from '../components/PageShell'
import { Btn, Card, CardHead, Pill, s } from '../components/UI'
import { writeXlsx, writeXlsxMulti } from '../components/ExportBtn'
import { ExportMenu } from '../components/ExportMenu'
import { getStage3Data, getFinalAdmissions, upsertFinalAdmission, getAllApplications, getDepartmentQuotas, getDepartmentCampuses, getBatchOverrides, setBatchOverride, clearBatchOverride } from '../api'
import { DECISIONS, batchInfo, batchOf, resolveCampus, setBatchOverrides } from '../constants'
import EvalDetailModal from '../components/EvalDetailModal'
import { getTeacher, logoutTeacher } from '../auth'

// 最終錄取狀態（對應 final_admissions.final_status 的 CHECK）
const FINAL_STATUSES = [
  { v: 'admitted',   label: '正取',   color: '#16a34a', bg: '#dcfce7' },
  { v: 'waitlisted', label: '備取',   color: '#d97706', bg: '#fef3c7' },
  { v: 'rejected',   label: '不錄取', color: '#dc2626', bg: '#fee2e2' },
  { v: 'pending',    label: '待定',   color: '#6b7280', bg: '#f3f4f6' },
]
const statusInfo = (v) => FINAL_STATUSES.find((x) => x.v === v) || FINAL_STATUSES[3]
const recInfo    = (v) => DECISIONS.find((x) => x.v === v) || DECISIONS[3]
// 志願序顏色：1 綠 / 2 藍 / 3 橘 / 4↑ 灰
const prefInfo = (p) => {
  const n = Number(p)
  if (n === 1) return { color: '#15803d', bg: '#dcfce7' }
  if (n === 2) return { color: '#1d4ed8', bg: '#dbeafe' }
  if (n === 3) return { color: '#b45309', bg: '#fef3c7' }
  return { color: '#475569', bg: '#f1f5f9' }
}

// 中心檢視排序優先序：正取 → 備取 → 不錄取 → 待定
const CENTER_SORT_PRIORITY = { admitted: 0, waitlisted: 1, rejected: 2, pending: 3 }

// 從一筆 evaluation 取出帳號 / 系所（以評分自身的 department 為準，缺則用 application 的）
const acctOf = (e) => e.applications?.account ?? null
const deptOf = (e) => e.department || e.applications?.department || ''
const keyOf  = (e) => `${acctOf(e)}__${deptOf(e)}`

// 同一學生在同一系所若有多筆評分（重複評分），合併為一列，避免放榜頁同系出現重複列。
// 合併規則（分數與建議分開取，因兩者性質不同）：
//   · 分數 total_score：取「最高分」那筆為基底（分數相同→eval_date 新者→created_at 新者）。
//     total_score 為 null 視為最低，確保有分數的評分一定勝過未評分的。
//   · 老師建議 recommendation：取「最新一筆有做決定（非待定 pending）」的建議；
//     若全部都待定，才沿用最新一筆（待定）。如此第一次待定、第二次錄取會顯示錄取；
//     待定不會蓋過先前已做的決定；老師改判時以最新決定為準。
const bestScoreOf = (a, b) => {
  const sa = a.total_score ?? -Infinity, sb = b.total_score ?? -Infinity
  if (sa !== sb) return sa > sb ? a : b
  const da = String(a.eval_date || ''), db = String(b.eval_date || '')
  if (da !== db) return da > db ? a : b
  const ca = String(a.created_at || ''), cb = String(b.created_at || '')
  if (ca !== cb) return ca > cb ? a : b
  return a
}
const laterOf = (a, b) => {
  const da = String(a.eval_date || ''), db = String(b.eval_date || '')
  if (da !== db) return da > db ? a : b
  const ca = String(a.created_at || ''), cb = String(b.created_at || '')
  return cb > ca ? b : a
}
const isDecided = (e) => !!e.recommendation && e.recommendation !== 'pending'
const dedupeEvals = (list) => {
  const groups = new Map()
  for (const e of (list || [])) {
    const a = acctOf(e), d = deptOf(e)
    const k = a && d ? `${a}__${d}` : `__row__${e.id}`
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push(e)
  }
  const out = []
  for (const evs of groups.values()) {
    const base = evs.reduce((acc, e) => bestScoreOf(e, acc))
    const decided = evs.filter(isDecided)
    const recSource = (decided.length ? decided : evs).reduce((acc, e) => laterOf(e, acc))
    out.push({ ...base, recommendation: recSource.recommendation })
  }
  return out
}

const EXPORT_COLS = [
  { key: 'account',      label: '帳號' },
  { key: 'batch_label',  label: '梯次' },
  { key: 'name',         label: '中文姓名' },
  { key: 'name_english', label: '英文姓名' },
  { key: 'department',   label: '科系' },
  { key: 'center',       label: '面試中心' },
  { key: 'status_label', label: '最終狀態' },
]

// 依中心匯出用的欄位（中心放第一欄）
const CENTER_EXPORT_COLS = [
  { key: 'center',       label: '面試中心' },
  { key: 'department',   label: '科系' },
  { key: 'account',      label: '帳號' },
  { key: 'batch_label',  label: '梯次' },
  { key: 'name',         label: '中文姓名' },
  { key: 'name_english', label: '英文姓名' },
  { key: 'status_label', label: '最終狀態' },
]

// 各系匯出欄位（與科系視角名單顯示一致；不含「查看評分紀錄」「設定」等操作欄）
const DEPT_EXPORT_COLS = [
  { key: 'name',         label: '中文姓名' },
  { key: 'account',      label: '帳號' },
  { key: 'batch_label',  label: '梯次' },
  { key: 'nationality',  label: '國籍' },
  { key: 'gender',       label: '性別' },
  { key: 'stage1_label', label: '一階' },
  { key: 'pref',         label: '志願序' },
  { key: 'score',        label: '二階分數' },
  { key: 'rec_label',    label: '老師建議' },
  { key: 'status_label', label: '最終狀態' },
]

// 全校總名單匯出欄位（每人一列，不分系）
const SCHOOL_EXPORT_COLS = [
  { key: 'name',        label: '中文姓名' },
  { key: 'name_english', label: '英文姓名' },
  { key: 'account',     label: '帳號' },
  { key: 'batch_label', label: '梯次' },
  { key: 'nationality', label: '國籍' },
  { key: 'gender',      label: '性別' },
  { key: 'campus',      label: '校區' },
  { key: 'dept',        label: '科系' },
  { key: 'pref',        label: '志願序' },
  { key: 'score',       label: '二階分數' },
  { key: 'note',        label: '備註' },
]

export default function Stage3App() {
  const teacher = getTeacher()
  const [evals, setEvals]       = useState([])
  const [rawEvals, setRawEvals] = useState([])   // 未去重的全部評分（供「查看評分紀錄」逐筆顯示）
  const [viewing, setViewing]   = useState(null)  // 正在檢視評分紀錄的學生（account+dept）
  const [finals, setFinals]     = useState(() => new Map())   // key(account__dept) → final row
  const [apps, setApps]         = useState([])
  const [quotas, setQuotas]     = useState({})
  const [campusOv, setCampusOv] = useState({})   // department_campus 覆寫
  const [overrides, setOverrides] = useState({})   // { account: '1'|'2' }
  const [dept, setDept]         = useState('')
  const [viewMode, setViewMode]           = useState('dept')   // 'dept' | 'center'
  const [selectedCenter, setSelectedCenter] = useState('')
  const [batchFilter, setBatchFilter]     = useState('')       // 梯次篩選：'' 全部 / '1' 一梯 / '2' 二梯
  const [statusFilter, setStatusFilter]   = useState('')       // 科系視角狀態篩選：'' 全部 / admitted / waitlisted / rejected / pending
  const [allTab, setAllTab]               = useState('admitted') // 全校總名單分頁：admitted / waitlisted / rejected
  const [allCampus, setAllCampus]         = useState('')        // 全校總名單校區篩選：'' 全部 / 台北校區 / 高雄校區 / 其他
  const [centersOpen, setCentersOpen]     = useState(false)     // 各中心錄取統計區塊是否展開（預設摺疊以節省版面）
  const [loading, setLoading]   = useState(false)
  const [savingKey, setSavingKey] = useState(null)
  const [resolving, setResolving] = useState(false)
  const [toast, setToast]       = useState(null)

  // 守衛：只有 admin 能進
  useEffect(() => { if (!teacher || (teacher.role !== 'superadmin')) window.location.hash = '#/login?stage=admin' }, [teacher])

  const showToast = useCallback((msg, type = 'ok') => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3500)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [ev, fa, ap, qz, cc, ov] = await Promise.all([
        getStage3Data(),
        getFinalAdmissions(),
        getAllApplications().catch(() => []),
        getDepartmentQuotas().catch(() => ({})),
        getDepartmentCampuses().catch(() => ({})),
        getBatchOverrides().catch(() => ({})),
      ])
      setRawEvals(ev || [])
      setEvals(dedupeEvals(ev))
      setFinals(new Map((fa || []).map((r) => [`${r.account}__${r.department}`, r])))
      setApps(ap || [])
      setQuotas(qz || {})
      setCampusOv(cc || {})
      setBatchOverrides(ov || {})   // 灌進 constants，讓本頁 batchOf/batchInfo 生效
      setOverrides(ov || {})        // 本地用來判斷是否已覆寫
    } catch (e) {
      showToast('載入失敗：' + e.message, 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  const toggleBatchOverride = useCallback(async (account) => {
    const acct = String(account || '')
    if (!acct) return
    try {
      if (overrides[acct] === '2') {
        await clearBatchOverride(acct)          // 已覆寫 → 還原成帳號原本梯次
      } else {
        await setBatchOverride(acct, '2', '轉報／重新報名改列第二梯')
      }
      await load()
    } catch (e) {
      showToast('梯次覆寫失敗：' + e.message, 'error')
    }
  }, [overrides, load, showToast])

  useEffect(() => { load() }, [load])

  const deptList = useMemo(
    () => [...new Set(evals.map(deptOf).filter(Boolean))].sort(),
    [evals],
  )

  // 預設選第一個科系
  useEffect(() => {
    if (deptList.length && !deptList.includes(dept)) setDept(deptList[0])
  }, [deptList, dept])

  const statusOf = (e) => finals.get(keyOf(e))?.final_status || 'pending'

  const evalCount = useMemo(() => {
    const m = new Map()
    for (const r of rawEvals) m.set(keyOf(r), (m.get(keyOf(r)) || 0) + 1)
    return m
  }, [rawEvals])
  const recCount = (e) => evalCount.get(keyOf(e)) || 0
  const openRecords = (e) => {
    const a = acctOf(e), d = deptOf(e)
    setViewing({
      name: e.applications?.name || '',
      name_english: e.applications?.name_english || '',
      account: a || '',
      department: d,
      evaluations: rawEvals.filter((r) => acctOf(r) === a && deptOf(r) === d),
    })
  }

  // 需釋出志願衝突：學生在某系已「正取」，其餘志願（不論正取或備取）須一併釋出為「不錄取」。
  // 贏家＝志願序最高（preference_order 最小，同序以二階分數高者）的那筆正取；待定（pending）不動。
  const resolvable = useMemo(() => {
    const byAcct = new Map()   // account → eval[]（該帳號各志願，已去重）
    for (const e of evals) {
      const a = acctOf(e); if (!a) continue
      if (!byAcct.has(a)) byAcct.set(a, [])
      byAcct.get(a).push(e)
    }
    const out = []
    for (const [account, list] of byAcct) {
      const admitted = list.filter((e) => statusOf(e) === 'admitted')
      if (!admitted.length) continue
      const winner = [...admitted].sort((x, y) => {
        const px = x.applications?.preference_order ?? 99
        const py = y.applications?.preference_order ?? 99
        if (px !== py) return px - py
        return (y.total_score || 0) - (x.total_score || 0)
      })[0]
      const losers = list.filter((e) => e !== winner && (statusOf(e) === 'admitted' || statusOf(e) === 'waitlisted'))
      if (!losers.length) continue
      out.push({
        account,
        name: winner.applications?.name || list[0].applications?.name || '',
        winnerDept: deptOf(winner),
        winnerPref: winner.applications?.preference_order ?? null,
        losers: losers.map((e) => ({ e, dept: deptOf(e), status: statusOf(e), pref: e.applications?.preference_order ?? null })),
      })
    }
    return out.sort((a, b) => String(a.account).localeCompare(String(b.account)))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evals, finals])

  // 老師建議重複（行政尚未拍板）：同帳號 ≥2 個系 recommendation = 'admit'，
  // 且這些系的 final_status 仍為 pending / waitlisted（尚未 admitted / rejected）。
  // 已確認只有一系正取（其餘 rejected / waitlisted）→ 不在此列。
  const pendingWarnings = useMemo(() => {
    const confirmedSet = new Set(resolvable.map((c) => c.account))
    const byAcct = new Map()
    for (const e of evals) {
      if (e.recommendation !== 'admit') continue
      const st = statusOf(e)
      if (st !== 'pending' && st !== 'waitlisted') continue
      const a = acctOf(e); if (!a) continue
      if (!byAcct.has(a)) byAcct.set(a, { name: e.applications?.name, depts: new Set() })
      byAcct.get(a).depts.add(deptOf(e))
    }
    return [...byAcct.entries()]
      .filter(([account, v]) => v.depts.size >= 2 && !confirmedSet.has(account))
      .map(([account, v]) => ({ account, name: v.name, depts: [...v.depts] }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evals, finals, resolvable])

  // 衝突帳號集合（兩類聯集）：表格內這些學生的名字旁標註「第 N 志願」
  const conflictAccts = useMemo(
    () => new Set([...resolvable, ...pendingWarnings].map((c) => c.account)),
    [resolvable, pendingWarnings],
  )

  // 各系正/備取總覽
  const summary = useMemo(() => deptList.map((d) => {
    const inDept = evals.filter((e) => deptOf(e) === d)
    return {
      dept: d,
      total: inDept.length,
      admitted:   inDept.filter((e) => statusOf(e) === 'admitted').length,
      waitlisted: inDept.filter((e) => statusOf(e) === 'waitlisted').length,
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [deptList, evals, finals])

  // 每位帳號固定歸到「最高志願（preference_order 最小）」那筆的面試中心，
  // 讓卡片統計、明細表、依中心匯出三邊用同一套中心口徑（同一人不會被算進多個中心）。
  const acctCanonCenter = useMemo(() => {
    const best = new Map()   // account → { pref, center }
    for (const e of evals) {
      const a = acctOf(e); if (!a) continue
      const pref = e.applications?.preference_order ?? 99
      const center = e.applications?.center || '（未設定中心）'
      const prev = best.get(a)
      if (!prev || pref < prev.pref ||
          (pref === prev.pref && prev.center === '（未設定中心）' && center !== '（未設定中心）')) {
        best.set(a, { pref, center })
      }
    }
    const m = new Map()
    for (const [a, v] of best) m.set(a, v.center)
    return m
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evals])
  const canonCenterOf = (e) => acctCanonCenter.get(acctOf(e)) || '（未設定中心）'

  // 各中心錄取統計（以帳號為單位：每個帳號取優先序最高的最終狀態，再依中心分組計數）
  const centerSummary = useMemo(() => {
    const PRIORITY = { admitted: 0, waitlisted: 1, rejected: 2, pending: 3 }
    const acctBestStatus = new Map()  // account → 全部志願裡優先序最高的 final_status
    for (const e of evals) {
      const a = acctOf(e); if (!a) continue
      const st = statusOf(e)
      const prev = acctBestStatus.get(a)
      if (prev === undefined || PRIORITY[st] < PRIORITY[prev]) acctBestStatus.set(a, st)
    }
    const byCenter = new Map()
    for (const [a, st] of acctBestStatus) {
      const center = acctCanonCenter.get(a) || '（未設定中心）'
      if (!byCenter.has(center)) byCenter.set(center, { center, admitted: 0, waitlisted: 0, rejected: 0, pending: 0, total: 0 })
      const g = byCenter.get(center)
      g[st || 'pending']++
      g.total++
    }
    return [...byCenter.values()].sort((x, y) => x.center.localeCompare(y.center, 'zh-TW'))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evals, finals, acctCanonCenter])

  // 各中心報名人數（以 applications 為準；每位申請人歸到最高志願的中心，計不重複帳號）
  const appliedByCenter = useMemo(() => {
    const best = new Map()   // account → { pref, center }
    for (const a of apps) {
      const acc = a.account || `__noacc_${a.id}`
      const pref = a.preference_order ?? 99
      const center = a.center || '（未設定中心）'
      const prev = best.get(acc)
      if (!prev || pref < prev.pref ||
          (pref === prev.pref && prev.center === '（未設定中心）' && center !== '（未設定中心）')) {
        best.set(acc, { pref, center })
      }
    }
    const m = new Map()  // center → Set(account)
    for (const [acc, v] of best) {
      if (!m.has(v.center)) m.set(v.center, new Set())
      m.get(v.center).add(acc)
    }
    const out = {}
    for (const [c, set] of m) out[c] = set.size
    return out
  }, [apps])

  // 各校區正取人數（以「人」計：每位帳號取其正取系所的校區，計不重複帳號）
  const campusAdmitted = useMemo(() => {
    const seen = new Map()   // account → 校區（取第一筆正取的校區；定案後每人僅一個正取）
    for (const e of evals) {
      if (statusOf(e) !== 'admitted') continue
      const a = acctOf(e); if (!a) continue
      if (!seen.has(a)) seen.set(a, resolveCampus(deptOf(e), campusOv))
    }
    const out = {}
    for (const camp of seen.values()) out[camp] = (out[camp] || 0) + 1
    return out
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evals, finals, campusOv])

  // 各中心「一階淘汰」人數（未通過一階＝任一志願有 status='rejected' 且無 stage1_passed_date）。
  // 這些人不在 evals 內，故以 applications 為來源、每人歸到最高志願的中心計數。
  const stage1RejectedByCenter = useMemo(() => {
    const acc = new Map()   // account → { passed, hasRej, center, pref }
    for (const a of apps) {
      const id = a.account; if (!id) continue
      const cur = acc.get(id) || { passed: false, hasRej: false, center: '（未設定中心）', pref: 99 }
      if (a.stage1_passed_date) cur.passed = true
      if (a.status === 'rejected') cur.hasRej = true
      const pref = a.preference_order ?? 99
      if (pref < cur.pref ||
          (pref === cur.pref && cur.center === '（未設定中心）' && a.center)) {
        cur.center = a.center || '（未設定中心）'
        cur.pref = pref
      }
      acc.set(id, cur)
    }
    const out = {}
    for (const v of acc.values()) if (!v.passed && v.hasRej) out[v.center] = (out[v.center] || 0) + 1
    return out
  }, [apps])

  // 中心卡片清單：合併「有進放榜評分的中心」與「只有一階淘汰的中心」，確保每個中心都出現
  const centerCards = useMemo(() => {
    const m = new Map()
    for (const cs of centerSummary) m.set(cs.center, { ...cs })
    for (const center of Object.keys(stage1RejectedByCenter)) {
      if (!m.has(center)) m.set(center, { center, admitted: 0, waitlisted: 0, rejected: 0, pending: 0, total: 0 })
    }
    return [...m.values()].sort((x, y) => x.center.localeCompare(y.center, 'zh-TW'))
  }, [centerSummary, stage1RejectedByCenter])

  const rows = evals.filter((e) => deptOf(e) === dept)
    .filter((e) => !batchFilter || String(batchOf(acctOf(e))) === batchFilter)
    .filter((e) => !statusFilter || statusOf(e) === statusFilter)

  // 全校總名單（不分系，每人一列）：依最終身分歸到 正取／備取／不錄取（待定者另計，不入榜）。
  //   · 正取：取最高志願（preference_order 最小、同序分數高）那筆正取的系所與校區。
  //   · 備取：無正取、有備取 → 取最高志願的備取系，另計其他備取系數（顯示「另備取 N 系」）。
  //   · 不錄取：全部志願皆已定案且無正取／備取／待定；科系欄顯示其最高志願「報考系」作參考。
  //   · 待定：尚有任一志願為 pending 且無正取／備取 → 不列入三榜，只計數提示。
  const schoolRoster = useMemo(() => {
    const byAcct = new Map()   // account → eval[]（已去重，套用梯次篩選）
    for (const e of evals) {
      if (batchFilter && String(batchOf(acctOf(e))) !== batchFilter) continue
      const a = acctOf(e); if (!a) continue
      if (!byAcct.has(a)) byAcct.set(a, [])
      byAcct.get(a).push(e)
    }
    const pickTop = (list) => [...list].sort((x, y) => {
      const px = x.applications?.preference_order ?? 99
      const py = y.applications?.preference_order ?? 99
      if (px !== py) return px - py
      return (y.total_score || 0) - (x.total_score || 0)
    })[0]
    const admitted = [], waitlisted = [], rejected = []
    let pendingCount = 0
    for (const [account, list] of byAcct) {
      const adm = list.filter((e) => statusOf(e) === 'admitted')
      const wai = list.filter((e) => statusOf(e) === 'waitlisted')
      const hasPending = list.some((e) => statusOf(e) === 'pending')
      const base = list[0]
      const common = {
        account,
        name:         base.applications?.name ?? '',
        name_english: base.applications?.name_english ?? '',
        nationality:  base.applications?.nationality ?? '',
        gender:       base.applications?.gender ?? '',
      }
      const rowOf = (w, extra = {}) => ({
        ...common,
        dept:   deptOf(w),
        campus: resolveCampus(deptOf(w), campusOv),
        pref:   w.applications?.preference_order ?? null,
        score:  w.total_score ?? null,
        ...extra,
      })
      if (adm.length) {
        admitted.push(rowOf(pickTop(adm), { status: 'admitted', otherCount: 0 }))
      } else if (wai.length) {
        const otherCount = new Set(wai.map(deptOf)).size - 1
        waitlisted.push(rowOf(pickTop(wai), { status: 'waitlisted', otherCount }))
      } else if (hasPending) {
        pendingCount++
      } else {
        rejected.push(rowOf(pickTop(list), { status: 'rejected', otherCount: 0 }))
      }
    }
    const byCampusDept = (a, b) =>
      a.campus.localeCompare(b.campus, 'zh-TW') ||
      a.dept.localeCompare(b.dept, 'zh-TW') ||
      (a.pref ?? 99) - (b.pref ?? 99) ||
      (b.score ?? -Infinity) - (a.score ?? -Infinity) ||
      String(a.account).localeCompare(String(b.account))
    admitted.sort(byCampusDept)
    waitlisted.sort(byCampusDept)
    rejected.sort((a, b) => String(a.account).localeCompare(String(b.account)))
    return { admitted, waitlisted, rejected, pendingCount }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evals, finals, campusOv, batchFilter])

  // 套用校區篩選後的當前分頁列，與各分頁人數（人數同步反映校區篩選）
  const countFor = (tab) => {
    const arr = schoolRoster[tab] || []
    return allCampus ? arr.filter((r) => r.campus === allCampus).length : arr.length
  }
  const allRows = (() => {
    const arr = schoolRoster[allTab] || []
    return allCampus ? arr.filter((r) => r.campus === allCampus) : arr
  })()

  const setStatus = async (e, final_status) => {
    const account = acctOf(e), department = deptOf(e)
    if (!account) { showToast('此筆缺少帳號，無法設定', 'warn'); return }
    const key = keyOf(e)
    setSavingKey(key)
    try {
      const row = {
        account, department, final_status,
        stage2_score: e.total_score ?? null,
        stage2_recommendation: e.recommendation ?? null,
        confirmed_at: new Date().toISOString(),
      }
      const res = await upsertFinalAdmission(row)
      const saved = (Array.isArray(res) ? res[0] : res) || row
      setFinals((prev) => { const m = new Map(prev); m.set(key, saved); return m })
      showToast(`已設定 ${e.applications?.name || account}（${department}）為「${statusInfo(final_status).label}」`)
    } catch (err) {
      showToast('設定失敗：' + err.message, 'error')
    } finally {
      setSavingKey(null)
    }
  }

  // 一鍵解決志願衝突：對每位已正取的學生，保留志願序最高的那筆正取，
  // 其餘正取與備取一律改「不錄取」（待定不動）。逐筆 upsert，最後一次更新 finals。
  const resolveConflicts = async () => {
    const losers = resolvable.flatMap((r) => r.losers.map((l) => ({ ...l, account: r.account })))
    if (!losers.length) { showToast('目前沒有需要釋出的志願衝突'); return }
    if (!window.confirm(
      `即將為 ${resolvable.length} 位已正取的學生，釋出其餘 ${losers.length} 筆志願（改為「不錄取」）。\n` +
      `每位學生只保留志願序最高的那筆正取，其餘正取與備取一律改不錄取。\n確定執行？`
    )) return
    setResolving(true)
    try {
      const updates = new Map()
      let ok = 0
      for (const l of losers) {
        const e = l.e
        const row = {
          account: l.account,
          department: l.dept,
          final_status: 'rejected',
          stage2_score: e.total_score ?? null,
          stage2_recommendation: e.recommendation ?? null,
          confirmed_at: new Date().toISOString(),
        }
        try {
          const res = await upsertFinalAdmission(row)
          const saved = (Array.isArray(res) ? res[0] : res) || row
          updates.set(keyOf(e), saved)
          ok++
        } catch { /* 單筆失敗略過，繼續其餘 */ }
      }
      if (updates.size) setFinals((prev) => { const m = new Map(prev); for (const [k, v] of updates) m.set(k, v); return m })
      showToast(
        `已釋出 ${ok} 筆志願為「不錄取」` + (ok < losers.length ? `（${losers.length - ok} 筆失敗）` : ''),
        ok < losers.length ? 'warn' : 'ok',
      )
    } finally {
      setResolving(false)
    }
  }

  // 中心檢視：該中心所有評分（不去重，同帳號多科系各列獨立顯示），
  // 依最終狀態（正→備→不錄→待定）、志願序 asc、二階分數 desc 排序
  const centerRows = useMemo(() => {
    const inCenter = evals.filter((e) => canonCenterOf(e) === selectedCenter)
      .filter((e) => !batchFilter || String(batchOf(acctOf(e))) === batchFilter)
    // 以帳號為單位，算出每人在該中心的最佳狀態（admitted > waitlisted > rejected > pending）
    const bestByAcct = new Map()
    for (const e of inCenter) {
      const a = acctOf(e); if (!a) continue
      const pri = CENTER_SORT_PRIORITY[statusOf(e)] ?? 9
      const prev = bestByAcct.get(a)
      if (prev == null || pri < prev) bestByAcct.set(a, pri)
    }
    return inCenter
      .filter((e) => {
        const a = acctOf(e)
        if (!a) return true  // 無帳號的列全保留
        return (CENTER_SORT_PRIORITY[statusOf(e)] ?? 9) === bestByAcct.get(a)
      })
      .sort((a, b) => {
        const sa = CENTER_SORT_PRIORITY[statusOf(a)] ?? 9
        const sb = CENTER_SORT_PRIORITY[statusOf(b)] ?? 9
        if (sa !== sb) return sa - sb
        const pa = a.applications?.preference_order ?? 99
        const pb = b.applications?.preference_order ?? 99
        if (pa !== pb) return pa - pb
        return (b.total_score || 0) - (a.total_score || 0)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evals, selectedCenter, finals, batchFilter, acctCanonCenter])

  // 設定欄共用的最終狀態按鈕組（科系檢視與中心檢視共用）
  const statusButtons = (e) => {
    const cur = statusOf(e)
    return (
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {FINAL_STATUSES.map((st) => (
          <button key={st.v} onClick={() => setStatus(e, st.v)}
            disabled={savingKey === keyOf(e)}
            style={{
              ...s.btn, ...s.btnSm,
              background: cur === st.v ? st.bg : 'white',
              borderColor: cur === st.v ? st.color : '#ddd',
              color: cur === st.v ? st.color : '#777',
              fontWeight: cur === st.v ? 600 : 400,
            }}>
            {st.label}
          </button>
        ))}
      </div>
    )
  }

  const exportAdmitted = () => {
    const out = []
    for (const e of evals) {
      if (statusOf(e) !== 'admitted') continue
      out.push({
        account:      acctOf(e) ?? '',
        batch_label:  batchInfo(acctOf(e)).label,
        name:         e.applications?.name ?? '',
        name_english: e.applications?.name_english ?? '',
        department:   deptOf(e),
        center:       e.applications?.center ?? '',
        status_label: '正取',
      })
    }
    if (!out.length) { showToast('目前沒有正取的學生', 'warn'); return }
    writeXlsx(EXPORT_COLS, out, '第三階段正取名單.xlsx')
    showToast(`已匯出 ${out.length} 筆正取名單`)
  }

  const exportWaitlisted = () => {
    const out = []
    for (const e of evals) {
      if (statusOf(e) !== 'waitlisted') continue
      out.push({
        account:      acctOf(e) ?? '',
        batch_label:  batchInfo(acctOf(e)).label,
        name:         e.applications?.name ?? '',
        name_english: e.applications?.name_english ?? '',
        department:   deptOf(e),
        center:       e.applications?.center ?? '',
        status_label: '備取',
      })
    }
    if (!out.length) { showToast('目前沒有備取的學生', 'warn'); return }
    writeXlsx(EXPORT_COLS, out, '第三階段備取名單.xlsx')
    showToast(`已匯出 ${out.length} 筆備取名單`)
  }

  // 依中心匯出（正取 + 備取），同中心歸為一組、組間以空行隔開
  const exportByCenter = () => {
    const labelOf = { admitted: '正取', waitlisted: '備取' }
    const groups = new Map()   // center → rows
    for (const e of evals) {
      const st = statusOf(e)
      if (st !== 'admitted' && st !== 'waitlisted') continue
      const center = canonCenterOf(e)
      if (!groups.has(center)) groups.set(center, [])
      groups.get(center).push({
        center,
        department:   deptOf(e),
        account:      acctOf(e) ?? '',
        batch_label:  batchInfo(acctOf(e)).label,
        name:         e.applications?.name ?? '',
        name_english: e.applications?.name_english ?? '',
        status_label: labelOf[st],
      })
    }
    if (!groups.size) { showToast('目前沒有正取或備取的學生', 'warn'); return }
    const centers = [...groups.keys()].sort()
    const out = []
    centers.forEach((c, i) => {
      if (i > 0) out.push({})   // 中心之間空一行
      out.push(...groups.get(c))
    })
    writeXlsx(CENTER_EXPORT_COLS, out, '第三階段錄取名單_依中心.xlsx')
    showToast(`已匯出依中心名單（${centers.length} 個中心）`)
  }

  // 匯出目前選取科系名單：正取／備取／不錄取 分三個分頁，只含本系學生
  const exportDept = () => {
    if (!dept) { showToast('請先選擇科系', 'warn'); return }
    const inDept = evals.filter((e) => deptOf(e) === dept)
    const toRow = (e) => ({
      name:         e.applications?.name ?? '',
      account:      acctOf(e) ?? '',
      batch_label:  batchInfo(acctOf(e)).label,
      nationality:  e.applications?.nationality ?? '',
      gender:       e.applications?.gender ?? '',
      stage1_label: e.applications?.stage1_passed_date ? '通過' : '',
      pref:         e.applications?.preference_order ?? '',
      score:        e.total_score ?? '',
      rec_label:    recInfo(e.recommendation).label,
      status_label: statusInfo(statusOf(e)).label,
    })
    const adm = inDept.filter((e) => statusOf(e) === 'admitted').map(toRow)
    const wai = inDept.filter((e) => statusOf(e) === 'waitlisted').map(toRow)
    const rej = inDept.filter((e) => statusOf(e) === 'rejected').map(toRow)
    if (!adm.length && !wai.length && !rej.length) {
      showToast('本系目前沒有正取／備取／不錄取的學生', 'warn'); return
    }
    writeXlsxMulti([
      { name: '正取',   columns: DEPT_EXPORT_COLS, rows: adm },
      { name: '備取',   columns: DEPT_EXPORT_COLS, rows: wai },
      { name: '不錄取', columns: DEPT_EXPORT_COLS, rows: rej },
    ], `第三階段_${dept}_名單.xlsx`)
    showToast(`已匯出 ${dept} 名單（正取 ${adm.length}／備取 ${wai.length}／不錄取 ${rej.length}）`)
  }

  // 匯出全校總名單：正取／備取／不錄取 分三個分頁，每人一列、不分系（不受畫面校區篩選影響，整份匯出）
  const exportSchoolRoster = () => {
    const toRow = (r) => ({
      name:         r.name,
      name_english: r.name_english,
      account:      r.account,
      batch_label:  batchInfo(r.account).label,
      nationality:  r.nationality,
      gender:       r.gender,
      campus:       r.campus,
      dept:         r.dept,
      pref:         r.pref ?? '',
      score:        r.score ?? '',
      note:         r.status === 'waitlisted' && r.otherCount > 0 ? `另備取 ${r.otherCount} 系` : '',
    })
    const adm = schoolRoster.admitted.map(toRow)
    const wai = schoolRoster.waitlisted.map(toRow)
    const rej = schoolRoster.rejected.map(toRow)
    if (!adm.length && !wai.length && !rej.length) {
      showToast('目前沒有可匯出的名單', 'warn'); return
    }
    writeXlsxMulti([
      { name: '正取',   columns: SCHOOL_EXPORT_COLS, rows: adm },
      { name: '備取',   columns: SCHOOL_EXPORT_COLS, rows: wai },
      { name: '不錄取', columns: SCHOOL_EXPORT_COLS, rows: rej },
    ], '第三階段_全校總名單.xlsx')
    showToast(`已匯出全校總名單（正取 ${adm.length}／備取 ${wai.length}／不錄取 ${rej.length}）`)
  }

  const th = { padding: '9px 10px', textAlign: 'left', borderBottom: '1px solid #e8e7e3', color: '#666', fontWeight: 500, fontSize: 12 }
  const td = { padding: '8px 10px', borderBottom: '1px solid #f5f4f0', fontSize: 13 }

  if (!teacher || (teacher.role !== 'superadmin')) return null

  return (
    <PageShell
      title="實踐大學" subtitle="第三階段 · 最終錄取" accent="#581c87" toast={toast} intlBack stageKey="stage3"
      right={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {loading && <span style={{ fontSize: 12, color: '#e9d5ff' }}>載入中…</span>}
          <ExportMenu items={[
            { label: '⬇ 匯出正取名單', onClick: exportAdmitted },
            { label: '⬇ 匯出備取名單', onClick: exportWaitlisted },
            { label: '⬇ 匯出依中心名單', onClick: exportByCenter },
            { label: '⬇ 匯出全校總名單（正/備/不錄取）', onClick: exportSchoolRoster },
          ]} />
          <Btn style={{ background: 'none', borderColor: '#ffffff44', color: '#f3e8ff' }} onClick={load}>↻</Btn>
          <span style={{ fontSize: 12, color: '#e9d5ff' }}>{teacher.display_name || teacher.username}</span>
          <Btn style={{ background: 'none', borderColor: '#ffffff44', color: '#f3e8ff' }} onClick={logoutTeacher}>登出</Btn>
        </div>
      }
    >
      {/* 各校區正取總人數（含全校總額） */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {(() => {
          const total = ['台北校區', '高雄校區', '其他'].reduce((sum, c) => sum + (campusAdmitted[c] || 0), 0)
          return (
            <div style={{ ...s.card, padding: '12px 18px', minWidth: 150, borderColor: '#d8b4fe', background: '#faf5ff' }}>
              <div style={{ fontSize: 13, color: '#6b21a8', marginBottom: 2, fontWeight: 600 }}>全校</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#7e22ce', lineHeight: 1.1 }}>
                {total}
                <span style={{ fontSize: 13, fontWeight: 400, color: '#888' }}> 人正取</span>
              </div>
            </div>
          )
        })()}
        {['台北校區', '高雄校區', ...(campusAdmitted['其他'] ? ['其他'] : [])].map((camp) => (
          <div key={camp} style={{ ...s.card, padding: '12px 18px', minWidth: 150 }}>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 2 }}>{camp}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#16a34a', lineHeight: 1.1 }}>
              {campusAdmitted[camp] || 0}
              <span style={{ fontSize: 13, fontWeight: 400, color: '#888' }}> 人正取</span>
            </div>
          </div>
        ))}
      </div>

      {/* 檢視切換：科系 / 中心 / 全校總名單 */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {[
          { v: 'dept',   label: '科系檢視' },
          { v: 'center', label: '中心檢視' },
          { v: 'all',    label: '全校總名單' },
        ].map((o) => (
          <button key={o.v}
            onClick={() => {
              if (o.v === 'center' && !selectedCenter && centerCards[0]) setSelectedCenter(centerCards[0].center)
              setViewMode(o.v)
            }}
            style={{
              ...s.btn, fontWeight: 600,
              background:  viewMode === o.v ? '#7e22ce' : '#fff',
              color:       viewMode === o.v ? '#fff' : '#555',
              borderColor: viewMode === o.v ? '#7e22ce' : '#ddd',
            }}>
            {o.label}
          </button>
        ))}
      </div>

      {/* 已確認重複正取（紅）：同一人被多系正取，需擇一保留 */}
      {resolvable.length > 0 && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 16px', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#b91c1c' }}>
              ⚠ 志願衝突（{resolvable.length} 人）— 已正取者須釋出其餘志願（含備取）為「不錄取」
            </div>
            <button onClick={resolveConflicts} disabled={resolving}
              style={{ ...s.btn, ...s.btnSm, background: '#b91c1c', color: '#fff', borderColor: '#b91c1c', fontWeight: 600, whiteSpace: 'nowrap' }}>
              {resolving ? '處理中…' : '🔧 一鍵解決志願衝突'}
            </button>
          </div>
          {resolvable.map((c) => (
            <div key={c.account} style={{ fontSize: 13, color: '#7f1d1d', padding: '3px 0' }}>
              帳號 <b>{c.account}</b>（{c.name || '—'}）保留正取：<b>{c.winnerDept}</b>
              {c.winnerPref != null ? `（第${c.winnerPref}志願）` : ''}
              ；釋出：{c.losers.map((l) => `${l.dept}（${l.status === 'admitted' ? '正取' : '備取'}${l.pref != null ? `·第${l.pref}志願` : ''}）`).join('、')}
            </div>
          ))}
        </div>
      )}

      {/* 老師建議重複錄取（黃）：尚未確認，請擇一 */}
      {pendingWarnings.length > 0 && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#b45309', marginBottom: 8 }}>
            ⚠ 老師建議重複錄取（{pendingWarnings.length} 人）— 請擇一確認
          </div>
          {pendingWarnings.map((c) => (
            <div key={c.account} style={{ fontSize: 13, color: '#92400e', padding: '3px 0' }}>
              帳號 <b>{c.account}</b>（{c.name || '—'}）同時在以下科系被建議錄取：{c.depts.join('、')}
            </div>
          ))}
        </div>
      )}

      {/* 各系總覽（依校區分組：台北 → 高雄 → 其他，便於區隔兩校區） */}
      {summary.length ? (() => {
        const CAMP_ORDER = { '台北校區': 0, '高雄校區': 1, '其他': 2 }
        const groups = new Map()
        for (const su of summary) {
          const camp = resolveCampus(su.dept, campusOv)
          if (!groups.has(camp)) groups.set(camp, [])
          groups.get(camp).push(su)
        }
        const camps = [...groups.keys()].sort((a, b) => (CAMP_ORDER[a] ?? 9) - (CAMP_ORDER[b] ?? 9) || a.localeCompare(b, 'zh-TW'))
        return camps.map((camp) => (
          <div key={camp} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: '#6b21a8', marginBottom: 6 }}>
              {camp}<span style={{ fontSize: 11.5, fontWeight: 400, color: '#aaa' }}>　{groups.get(camp).length} 系</span>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {groups.get(camp).map((su) => (
                <button key={su.dept} onClick={() => setDept(su.dept)}
                  style={{
                    ...s.card, padding: '10px 14px', minWidth: 150, textAlign: 'left', cursor: 'pointer',
                    border: dept === su.dept ? '2px solid #7e22ce' : '1px solid #e8e7e3', fontFamily: 'inherit',
                  }}>
                  {(() => {
                    const q = quotas[su.dept]
                    if (q == null || q === '') return null
                    const diff = Number(q) - su.admitted
                    const txt = diff > 0 ? `尚可錄取 ${diff}` : diff === 0 ? '已達預計' : `超收 ${-diff}`
                    const color = diff > 0 ? '#0f766e' : diff === 0 ? '#6b7280' : '#dc2626'
                    const bg = diff > 0 ? '#ecfdf5' : diff === 0 ? '#f3f4f6' : '#fee2e2'
                    return (
                      <div style={{ display: 'inline-block', fontSize: 11.5, fontWeight: 700, color, background: bg, borderRadius: 6, padding: '2px 8px', marginBottom: 6 }}>
                        {txt}（預計 {q}／正取 {su.admitted}）
                      </div>
                    )
                  })()}
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{su.dept}</div>
                  <div style={{ fontSize: 12, color: '#666' }}>
                    <span style={{ color: '#16a34a' }}>正 {su.admitted}</span> ·{' '}
                    <span style={{ color: '#d97706' }}>備 {su.waitlisted}</span> ·{' '}
                    <span style={{ color: '#aaa' }}>共 {su.total}</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: '#475569', marginTop: 3 }}>
                    預計錄取 <b style={{ color: '#0f766e' }}>{quotas[su.dept] ?? '—'}</b>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))
      })() : (
        <div style={{ fontSize: 13, color: '#aaa', marginBottom: 16 }}>{loading ? '載入中…' : '尚無第二階段評分資料'}</div>
      )}

      {/* 檢視模式切換提示 */}
      {viewMode === 'center' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, padding: '8px 14px', background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: 10 }}>
          <span style={{ fontSize: 13, color: '#6b21a8', fontWeight: 600 }}>
            目前檢視：{selectedCenter} 的正備取名單
          </span>
          <button onClick={() => setViewMode('dept')}
            style={{ ...s.btn, ...s.btnSm, background: 'white', borderColor: '#d8b4fe', color: '#7e22ce' }}>
            ← 回到科系檢視
          </button>
        </div>
      )}

      {/* 各中心錄取統計 */}
      {centerCards.length > 0 && (
        <Card style={{ marginBottom: 16 }}>
          <button onClick={() => setCentersOpen((v) => !v)}
            style={{ ...s.cardHead, width: '100%', background: 'none', border: 'none', borderBottom: centersOpen ? '1px solid #f0efeb' : 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
            <span>{centersOpen ? '▾' : '▸'} 各中心錄取統計</span>
            <span style={{ fontSize: 13, fontWeight: 400, color: '#888' }}>
              {centerCards.length} 個中心{centersOpen ? '' : '（點此展開）'}
            </span>
          </button>
          {centersOpen && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: 14 }}>
            {centerCards.map((cs) => (
              <button key={cs.center}
                onClick={() => { setViewMode('center'); setSelectedCenter(cs.center) }}
                style={{
                  ...s.card, padding: '10px 14px', minWidth: 170, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
                  border: viewMode === 'center' && selectedCenter === cs.center ? '2px solid #7e22ce' : '1px solid #e8e7e3',
                }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{cs.center}</div>
                <div style={{ fontSize: 12, color: '#666' }}>
                  <span style={{ color: '#16a34a' }}>正取 {cs.admitted}</span> ·{' '}
                  <span style={{ color: '#d97706' }}>備取 {cs.waitlisted}</span> ·{' '}
                  <span style={{ color: '#dc2626' }}>未錄取 {cs.rejected}</span>
                </div>
                <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
                  <span style={{ color: '#6b7280' }}>待定 {cs.pending}</span> ·{' '}
                  <span style={{ color: '#aaa' }}>共 {cs.total} 人</span>
                </div>
                <div style={{ fontSize: 11.5, color: '#475569', marginTop: 3 }}>
                  共報名 <b style={{ color: '#0f766e' }}>{appliedByCenter[cs.center] ?? '—'}</b> 人
                  {stage1RejectedByCenter[cs.center] ? (
                    <span style={{ color: '#b45309' }}>　一階淘汰 <b>{stage1RejectedByCenter[cs.center]}</b></span>
                  ) : null}
                </div>
              </button>
            ))}
          </div>
          )}
        </Card>
      )}

      {viewMode === 'all' ? (
      <Card>
        <CardHead left="全校總名單 · 不分系（每人一列）" right={`${allRows.length} 人`} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', flexWrap: 'wrap', borderBottom: '1px solid #f0efea' }}>
          {[
            { v: 'admitted',   label: '正取' },
            { v: 'waitlisted', label: '備取' },
            { v: 'rejected',   label: '不錄取' },
          ].map((o) => (
            <button key={o.v} onClick={() => setAllTab(o.v)}
              style={{
                ...s.btn, ...s.btnSm, fontWeight: 600,
                background:  allTab === o.v ? '#7e22ce' : '#fff',
                color:       allTab === o.v ? '#fff' : '#555',
                borderColor: allTab === o.v ? '#7e22ce' : '#ddd',
              }}>
              {o.label} {countFor(o.v)}
            </button>
          ))}
          <span style={{ width: 1, height: 18, background: '#e8e7e3', margin: '0 4px' }} />
          <select style={s.sel} value={allCampus} onChange={(e) => setAllCampus(e.target.value)}>
            <option value="">全部校區</option>
            <option value="台北校區">台北校區</option>
            <option value="高雄校區">高雄校區</option>
            <option value="其他">其他</option>
          </select>
          {schoolRoster.pendingCount > 0 && (
            <span style={{ fontSize: 12, color: '#6b7280' }}>待定 {schoolRoster.pendingCount} 人（未列入榜單）</span>
          )}
          <span style={{ marginLeft: 'auto', fontSize: 13, color: '#6b21a8', fontWeight: 600 }}>梯次</span>
          <select style={s.sel} value={batchFilter} onChange={(e) => setBatchFilter(e.target.value)}>
            <option value="">全部梯次</option>
            <option value="1">僅第一梯</option>
            <option value="2">僅第二梯</option>
          </select>
          <button onClick={exportSchoolRoster}
            style={{ ...s.btn, ...s.btnSm, fontWeight: 600, background: '#581c87', color: '#fff', borderColor: '#581c87' }}>
            ⬇ 下載全校總名單（正/備/不錄取）
          </button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#faf9f6' }}>
                {['中文姓名', '帳號', '梯次', '國籍', '性別', '校區', allTab === 'rejected' ? '報考系' : '錄取系', '志願序', '二階分數'].map((h) => <th key={h} style={th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {allRows.map((r) => {
                const bi = batchInfo(r.account)
                return (
                  <tr key={r.account}>
                    <td style={{ ...td, fontWeight: 500 }}>{r.name || '—'}</td>
                    <td style={{ ...td, color: '#888' }}>{r.account}</td>
                    <td style={td}><Pill color={bi.color} bg={bi.bg}>{bi.short}</Pill></td>
                    <td style={td}>{r.nationality || '—'}</td>
                    <td style={td}>{r.gender || '—'}</td>
                    <td style={td}>{r.campus || '—'}</td>
                    <td style={td}>
                      {r.dept || '—'}
                      {allTab === 'waitlisted' && r.otherCount > 0 && (
                        <span style={{ ...s.pill, marginLeft: 6, background: '#fef3c7', color: '#b45309' }}>另備取 {r.otherCount} 系</span>
                      )}
                    </td>
                    <td style={td}>
                      {r.pref != null
                        ? <Pill {...prefInfo(r.pref)}>第 {r.pref} 志願</Pill>
                        : '—'}
                    </td>
                    <td style={td}>{r.score ?? '—'}</td>
                  </tr>
                )
              })}
              {!allRows.length && (
                <tr><td colSpan={9} style={{ ...td, textAlign: 'center', color: '#aaa', padding: 32 }}>
                  {loading ? '載入中…' : '此分頁目前沒有名單'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
      ) : viewMode === 'dept' ? (
      <Card>
        <CardHead left={dept ? `${dept} · 通過兩階段名單` : '請選擇科系'} right={`${rows.length} 位`} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', flexWrap: 'wrap', borderBottom: '1px solid #f0efea' }}>
          <span style={{ fontSize: 13, color: '#6b21a8', fontWeight: 600, marginRight: 2 }}>狀態篩選</span>
          {[
            { v: '', label: '全部' },
            { v: 'admitted', label: '正取' },
            { v: 'waitlisted', label: '備取' },
            { v: 'rejected', label: '不錄取' },
            { v: 'pending', label: '待定' },
          ].map((o) => (
            <button key={o.v} onClick={() => setStatusFilter(o.v)}
              style={{
                ...s.btn, ...s.btnSm, fontWeight: 600,
                background: statusFilter === o.v ? '#7e22ce' : '#fff',
                color: statusFilter === o.v ? '#fff' : '#555',
                borderColor: statusFilter === o.v ? '#7e22ce' : '#ddd',
              }}>
              {o.label}
            </button>
          ))}
          <button onClick={exportDept}
            style={{ ...s.btn, ...s.btnSm, fontWeight: 600, marginLeft: 'auto', background: '#581c87', color: '#fff', borderColor: '#581c87' }}>
            ⬇ 下載本系名單（正/備/不錄取）
          </button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#faf9f6' }}>
                {['中文姓名', '帳號', '梯次', '國籍／性別', '一階', '志願序', '二階分數', '評分紀錄', '老師建議', '最終狀態', '設定'].map((h) => <th key={h} style={th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => {
                const cur = statusOf(e)
                const ri = recInfo(e.recommendation)
                const passed = !!e.applications?.stage1_passed_date
                return (
                  <tr key={e.id}>
                    <td style={{ ...td, fontWeight: 500 }}>
                      {e.applications?.name || '—'}
                      {conflictAccts.has(acctOf(e)) && e.applications?.preference_order != null && (
                        <span style={{ ...s.pill, marginLeft: 6, background: '#fef3c7', color: '#b45309' }}>
                          第 {e.applications.preference_order} 志願
                        </span>
                      )}
                    </td>
                    <td style={{ ...td, color: '#888' }}>{acctOf(e) || '—'}</td>
                    {(() => {
                  const acct = acctOf(e); const bi = batchInfo(acct); const ov = overrides[acct]
                  return (
                    <td style={td}>
                      <span
                        onClick={() => toggleBatchOverride(acct)}
                        title={ov ? '手動改列第二梯，點擊還原' : '點擊改列第二梯'}
                        style={{ cursor: 'pointer' }}
                      >
                        <Pill color={bi.color} bg={bi.bg}>{bi.short}{ov ? '＊' : ''}</Pill>
                      </span>
                    </td>
                  )
                })()}
                    <td style={td}>{[e.applications?.nationality, e.applications?.gender].filter(Boolean).join('／') || '—'}</td>
                    <td style={td}>{passed ? <span style={{ color: '#15803d' }}>通過</span> : '—'}</td>
                    <td style={td}>
                      {e.applications?.preference_order != null
                        ? <Pill {...prefInfo(e.applications.preference_order)}>第 {e.applications.preference_order} 志願</Pill>
                        : '—'}
                    </td>
                    <td style={td}>{e.total_score ?? '—'}</td>
                    <td style={td}>
                      <Btn onClick={() => openRecords(e)} style={{ padding: '3px 10px', fontSize: 12 }}>
                        查看{recCount(e) > 1 ? ` ${recCount(e)}` : ''}
                      </Btn>
                    </td>
                    <td style={td}><Pill color={ri.color} bg={ri.bg}>{ri.label}</Pill></td>
                    <td style={td}><Pill color={statusInfo(cur).color} bg={statusInfo(cur).bg}>{statusInfo(cur).label}</Pill></td>
                    <td style={td}>{statusButtons(e)}</td>
                  </tr>
                )
              })}
              {!rows.length && (
                <tr><td colSpan={11} style={{ ...td, textAlign: 'center', color: '#aaa', padding: 32 }}>
                  {loading ? '載入中…' : '此科系尚無第二階段評分'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
      ) : (
      <Card>
        <CardHead left={`${selectedCenter} · 正備取名單`} right={`${new Set(centerRows.map((e) => acctOf(e)).filter(Boolean)).size} 人 / ${centerRows.length} 筆`} />
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#faf9f6' }}>
                {['姓名', '帳號', '梯次', '國籍', '性別', '科系', '志願序', '二階分數', '評分紀錄', '老師建議', '最終狀態', '設定'].map((h) => <th key={h} style={th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {centerRows.map((e) => {
                const cur = statusOf(e)
                const ri = recInfo(e.recommendation)
                return (
                  <tr key={e.id}>
                    <td style={{ ...td, fontWeight: 500 }}>{e.applications?.name || '—'}</td>
                    <td style={{ ...td, color: '#888' }}>{acctOf(e) || '—'}</td>
                    {(() => {
                  const acct = acctOf(e); const bi = batchInfo(acct); const ov = overrides[acct]
                  return (
                    <td style={td}>
                      <span
                        onClick={() => toggleBatchOverride(acct)}
                        title={ov ? '手動改列第二梯，點擊還原' : '點擊改列第二梯'}
                        style={{ cursor: 'pointer' }}
                      >
                        <Pill color={bi.color} bg={bi.bg}>{bi.short}{ov ? '＊' : ''}</Pill>
                      </span>
                    </td>
                  )
                })()}
                    <td style={td}>{e.applications?.nationality || '—'}</td>
                    <td style={td}>{e.applications?.gender || '—'}</td>
                    <td style={td}>{deptOf(e)}</td>
                    <td style={td}>{e.applications?.preference_order ?? '—'}</td>
                    <td style={td}>{e.total_score ?? '—'}</td>
                    <td style={td}>
                      <Btn onClick={() => openRecords(e)} style={{ padding: '3px 10px', fontSize: 12 }}>
                        查看{recCount(e) > 1 ? ` ${recCount(e)}` : ''}
                      </Btn>
                    </td>
                    <td style={td}><Pill color={ri.color} bg={ri.bg}>{ri.label}</Pill></td>
                    <td style={td}><Pill color={statusInfo(cur).color} bg={statusInfo(cur).bg}>{statusInfo(cur).label}</Pill></td>
                    <td style={td}>{statusButtons(e)}</td>
                  </tr>
                )
              })}
              {!centerRows.length && (
                <tr><td colSpan={12} style={{ ...td, textAlign: 'center', color: '#aaa', padding: 32 }}>
                  {loading ? '載入中…' : '此中心尚無評分資料'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
      )}

      <div style={{ fontSize: 12, color: '#aaa', marginTop: 12, lineHeight: 1.6 }}>
        說明：一階為簽到通過制（無分數）；二階分數與老師建議來自各系評分。設定最終狀態後即時寫入；
        上方警示區紅色為「同一人已被多系正取」（需擇一保留），黃色為「老師建議重複、行政尚未確認」（請擇一正取）。
      </div>
      {viewing && <EvalDetailModal student={viewing} onClose={() => setViewing(null)} />}
    </PageShell>
  )
}
