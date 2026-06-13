import { useState, useEffect, useCallback, useMemo } from 'react'
import { PageShell } from '../components/PageShell'
import { Btn, Card, CardHead, Pill, s } from '../components/UI'
import { writeXlsx } from '../components/ExportBtn'
import { ExportMenu } from '../components/ExportMenu'
import { getStage3Data, getFinalAdmissions, upsertFinalAdmission, getNotifyStage3 } from '../api'
import { DECISIONS } from '../constants'
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
  { key: 'name',         label: '中文姓名' },
  { key: 'name_english', label: '英文姓名' },
  { key: 'status_label', label: '最終狀態' },
]

export default function Stage3App() {
  const teacher = getTeacher()
  const [evals, setEvals]       = useState([])
  const [finals, setFinals]     = useState(() => new Map())   // key(account__dept) → final row
  const [dept, setDept]         = useState('')
  const [viewMode, setViewMode]           = useState('dept')   // 'dept' | 'center'
  const [selectedCenter, setSelectedCenter] = useState('')
  const [loading, setLoading]   = useState(false)
  const [savingKey, setSavingKey] = useState(null)
  const [toast, setToast]       = useState(null)

  // 守衛：只有 admin 能進
  useEffect(() => { if (!teacher || (teacher.role !== 'superadmin')) window.location.hash = '#/login?stage=admin' }, [teacher])

  const showToast = useCallback((msg, type = 'ok') => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3500)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [ev, fa] = await Promise.all([getStage3Data(), getFinalAdmissions()])
      setEvals(dedupeEvals(ev))
      setFinals(new Map((fa || []).map((r) => [`${r.account}__${r.department}`, r])))
    } catch (e) {
      showToast('載入失敗：' + e.message, 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

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

  // 已確認重複正取：同帳號在多個系 final_status = 'admitted'（真正需要處理的問題）
  const confirmedConflicts = useMemo(() => {
    const byAcct = new Map()
    for (const e of evals) {
      if (statusOf(e) !== 'admitted') continue
      const a = acctOf(e); if (!a) continue
      if (!byAcct.has(a)) byAcct.set(a, { name: e.applications?.name, depts: new Set() })
      byAcct.get(a).depts.add(deptOf(e))
    }
    return [...byAcct.entries()]
      .filter(([, v]) => v.depts.size >= 2)
      .map(([account, v]) => ({ account, name: v.name, depts: [...v.depts] }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evals, finals])

  // 老師建議重複（行政尚未拍板）：同帳號 ≥2 個系 recommendation = 'admit'，
  // 且這些系的 final_status 仍為 pending / waitlisted（尚未 admitted / rejected）。
  // 已確認只有一系正取（其餘 rejected / waitlisted）→ 不在此列。
  const pendingWarnings = useMemo(() => {
    const confirmedSet = new Set(confirmedConflicts.map((c) => c.account))
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
  }, [evals, finals, confirmedConflicts])

  // 衝突帳號集合（兩類聯集）：表格內這些學生的名字旁標註「第 N 志願」
  const conflictAccts = useMemo(
    () => new Set([...confirmedConflicts, ...pendingWarnings].map((c) => c.account)),
    [confirmedConflicts, pendingWarnings],
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

  // 各中心錄取統計（以帳號為單位：每個帳號取優先序最高的最終狀態，再依中心分組計數）
  const centerSummary = useMemo(() => {
    const PRIORITY = { admitted: 0, waitlisted: 1, rejected: 2, pending: 3 }
    const acctCenter = new Map()      // account → center
    const acctBestStatus = new Map()  // account → 優先序最高的 final_status
    for (const e of evals) {
      const a = acctOf(e); if (!a) continue
      if (!acctCenter.has(a)) acctCenter.set(a, e.applications?.center || '（未設定中心）')
      const st = statusOf(e)
      const prev = acctBestStatus.get(a)
      if (prev === undefined || PRIORITY[st] < PRIORITY[prev]) acctBestStatus.set(a, st)
    }
    const byCenter = new Map()
    for (const [a, center] of acctCenter) {
      if (!byCenter.has(center)) byCenter.set(center, { center, admitted: 0, waitlisted: 0, rejected: 0, pending: 0, total: 0 })
      const g = byCenter.get(center)
      g[acctBestStatus.get(a) || 'pending']++
      g.total++
    }
    return [...byCenter.values()].sort((x, y) => x.center.localeCompare(y.center, 'zh-TW'))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evals, finals])

  const rows = evals.filter((e) => deptOf(e) === dept)

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

  // 中心檢視：該中心所有評分（不去重，同帳號多科系各列獨立顯示），
  // 依最終狀態（正→備→不錄→待定）、志願序 asc、二階分數 desc 排序
  const centerLabelOf = (e) => e.applications?.center || '（未設定中心）'
  const centerRows = useMemo(() => {
    const inCenter = evals.filter((e) => centerLabelOf(e) === selectedCenter)
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
  }, [evals, selectedCenter, finals])

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
      const center = e.applications?.center || '未指定'
      if (!groups.has(center)) groups.set(center, [])
      groups.get(center).push({
        center,
        department:   deptOf(e),
        account:      acctOf(e) ?? '',
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

  // 匯出錄取通知寄信名單（admitted，含 Email、一人一列）
  const exportNotify = async () => {
    try {
      const rows = await getNotifyStage3()
      if (!rows.length) { showToast('目前沒有正取的學生', 'warn'); return }
      writeXlsx(
        [
          { key: 'name', label: '中文姓名' },
          { key: 'name_english', label: '英文姓名' },
          { key: 'email', label: 'Email' },
          { key: 'department', label: '錄取系所' },
        ],
        rows,
        '三階錄取通知.xlsx',
      )
      showToast(`已匯出 ${rows.length} 筆錄取通知名單`)
    } catch (e) {
      showToast('匯出失敗：' + e.message, 'error')
    }
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
            { label: '⬇ 匯出錄取通知名單', onClick: exportNotify },
          ]} />
          <Btn style={{ background: 'none', borderColor: '#ffffff44', color: '#f3e8ff' }} onClick={load}>↻</Btn>
          <span style={{ fontSize: 12, color: '#e9d5ff' }}>{teacher.display_name || teacher.username}</span>
          <Btn style={{ background: 'none', borderColor: '#ffffff44', color: '#f3e8ff' }} onClick={logoutTeacher}>登出</Btn>
        </div>
      }
    >
      {/* 已確認重複正取（紅）：同一人被多系正取，需擇一保留 */}
      {confirmedConflicts.length > 0 && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 16px', marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#b91c1c', marginBottom: 8 }}>
            ⚠ 重複正取（{confirmedConflicts.length} 人）— 同一人被多系正取，請擇一保留
          </div>
          {confirmedConflicts.map((c) => (
            <div key={c.account} style={{ fontSize: 13, color: '#7f1d1d', padding: '3px 0' }}>
              帳號 <b>{c.account}</b>（{c.name || '—'}）已被以下科系同時正取：{c.depts.join('、')}
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

      {/* 各系總覽 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {summary.map((su) => (
          <button key={su.dept} onClick={() => setDept(su.dept)}
            style={{
              ...s.card, padding: '10px 14px', minWidth: 150, textAlign: 'left', cursor: 'pointer',
              border: dept === su.dept ? '2px solid #7e22ce' : '1px solid #e8e7e3', fontFamily: 'inherit',
            }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{su.dept}</div>
            <div style={{ fontSize: 12, color: '#666' }}>
              <span style={{ color: '#16a34a' }}>正 {su.admitted}</span> ·{' '}
              <span style={{ color: '#d97706' }}>備 {su.waitlisted}</span> ·{' '}
              <span style={{ color: '#aaa' }}>共 {su.total}</span>
            </div>
          </button>
        ))}
        {!summary.length && (
          <div style={{ fontSize: 13, color: '#aaa' }}>{loading ? '載入中…' : '尚無第二階段評分資料'}</div>
        )}
      </div>

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
      {centerSummary.length > 0 && (
        <Card style={{ marginBottom: 16 }}>
          <CardHead left="各中心錄取統計" right={`${centerSummary.length} 個中心`} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: 14 }}>
            {centerSummary.map((cs) => (
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
                  <span style={{ color: '#aaa' }}>共 {cs.total}</span>
                </div>
              </button>
            ))}
          </div>
        </Card>
      )}

      {viewMode === 'dept' ? (
      <Card>
        <CardHead left={dept ? `${dept} · 通過兩階段名單` : '請選擇科系'} right={`${rows.length} 位`} />
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#faf9f6' }}>
                {['中文姓名', '帳號', '國籍', '性別', '志願序', '一階', '二階分數', '老師建議', '最終狀態', '設定'].map((h) => <th key={h} style={th}>{h}</th>)}
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
                    <td style={td}>{e.applications?.nationality || '—'}</td>
                    <td style={td}>{e.applications?.gender || '—'}</td>
                    <td style={td}>{e.applications?.preference_order ?? '—'}</td>
                    <td style={td}>{passed ? <span style={{ color: '#15803d' }}>通過</span> : '—'}</td>
                    <td style={td}>{e.total_score ?? '—'}</td>
                    <td style={td}><Pill color={ri.color} bg={ri.bg}>{ri.label}</Pill></td>
                    <td style={td}><Pill color={statusInfo(cur).color} bg={statusInfo(cur).bg}>{statusInfo(cur).label}</Pill></td>
                    <td style={td}>{statusButtons(e)}</td>
                  </tr>
                )
              })}
              {!rows.length && (
                <tr><td colSpan={10} style={{ ...td, textAlign: 'center', color: '#aaa', padding: 32 }}>
                  {loading ? '載入中…' : '此科系尚無第二階段評分'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
      ) : (
      <Card>
        <CardHead left={`${selectedCenter} · 正備取名單`} right={`${centerRows.length} 筆（每人取最優狀態顯示）`} />
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#faf9f6' }}>
                {['姓名', '帳號', '國籍', '性別', '科系', '志願序', '二階分數', '老師建議', '最終狀態', '設定'].map((h) => <th key={h} style={th}>{h}</th>)}
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
                    <td style={td}>{e.applications?.nationality || '—'}</td>
                    <td style={td}>{e.applications?.gender || '—'}</td>
                    <td style={td}>{deptOf(e)}</td>
                    <td style={td}>{e.applications?.preference_order ?? '—'}</td>
                    <td style={td}>{e.total_score ?? '—'}</td>
                    <td style={td}><Pill color={ri.color} bg={ri.bg}>{ri.label}</Pill></td>
                    <td style={td}><Pill color={statusInfo(cur).color} bg={statusInfo(cur).bg}>{statusInfo(cur).label}</Pill></td>
                    <td style={td}>{statusButtons(e)}</td>
                  </tr>
                )
              })}
              {!centerRows.length && (
                <tr><td colSpan={10} style={{ ...td, textAlign: 'center', color: '#aaa', padding: 32 }}>
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
    </PageShell>
  )
}
