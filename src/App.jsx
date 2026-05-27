import { useState, useEffect, useCallback } from 'react'
import { FIXED_ROLES, SCORE_ITEMS, DECISIONS, FINAL_RESULTS } from './constants'
import { useStore } from './useStore'
import { getScriptUrl } from './api'
import { sumScore, avg2, decInfo, finInfo } from './utils'
import { Toast, Modal, Btn } from './components/UI'
import ImportModal  from './components/ImportModal'
import SetupModal   from './components/SetupModal'
import ListPage     from './components/ListPage'
import ScorePage    from './components/ScorePage'
import ComparePage  from './components/ComparePage'

export default function App() {
  const [role, setRole]               = useState(() => localStorage.getItem('role') || '')
  const [view, setView]               = useState('list')   // list | score | compare
  const [activeStudent, setActive]    = useState(null)
  const [showImport, setShowImport]   = useState(false)
  const [showSetup, setShowSetup]     = useState(false)
  const [toast, setToast]             = useState(null)

  const store = useStore()

  const showToast = useCallback((msg, type = 'ok') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }, [])

  // 載入資料
  useEffect(() => {
    if (role && getScriptUrl()) store.loadData()
  }, [role])

  // ── 角色計算 ──────────────────────────────────────────────────────────────
  const isAdmin    = role === 'admin'
  const isDirector = role === 'director'
  const isStage1   = role === 't1a' || role === 't1b'
  const isStage2   = role.startsWith('t2_')
  const myDept     = isStage2 ? role.replace('t2_', '') : null

  const getRoleLabel = (id) => {
    const f = FIXED_ROLES.find((r) => r.id === id)
    if (f) return f.label
    if (id.startsWith('t2_')) return id.replace('t2_', '') + ' 系老師'
    return id
  }

  const selectRole = (id) => {
    setRole(id)
    localStorage.setItem('role', id)
    setView('list')
  }

  // ── 匯出 CSV ─────────────────────────────────────────────────────────────
  const exportCSV = (type) => {
    let target = store.students
    let filename = '面試評分總表.csv'
    if (type === 'admitted')   { target = store.students.filter((s) => s.finalResult === 'admitted');   filename = '正取名單.csv' }
    if (type === 'waitlisted') { target = store.students.filter((s) => s.finalResult === 'waitlisted'); filename = '備取名單.csv' }
    if (type === 'rejected')   { target = store.students.filter((s) => s.finalResult === 'rejected');   filename = '不錄取名單.csv' }
    if (!target.length) { showToast('沒有符合的學生', 'warn'); return }

    const header = '序號,中文姓名,英文姓名,系所,國籍,性別,獎學金,一階A,一階B,一階平均,一階建議,最終結果'
    const rows = target.map((s) => {
      const ea = store.getEval(s.id, 't1a'), eb = store.getEval(s.id, 't1b')
      const tA = sumScore(ea), tB = sumScore(eb)
      const decisions = [ea.decision, eb.decision]
        .filter((d) => d && d !== 'pending')
        .map((d) => decInfo(d).label)
      return [
        s.id, s.chName, s.enName, s.dept, s.nationality, s.gender, s.scholarship,
        tA || '—', tB || '—', avg2(tA, tB),
        decisions.join('/') || '—',
        finInfo(s.finalResult).label,
      ].join(',')
    })

    const blob = new Blob(['\uFEFF' + [header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
    showToast(`已匯出 ${rows.length} 筆`)
  }

  // ── 匯入 ─────────────────────────────────────────────────────────────────
  const handleImport = async (parsed) => {
    try {
      const { added } = await store.importStudents(parsed)
      showToast(`匯入完成，新增 ${added} 位學生`)
    } catch (e) {
      showToast('匯入失敗：' + e.message, 'error')
    }
  }

  // ── 登入畫面 ──────────────────────────────────────────────────────────────
  if (!role) {
    const deptList = [...new Set(store.students.map((s) => s.dept).filter(Boolean))]
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f4f0' }}>
        <div style={{ background: 'white', borderRadius: 14, padding: '36px 40px', width: 480, border: '1px solid #e8e7e3' }}>
          <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>實踐大學</div>
          <div style={{ fontSize: 16, color: '#555', marginBottom: 2 }}>國際生面試管理系統</div>
          <div style={{ fontSize: 13, color: '#aaa', marginBottom: 24 }}>請選擇您的角色</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            {FIXED_ROLES.map((r) => (
              <button
                key={r.id}
                onClick={() => selectRole(r.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px',
                  border: '1px solid #e8e7e3', borderRadius: 10, background: 'white',
                  cursor: 'pointer', fontSize: 14, fontFamily: 'inherit', textAlign: 'left',
                  transition: 'all .15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#f5f4f0'; e.currentTarget.style.borderColor = '#bbb' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'white'; e.currentTarget.style.borderColor = '#e8e7e3' }}
              >
                <div style={{ width: 32, height: 32, borderRadius: 8, background: '#f5f4f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, flexShrink: 0 }}>
                  {r.icon}
                </div>
                {r.label}
              </button>
            ))}
          </div>

          {deptList.length > 0 && (
            <>
              <div style={{ fontSize: 12, color: '#aaa', textAlign: 'center', margin: '14px 0 8px', borderTop: '1px solid #f0efeb', paddingTop: 14 }}>
                ── 第二階段系所老師 ──
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {deptList.map((dept) => (
                  <button
                    key={dept}
                    onClick={() => selectRole(`t2_${dept}`)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
                      border: '1px solid #e8e7e3', borderRadius: 10, background: '#f0f9ff',
                      cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', textAlign: 'left',
                    }}
                  >
                    <div style={{ width: 28, height: 28, borderRadius: 6, background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#1e40af', flexShrink: 0 }}>系</div>
                    <span style={{ fontSize: 12 }}>{dept.replace('學系(專)', '').replace('學系', '')}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          <button
            onClick={() => setShowSetup(true)}
            style={{ width: '100%', marginTop: 20, padding: '10px', borderRadius: 8, border: '1px solid #ddd', background: 'white', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', color: '#555' }}
          >
            ⚙ 設定 Google Sheets
          </button>
        </div>

        {showSetup && (
          <SetupModal
            onClose={() => setShowSetup(false)}
            onSaved={() => { showToast('設定已儲存'); store.loadData() }}
          />
        )}
        <Toast msg={toast?.msg} type={toast?.type} />
      </div>
    )
  }

  // ── 主畫面 ────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#f5f4f0' }}>
      {/* Header */}
      <div style={{
        background: '#1a1a18', padding: '0 24px', display: 'flex',
        alignItems: 'center', justifyContent: 'space-between',
        height: 52, position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#f5f4f0', letterSpacing: '.03em' }}>實踐大學</span>
          <span style={{ fontSize: 13, color: '#666' }}>國際生面試系統</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {store.loading  && <span style={{ fontSize: 12, color: '#888' }}>載入中…</span>}
          {store.syncing  && <span style={{ fontSize: 12, color: '#888' }}>同步中…</span>}
          <span style={{ fontSize: 12, background: '#2a2a28', padding: '4px 10px', borderRadius: 99, color: '#ccc' }}>
            {getRoleLabel(role)}
          </span>
          <button onClick={() => { setRole(''); localStorage.removeItem('role') }} style={{ padding: '4px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer', border: '1px solid #444', background: 'none', color: '#ccc', fontFamily: 'inherit' }}>切換角色</button>
          <button onClick={() => store.loadData()} style={{ padding: '4px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer', border: '1px solid #444', background: 'none', color: '#ccc', fontFamily: 'inherit' }}>↻</button>
          <button onClick={() => setShowSetup(true)} style={{ padding: '4px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer', border: '1px solid #444', background: 'none', color: '#ccc', fontFamily: 'inherit' }}>⚙</button>
        </div>
      </div>

      <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
        {view === 'score' && activeStudent ? (
          <ScorePage
            student={activeStudent}
            role={role}
            myDept={myDept}
            isStage2={isStage2}
            getEval={store.getEval}
            saveEval={async (...args) => { await store.saveEval(...args); showToast('評分已儲存') }}
            onBack={() => setView('list')}
          />
        ) : view === 'compare' && activeStudent ? (
          <ComparePage
            student={activeStudent}
            evals={store.evals}
            getEval={store.getEval}
            isDirector={isDirector}
            promoteToStage2={async (id) => { await store.promoteToStage2(id); showToast('已進入第二階段'); store.loadData() }}
            setFinalResult={async (id, r) => { await store.setFinalResult(id, r); showToast('最終結果已更新') }}
            onBack={() => setView('list')}
          />
        ) : (
          <ListPage
            students={store.students}
            evals={store.evals}
            role={role}
            getEval={store.getEval}
            isAdmin={isAdmin}
            isDirector={isDirector}
            isStage1={isStage1}
            isStage2={isStage2}
            myDept={myDept}
            updateStudent={store.updateStudent}
            promoteToStage2={async (id) => { await store.promoteToStage2(id); showToast('已進入第二階段') }}
            setFinalResult={store.setFinalResult}
            onOpenScore={(s) => { setActive(s); setView('score') }}
            onOpenCompare={(s) => { setActive(s); setView('compare') }}
            onImport={() => setShowImport(true)}
            exportCSV={exportCSV}
          />
        )}
      </div>

      {showImport && (
        <ImportModal
          onImport={handleImport}
          onClose={() => setShowImport(false)}
        />
      )}
      {showSetup && (
        <SetupModal
          onClose={() => setShowSetup(false)}
          onSaved={() => { showToast('設定已儲存'); store.loadData() }}
        />
      )}
      <Toast msg={toast?.msg} type={toast?.type} />
    </div>
  )
}
