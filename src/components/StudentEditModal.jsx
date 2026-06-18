import { useState } from 'react'
import { Modal, Btn, s } from './UI'
import { updateApplication, deleteApplication, createApplication, deleteStudentByAccount } from '../api'
import { getTeacher } from '../auth'

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

// group.__new === true 時為「新增考生」模式：帳號可輸入、起始一個空白志願。
export default function StudentEditModal({ group, depts = [], showToast, onClose, onReload }) {
  const isNew = !!group.__new
  const teacher = getTeacher()

  const [account, setAccount] = useState(group.account || '')
  const [shared, setShared] = useState(() =>
    Object.fromEntries(SHARED_FIELDS.map((f) => [f.key, group.rep?.[f.key] ?? ''])),
  )
  const [apps, setApps] = useState(() =>
    isNew
      ? [{ id: null, department: '', preference_order: 1 }]
      : group.apps.map((a) => ({ id: a.id, department: a.department || '', preference_order: a.preference_order ?? '' })),
  )
  const [removedIds, setRemovedIds] = useState([])
  const [saving, setSaving] = useState(false)

  const [showDel, setShowDel] = useState(false)
  const [delPw, setDelPw] = useState('')
  const [deleting, setDeleting] = useState(false)

  const setS = (k, v) => setShared((p) => ({ ...p, [k]: v }))
  const setApp = (i, k, v) => setApps((p) => p.map((a, idx) => (idx === i ? { ...a, [k]: v } : a)))
  const addApp = () => setApps((p) => [...p, { id: null, department: '', preference_order: p.length + 1 }])
  const removeApp = (i) => setApps((p) => {
    const a = p[i]
    if (a.id) setRemovedIds((r) => [...r, a.id])
    return p.filter((_, idx) => idx !== i)
  })

  const save = async () => {
    const acct = account.trim()
    if (isNew && !acct) { showToast('請輸入帳號', 'warn'); return }
    if (!apps.length) {
      if (isNew) { showToast('至少要有一個志願', 'warn'); return }
      if (!window.confirm('沒有任何志願，將刪除此考生的所有報名資料，確定？')) return
    }
    for (const a of apps) {
      if (!a.department) { showToast('每個志願都要選系所', 'warn'); return }
      if (a.preference_order === '' || a.preference_order == null) { showToast('每個志願都要填志願序', 'warn'); return }
    }

    const sharedNorm = Object.fromEntries(SHARED_FIELDS.map((f) => [f.key, trimOrNull(shared[f.key])]))
    setSaving(true)
    try {
      for (const id of removedIds) await deleteApplication(id)
      for (const a of apps) {
        const fields = { ...sharedNorm, department: a.department, preference_order: Number(a.preference_order) }
        if (a.id) await updateApplication(a.id, fields)
        else      await createApplication({ account: acct, status: 'pending', ...fields })
      }
      showToast(isNew
        ? `已新增考生 ${sharedNorm.name || acct}`
        : `已更新 ${sharedNorm.name || acct} 的資料`)
      await onReload()
      onClose()
    } catch (e) {
      showToast('儲存失敗：' + e.message + '（被評分/簽到引用的志願可能無法刪除，請改用下方「永久刪除整位考生」）', 'error')
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = async () => {
    if (!delPw) { showToast('請輸入您的行政密碼', 'warn'); return }
    if (!window.confirm(`即將永久刪除考生「${shared.name || account}」（${account}）及其所有面試/評分/錄取資料，此操作無法復原。確定繼續？`)) return
    setDeleting(true)
    try {
      const r = await deleteStudentByAccount(account, teacher?.username, delPw)
      showToast(`已永久刪除考生 ${shared.name || account}（${r?.deletedApplications ?? 0} 個志願）`)
      await onReload()
      onClose()
    } catch (e) {
      showToast('刪除失敗：' + e.message, 'error')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Modal title={isNew ? '新增考生' : `編輯考生 · ${group.account}`} onClose={onClose} width={680}>
      {isNew ? (
        <div style={{ marginBottom: 16 }}>
          <label style={{ ...s.secLabel, marginTop: 0 }}>帳號（准考證號）</label>
          <input style={{ ...s.input, marginBottom: 0 }} value={account}
            onChange={(e) => setAccount(e.target.value)} placeholder="例如 1152xxxxx（第4碼=梯次、第5碼=校區）" />
        </div>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
        {SHARED_FIELDS.map((f) => (
          <div key={f.key}>
            <label style={{ ...s.secLabel, marginTop: 0 }}>{f.label}</label>
            <input style={{ ...s.input, marginBottom: 0 }} value={shared[f.key] ?? ''}
              onChange={(e) => setS(f.key, e.target.value)} />
          </div>
        ))}
      </div>

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
      {!apps.length && !isNew && (
        <div style={{ fontSize: 12, color: '#dc2626', padding: '6px 0' }}>已無志願；儲存將刪除此考生。</div>
      )}

      {removedIds.length > 0 && (
        <div style={{ fontSize: 12, color: '#d97706', marginTop: 8 }}>儲存後將刪除 {removedIds.length} 個志願</div>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
        <Btn onClick={onClose}>取消</Btn>
        <Btn variant="primary" onClick={save} disabled={saving || deleting}>{saving ? '儲存中…' : '儲存'}</Btn>
      </div>

      {!isNew && teacher?.role === 'superadmin' && (
        <div style={{ marginTop: 22, paddingTop: 16, borderTop: '1px solid #f0e0e0' }}>
          {!showDel ? (
            <button onClick={() => setShowDel(true)}
              style={{ ...s.btn, ...s.btnSm, background: '#fff', borderColor: '#fca5a5', color: '#b91c1c' }}>
              🗑 永久刪除整位考生
            </button>
          ) : (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 13, color: '#991b1b', fontWeight: 600, marginBottom: 6 }}>
                ⚠ 將連動刪除：申請、一階評分、二階報到、二階評分、三階錄取、四階確認與稽核紀錄。無法復原。
              </div>
              <div style={{ fontSize: 12, color: '#7f1d1d', marginBottom: 8 }}>請再次輸入您的行政密碼以確認身分。</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="password" style={{ ...s.input, marginBottom: 0, flex: 1 }} value={delPw}
                  onChange={(e) => setDelPw(e.target.value)} placeholder="行政密碼" autoComplete="off" />
                <button onClick={() => { setShowDel(false); setDelPw('') }}
                  style={{ ...s.btn, ...s.btnSm }}>取消</button>
                <button onClick={confirmDelete} disabled={deleting}
                  style={{ ...s.btn, ...s.btnSm, background: '#dc2626', borderColor: '#dc2626', color: '#fff' }}>
                  {deleting ? '刪除中…' : '確認永久刪除'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
