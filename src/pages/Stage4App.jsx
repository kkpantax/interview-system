import { useState, useEffect, useCallback, useMemo } from 'react'
import { PageShell } from '../components/PageShell'
import { Btn, Card, CardHead, Pill, s } from '../components/UI'
import { writeXlsx } from '../components/ExportBtn'
import { ExportMenu } from '../components/ExportMenu'
import { getStage4Data, syncStage4FromStage3, updateStage4Status } from '../api'
import { getTeacher, logoutTeacher } from '../auth'

const ACCENT = '#7c2d12'

// 聯繫狀態的顯示 pill（pending 再依 stage3_status 分正取 / 備取N）
function contactDisplay(row) {
  const cs = row.contact_status
  if (cs === 'pending') {
    return row.stage3_status === 'admitted'
      ? { label: '正取', color: '#15803d', bg: '#dcfce7' }
      : { label: `備取${row.standby_rank ?? ''}`, color: '#6b7280', bg: '#f3f4f6' }
  }
  if (cs === 'negotiating')       return { label: '候補詢問中', color: '#1e40af', bg: '#dbeafe' }
  if (cs === 'enrolled')          return { label: '✓ 確認就讀', color: '#15803d', bg: '#dcfce7' }
  if (cs === 'declined')          return { label: '放棄',       color: '#dc2626', bg: '#fee2e2' }
  if (cs === 'settled_elsewhere') return { label: '已確認他系', color: '#c2410c', bg: '#ffedd5' }
  if (cs === 'passed')            return { label: '已略過',     color: '#6b7280', bg: '#f3f4f6' }
  return { label: cs || '—', color: '#6b7280', bg: '#f3f4f6' }
}

// 類別（stage3 結果）：正取 / 備取N
const categoryLabel = (row) =>
  row.stage3_status === 'admitted' ? '正取' : `備取${row.standby_rank ?? ''}`

// 可操作（顯示 [就讀][放棄]）：pending 的正取，或候補詢問中
const canAct = (row) =>
  (row.contact_status === 'pending' && row.stage3_status === 'admitted') ||
  row.contact_status === 'negotiating'

const EXPORT_COLS = [
  { key: 'account',          label: '帳號' },
  { key: 'name',             label: '中文姓名' },
  { key: 'name_english',     label: '英文姓名' },
  { key: 'department',       label: '科系' },
  { key: 'center',           label: '中心' },
  { key: 'preference_order', label: '志願序' },
  { key: 'status_label',     label: '最終狀態' },
]

export default function Stage4App() {
  const teacher = getTeacher()
  const [data, setData]       = useState([])
  const [center, setCenter]   = useState('')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy]       = useState(false)
  const [toast, setToast]     = useState(null)

  // 守衛：只有 admin 能進（導向 stage4 專用登入，登入後會回到本頁）
  useEffect(() => { if (!teacher || (teacher.role !== 'admin' && teacher.role !== 'superadmin')) window.location.hash = '#/login?stage=stage4' }, [teacher])

  const showToast = useCallback((msg, type = 'ok') => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3500)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await getStage4Data()
      setData(rows || [])
    } catch (e) {
      showToast('載入失敗：' + e.message, 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => { load() }, [load])

  const centers = useMemo(
    () => [...new Set(data.map((r) => r.center || '（未設定中心）'))].sort((a, b) => a.localeCompare(b, 'zh-TW')),
    [data],
  )

  // 預設選第一個中心
  useEffect(() => {
    if (centers.length && !centers.includes(center)) setCenter(centers[0])
  }, [centers, center])

  const centerOf = (r) => r.center || '（未設定中心）'
  const rows = useMemo(
    () => data.filter((r) => centerOf(r) === center),
    [data, center],
  )

  // 本中心統計
  const stats = useMemo(() => ({
    enrolled:    rows.filter((r) => r.contact_status === 'enrolled').length,
    negotiating: rows.filter((r) => r.contact_status === 'negotiating').length,
    pending:     rows.filter((r) => r.contact_status === 'pending').length,
    declined:    rows.filter((r) => r.contact_status === 'declined').length,
  }), [rows])

  // 衝突警示：同中心超過一筆 negotiating（理論上不應發生）
  const negotiatingConflict = stats.negotiating > 1

  // [就讀]：本筆 → enrolled；同帳號其他科系進行中（pending/negotiating/standby）→ settled_elsewhere
  const giveSeat = async (row) => {
    if (busy) return
    setBusy(true)
    try {
      await updateStage4Status(row.id, { contact_status: 'enrolled' })
      const others = data.filter((r) =>
        r.account === row.account && r.id !== row.id &&
        ['pending', 'negotiating', 'standby'].includes(r.contact_status),
      )
      for (const o of others) await updateStage4Status(o.id, { contact_status: 'settled_elsewhere' })
      showToast(`已確認 ${row.appInfo?.name || row.account} 就讀 ${row.department}`)
      await load()
    } catch (e) {
      showToast('操作失敗：' + e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  // [放棄]：本筆 → declined；遞補同中心同科系下一位 waitlisted（standby_rank 最小、尚 pending）
  //   該帳號已在他系就讀/確認 → 標 passed 跳過，繼續找下一位；否則 → negotiating 後停止
  const decline = async (row) => {
    if (busy) return
    setBusy(true)
    try {
      await updateStage4Status(row.id, { contact_status: 'declined' })

      const candidates = data
        .filter((r) =>
          centerOf(r) === centerOf(row) && r.department === row.department &&
          r.stage3_status === 'waitlisted' && r.contact_status === 'pending')
        .sort((a, b) => (a.standby_rank || 99) - (b.standby_rank || 99))

      let promoted = null
      for (const cand of candidates) {
        const settledElsewhere = data.some((r) =>
          r.account === cand.account && r.id !== cand.id &&
          (r.contact_status === 'enrolled' || r.contact_status === 'settled_elsewhere'))
        if (settledElsewhere) {
          await updateStage4Status(cand.id, { contact_status: 'passed' })
        } else {
          await updateStage4Status(cand.id, { contact_status: 'negotiating' })
          promoted = cand
          break
        }
      }
      showToast(promoted
        ? `${row.appInfo?.name || row.account} 放棄，已遞補候補：${promoted.appInfo?.name || promoted.account}`
        : `${row.appInfo?.name || row.account} 放棄（此科系已無可遞補候補）`, promoted ? 'ok' : 'warn')
      await load()
    } catch (e) {
      showToast('操作失敗：' + e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  // 備注：失焦時自動 PATCH（值未變動則略過），就地更新 state 不重載
  const saveNote = async (row, value) => {
    if ((row.admin_note || '') === value) return
    try {
      await updateStage4Status(row.id, { admin_note: value })
      setData((prev) => prev.map((r) => (r.id === row.id ? { ...r, admin_note: value } : r)))
    } catch (e) {
      showToast('備注儲存失敗：' + e.message, 'error')
    }
  }

  const exportEnrolled = () => {
    const out = data
      .filter((r) => r.contact_status === 'enrolled')
      .map((r) => ({
        account:          r.account ?? '',
        name:             r.appInfo?.name ?? '',
        name_english:     r.appInfo?.name_english ?? '',
        department:       r.department ?? '',
        center:           r.center ?? '',
        preference_order: r.preference_order ?? '',
        status_label:     '確認就讀',
      }))
    if (!out.length) { showToast('目前沒有確認就讀的學生', 'warn'); return }
    writeXlsx(EXPORT_COLS, out, '第四階段最終就讀名單.xlsx')
    showToast(`已匯出 ${out.length} 筆就讀名單`)
  }

  // 匯出就讀確認寄信名單（enrolled，含 Email、一人一列）
  const exportNotifyEnrolled = () => {
    const out = data
      .filter((r) => r.contact_status === 'enrolled')
      .map((r) => ({
        name:         r.appInfo?.name ?? '',
        name_english: r.appInfo?.name_english ?? '',
        email:        r.appInfo?.email ?? '',
        department:   r.department ?? '',
        center:       r.center ?? '',
      }))
    if (!out.length) { showToast('目前沒有確認就讀的學生', 'warn'); return }
    writeXlsx(
      [
        { key: 'name', label: '中文姓名' },
        { key: 'name_english', label: '英文姓名' },
        { key: 'email', label: 'Email' },
        { key: 'department', label: '系所' },
        { key: 'center', label: '中心' },
      ],
      out,
      '四階就讀確認.xlsx',
    )
    showToast(`已匯出 ${out.length} 筆就讀確認名單`)
  }

  const doSync = async () => {
    if (busy) return
    if (!window.confirm('將從第三階段（正取 + 備取）同步名單到第四階段。\n已在進行中（候補詢問 / 就讀 / 放棄…）的資料不會被覆蓋。\n確定要同步嗎？')) return
    setBusy(true)
    try {
      const n = await syncStage4FromStage3()
      showToast(`已同步 ${n} 筆名單`)
      await load()
    } catch (e) {
      showToast('同步失敗：' + e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const th = { padding: '9px 10px', textAlign: 'left', borderBottom: '1px solid #e8e7e3', color: '#666', fontWeight: 500, fontSize: 12 }
  const td = { padding: '8px 10px', borderBottom: '1px solid #f5f4f0', fontSize: 13 }

  if (!teacher || (teacher.role !== 'admin' && teacher.role !== 'superadmin')) return null

  const headerBtn = { background: 'none', borderColor: '#ffffff44', color: '#fde7d4' }

  return (
    <PageShell
      title="實踐大學" subtitle="第四階段 · 就讀確認 / 候補遞補" accent={ACCENT} toast={toast} intlBack stageKey="stage4"
      right={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {loading && <span style={{ fontSize: 12, color: '#fde7d4' }}>載入中…</span>}
          <Btn style={headerBtn} disabled={busy} onClick={doSync}>從Stage3同步正取備取名單</Btn>
          <ExportMenu items={[
            { label: '⬇ 匯出最終就讀名單', onClick: exportEnrolled },
            { label: '⬇ 匯出就讀確認名單', onClick: exportNotifyEnrolled },
          ]} />
          <Btn style={headerBtn} disabled={busy} onClick={load}>↻</Btn>
          <span style={{ fontSize: 12, color: '#fde7d4' }}>{teacher.display_name || teacher.username}</span>
          <Btn style={headerBtn} onClick={logoutTeacher}>登出</Btn>
        </div>
      }
    >
      {/* 中心 Tab */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {centers.map((c) => (
          <button key={c} onClick={() => setCenter(c)}
            style={{
              ...s.btn,
              background: center === c ? ACCENT : 'white',
              color: center === c ? '#fff' : '#555',
              borderColor: center === c ? ACCENT : '#ddd',
              fontWeight: center === c ? 600 : 400,
            }}>
            {c}
          </button>
        ))}
        {!centers.length && (
          <div style={{ fontSize: 13, color: '#aaa' }}>
            {loading ? '載入中…' : '尚無資料，請先點右上角「從Stage3同步正取備取名單」'}
          </div>
        )}
      </div>

      {/* 衝突警示 */}
      {negotiatingConflict && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 16px', marginBottom: 12, fontSize: 13, color: '#b91c1c', fontWeight: 600 }}>
          ⚠ 本中心同時有 {stats.negotiating} 筆「候補詢問中」，請確認是否異常（同科系一次應只詢問一位）
        </div>
      )}

      <Card>
        <CardHead
          left={center || '請選擇中心'}
          right={`已就讀 ${stats.enrolled} · 候補詢問中 ${stats.negotiating} · 待處理 ${stats.pending} · 放棄 ${stats.declined}`}
        />
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#faf9f6' }}>
                {['姓名', '帳號', '科系', '志願序', '二階分數', '類別', '聯繫狀態', '備注', '操作'].map((h) => <th key={h} style={th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const cd = contactDisplay(r)
                return (
                  <tr key={r.id}>
                    <td style={td}>
                      <div style={{ fontWeight: 500 }}>{r.appInfo?.name || '—'}</div>
                      <div style={{ fontSize: 11, color: '#888' }}>{r.appInfo?.name_english || '—'}</div>
                      <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>
                        {r.appInfo?.birth_date || '—'} · {r.appInfo?.passport_number || '—'}
                      </div>
                    </td>
                    <td style={{ ...td, color: '#888' }}>{r.account || '—'}</td>
                    <td style={td}>{r.department || '—'}</td>
                    <td style={td}>{r.preference_order ?? '—'}</td>
                    <td style={td}>{r.stage2_score ?? '—'}</td>
                    <td style={td}>{categoryLabel(r)}</td>
                    <td style={td}><Pill color={cd.color} bg={cd.bg}>{cd.label}</Pill></td>
                    <td style={td}>
                      <input
                        defaultValue={r.admin_note || ''}
                        onBlur={(e) => saveNote(r, e.target.value)}
                        placeholder="備注"
                        style={{ ...s.input, marginBottom: 0, minWidth: 130 }}
                      />
                    </td>
                    <td style={td}>
                      {canAct(r) ? (
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button onClick={() => giveSeat(r)} disabled={busy}
                            style={{ ...s.btn, ...s.btnSm, background: '#dcfce7', color: '#15803d', borderColor: '#86efac' }}>
                            就讀
                          </button>
                          <button onClick={() => decline(r)} disabled={busy}
                            style={{ ...s.btn, ...s.btnSm, background: '#fee2e2', color: '#991b1b', borderColor: '#fca5a5' }}>
                            放棄
                          </button>
                        </div>
                      ) : (
                        <span style={{ color: '#ccc' }}>—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
              {!rows.length && (
                <tr><td colSpan={9} style={{ ...td, textAlign: 'center', color: '#aaa', padding: 32 }}>
                  {loading ? '載入中…' : '本中心尚無資料'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div style={{ fontSize: 12, color: '#aaa', marginTop: 12, lineHeight: 1.6 }}>
        說明：「就讀」即確認該生繳費就讀，並自動把該生在其他科系的名額釋出為「已確認他系」；
        「放棄」（正取或候補）會自動遞補同中心同科系排名最前的備取生為「候補詢問中」，
        若該備取生已在他系確認則跳過（標為「已略過」）。「從Stage3同步」不會覆蓋進行中的資料。
      </div>
    </PageShell>
  )
}
