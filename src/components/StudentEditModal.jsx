import { useState } from 'react'
import { Modal, Btn, s } from './UI'
import { updateApplication, deleteApplication, createApplication } from '../api'

// 個人共用欄位（同帳號各志願共用，存於每筆 application）
const SHARED_FIELDS = [
  { key: 'name',            label: '中文姓名' },
  { key: 'name_english',    label: '英文姓名' },
  { key: 'passport_number', label: '護照號碼' },
  { key: 'nationality',     label: '國籍' },
  { key: 'gender',          label: '性別' },
  { key: 'birth_date',      label: '生日 (YYYY-MM-DD)' },
  { key: 'email',           label: 'Email' },
  { key: 'phone',           label: '電話' },
  { key: 'high_school',     label: '最高學歷' },
]

const trimOrNull = (v) => {
  const t = typeof v === 'string' ? v.trim() : v
  return t === '' || t == null ? null : t
}

// 編輯一位考生（同帳號）的所有志願：可改共用資料、改各志願系所/志願序、刪除或新增志願。
export default function StudentEditModal({ group, depts = [], showToast, onClose, onReload }) {
  const [shared, setShared] = useState(() =>
    Object.fromEntries(SHARED_FIELDS.map((f) => [f.key, group.rep[f.key] ?? ''])),
  )
  const [apps, setApps] = useState(() =>
    group.apps.map((a) => ({ id: a.id, department: a.department || '', preference_order: a.preference_order ?? '' })),
  )
  const [removedIds, setRemovedIds] = useState([])
  const [saving, setSaving] = useState(false)

  const setS = (k, v) => setShared((p) => ({ ...p, [k]: v }))
  const setApp = (i, k, v) => setApps((p) => p.map((a, idx) => (idx === i ? { ...a, [k]: v } : a)))
  const addApp = () => setApps((p) => [...p, { id: null, department: '', preference_order: p.length + 1 }])
  const removeApp = (i) => setApps((p) => {
    const a = p[i]
    if (a.id) setRemovedIds((r) => [...r, a.id])
    return p.filter((_, idx) => idx !== i)
  })

  const save = async () => {
    // 保留的志願都要有系所與志願序
    for (const a of apps) {
      if (!a.department) { showToast('每個志願都要選系所', 'warn'); return }
      if (a.preference_order === '' || a.preference_order == null) { showToast('每個志願都要填志願序', 'warn'); return }
    }
    if (!apps.length && !window.confirm('沒有任何志願，將刪除此考生的所有報名資料，確定？')) return

    const sharedNorm = Object.fromEntries(SHARED_FIELDS.map((f) => [f.key, trimOrNull(shared[f.key])]))
    setSaving(true)
    try {
      // 1) 刪除被移除的志願
      for (const id of removedIds) await deleteApplication(id)
      // 2) 更新既有 / 新增志願（不送 status，保留流程狀態）
      for (const a of apps) {
        const fields = { ...sharedNorm, department: a.department, preference_order: Number(a.preference_order) }
        if (a.id) await updateApplication(a.id, fields)
        else      await createApplication({ account: group.account, status: 'pending', ...fields })
      }
      showToast(`已更新 ${sharedNorm.name || group.account} 的資料`)
      await onReload()
      onClose()
    } catch (e) {
      showToast('儲存失敗：' + e.message + '（被評分/簽到引用的志願可能無法刪除）', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={`編輯考生 · ${group.account}`} onClose={onClose} width={680}>
      {/* 共用資料 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
        {SHARED_FIELDS.map((f) => (
          <div key={f.key}>
            <label style={{ ...s.secLabel, marginTop: 0 }}>{f.label}</label>
            <input style={{ ...s.input, marginBottom: 0 }} value={shared[f.key] ?? ''}
              onChange={(e) => setS(f.key, e.target.value)} />
          </div>
        ))}
      </div>

      {/* 志願清單 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ ...s.secLabel, margin: 0 }}>志願（系所 / 志願序）</span>
        <button onClick={addApp} style={{ ...s.btn, ...s.btnSm, background: '#f0fdf4', borderColor: '#bbf7d0', color: '#15803d' }}>＋ 新增志願</button>
      </div>

      {apps.map((a, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <input type="number" min="1" style={{ ...s.input, marginBottom: 0, width: 70 }}
            value={a.preference_order} onChange={(e) => setApp(i, 'preference_order', e.target.value)} placeholder="序" />
          <select style={{ ...s.sel, flex: 1 }} value={a.department} onChange={(e) => setApp(i, 'department', e.target.value)}>
            <option value="">選擇系所…</option>
            {[...new Set([a.department, ...depts].filter(Boolean))].map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <button onClick={() => removeApp(i)}
            style={{ ...s.btn, ...s.btnSm, background: '#fee2e2', borderColor: '#fca5a5', color: '#991b1b' }}>刪除</button>
        </div>
      ))}
      {!apps.length && (
        <div style={{ fontSize: 12, color: '#dc2626', padding: '6px 0' }}>已無志願；儲存將刪除此考生。</div>
      )}

      {removedIds.length > 0 && (
        <div style={{ fontSize: 12, color: '#d97706', marginTop: 8 }}>儲存後將刪除 {removedIds.length} 個志願</div>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
        <Btn onClick={onClose}>取消</Btn>
        <Btn variant="primary" onClick={save} disabled={saving}>{saving ? '儲存中…' : '儲存'}</Btn>
      </div>
    </Modal>
  )
}
