import { useState } from 'react'
import { Btn, Card, CardHead, Pill, s } from './UI'
import { createCenter, deleteCenter } from '../api'

// 中心管理：行政人員動態新增 / 刪除面試中心。
// centers 由 AdminApp 載入後傳入；usage 為 { 中心名稱: 綁定學生(志願)數 }，刪除前提示。
export default function CenterManager({ centers = [], usage = {}, showToast, onReload }) {
  const [name, setName]     = useState('')
  const [saving, setSaving] = useState(false)

  const add = async () => {
    const n = name.trim()
    if (!n) { showToast('請輸入中心名稱', 'warn'); return }
    setSaving(true)
    try {
      await createCenter(n)
      showToast(`已新增中心：${n}`)
      setName('')
      await onReload()
    } catch (e) {
      showToast('新增失敗：' + e.message + '（名稱可能重複）', 'error')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (c) => {
    const u = usage[c.name]
    const warn = u
      ? `中心「${c.name}」目前仍有 ${u.people} 位學生（${u.prefs} 筆志願）綁定，刪除後這些學生的中心欄位仍保留文字。確定刪除？`
      : `確定刪除中心「${c.name}」？`
    if (!window.confirm(warn)) return
    try {
      await deleteCenter(c.id)
      showToast('已刪除中心')
      await onReload()
    } catch (e) {
      showToast('刪除失敗：' + e.message, 'error')
    }
  }

  const th = { padding: '9px 10px', textAlign: 'left', borderBottom: '1px solid #e8e7e3', color: '#666', fontWeight: 500, fontSize: 12 }
  const td = { padding: '8px 10px', borderBottom: '1px solid #f5f4f0', fontSize: 13 }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20, alignItems: 'start' }}>
      {/* 新增中心 */}
      <Card>
        <CardHead left="新增中心" />
        <div style={{ padding: '14px 18px' }}>
          <label style={{ ...s.secLabel, marginTop: 0 }}>中心名稱</label>
          <input style={s.input} value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
            placeholder="例：台南中心" />
          <Btn variant="primary" onClick={add} disabled={saving}
            style={{ width: '100%', justifyContent: 'center', marginTop: 12 }}>
            {saving ? '新增中…' : '＋ 新增中心'}
          </Btn>
        </div>
      </Card>

      {/* 中心列表 */}
      <Card>
        <CardHead left="中心列表" right={`${centers.length} 個`} />
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#faf9f6' }}>
                {['中心名稱', '綁定學生', ''].map((h, i) => <th key={i} style={th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {centers.map((c) => (
                <tr key={c.id}>
                  <td style={{ ...td, fontWeight: 500 }}>{c.name}</td>
                  <td style={td}>
                    {usage[c.name]
                      ? <Pill color="#1e40af" bg="#eff6ff">{usage[c.name].people} 人 / {usage[c.name].prefs} 志願</Pill>
                      : <span style={{ color: '#ccc' }}>—</span>}
                  </td>
                  <td style={td}>
                    <button onClick={() => remove(c)}
                      style={{ ...s.btn, ...s.btnSm, background: '#fee2e2', borderColor: '#fca5a5', color: '#991b1b' }}>刪除</button>
                  </td>
                </tr>
              ))}
              {!centers.length && (
                <tr><td colSpan={3} style={{ ...td, textAlign: 'center', color: '#aaa', padding: 32 }}>
                  尚無中心，請用左側表單新增
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
