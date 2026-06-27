import { useState, useEffect, useCallback } from 'react'
import { PageShell } from '../components/PageShell'
import { Btn, Card, CardHead, Pill, s } from '../components/UI'
import { writeXlsx } from '../components/ExportBtn'
import { getTransfers, updateTransferStatus } from '../api'
import { getTeacher, logoutTeacher } from '../auth'
import { batchInfo, deptShort } from '../constants'

const ACCENT = '#7c2d12'

// 承辦處理狀態（手動）：與「新系現況」（自動）並存
const HANDLE = [
  { v: 'pending',    label: '待處理', color: '#92400e', bg: '#fef3c7' },
  { v: 'processing', label: '處理中', color: '#1e40af', bg: '#dbeafe' },
  { v: 'done',       label: '已完成', color: '#15803d', bg: '#dcfce7' },
]
// 舊資料相容：建立時預設 'scoring' → 視為待處理
const handleOf = (v) => HANDLE.find((h) => h.v === v) || HANDLE[0]

const fromLabel = (t) =>
  t.from_status === 'admitted' ? '正取'
  : t.from_status === 'waitlisted' ? `備取${t.from_standby_rank ?? ''}` : (t.from_status || '—')

const fmtTime = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d)) return String(iso)
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function TransferApp() {
  const teacher = getTeacher()
  const [rows, setRows]     = useState([])
  const [loading, setLoad]  = useState(false)
  const [busy, setBusy]     = useState(false)
  const [toast, setToast]   = useState(null)
  const [q, setQ]           = useState('')

  useEffect(() => {
    if (!teacher || (teacher.role !== 'admin' && teacher.role !== 'superadmin')) {
      window.location.hash = '#/login?stage=stage4'
    }
  }, [teacher])

  const showToast = useCallback((msg, type = 'ok') => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3500)
  }, [])

  const load = useCallback(async () => {
    setLoad(true)
    try { setRows(await getTransfers() || []) }
    catch (e) { showToast('載入失敗：' + e.message, 'error') }
    finally { setLoad(false) }
  }, [showToast])

  useEffect(() => { load() }, [load])

  const setHandle = async (t, v) => {
    if (busy) return
    setBusy(true)
    try {
      await updateTransferStatus(t.id, v)
      setRows((p) => p.map((r) => (r.id === t.id ? { ...r, to_status: v } : r)))
      showToast('已更新處理狀態')
    } catch (e) { showToast('更新失敗：' + e.message, 'error') }
    finally { setBusy(false) }
  }

  const kw = q.trim().toLowerCase()
  const filtered = rows.filter((t) =>
    !kw
    || (t.account || '').toLowerCase().includes(kw)
    || (t.appInfo?.name || '').toLowerCase().includes(kw)
    || (t.appInfo?.name_english || '').toLowerCase().includes(kw)
    || (t.from_department || '').toLowerCase().includes(kw)
    || (t.to_department || '').toLowerCase().includes(kw),
  )

  const exportRows = () => {
    if (!filtered.length) { showToast('沒有可匯出的資料', 'warn'); return }
    writeXlsx(
      [
        { key: 'name', label: '中文姓名' }, { key: 'name_english', label: '英文姓名' },
        { key: 'account', label: '帳號' }, { key: 'from', label: '原系/原狀態' },
        { key: 'to', label: '轉報新系' }, { key: 'cur', label: '新系現況' },
        { key: 'handle', label: '處理狀態' }, { key: 'note', label: '備注' },
        { key: 'by', label: '操作人' }, { key: 'at', label: '轉報時間' },
      ],
      filtered.map((t) => ({
        name: t.appInfo?.name || '', name_english: t.appInfo?.name_english || '',
        account: t.account || '', from: `${t.from_department}（${fromLabel(t)}）`,
        to: t.to_department || '', cur: t.newStatus?.label || '',
        handle: handleOf(t.to_status).label, note: t.note || '',
        by: t.created_by || '', at: fmtTime(t.created_at),
      })),
      '轉報追蹤名單.xlsx',
    )
    showToast(`已匯出 ${filtered.length} 筆`)
  }

  if (!teacher || (teacher.role !== 'admin' && teacher.role !== 'superadmin')) return null

  const th = { padding: '9px 10px', textAlign: 'left', borderBottom: '1px solid #e8e7e3', color: '#666', fontWeight: 500, fontSize: 12, whiteSpace: 'nowrap' }
  const td = { padding: '8px 10px', borderBottom: '1px solid #f5f4f0', fontSize: 13, verticalAlign: 'top' }
  const headerBtn = { background: 'none', borderColor: '#ffffff44', color: '#fde7d4' }

  return (
    <PageShell
      title="實踐大學" subtitle="轉報追蹤" accent={ACCENT} toast={toast} intlBack stageKey="transfers"
      right={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {loading && <span style={{ fontSize: 12, color: '#fde7d4' }}>載入中…</span>}
          <Btn style={headerBtn} onClick={() => { window.location.hash = '#/stage4' }}>← 第四階段</Btn>
          <Btn style={headerBtn} onClick={exportRows}>⬇ 匯出</Btn>
          <Btn style={headerBtn} disabled={busy} onClick={load}>↻</Btn>
          <span style={{ fontSize: 12, color: '#fde7d4' }}>{teacher.display_name || teacher.username}</span>
          <Btn style={headerBtn} onClick={logoutTeacher}>登出</Btn>
        </div>
      }
    >
      <Card>
        <CardHead left="轉報記錄" right={`${filtered.length} 筆`} />
        <div style={{ padding: '10px 18px 0' }}>
          <input
            value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="搜尋 姓名 / 帳號 / 系所"
            style={{ ...s.input, maxWidth: 320, marginBottom: 0 }}
          />
        </div>
        <div style={{ padding: '6px 18px 4px', fontSize: 12, color: '#888', lineHeight: 1.7 }}>
          「新系現況」由系統依實際資料自動判定（二階待評分 → 已評分 → 三階放榜 → 四階就讀確認）；
          「處理狀態」為承辦人手動標記之工作流程。
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#faf9f6' }}>
                {['學生', '梯次', '原系 · 原狀態', '轉報新系', '新系現況', '處理狀態', '備注', '操作人 · 時間'].map((h, i) => <th key={i} style={th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => {
                const bi = batchInfo(t.account)
                const ns = t.newStatus || {}
                return (
                  <tr key={t.id}>
                    <td style={td}>
                      <div style={{ fontWeight: 500 }}>{t.appInfo?.name || '—'}</div>
                      <div style={{ fontSize: 11, color: '#888' }}>{t.appInfo?.name_english || ''}</div>
                      <div style={{ fontSize: 11, color: '#aaa' }}>{t.account}</div>
                    </td>
                    <td style={td}><Pill color={bi.color} bg={bi.bg}>{bi.short}</Pill></td>
                    <td style={td}>
                      <div>{deptShort(t.from_department)}</div>
                      <div style={{ fontSize: 11, color: '#b45309' }}>{fromLabel(t)}</div>
                    </td>
                    <td style={{ ...td, fontWeight: 500 }}>{deptShort(t.to_department)}</td>
                    <td style={td}><Pill color={ns.color} bg={ns.bg}>{ns.label}</Pill></td>
                    <td style={td}>
                      <select
                        value={HANDLE.some((h) => h.v === t.to_status) ? t.to_status : 'pending'}
                        onChange={(e) => setHandle(t, e.target.value)}
                        disabled={busy}
                        style={{ ...s.sel, padding: '4px 8px', minWidth: 92 }}
                      >
                        {HANDLE.map((h) => <option key={h.v} value={h.v}>{h.label}</option>)}
                      </select>
                    </td>
                    <td style={{ ...td, maxWidth: 200, color: '#555' }}>{t.note || '—'}</td>
                    <td style={{ ...td, color: '#888', fontSize: 12, whiteSpace: 'nowrap' }}>
                      <div>{t.created_by || '—'}</div>
                      <div>{fmtTime(t.created_at)}</div>
                    </td>
                  </tr>
                )
              })}
              {!filtered.length && (
                <tr><td colSpan={8} style={{ ...td, textAlign: 'center', color: '#aaa', padding: 28 }}>
                  {loading ? '載入中…' : '目前沒有轉報記錄'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </PageShell>
  )
}
