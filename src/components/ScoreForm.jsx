import { useState } from 'react'
import { SCORE_ITEMS, DECISIONS, QUESTIONS_STAGE1, QUESTIONS_STAGE2, batchOf } from '../constants'
import { BackBtn, Card, CardHead, Btn, Modal, s } from './UI'

const emptyScores = () => Object.fromEntries(SCORE_ITEMS.map((i) => [i.key, 0]))
const sumScores = (sc) => SCORE_ITEMS.reduce((a, i) => a + Number(sc[i.key] || 0), 0)

// 第二階段評分表（寫入 evaluations）
export default function ScoreForm({ student, onSave, onBack, saving, evaluator }) {
  const [scores, setScores] = useState(emptyScores)
  const [rec, setRec]       = useState('pending')
  const [note, setNote]     = useState('')
  const [confirming, setConfirming] = useState(false)
  // 自訂題目：[{ question, note }]
  const [customQs, setCustomQs] = useState([])
  const [newQ, setNewQ]         = useState('')

  const total = sumScores(scores)
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
      stage: 2,
      // 過濾掉空題目，避免存入空白列
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
        {student.stage1_passed_date && <span style={{ color: '#15803d' }}>一階通過：{student.stage1_passed_date}</span>}
        {(() => {
          const base = { marginLeft: 'auto', padding: '5px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600 }
          if (student.materials_url) return (
            <a href={student.materials_url} target="_blank" rel="noopener noreferrer"
              style={{ ...base, display: 'inline-flex', alignItems: 'center', gap: 4, background: '#1d4ed8', color: '#fff', textDecoration: 'none' }}
            >📎 查看書面資料</a>
          )
          if (batchOf(student.account) === 2) return (
            <span style={{ ...base, background: '#fef3c7', color: '#b45309' }}>⚠ 尚未上傳書面資料</span>
          )
          return (
            <span style={{ ...base, fontWeight: 500, background: '#f3f4f6', color: '#9ca3af' }}>資料請查閱書審系統</span>
          )
        })()}
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

            <Btn variant="primary" onClick={() => setConfirming(true)} disabled={saving}
              style={{ width: '100%', justifyContent: 'center', marginTop: 16 }}>
              {saving ? '儲存中...' : '儲存評分'}
            </Btn>
          </div>
        </Card>

        {/* 面試題目參考 */}
        <Card>
          <CardHead left="面試題目參考" />
          <div style={{ padding: '14px 18px', maxHeight: 600, overflowY: 'auto' }}>
            {/* 固定基礎題（共用 7 題） */}
            <div style={{ marginBottom: 16 }}>
              <span style={s.secLabel}>固定題目（基礎）</span>
              {QUESTIONS_STAGE1.map((q, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, padding: '7px 0', borderBottom: '1px solid #f5f4f0' }}>
                  <span style={{ color: '#bbb', fontSize: 13, flexShrink: 0 }}>{i + 1}.</span>
                  <span style={{ fontSize: 13 }}>{q.q}</span>
                </div>
              ))}
            </div>

            {/* 延伸參考題（依分類） */}
            {['基本自我介紹', '學習態度', '品行觀察'].map((cat) => (
              <div key={cat} style={{ marginBottom: 16 }}>
                <span style={s.secLabel}>{cat}</span>
                {QUESTIONS_STAGE2.filter((q) => q.cat === cat).map((q, i) => (
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

      {confirming && (
        <Modal title="確認送出評分" onClose={() => setConfirming(false)} width={460}>
          <div style={{ fontSize: 13, color: '#555', marginBottom: 12 }}>
            請確認以下評分內容無誤後再送出：
          </div>
          <div style={{ background: '#faf9f6', borderRadius: 8, padding: '12px 14px', fontSize: 13 }}>
            <div style={{ marginBottom: 8 }}>
              <b style={{ fontSize: 14 }}>{student.name}</b> {student.name_english} · {student.department}
            </div>
            {evaluator && (
              <div style={{ color: '#666', marginBottom: 10 }}>
                評分老師：{evaluator.name} · 日期：{evaluator.date}
              </div>
            )}
            {SCORE_ITEMS.map((it) => (
              <div key={it.key} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                <span style={{ color: '#666' }}>{it.label}</span>
                <span style={{ fontWeight: 600 }}>{scores[it.key] || 0}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0 0', marginTop: 6, borderTop: '1px solid #e8e7e3' }}>
              <span>總分</span><span style={{ fontWeight: 700 }}>{total} / 40</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0 0' }}>
              <span>錄取建議</span>
              <span style={{ fontWeight: 600 }}>{(DECISIONS.find((d) => d.v === rec) || {}).label || '—'}</span>
            </div>
            {note.trim() && <div style={{ marginTop: 8, color: '#666' }}>備註：{note.trim()}</div>}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <Btn onClick={() => setConfirming(false)} style={{ flex: 1, justifyContent: 'center' }}>返回修改</Btn>
            <Btn variant="primary" disabled={saving}
              onClick={() => { setConfirming(false); handleSave() }}
              style={{ flex: 1, justifyContent: 'center' }}>
              確認送出
            </Btn>
          </div>
        </Modal>
      )}
    </div>
  )
}
