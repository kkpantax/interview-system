import { useState, useEffect } from 'react'
import { Btn, s } from '../components/UI'
import { loginTeacher } from '../api'

// 老師登入頁。stage = '1' | '2' | 'admin' | 'stage4'（亦接受 '4'）。驗證成功後把 teacher
// 存入 localStorage 再導回對應頁面。stage4 沿用行政（admin）權限，只是登入後導向第四階段。
export default function TeacherLogin({ stage }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [err, setErr]           = useState('')

  const isAdmin   = stage === 'admin'
  const isStage4  = stage === 'stage4' || stage === '4'
  const isConfirm1 = stage === 'confirm1'
  const isStats   = stage === 'stats'
  const isCheckin2 = stage === 'checkin2'
  const needAdmin = isAdmin || isStage4 || isConfirm1 || isStats || isCheckin2   // 皆需 admin 角色

  const stageLabel  = isCheckin2 ? '二階報到管理' : needAdmin ? '行政人員' : stage === '2' ? '第二階段' : '第一階段'
  const accent      = needAdmin ? '#1a1a18' : stage === '2' ? '#15803d' : '#1e40af'
  const accentBg    = needAdmin ? '#ecebe6' : stage === '2' ? '#f0fdf4' : '#eff6ff'
  const targetHash  = isCheckin2 ? '#/checkin2' : isStats ? '#/stats' : isStage4 ? '#/stage4' : isConfirm1 ? '#/confirm1' : isAdmin ? '#/admin' : stage === '2' ? '#/stage2' : '#/stage1'
  const stageRole   = needAdmin ? 'admin'   : stage === '2' ? 'stage2'   : 'stage1'

  // 權限規則：superadmin 全系統可用；checkin2（二階面試管理員）僅能進二階報到，
  // 舊的 admin 角色一律視同 checkin2；其餘行政頁（書審/實體確認/放榜/就學/統計）僅 superadmin。
  const roleAllowed = (role) => {
    if (role === 'superadmin') return true
    if (isCheckin2) return role === 'checkin2' || role === 'admin'
    if (needAdmin) return false
    return role === stageRole || role === 'both'
  }
  const headerLabel = isCheckin2 ? '二階報到管理登入' : isStats ? '報名統計登入' : isStage4 ? '第四階段確認登入' : isConfirm1 ? '實體面試確認登入' : isAdmin ? '行政人員登入' : `${stageLabel}老師登入`

  // 已登入且角色符合 → 直接跳轉，不顯示登入表單
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('teacher'))
      if (!stored) return
      if (roleAllowed(stored.role)) window.location.hash = targetHash
    } catch { /* ignore */ }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e) => {
    e.preventDefault()
    if (!username.trim() || !password) { setErr('請輸入帳號與密碼'); return }
    setLoading(true); setErr('')
    try {
      const teacher = await loginTeacher(username.trim(), password)
      if (!teacher) { setErr('帳號或密碼錯誤'); return }
      if (!roleAllowed(teacher.role)) { setErr(`此帳號沒有${stageLabel}的權限`); return }
      localStorage.setItem('teacher', JSON.stringify(teacher))
      window.location.hash = targetHash
    } catch (e2) {
      setErr('登入失敗：' + e2.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f4f0', padding: 24 }}>
      <form onSubmit={submit} style={{ width: 360, maxWidth: '100%', background: 'white', border: '1px solid #e8e7e3', borderRadius: 14, padding: 28 }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 22, fontWeight: 700 }}>實踐大學</div>
          <div style={{ display: 'inline-block', marginTop: 8, padding: '3px 12px', borderRadius: 99, background: accentBg, color: accent, fontSize: 13, fontWeight: 600 }}>
            {headerLabel}
          </div>
        </div>

        <label style={{ ...s.secLabel, marginTop: 0 }}>帳號</label>
        <input style={s.input} value={username} autoFocus
          onChange={(e) => setUsername(e.target.value)} placeholder="老師帳號" />

        <label style={s.secLabel}>密碼</label>
        <input style={s.input} type="password" value={password}
          onChange={(e) => setPassword(e.target.value)} placeholder="密碼" />

        {err && <div style={{ color: '#dc2626', fontSize: 13, margin: '8px 0' }}>⚠ {err}</div>}

        <Btn variant="primary" disabled={loading}
          style={{ width: '100%', justifyContent: 'center', marginTop: 12 }}>
          {loading ? '登入中…' : '登入'}
        </Btn>

        <button type="button" onClick={() => { window.location.hash = '#/' }}
          style={{ display: 'block', margin: '14px auto 0', background: 'none', border: 'none', color: '#888', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
          ← 回首頁
        </button>
      </form>
    </div>
  )
}
