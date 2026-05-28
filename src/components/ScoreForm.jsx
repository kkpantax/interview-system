import { useState } from 'react'
import { SCORE_ITEMS, DECISIONS, QUESTIONS } from '../constants'
import { BackBtn, Card, CardHead, Btn, s } from './UI'

const emptyScores = () => Object.fromEntries(SCORE_ITEMS.map((i) => [i.key, 0]))
const sumScores = (sc) => SCORE_ITEMS.reduce((a, i) => a + Number(sc[i.key] || 0), 0)

// 第二階段評分表（寫入 evaluations）
export default function ScoreForm({ student, onSave, onBack, saving }) {
  const [scores, setScores] = useState(emptyScores)
  const [rec, setRec]       = useState('pending')
  const [note, setNote]     = useState('')

  const total = sumScores(scores)
  const setStar = (k, v) => setScores((p) => ({ ...p, [k]: p[k] === v ? 0 : v }))

  const handleSave = () =>
    onSave({ scores, total_score: total, recommendation: rec, teacher_note: note })

  return (
    <div>
      <BackBtn onClick={onBack} />

      <div style={{
        background: 'white', border: '1px solid #e8e7e3', borderRadius: 10,
        padding: '12px 16px', marginBottom: 16, display: 'flex', gap: 16,
        alignItems: 'center', flexWrap: 'wrap', fontSize: 13, color: '#555',
      }}>
        <b style={{ color: '#1a1a18', fontSize: 15 }}>{student.name}</b>
        <span>{student.name_english}</span>
        <span>{student.department}</span>
        <span>{student.nationality} · {student.gender}</span>
        {student.stage1_passed_date && <span style={{ color: '#15803d' }}>一階通過：{student.stage1_passed_date}</span>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* 評分表 */}
        <Card>
          <CardHead left="評分表" right={student.department} />
          <div style={{ padding: '14px 18px' }}>
            {SCORE_ITEMS.map((item) => (
              <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid #f8f7f5' }}>
                <div style={{ fontSize: 13, width: 96, flexShrink: 0 }}>{item.label}</div>
                <div style={{ display: 'flex', gap: 3 }}>
                  {[1, 2, 3, 4, 5].map((v) => (
                    <button key={v} onClick={() => setStar(item.key, v)}
                      style={{
                        width: 26, height: 26, border: 'none', background: 'none', cursor: 'pointer',
                        fontSize: 18, lineHeight: 1, padding: 0,
                        color: scores[item.key] >= v ? '#f59e0b' : '#ddd',
                      }}
                    >★</button>
                  ))}
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, minWidth: 16, color: '#555' }}>{scores[item.key] || ''}</div>
              </div>
            ))}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0 0', borderTop: '1px solid #e8e7e3', marginTop: 8 }}>
              <span style={{ fontSize: 13, color: '#666' }}>總分</span>
              <span>
                <span style={{ fontSize: 22, fontWeight: 700 }}>{total}</span>
                <span style={{ fontSize: 13, color: '#aaa' }}> / 40</span>
              </span>
            </div>

            <div style={{ marginTop: 16 }}>
              <span style={s.secLabel}>錄取建議</span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                {DECISIONS.filter((d) => d.v !== 'pending').map((d) => (
                  <div key={d.v} onClick={() => setRec(d.v)}
                    style={{
                      padding: 9, borderRadius: 8, cursor: 'pointer', textAlign: 'center', fontSize: 13, fontWeight: 500,
                      border: rec === d.v ? `2px solid ${d.color}` : '2px solid #e8e7e3',
                      background: rec === d.v ? d.bg : 'white',
                      color: rec === d.v ? d.color : '#555',
                    }}
                  >{d.label}</div>
                ))}
              </div>
            </div>

            <div style={{ marginTop: 14 }}>
              <span style={s.secLabel}>備註 / 觀察</span>
              <textarea style={s.ta} placeholder="整體觀察、特殊情況記錄..."
                value={note} onChange={(e) => setNote(e.target.value)} />
            </div>

            <Btn variant="primary" onClick={handleSave} disabled={saving}
              style={{ width: '100%', justifyContent: 'center', marginTop: 16 }}>
              {saving ? '儲存中...' : '儲存評分'}
            </Btn>
          </div>
        </Card>

        {/* 面試題目參考 */}
        <Card>
          <CardHead left="面試題目參考" />
          <div style={{ padding: '14px 18px', maxHeight: 600, overflowY: 'auto' }}>
            {['基本自我介紹', '學習態度', '品行觀察'].map((cat) => (
              <div key={cat} style={{ marginBottom: 16 }}>
                <span style={s.secLabel}>{cat}</span>
                {QUESTIONS.filter((q) => q.cat === cat).map((q, i) => (
                  <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid #f5f4f0' }}>
                    <div style={{ fontSize: 13, marginBottom: 2 }}>{q.q}</div>
                    <div style={{ fontSize: 11, color: '#aaa' }}>評估：{q.focus}</div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
