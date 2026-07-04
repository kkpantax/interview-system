import { useState } from 'react'
import { SCORE_ITEMS_STAGE1, DECISIONS_STAGE1, QUESTIONS_STAGE1 } from '../constants'
import { BackBtn, Card, CardHead, Btn, s } from './UI'
import { calcAge } from '../utils'

const MAX = SCORE_ITEMS_STAGE1.length * 5
const emptyScores = () => Object.fromEntries(SCORE_ITEMS_STAGE1.map((i) => [i.key, 0]))
const sumScores = (sc) => SCORE_ITEMS_STAGE1.reduce((a, i) => a + Number(sc[i.key] || 0), 0)

// 第一階段評分表（寫入 stage1_records）。initial 帶入既有紀錄即為「重新評分」。
export default function Stage1ScoreForm({ student, onSave, onBack, saving, initial }) {
  const [scores, setScores] = useState(() => ({ ...emptyScores(), ...(initial?.scores || {}) }))
  const [rec, setRec]       = useState(initial?.recommendation || 'pending')
  const [note, setNote]     = useState(initial?.teacher_note || '')
  // 自訂題目：[{ question, note }]
  const [customQs, setCustomQs] = useState(() => initial?.custom_questions || [])
  const [newQ, setNewQ]         = useState('')

  const total = sumScores(scores)
  const age = calcAge(student.birth_date)
  const setStar = (k, v) => setScores((p) => ({ ...p, [k]: p[k] === v ? 0 : v }))

  const addCustom = () => {
    const q = newQ.trim()
    if (!q) return
    setCustomQs((p) => [...p, { question: q, note: '' }])
    setNewQ('')
  }
  const setCustomNote = (i, val) => setCustomQs((p) => p.map((c, idx) => (idx === i ? { ...c, note: val } : c)))
  const removeCustom  = (i) => setCustomQs((p) => p.filter((_, idx) => idx !== i))

  const handleSave = () =>
    onSave({
      scores,
      total_score: total,
      recommendation: rec,
      teacher_note: note,
      custom_questions: customQs.filter((c) => c.question.trim()),
    })

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
        {age != null && <span>年齡：{age}</span>}
        {student.high_school && <span>畢業學校：{student.high_school}</span>}
        {student.center && <span style={{ color: '#1e40af' }}>中心：{student.center}</span>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* 評分表 */}
        <Card>
          <CardHead left="第一階段評分" right={student.department} />
          <div style={{ padding: '14px 18px' }}>
            {SCORE_ITEMS_STAGE1.map((item) => (
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
                <span style={{ fontSize: 13, color: '#aaa' }}> / {MAX}</span>
              </span>
            </div>

            <div style={{ marginTop: 16 }}>
              <span style={s.secLabel}>第一階段建議</span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                {DECISIONS_STAGE1.map((d) => (
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
            <span style={s.secLabel}>基礎題目</span>
            {QUESTIONS_STAGE1.map((q, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, padding: '8px 0', borderBottom: '1px solid #f5f4f0' }}>
                <span style={{ color: '#bbb', fontSize: 13, flexShrink: 0 }}>{i + 1}.</span>
                <span style={{ fontSize: 13 }}>{q.q}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* 自訂題目（現場新增，連同評分一起儲存） */}
      <Card style={{ marginTop: 20 }}>
        <CardHead left="自訂題目" right={customQs.length ? `${customQs.length} 題` : ''} />
        <div style={{ padding: '14px 18px' }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: customQs.length ? 14 : 0 }}>
            <input
              style={{ ...s.input, marginBottom: 0 }}
              placeholder="輸入想問的題目，按 Enter 或「＋ 新增」"
              value={newQ}
              onChange={(e) => setNewQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom() } }}
            />
            <Btn variant="primary" onClick={addCustom} disabled={!newQ.trim()}>＋ 新增</Btn>
          </div>

          {customQs.map((c, i) => (
            <div key={i} style={{ padding: '10px 0', borderTop: '1px solid #f5f4f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ color: '#bbb', fontSize: 13 }}>{i + 1}.</span>
                <span style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>{c.question}</span>
                <button onClick={() => removeCustom(i)}
                  style={{ background: 'none', border: 'none', color: '#dc2626', fontSize: 16, cursor: 'pointer', padding: '0 4px' }}>✕</button>
              </div>
              <input
                style={{ ...s.input, marginBottom: 0 }}
                placeholder="學生回答重點 / 備註…"
                value={c.note}
                onChange={(e) => setCustomNote(i, e.target.value)}
              />
            </div>
          ))}

          {!customQs.length && (
            <div style={{ fontSize: 12, color: '#aaa', marginTop: 10 }}>
              現場想追問的題目可在此新增，每題可記錄學生回答重點；儲存評分時會一併存入。
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
