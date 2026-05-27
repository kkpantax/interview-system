import { SCORE_ITEMS, FINAL_RESULTS } from '../constants'
import { sumScore, avg2, decInfo, finInfo } from '../utils'
import { BackBtn, Card, CardHead, Btn, Pill } from './UI'

export default function ComparePage({ student, evals, getEval, isDirector, promoteToStage2, setFinalResult, onBack }) {
  const ea = getEval(student.id, 't1a')
  const eb = getEval(student.id, 't1b')
  const tA = sumScore(ea)
  const tB = sumScore(eb)
  const avgScore = avg2(tA, tB)
  const stage2Evs = evals.filter(
    (e) => String(e.studentId) === String(student.id) && e.stage === '2'
  )

  return (
    <div>
      <BackBtn onClick={onBack} />

      {/* 頂部橫幅 */}
      <div style={{
        background: '#1a1a18', color: 'white', borderRadius: 10,
        padding: '18px 24px', marginBottom: 20,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div>
          <div style={{ fontSize: 12, opacity: .6, marginBottom: 4 }}>一階平均分</div>
          <div style={{ fontSize: 36, fontWeight: 700 }}>
            {avgScore} <span style={{ fontSize: 16, opacity: .5 }}>/ 40</span>
          </div>
          <div style={{ fontSize: 12, opacity: .6, marginTop: 4 }}>
            {student.chName} · {student.dept}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 12, opacity: .6, marginBottom: 10 }}>
            老師 A：{tA || '—'} ｜ 老師 B：{tB || '—'}
          </div>
          {isDirector && (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              {FINAL_RESULTS.filter((r) => r.v).map((r) => (
                <button
                  key={r.v}
                  onClick={() => setFinalResult(student.id, r.v)}
                  style={{
                    padding: '5px 14px', borderRadius: 99, border: 'none',
                    cursor: 'pointer', fontSize: 12, fontWeight: 600,
                    background: student.finalResult === r.v ? r.color : 'rgba(255,255,255,.2)',
                    color: 'white', fontFamily: 'inherit',
                  }}
                >
                  {r.label}
                </button>
              ))}
              {!student.stage2Status && tA > 0 && (
                <button
                  onClick={() => promoteToStage2(student.id)}
                  style={{
                    padding: '5px 14px', borderRadius: 99, border: 'none',
                    cursor: 'pointer', fontSize: 12, background: '#3b82f6',
                    color: 'white', fontFamily: 'inherit',
                  }}
                >
                  → 進二階
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 逐項比對 */}
      <Card style={{ marginBottom: 16 }}>
        <CardHead left="一階評分比對" />
        <div style={{ padding: '14px 18px' }}>
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['項目', '老師A', '老師B', '平均', '差異'].map((h, i) => (
                  <th key={h} style={{
                    textAlign: i ? 'center' : 'left', padding: '6px 8px',
                    borderBottom: '1px solid #e8e7e3', color: '#888', fontWeight: 500, fontSize: 12,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SCORE_ITEMS.map((item) => {
                const a = Number(ea[item.key])
                const b = Number(eb[item.key])
                const diff = Math.abs(a - b)
                return (
                  <tr key={item.key}>
                    <td style={{ padding: '7px 8px', borderBottom: '1px solid #f5f4f0' }}>{item.label}</td>
                    <td style={{ textAlign: 'center', padding: '7px 8px', borderBottom: '1px solid #f5f4f0', fontWeight: 600 }}>{a || '—'}</td>
                    <td style={{ textAlign: 'center', padding: '7px 8px', borderBottom: '1px solid #f5f4f0', fontWeight: 600 }}>{b || '—'}</td>
                    <td style={{ textAlign: 'center', padding: '7px 8px', borderBottom: '1px solid #f5f4f0' }}>
                      {(a + b) > 0 ? ((a + b) / 2).toFixed(1) : '—'}
                    </td>
                    <td style={{ textAlign: 'center', padding: '7px 8px', borderBottom: '1px solid #f5f4f0' }}>
                      {diff >= 2
                        ? <span style={{ background: '#fef9c3', color: '#92400e', padding: '1px 6px', borderRadius: 4, fontSize: 11 }}>差{diff}</span>
                        : diff === 1
                          ? <span style={{ color: '#aaa', fontSize: 12 }}>差1</span>
                          : <span style={{ color: '#16a34a', fontSize: 12 }}>✓</span>}
                    </td>
                  </tr>
                )
              })}
              <tr style={{ fontWeight: 700 }}>
                <td style={{ padding: '10px 8px' }}>總分</td>
                <td style={{ textAlign: 'center', padding: '10px 8px' }}>{tA || '—'}</td>
                <td style={{ textAlign: 'center', padding: '10px 8px' }}>{tB || '—'}</td>
                <td style={{ textAlign: 'center', padding: '10px 8px' }}>{avgScore}</td>
                <td style={{ textAlign: 'center', padding: '10px 8px' }}>{Math.abs(tA - tB)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      {/* 老師備註 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        {['t1a', 't1b'].map((t) => {
          const ev = getEval(student.id, t)
          const d = decInfo(ev.decision)
          return (
            <Card key={t}>
              <CardHead
                left={`老師 ${t === 't1a' ? 'A' : 'B'}`}
                right={<Pill color={d.color} bg={d.bg}>{d.label}</Pill>}
              />
              <div style={{ padding: '14px 18px', fontSize: 13 }}>
                {ev.absent && <div style={{ color: '#dc2626', marginBottom: 8 }}>⚠ 缺席</div>}
                <div style={{ color: '#555', marginBottom: 8, whiteSpace: 'pre-wrap' }}>
                  {ev.notes || <span style={{ color: '#aaa' }}>（無備註）</span>}
                </div>
                {ev.extraQ1 && <div style={{ marginTop: 6 }}><b>加問：</b>{ev.extraQ1}</div>}
                {ev.extraQ2 && <div>{ev.extraQ2}</div>}
                {ev.qNotes  && <div style={{ marginTop: 6, color: '#777' }}>{ev.qNotes}</div>}
              </div>
            </Card>
          )
        })}
      </div>

      {/* 二階各系評分 */}
      {stage2Evs.length > 0 && (
        <Card>
          <CardHead left="二階各系評分" />
          <div style={{ padding: '14px 18px' }}>
            {stage2Evs.map((ev) => {
              const d = decInfo(ev.decision)
              return (
                <div key={ev.role} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '9px 0', borderBottom: '1px solid #f5f4f0', fontSize: 13,
                }}>
                  <span style={{ width: 130, fontWeight: 500 }}>{ev.role.replace('t2_', '')}</span>
                  <span>分數：<b>{ev.total || '—'}</b></span>
                  <Pill color={d.color} bg={d.bg}>{d.label}</Pill>
                  {ev.absent && <Pill color="#dc2626" bg="#fee2e2">缺席</Pill>}
                  {ev.notes && <span style={{ fontSize: 12, color: '#aaa' }}>「{ev.notes.slice(0, 30)}」</span>}
                </div>
              )
            })}
          </div>
        </Card>
      )}
    </div>
  )
}
