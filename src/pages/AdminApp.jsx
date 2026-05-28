import { useState, useEffect, useCallback, useMemo } from 'react'
import { PageShell } from '../components/PageShell'
import { Btn, Card, CardHead, Pill, s } from '../components/UI'
import ImportModal from '../components/ImportModal'
import TeacherManager from '../components/TeacherManager'
import CenterManager from '../components/CenterManager'
import StudentEditModal from '../components/StudentEditModal'
import { writeXlsx } from '../components/ExportBtn'
import { getAllApplications, upsertApplications, getFinalList, setInterviewDate, getCenters, batchSetCenter } from '../api'
import { getTeacher, logoutTeacher } from '../auth'
import { STATUS } from '../constants'

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
  const [toast, setToast]         = useState(null)
  const [kw, setKw]               = useState('')
  const [deptFilter, setDeptFilter]     = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [selected, setSelected]   = useState(() => new Set())  // 選取的帳號群組 key
  const [expanded, setExpanded]   = useState(() => new Set())  // 展開的帳號群組 key
  const [assignDate, setAssignDate] = useState(localToday)
  const [assigning, setAssigning] = useState(false)
  const [tab, setTab]             = useState('students')  // students | teachers | centers
  const [editGroup, setEditGroup] = useState(null)        // 編輯中的考生群組
  const [centers, setCenters]     = useState([])          // 面試中心清單
  const [batchCenter, setBatchCenter] = useState('')      // 批次設定中心：選定的中心名稱

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
    if (!teacher || teacher.role !== 'admin') window.location.hash = '#/login?stage=admin'
  }, [teacher])

  const handleImport = async (rows, skipped, onProgress) => {
    const { added, updated } = await upsertApplications(rows, onProgress)
    showToast(`匯入完成：新增 ${added}、更新 ${updated}、略過 ${skipped}（無帳號）`)
    await load()
  }

  const exportFinal = async () => {
    try {
      const evals = (await getFinalList()) || []
      if (!evals.length) { showToast('目前沒有建議錄取的學生', 'warn'); return }
      const rows = evals.map((e) => ({
        account:            e.applications?.account ?? '',
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

  const depts = [...new Set(apps.map((a) => a.department).filter(Boolean))].sort()

  // 先分組，再以群組為單位篩選（任一志願符合即顯示）
  const groups = useMemo(() => groupByAccount(apps), [apps])
  const groupMap = useMemo(() => new Map(groups.map((g) => [g.key, g])), [groups])

  const filtered = groups.filter((g) => {
    if (deptFilter && !g.apps.some((a) => a.department === deptFilter)) return false
    if (statusFilter && g.status !== statusFilter) return false
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

  // 各中心綁定的志願數（給中心管理頁刪除前提示）
  const centerUsage = useMemo(() => {
    const m = {}
    for (const a of apps) if (a.center) m[a.center] = (m[a.center] || 0) + 1
    return m
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

  const td = { padding: '8px 10px', borderBottom: '1px solid #f5f4f0', fontSize: 13 }
  const th = { padding: '9px 10px', textAlign: 'left', borderBottom: '1px solid #e8e7e3', color: '#666', fontWeight: 500, fontSize: 12 }

  if (!teacher || teacher.role !== 'admin') return null

  return (
    <PageShell
      title="實踐大學"
      subtitle="行政人員"
      toast={toast}
      right={
        <>
          {loading && <span style={{ fontSize: 12, color: '#aaa' }}>載入中…</span>}
          <Btn variant="primary" style={{ background: '#2a2a28', borderColor: '#444', color: '#f5f4f0' }} onClick={() => setShowImport(true)}>＋ 上傳名單</Btn>
          <Btn style={{ background: 'none', borderColor: '#7e22ce', color: '#e9d5ff' }} onClick={() => { window.location.hash = '#/stage3' }}>③ 第三階段錄取</Btn>
          <Btn style={{ background: 'none', borderColor: '#7c2d12', color: '#fed7aa' }} onClick={() => { window.location.hash = '#/stage4' }}>④ 第四階段確認 →</Btn>
          <Btn style={{ background: 'none', borderColor: '#444', color: '#ccc' }} onClick={exportFinal}>⬇ 匯出最終名單</Btn>
          <Btn style={{ background: 'none', borderColor: '#444', color: '#ccc' }} onClick={load}>↻</Btn>
          <span style={{ fontSize: 12, color: '#999' }}>{teacher.display_name || teacher.username}</span>
          <Btn style={{ background: 'none', borderColor: '#444', color: '#ccc' }} onClick={logoutTeacher}>登出</Btn>
        </>
      }
    >
      {/* 分頁 */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid #e8e7e3' }}>
        {[{ k: 'students', label: '學生總覽' }, { k: 'teachers', label: '帳號管理' }, { k: 'centers', label: '中心管理' }].map((t) => (
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

      {tab === 'teachers' && <TeacherManager depts={depts} showToast={showToast} />}

      {tab === 'centers' && (
        <CenterManager centers={centers} usage={centerUsage} showToast={showToast} onReload={loadCenters} />
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
        <span style={{ fontSize: 12, color: '#aaa', alignSelf: 'center' }}>共 {filtered.length} 人</span>
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

      <Card>
        <CardHead left="學生總覽" right={`${filtered.length} / ${groups.length} 人`} />
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#faf9f6' }}>
                <th style={{ ...th, width: 32 }}>
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                </th>
                {['帳號', '中文姓名', '英文姓名', '護照號碼', '國籍', '中心', '第1志願系所', '志願', '面試日', '狀態', '通過一階日', '操作'].map((h) => (
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
                      <td style={{ ...td, fontWeight: 500 }}>{g.rep.name}</td>
                      <td style={{ ...td, color: '#777' }}>{g.rep.name_english}</td>
                      <td style={{ ...td, color: '#777' }}>{g.rep.passport_number}</td>
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
                      <td style={{ ...td, color: '#555' }}>{g.rep.department}</td>
                      <td style={td}>
                        {extra > 0 ? (
                          <button onClick={() => toggleExpand(g.key)}
                            style={{ ...s.btn, ...s.btnSm, background: '#f0fdf4', borderColor: '#bbf7d0', color: '#15803d' }}>
                            {isOpen ? '▼ 收合' : `＋${extra} 個志願`}
                          </button>
                        ) : (
                          <span style={{ fontSize: 12, color: '#ccc' }}>單一志願</span>
                        )}
                      </td>
                      <td style={{ ...td, color: g.interview_date ? '#1e40af' : '#ccc' }}>{g.interview_date || '—'}</td>
                      <td style={td}><Pill color={si.color} bg={si.bg}>{si.label}</Pill></td>
                      <td style={{ ...td, color: '#888' }}>{g.stage1_passed_date || '—'}</td>
                      <td style={td}>
                        <button onClick={() => setEditGroup(g)} style={{ ...s.btn, ...s.btnSm }}>編輯</button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td></td>
                        <td colSpan={12} style={{ padding: '4px 10px 12px', background: '#fafafa' }}>
                          <div style={{ fontSize: 11, color: '#aaa', margin: '4px 0 6px' }}>該帳號全部志願</div>
                          {g.apps.map((a) => (
                            <div key={a.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '5px 0', borderBottom: '1px solid #f0efeb', fontSize: 13 }}>
                              <span style={{ width: 56, color: '#888' }}>第 {a.preference_order ?? '—'} 志願</span>
                              <span style={{ flex: 1 }}>{a.department}</span>
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
