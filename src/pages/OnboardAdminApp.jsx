import { useState, useEffect, useCallback } from 'react'
import { PageShell } from '../components/PageShell'
import { Btn, Card, CardHead, Pill, s } from '../components/UI'
import { onboardAdminList, onboardAdminConfirm, onboardAdminAbandon, onboardAdminReactivate } from '../api'
import { getTeacher, logoutTeacher } from '../auth'
import { ENROLL_STEPS, deptZhFull } from '../constants'

// 入學準備後台（superadmin 專用）。掛 #/onboard-admin，StageNav 顯示「⑤ 入學準備」。
// 資料經 /api/onboard-admin（service role），操作需帶超管帳密——本頁用一次性密碼閘門
// 取得密碼後快取於記憶體（不落地 storage）重用。整體結構鏡像 Stage4App。
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
  const active = data.filter((x) => x.status !== 'abandoned')
  const completedN = data.filter((x) => x.status === 'completed').length
  const abandonedList = data.filter((x) => x.status === 'abandoned')
  const denom = active.length   // 分母排除已放棄

  // 各步「卡關中」= 該步 open/submitted（非放棄）
  const stuckAt = (step) => active.filter((x) => x.status !== 'completed'
    && ['open', 'submitted'].includes(stepStateOf(x, step)))
  const countState = (step, state) => active.filter((x) => stepStateOf(x, step) === state).length

  const right = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {loading && <span style={{ fontSize: 12, color: '#fde7d4' }}>載入中…</span>}
      <Btn style={headerBtn} disabled={busy} onClick={() => load()}>↻</Btn>
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
    </PageShell>
  )
}
