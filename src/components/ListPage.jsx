import { useState } from 'react'
import { sumScore, avg2, decInfo, finInfo, todayStr } from '../utils'
import { Btn, Pill } from './UI'

export default function ListPage({
  students, evals, role, getEval,
  isAdmin, isDirector, isStage1, isStage2, myDept,
  updateStudent, promoteToStage2, setFinalResult,
  onOpenScore, onOpenCompare,
  onImport, exportCSV,
}) {
  const [search, setSearch]   = useState('')
  const [filterDept, setFD]   = useState('全部')
  const [sortBy, setSort]     = useState('id')

  const stageNum = isStage2 ? 2 : 1
  const depts = ['全部', ...new Set(students.map((s) => s.dept).filter(Boolean))]

  // ── 篩選 + 排序 ──────────────────────────────────────────────────────────
  const visible = students
    .filter((s) => {
      if (isStage2 && s.dept !== myDept) return false
      if (isStage2 && !s.stage2Status) return false
      if (search) {
        const q = search.toLowerCase()
        if (![s.chName, s.enName, String(s.id), s.passportNo].some((f) => f?.toLowerCase().includes(q))) return false
      }
      if (filterDept !== '全部' && s.dept !== filterDept) return false
      return true
    })
    .sort((a, b) => {
      if (sortBy === 'id') return Number(a.id) - Number(b.id)
      if (sortBy === 'avg') {
        const getAvg = (s) => {
          const ea = getEval(s.id, 't1a'), eb = getEval(s.id, 't1b')
          return Number(avg2(sumScore(ea), sumScore(eb))) || 0
        }
        return getAvg(b) - getAvg(a)
      }
      if (sortBy === 'name') return (a.chName || '').localeCompare(b.chName || '')
      return 0
    })

  // ── 統計 ─────────────────────────────────────────────────────────────────
  const stats = {
    total:    students.length,
    checked1: students.filter((s) => s.stage1Status === 'checked').length,
    stage2:   students.filter((s) => s.stage2Status).length,
    checked2: students.filter((s) => s.stage2Status === 'checked').length,
    absent1:  evals.filter((e) => e.stage === '1' && e.absent).length,
    absent2:  evals.filter((e) => e.stage === '2' && e.absent).length,
    admitted: students.filter((s) => s.finalResult === 'admitted').length,
  }

  // ── 進二階待確認列表 ──────────────────────────────────────────────────────
  const stage1Passed = students.filter((s) => {
    const ea = getEval(s.id, 't1a'), eb = getEval(s.id, 't1b')
    return (ea.decision === 'admit' || eb.decision === 'admit') && !s.stage2Status
  })

  const handleCheckIn = (student) => {
    const field = stageNum === 1 ? 'stage1Status' : 'stage2Status'
    const dateField = stageNum === 1 ? 'stage1Date' : 'stage2Date'
    const current = stageNum === 1 ? student.stage1Status : student.stage2Status
    updateStudent({
      id: student.id,
      [field]: current === 'checked' ? '' : 'checked',
      [dateField]: current === 'checked' ? '' : todayStr(),
    })
  }

  return (
    <div>
      {/* 統計卡 */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          ['全部學生', stats.total],
          ['一階報到',  stats.checked1],
          ['進二階',    stats.stage2],
          ['二階報到',  stats.checked2],
          ['一階缺席',  stats.absent1],
          ['二階缺席',  stats.absent2],
          ['正取',      stats.admitted],
        ].map(([label, val]) => (
          <div key={label} style={{ background: 'white', border: '1px solid #e8e7e3', borderRadius: 8, padding: '10px 16px', minWidth: 88 }}>
            <div style={{ fontSize: 11, color: '#999', marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{val}</div>
          </div>
        ))}
      </div>

      {/* 主任：進二階確認面板 */}
      {isDirector && stage1Passed.length > 0 && (
        <div style={{ background: 'white', border: '1px solid #e8e7e3', borderRadius: 10, marginBottom: 20, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #f0efeb', display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>今日一階通過 → 進二階確認</span>
            <span style={{ fontSize: 12, color: '#888' }}>{stage1Passed.length} 位待確認</span>
          </div>
          <div style={{ padding: '8px 18px' }}>
            {stage1Passed.map((s) => {
              const ea = getEval(s.id, 't1a'), eb = getEval(s.id, 't1b')
              const da = decInfo(ea.decision), db = decInfo(eb.decision)
              return (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid #f5f4f0', fontSize: 13 }}>
                  <span style={{ fontWeight: 500, width: 88, flexShrink: 0 }}>{s.chName}</span>
                  <span style={{ color: '#888', flex: 1, fontSize: 12 }}>{s.dept}</span>
                  <span>A：{sumScore(ea) || '—'}</span>
                  <span>B：{sumScore(eb) || '—'}</span>
                  <Pill color={da.color} bg={da.bg}>{da.label}</Pill>
                  <Pill color={db.color} bg={db.bg}>{db.label}</Pill>
                  <Btn variant="blue" style={{ padding: '4px 12px', fontSize: 12 }} onClick={() => promoteToStage2(s.id)}>
                    確認進二階
                  </Btn>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 工具列 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          autoFocus
          type="text"
          placeholder="搜尋：序號 / 姓名 / 護照號"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            border: '1px solid #ddd', background: 'white', padding: '8px 12px',
            borderRadius: 7, fontSize: 13, width: 240, outline: 'none',
          }}
        />
        {!isStage2 && (
          <select
            value={filterDept}
            onChange={(e) => setFD(e.target.value)}
            style={{ border: '1px solid #ddd', background: 'white', padding: '8px 10px', borderRadius: 7, fontSize: 13, outline: 'none' }}
          >
            {depts.map((d) => <option key={d}>{d}</option>)}
          </select>
        )}
        {(isAdmin || isDirector) && (
          <select
            value={sortBy}
            onChange={(e) => setSort(e.target.value)}
            style={{ border: '1px solid #ddd', background: 'white', padding: '8px 10px', borderRadius: 7, fontSize: 13, outline: 'none' }}
          >
            <option value="id">排序：序號</option>
            <option value="avg">排序：平均分</option>
            <option value="name">排序：姓名</option>
          </select>
        )}
        <span style={{ fontSize: 12, color: '#aaa' }}>{visible.length} 位</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {isAdmin && <Btn onClick={onImport}>↑ 匯入學生</Btn>}
          {(isAdmin || isDirector) && (
            <>
              <Btn onClick={() => exportCSV('all')}>↓ 總表</Btn>
              <Btn variant="green"   onClick={() => exportCSV('admitted')}>↓ 正取</Btn>
              <Btn variant="amber"   onClick={() => exportCSV('waitlisted')}>↓ 備取</Btn>
              <Btn variant="red"     onClick={() => exportCSV('rejected')}>↓ 不錄取</Btn>
            </>
          )}
        </div>
      </div>

      {/* 名單表格 */}
      <div style={{ background: 'white', borderRadius: 10, border: '1px solid #e8e7e3', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f8f7f3' }}>
              {[
                '#', '姓名', '系所', '國籍', '狀態',
                ...(isAdmin || isDirector ? ['老師A', '老師B', '平均', '二階', '最終'] : []),
                ...(isStage1 || isStage2 ? ['我的評分'] : []),
                '',
              ].map((h) => (
                <th key={h} style={{ padding: '10px 12px', textAlign: 'left', borderBottom: '1px solid #e8e7e3', color: '#666', fontWeight: 500, fontSize: 12, whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr><td colSpan={12} style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>
                {search ? `找不到「${search}」` : '沒有學生資料，請先匯入'}
              </td></tr>
            ) : visible.map((s) => (
              <StudentRow
                key={s.id} s={s} role={role}
                isAdmin={isAdmin} isDirector={isDirector}
                isStage1={isStage1} isStage2={isStage2}
                stageNum={stageNum} getEval={getEval}
                onCheckIn={() => handleCheckIn(s)}
                onScore={() => onOpenScore(s)}
                onCompare={() => onOpenCompare(s)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function StudentRow({ s, role, isAdmin, isDirector, isStage1, isStage2, stageNum, getEval, onCheckIn, onScore, onCompare }) {
  const ea = getEval(s.id, 't1a')
  const eb = getEval(s.id, 't1b')
  const tA = sumScore(ea), tB = sumScore(eb)
  const avgScore = avg2(tA, tB)
  const myEv = (isStage1 || isStage2) ? getEval(s.id, role) : null
  const checkedField = stageNum === 1 ? s.stage1Status : s.stage2Status
  const isChecked = checkedField === 'checked'
  const isAbsent = myEv?.absent

  const statusLabel = isAbsent ? '缺席' : isChecked ? '已報到' : '未報到'
  const statusColor = isAbsent ? '#dc2626' : isChecked ? '#15803d' : '#6b7280'
  const statusBg    = isAbsent ? '#fee2e2' : isChecked ? '#dcfce7' : '#f3f4f6'

  return (
    <tr onMouseEnter={(e) => (e.currentTarget.style.background = '#fafaf8')}
        onMouseLeave={(e) => (e.currentTarget.style.background = '')}>
      <td style={{ padding: '10px 12px', color: '#aaa', fontSize: 12 }}>{s.id}</td>
      <td style={{ padding: '10px 12px' }}>
        <div style={{ fontWeight: 500 }}>{s.chName || '—'}</div>
        <div style={{ fontSize: 11, color: '#aaa' }}>{s.enName}</div>
      </td>
      <td style={{ padding: '10px 12px', fontSize: 12, color: '#666', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.dept || '—'}</td>
      <td style={{ padding: '10px 12px', fontSize: 12 }}>{s.nationality || '—'}</td>
      <td style={{ padding: '10px 12px' }}>
        <Pill color={statusColor} bg={statusBg}>{statusLabel}</Pill>
      </td>

      {(isAdmin || isDirector) && (
        <>
          <td style={{ padding: '10px 12px', textAlign: 'center' }}>
            {tA > 0 ? <><b>{tA}</b>{ea.absent && <span style={{ fontSize: 10, color: '#dc2626', marginLeft: 3 }}>缺</span>}</> : <span style={{ color: '#ddd' }}>—</span>}
          </td>
          <td style={{ padding: '10px 12px', textAlign: 'center' }}>
            {tB > 0 ? <><b>{tB}</b>{eb.absent && <span style={{ fontSize: 10, color: '#dc2626', marginLeft: 3 }}>缺</span>}</> : <span style={{ color: '#ddd' }}>—</span>}
          </td>
          <td style={{ padding: '10px 12px', textAlign: 'center' }}>
            <Pill bg={avgScore !== '—' ? '#1a1a18' : '#f5f4f0'} color={avgScore !== '—' ? 'white' : '#999'}>
              <b>{avgScore}</b>
            </Pill>
          </td>
          <td style={{ padding: '10px 12px' }}>
            {s.stage2Status && <Pill bg="#e0f2fe" color="#0369a1">進二階</Pill>}
          </td>
          <td style={{ padding: '10px 12px' }}>
            {s.finalResult && <Pill bg={finInfo(s.finalResult).bg} color={finInfo(s.finalResult).color}>{finInfo(s.finalResult).label}</Pill>}
          </td>
        </>
      )}

      {(isStage1 || isStage2) && (
        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
          {myEv && sumScore(myEv) > 0
            ? <Pill bg="#f5f4f0"><b>{sumScore(myEv)}</b></Pill>
            : <span style={{ color: '#ddd' }}>—</span>}
        </td>
      )}

      <td style={{ padding: '10px 12px' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {(isAdmin || isStage1 || isStage2) && (
            <button
              onClick={onCheckIn}
              style={{
                padding: '4px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                border: '1px solid', fontFamily: 'inherit',
                background: isChecked ? '#dcfce7' : 'white',
                color: isChecked ? '#15803d' : '#555',
                borderColor: isChecked ? '#86efac' : '#ddd',
              }}
            >
              {isChecked ? '✓ 報到' : '報到'}
            </button>
          )}
          {(isStage1 || isStage2) && (
            <button
              onClick={onScore}
              style={{ padding: '4px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer', border: 'none', background: '#1a1a18', color: 'white', fontFamily: 'inherit' }}
            >
              評分 →
            </button>
          )}
          {(isDirector || isAdmin) && (
            <button
              onClick={onCompare}
              style={{ padding: '4px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer', border: '1px solid #ddd', background: 'white', fontFamily: 'inherit' }}
            >
              詳情
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}
