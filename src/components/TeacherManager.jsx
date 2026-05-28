import { useState, useEffect, useCallback } from 'react'
import { Btn, Card, CardHead, Pill, s } from './UI'
import { getTeachers, createTeacher, deleteTeacher } from '../api'

const ROLES = [
  { v: 'stage1', label: '一階老師' },
  { v: 'stage2', label: '二階老師' },
  { v: 'both',   label: '一階＋二階' },
  { v: 'admin',  label: '行政人員' },
]
const roleLabel = (r) => ROLES.find((x) => x.v === r)?.label || r
const needsDept = (r) => r === 'stage2' || r === 'both'

const emptyForm = { username: '', password: '', display_name: '', role: 'stage1', department: '' }

export default function TeacherManager({ depts = [], showToast }) {
  const [teachers, setTeachers] = useState([])
  const [loading, setLoading]   = useState(false)
  const [form, setForm]         = useState(emptyForm)
  const [saving, setSaving]     = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try { setTeachers((await getTeachers()) || []) }
    catch (e) { showToast('載入老師失敗：' + e.message, 'error') }
    finally { setLoading(false) }
  }, [showToast])

  useEffect(() => { load() }, [load])

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const submit = async () => {
    if (!form.username.trim() || !form.password) { showToast('請輸入帳號與密碼', 'warn'); return }
    if (needsDept(form.role) && !form.department) { showToast('二階老師請選擇科系', 'warn'); return }
    setSaving(true)
    try {
      await createTeacher({
        username: form.username.trim(),
        password: form.password,
        display_name: form.display_name.trim(),
        role: form.role,
        department: needsDept(form.role) ? form.department : null,
      })
      showToast(`已新增老師：${form.display_name.trim() || form.username.trim()}`)
      setForm(emptyForm)
      await load()
    } catch (e) {
      showToast('新增失敗：' + e.message + '（帳號可能重複）', 'error')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (t) => {
    if (!window.confirm(`確定刪除老師「${t.display_name || t.username}」？`)) return
    try {
      await deleteTeacher(t.id)
      showToast('已刪除')
      await load()
    } catch (e) {
      showToast('刪除失敗：' + e.message, 'error')
    }
  }

  const th = { padding: '9px 10px', textAlign: 'left', borderBottom: '1px solid #e8e7e3', color: '#666', fontWeight: 500, fontSize: 12 }
  const td = { padding: '8px 10px', borderBottom: '1px solid #f5f4f0', fontSize: 13 }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20, alignItems: 'start' }}>
      {/* 新增帳號 */}
      <Card>
        <CardHead left="新增帳號" />
        <div style={{ padding: '14px 18px' }}>
          <label style={{ ...s.secLabel, marginTop: 0 }}>帳號</label>
          <input style={s.input} value={form.username} onChange={(e) => set('username', e.target.value)} placeholder="登入帳號（唯一）" />

          <label style={s.secLabel}>密碼</label>
          <input style={s.input} value={form.password} onChange={(e) => set('password', e.target.value)} placeholder="登入密碼" />

          <label style={s.secLabel}>顯示名稱</label>
          <input style={s.input} value={form.display_name} onChange={(e) => set('display_name', e.target.value)} placeholder="例：王老師" />

          <label style={s.secLabel}>角色</label>
          <select style={{ ...s.sel, width: '100%', marginBottom: 6 }} value={form.role}
            onChange={(e) => set('role', e.target.value)}>
            {ROLES.map((r) => <option key={r.v} value={r.v}>{r.label}</option>)}
          </select>

          {needsDept(form.role) && (
            <>
              <label style={s.secLabel}>負責科系（二階）</label>
              <select style={{ ...s.sel, width: '100%', marginBottom: 6 }} value={form.department}
                onChange={(e) => set('department', e.target.value)}>
                <option value="">選擇科系…</option>
                {depts.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </>
          )}

          <Btn variant="primary" onClick={submit} disabled={saving}
            style={{ width: '100%', justifyContent: 'center', marginTop: 12 }}>
            {saving ? '新增中…' : '＋ 新增老師'}
          </Btn>
        </div>
      </Card>

      {/* 帳號列表 */}
      <Card>
        <CardHead left="帳號列表" right={`${teachers.length} 位`} />
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#faf9f6' }}>
                {['顯示名稱', '帳號', '角色', '負責科系', ''].map((h, i) => <th key={i} style={th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {teachers.map((t) => (
                <tr key={t.id}>
                  <td style={{ ...td, fontWeight: 500 }}>{t.display_name || '—'}</td>
                  <td style={{ ...td, color: '#777' }}>{t.username}</td>
                  <td style={td}><Pill color="#1e40af" bg="#eff6ff">{roleLabel(t.role)}</Pill></td>
                  <td style={{ ...td, color: '#777' }}>{t.department || '—'}</td>
                  <td style={td}>
                    <button onClick={() => remove(t)}
                      style={{ ...s.btn, ...s.btnSm, background: '#fee2e2', borderColor: '#fca5a5', color: '#991b1b' }}>刪除</button>
                  </td>
                </tr>
              ))}
              {!teachers.length && (
                <tr><td colSpan={5} style={{ ...td, textAlign: 'center', color: '#aaa', padding: 32 }}>
                  {loading ? '載入中…' : '尚無帳號，請用左側表單新增'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
