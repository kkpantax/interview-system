import { useState, useEffect } from 'react'
import { Btn, Card, CardHead, s } from './UI'
import { getInfoLinks, addInfoLink, updateInfoLink, deleteInfoLink } from '../api'

const KIND_OPTIONS = [
  { v: 'schedule', label: '時段表' },
  { v: 'meet',     label: '系所會議' },
  { v: 'link',     label: '其他連結' },
]

const EMPTY_NEW = { kind: 'link', label: '', url: '', departments: '', sort_order: '' }

// 行政後台「連結管理」：維護 info_links（二階報到頁 ℹ 面試資訊 / 📑 時段表 / 📹 Meet 按鈕的資料來源）。
export default function InfoLinksManager({ showToast }) {
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId]   = useState(null)   // 儲存／刪除中的列 id（新增列用 'new'）
  const [draft, setDraft]     = useState(EMPTY_NEW)

  const reload = async () => {
    setLoading(true)
    try {
      const data = await getInfoLinks()
      setRows((data || []).map((r) => ({ ...r, sort_order: r.sort_order == null ? '' : String(r.sort_order) })))
    } catch (e) {
      showToast('載入失敗：' + e.message, 'error')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { reload() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const setRow = (id, patch) => setRows((p) => p.map((r) => (r.id === id ? { ...r, ...patch } : r)))

  const save = async (r) => {
    if (!r.label.trim() || !r.url.trim()) { showToast('名稱與網址為必填', 'warn'); return }
    setBusyId(r.id)
    try {
      await updateInfoLink(r.id, {
        kind: r.kind,
        label: r.label.trim(),
        url: r.url.trim(),
        departments: r.kind === 'meet' ? (r.departments || '').trim() : null,
        sort_order: parseInt(r.sort_order, 10) || 0,
      })
      showToast(`已儲存「${r.label.trim()}」`)
    } catch (e) {
      showToast('儲存失敗：' + e.message, 'error')
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (r) => {
    if (!window.confirm(`確定刪除「${r.label}」？`)) return
    setBusyId(r.id)
    try {
      await deleteInfoLink(r.id)
      setRows((p) => p.filter((x) => x.id !== r.id))
      showToast(`已刪除「${r.label}」`)
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setBusyId(null)
    }
  }

  const add = async () => {
    if (!draft.label.trim() || !draft.url.trim()) { showToast('名稱與網址為必填', 'warn'); return }
    setBusyId('new')
    try {
      await addInfoLink({
        kind: draft.kind,
        label: draft.label.trim(),
        url: draft.url.trim(),
        departments: draft.kind === 'meet' ? (draft.departments || '').trim() : null,
        sort_order: parseInt(draft.sort_order, 10) || 0,
      })
      setDraft(EMPTY_NEW)
      showToast(`已新增「${draft.label.trim()}」`)
      await reload()
    } catch (e) {
      showToast('新增失敗：' + e.message, 'error')
    } finally {
      setBusyId(null)
    }
  }

  const th = { padding: '9px 10px', textAlign: 'left', borderBottom: '1px solid #e8e7e3', color: '#666', fontWeight: 500, fontSize: 12, whiteSpace: 'nowrap' }
  const td = { padding: '8px 10px', borderBottom: '1px solid #f5f4f0', fontSize: 13, verticalAlign: 'middle' }
  const input = { ...s.input, marginBottom: 0 }

  const kindSelect = (value, onChange) => (
    <select style={{ ...input, width: 110 }} value={value} onChange={onChange}>
      {KIND_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
    </select>
  )

  return (
    <Card>
      <CardHead left="連結管理" right={`${rows.length} 筆`} />
      <div style={{ padding: '8px 18px 0', fontSize: 12, color: '#888' }}>
        這些連結會顯示在「二階面試報到」頁的 ℹ 面試資訊視窗。類型為「時段表」者另有專屬按鈕；
        「系所會議」需填「對應系所」關鍵字（逗號分隔、比對系名 includes），會顯示在各系即時狀態卡片的 📹 按鈕。
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
          <thead>
            <tr style={{ background: '#faf9f6' }}>
              {['類型', '名稱', '網址', '對應系所（meet 用）', '排序', ''].map((h, i) => <th key={i} style={th}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={td}>{kindSelect(r.kind, (e) => setRow(r.id, { kind: e.target.value }))}</td>
                <td style={td}>
                  <input style={{ ...input, width: 160 }} value={r.label || ''} onChange={(e) => setRow(r.id, { label: e.target.value })} />
                </td>
                <td style={td}>
                  <input style={{ ...input, width: 240 }} value={r.url || ''} onChange={(e) => setRow(r.id, { url: e.target.value })} />
                </td>
                <td style={td}>
                  <input
                    style={{ ...input, width: 160 }} placeholder="如：設計,餐飲"
                    value={r.departments || ''} disabled={r.kind !== 'meet'}
                    onChange={(e) => setRow(r.id, { departments: e.target.value })}
                  />
                </td>
                <td style={td}>
                  <input
                    style={{ ...input, width: 60 }} inputMode="numeric" placeholder="0"
                    value={r.sort_order}
                    onChange={(e) => setRow(r.id, { sort_order: e.target.value.replace(/[^0-9]/g, '') })}
                  />
                </td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>
                  <Btn variant="primary" onClick={() => save(r)} disabled={busyId === r.id} style={{ marginRight: 6 }}>
                    {busyId === r.id ? '處理中…' : '儲存'}
                  </Btn>
                  <Btn onClick={() => remove(r)} disabled={busyId === r.id} style={{ color: '#dc2626', borderColor: '#fecaca' }}>刪除</Btn>
                </td>
              </tr>
            ))}
            {!rows.length && !loading && (
              <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: '#aaa', padding: 24 }}>尚無連結，請用下方新增列建立</td></tr>
            )}
            {loading && (
              <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: '#aaa', padding: 24 }}>載入中…</td></tr>
            )}
            {/* 新增列 */}
            <tr style={{ background: '#faf9f6' }}>
              <td style={td}>{kindSelect(draft.kind, (e) => setDraft((p) => ({ ...p, kind: e.target.value })))}</td>
              <td style={td}>
                <input style={{ ...input, width: 160 }} placeholder="名稱（必填）" value={draft.label} onChange={(e) => setDraft((p) => ({ ...p, label: e.target.value }))} />
              </td>
              <td style={td}>
                <input style={{ ...input, width: 240 }} placeholder="https://…（必填）" value={draft.url} onChange={(e) => setDraft((p) => ({ ...p, url: e.target.value }))} />
              </td>
              <td style={td}>
                <input
                  style={{ ...input, width: 160 }} placeholder="如：設計,餐飲"
                  value={draft.departments} disabled={draft.kind !== 'meet'}
                  onChange={(e) => setDraft((p) => ({ ...p, departments: e.target.value }))}
                />
              </td>
              <td style={td}>
                <input
                  style={{ ...input, width: 60 }} inputMode="numeric" placeholder="0"
                  value={draft.sort_order}
                  onChange={(e) => setDraft((p) => ({ ...p, sort_order: e.target.value.replace(/[^0-9]/g, '') }))}
                />
              </td>
              <td style={td}>
                <Btn variant="primary" onClick={add} disabled={busyId === 'new'}>
                  {busyId === 'new' ? '新增中…' : '＋ 新增'}
                </Btn>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  )
}
