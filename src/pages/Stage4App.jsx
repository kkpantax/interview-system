import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { PageShell } from '../components/PageShell'
import { Btn, Card, CardHead, Pill, s } from '../components/UI'
import { writeXlsx } from '../components/ExportBtn'
import AdmitMailComposer from '../components/AdmitMailComposer'
import {
  getStage4Data, syncStage4FromStage3, updateStage4Status,
  getDepartmentQuotas, getDepartmentCampuses,
  getStage4Settings, saveStage4Settings,
} from '../api'
import { getTeacher, logoutTeacher } from '../auth'
import { batchInfo, batchOf, deptShort, resolveCampus } from '../constants'

const ACCENT = '#7c2d12'
const CAMP_ORDER = { '台北校區': 0, '高雄校區': 1, '其他': 2 }

const TABS = [
  { key: 'admit',    label: '正取' },
  { key: 'wait',     label: '備取' },
  { key: 'declined', label: '正取拒絕' },
  { key: 'reject',   label: '不錄取' },
  { key: 'tools',    label: '工具' },
]

// 設定列(DB) ↔ composer defaults
const defaultsFromSettings = (st) => ({
  replyBy:       st?.reply_by || '',
  announceDate:  st?.announce_date || '',
  contactPerson: st?.contact_person || '',
  contactEmail:  st?.contact_email || 'shihchien_ifp@g2.usc.edu.tw',
  unitName:      st?.unit_name || '國際事務處 Office of International Affairs',
})
const settingsFromForm = (f) => ({
  announce_date:  f.announceDate || '',
  reply_by:       f.replyBy || '',
  contact_person: f.contactPerson || '',
  contact_email:  f.contactEmail || '',
  unit_name:      f.unitName || '',
})

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
  const [batchFilter, setBatchFilter] = useState('') // '' 全部 / '1' / '2'
  const [selDept, setSelDept] = useState('')         // 展開中的系所（正取頁）
  const [mail, setMail]       = useState(null)        // { kind, recipients, batch }
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

  useEffect(() => {
    getDepartmentQuotas().then((q) => setQuotas(q || {})).catch(() => {})
    getDepartmentCampuses().then((o) => setCampusOv(o || {})).catch(() => {})
    getStage4Settings().then((m) => setSettings(m || {})).catch(() => {})
  }, [])

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
  const openMail = (recipients) => {
    if (!recipients.length) { showToast('沒有可寄送的對象（需未回應且有 Email）', 'warn'); return }
    setMail({ kind: 's4_admit', recipients, batch: settingsBatch })
  }

  const onSaveDefaults = async (form) => {
    const b = mail?.batch || settingsBatch
    await saveStage4Settings(b, settingsFromForm(form))
    const m = await getStage4Settings(); setSettings(m || {})
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

  if (!teacher || teacher.role !== 'superadmin') return null
  const headerBtn = { background: 'none', borderColor: '#ffffff44', color: '#fde7d4' }
  const th = { padding: '9px 10px', textAlign: 'left', borderBottom: '1px solid #e8e7e3', color: '#666', fontWeight: 500, fontSize: 12 }
  const td = { padding: '8px 10px', borderBottom: '1px solid #f5f4f0', fontSize: 13 }

  // 名額徽章
  const quotaBadge = (dept, admittedN) => {
    const q = quotas[dept]
    if (q == null) return null
    const diff = q - admittedN
    const txt = diff > 0 ? `尚可錄取 ${diff}` : diff === 0 ? '已達預計' : `超收 ${-diff}`
    const col = diff > 0 ? { c: '#0f766e', b: '#ccfbf1' } : diff === 0 ? { c: '#6b7280', b: '#f3f4f6' } : { c: '#b91c1c', b: '#fee2e2' }
    return <Pill color={col.c} bg={col.b}>{txt}</Pill>
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
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <Btn variant="primary" disabled={busy || !notifyList.length}
              onClick={() => openMail(notifyList)}>
              ✉ 寄送預錄取意願調查{notifyList.length ? `（未回應 ${notifyList.length}）` : ''}
            </Btn>
          </div>

          {admitByCampus.map(([camp, list]) => (
            <div key={camp} style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#7c2d12', marginBottom: 8 }}>
                {camp}<span style={{ color: '#bbb', fontWeight: 400 }}> · {list.reduce((s2, x) => s2 + x.total, 0)} 位正取</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 10 }}>
                {list.map((su) => {
                  const open = selDept === su.dept
                  const finalEnroll = su.enrolled + su.promotedEnrolled
                  return (
                    <button key={su.dept} onClick={() => setSelDept(open ? '' : su.dept)}
                      style={{ textAlign: 'left', cursor: 'pointer', background: open ? '#fff7ed' : 'white',
                        border: '1px solid ' + (open ? ACCENT : '#e8e7e3'), borderRadius: 12, padding: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontWeight: 600, fontSize: 14 }}>{deptShort(su.dept)}</span>
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
          ))}
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
                      {['姓名', '帳號', '梯次', '志願序', '二階分數', '回應狀態', '備注', '操作'].map((h) => <th key={h} style={th}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {selRows.map((r) => {
                      const cs = r.contact_status
                      const resp = cs === 'enrolled' ? { t: '✓ 願意就讀', c: '#15803d', b: '#dcfce7' }
                        : cs === 'declined' ? { t: '放棄', c: '#dc2626', b: '#fee2e2' }
                        : { t: '未回應', c: '#b45309', b: '#fef3c7' }
                      const bi = batchInfo(r.account)
                      return (
                        <tr key={r.id}>
                          <td style={td}><div style={{ fontWeight: 500 }}>{r.appInfo?.name || '—'}</div><div style={{ fontSize: 11, color: '#888' }}>{r.appInfo?.name_english || '—'}</div></td>
                          <td style={{ ...td, color: '#888' }}>{r.account || '—'}</td>
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
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                    {!selRows.length && <tr><td colSpan={8} style={{ ...td, textAlign: 'center', color: '#aaa', padding: 28 }}>本系無正取資料</td></tr>}
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

      {/* ── 其餘分頁（後續階段建置） ── */}
      {tab !== 'admit' && (
        <div style={{ background: 'white', border: '1px dashed #e0ddd6', borderRadius: 12, padding: 48, textAlign: 'center', color: '#aaa' }}>
          「{TABS.find((t) => t.key === tab)?.label}」分頁建置中。
        </div>
      )}

      {mail && (
        <AdmitMailComposer
          kind={mail.kind}
          recipients={mail.recipients}
          defaults={defaultsFromSettings(settings[mail.batch])}
          onSaveDefaults={onSaveDefaults}
          onClose={() => { setMail(null); load() }}
          onToast={showToast}
        />
      )}
    </PageShell>
  )
}
