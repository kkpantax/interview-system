import { useState, useEffect, useCallback } from 'react'
import { PageShell } from '../components/PageShell'
import { Btn, Card, CardHead, Pill, s } from '../components/UI'
import { onboardAdminList, onboardAdminConfirm, onboardAdminAbandon, onboardAdminReactivate,
  onboardAdminGetSettings, onboardAdminSaveSettings, onboardAdminSaveLineQr } from '../api'
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

// timestamptz ISO ↔ <input type="datetime-local"> 的本地時間字串
const isoToLocal = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d)) return ''
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

const CAMPUSES = ['台北', '高雄']

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

  // ── 設定分頁：每步截止/承辦 + 步驟5行前須知 + LINE QR ─────────────────────────
  const [cfgLoaded, setCfgLoaded] = useState(false)
  const [rowForm, setRowForm] = useState({})   // { `${batch}-${step}`: {deadline, contact_name, contact_email, contact_phone} }
  const [notice, setNotice] = useState({ 台北: '', 高雄: '' })
  const [qrForm, setQrForm] = useState({ 台北: '', 高雄: '' })

  const loadSettings = useCallback(async (password) => {
    const pp = password ?? pw
    setLoading(true)
    try {
      const res = await onboardAdminGetSettings(teacher.username, pp)
      const rows = res.settings || []
      const f = {}
      for (const r of rows) {
        f[`${r.batch}-${r.step}`] = {
          deadline: isoToLocal(r.deadline),
          contact_name: r.contact_name || '',
          contact_email: r.contact_email || '',
          contact_phone: r.contact_phone || '',
        }
      }
      setRowForm(f)
      // 行前須知以第一梯 step5 為準（兩梯共通儲存）；舊資料為字串時兩校區同值帶入
      const n5 = rows.find((r) => String(r.batch) === '1' && Number(r.step) === 5)?.extra?.notice
      if (typeof n5 === 'string') setNotice({ 台北: n5, 高雄: n5 })
      else if (n5 && typeof n5 === 'object') setNotice({ 台北: n5['台北'] || '', 高雄: n5['高雄'] || '' })
      else setNotice({ 台北: '', 高雄: '' })
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
      await onboardAdminSaveSettings(teacher.username, pw, {
        batch: b, step,
        deadline: f.deadline ? new Date(f.deadline).toISOString() : null,
        contact_name: (f.contact_name || '').trim() || null,
        contact_email: (f.contact_email || '').trim() || null,
        contact_phone: (f.contact_phone || '').trim() || null,
      })
      showToast(`已儲存 ${b === '1' ? '第一梯' : '第二梯'}「${ENROLL_STEPS[step - 1]?.zh}」設定`)
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
      <Btn style={headerBtn} disabled={busy} onClick={() => (tab === 'settings' ? loadSettings() : load())}>↻</Btn>
      <span style={{ fontSize: 12, color: '#fde7d4' }}>{teacher.display_name || teacher.username}</span>
      <Btn style={headerBtn} onClick={logoutTeacher}>登出</Btn>
    </div>
  )

  // 名單表（每個步驟分頁共用）
  const stepTable = (step) => {
    const rows = stuckAt(step)
    return (
      <>
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
          {/* A. 每步設定：截止日 + 承辦資訊（依梯次分兩組） */}
          {['1', '2'].map((b) => (
            <Card key={b} style={{ marginBottom: 16 }}>
              <CardHead left={`${b === '1' ? '第一梯' : '第二梯'}：各步驟截止時間與承辦資訊`} />
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr style={{ background: '#faf9f6' }}>
                    {['步驟', '截止時間', '承辦人姓名', 'Email', '電話', ''].map((h, i) => <th key={i} style={th}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {ENROLL_STEPS.map((st) => {
                      const k = `${b}-${st.step}`
                      const f = rowForm[k] || { deadline: '', contact_name: '', contact_email: '', contact_phone: '' }
                      const upd = (key, v) => setRowForm((p) => ({ ...p, [k]: { ...f, [key]: v } }))
                      const cell = { ...s.input, padding: '6px 8px', fontSize: 13, boxSizing: 'border-box' }
                      return (
                        <tr key={st.step}>
                          <td style={{ ...td, whiteSpace: 'nowrap', fontWeight: 500 }}>{'①②③④⑤'[st.step - 1]} {st.zh}</td>
                          <td style={td}><input type="datetime-local" value={f.deadline} onChange={(e) => upd('deadline', e.target.value)} style={cell} /></td>
                          <td style={td}><input value={f.contact_name} onChange={(e) => upd('contact_name', e.target.value)} style={{ ...cell, width: 110 }} /></td>
                          <td style={td}><input value={f.contact_email} onChange={(e) => upd('contact_email', e.target.value)} style={{ ...cell, width: 190 }} /></td>
                          <td style={td}><input value={f.contact_phone} onChange={(e) => upd('contact_phone', e.target.value)} style={{ ...cell, width: 130 }} /></td>
                          <td style={td}><button onClick={() => saveRow(b, st.step)} disabled={busy} style={{ ...s.btn, ...s.btnSm, background: ACCENT, color: '#fff', borderColor: ACCENT }}>儲存</button></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}

          {/* B. 步驟5 行前須知（分校區，兩梯次共通儲存） */}
          <Card style={{ marginBottom: 16 }}>
            <CardHead left="⑤ 行前須知（依校區顯示，兩梯次共通）" />
            <div style={{ padding: '4px 2px' }}>
              <div style={{ fontSize: 12.5, color: '#888', lineHeight: 1.7, marginBottom: 10 }}>
                學生端「⑤ 行前通知」會依學生校區顯示對應內容；儲存時同步寫入第一、二梯的步驟5設定。
              </div>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                {CAMPUSES.map((c) => (
                  <div key={c} style={{ flex: '1 1 320px' }}>
                    <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>{c}校區</div>
                    <textarea rows={8} value={notice[c]}
                      onChange={(e) => setNotice((p) => ({ ...p, [c]: e.target.value }))}
                      style={{ ...s.input, width: '100%', boxSizing: 'border-box', fontFamily: 'inherit', fontSize: 13, lineHeight: 1.7, resize: 'vertical' }} />
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
    </PageShell>
  )
}
