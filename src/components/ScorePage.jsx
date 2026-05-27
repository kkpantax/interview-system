import { useState } from 'react'
import { SCORE_ITEMS, QUESTIONS, DECISIONS } from '../constants'
import { sumScore, decInfo, emptyEval } from '../utils'
import { BackBtn, Card, CardHead, Btn, s } from './UI'

export default function ScorePage({ student, role, myDept, isStage2, getEval, saveEval, onBack }) {
  const stageNum = isStage2 ? 2 : 1
  const [ev, setEv] = useState(() => ({ ...emptyEval(), ...getEval(student.id, role) }))
  const [saving, setSaving] = useState(false)

  const roleName = role === 't1a' ? '老師 A' : role === 't1b' ? '老師 B' : (myDept || role)

  const setStar = (key, val) =>
    setEv((prev) => ({ ...prev, [key]: prev[key] === val ? 0 : val }))

  const setDecision = (v) => setEv((prev) => ({ ...prev, decision: v }))

  const toggleAbsent = () =>
    setEv((prev) => {
      const next = { ...prev, absent: !prev.absent }
      if (next.absent) SCORE_ITEMS.forEach((i) => { next[i.key] = 0 })
      return next
    })

  const handleSave = async () => {
    setSaving(true)
    await saveEval(student.id, role, stageNum, ev)
    setSaving(false)
  }

  const total = sumScore(ev)

  // 一階參考（二階老師用）
  const stage1Ref = isStage2 && (
    <div style={{ ...s.card, marginBottom: 16, padding: '12px 18px' }}>
      <span style={s.secLabel}>一階評分參考</span>
      <div style={{ display: 'flex', gap: 24, fontSize: 13, color: '#555' }}>
        {['t1a', 't1b'].map((t) => {
          const prev = getEval(student.id, t)
          const pt = sumScore(prev)
          return (
            <span key={t}>
              老師 {t === 't1a' ? 'A' : 'B'}：
              <b style={{ color: '#1a1a18' }}>{pt > 0 ? pt : '—'}</b>
              {prev.absent && <span style={{ color: '#dc2626', fontSize: 11, marginLeft: 4 }}>缺席</span>}
              {prev.notes && <span style={{ color: '#aaa', fontSize: 11, marginLeft: 6 }}>「{prev.notes.slice(0, 20)}…」</span>}
            </span>
          )
        })}
      </div>
    </div>
  )

  return (
    <div>
      <BackBtn onClick={onBack} />

      {/* 學生基本資料列 */}
      <div style={{
        background: 'white', border: '1px solid #e8e7e3', borderRadius: 10,
        padding: '12px 16px', marginBottom: 16,
        display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', fontSize: 13, color: '#555',
      }}>
        <b style={{ color: '#1a1a18' }}>{student.chName}</b>
        <span>{student.enName}</span>
        <span>{student.dept || '—'}</span>
        <span>{student.nationality} · {student.gender}</span>
        <span>獎學金：{student.scholarship || '—'}</span>
        <div style={{ marginLeft: 'auto' }}>
          <button
            onClick={toggleAbsent}
            style={{
              ...s.btn, ...s.btnSm,
              background: ev.absent ? '#fee2e2' : 'white',
              color: ev.absent ? '#dc2626' : '#555',
              borderColor: ev.absent ? '#fca5a5' : '#ddd',
            }}
          >
            {ev.absent ? '⚠ 已標記缺席' : '標記缺席'}
          </button>
        </div>
      </div>

      {stage1Ref}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* 評分表 */}
        <Card>
          <CardHead left="評分表" right={roleName} />
          <div style={{ padding: '14px 18px' }}>
            {ev.absent ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#dc2626', fontSize: 14 }}>
                已標記為缺席，無需填寫評分
              </div>
            ) : (
              <>
                {SCORE_ITEMS.map((item) => (
                  <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid #f8f7f5' }}>
                    <div style={{ fontSize: 13, width: 96, flexShrink: 0 }}>{item.label}</div>
                    <div style={{ display: 'flex', gap: 3 }}>
                      {[1, 2, 3, 4, 5].map((v) => (
                        <button
                          key={v}
                          onClick={() => setStar(item.key, v)}
                          style={{
                            width: 26, height: 26, border: 'none', background: 'none',
                            cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 0,
                            color: ev[item.key] >= v ? '#f59e0b' : '#ddd',
                            transition: 'color .1s',
                          }}
                        >★</button>
                      ))}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 600, minWidth: 16, color: '#555' }}>
                      {ev[item.key] || ''}
                    </div>
                  </div>
                ))}

                {/* 總分 */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0 0', borderTop: '1px solid #e8e7e3', marginTop: 8 }}>
                  <span style={{ fontSize: 13, color: '#666' }}>總分</span>
                  <span>
                    <span style={{ fontSize: 22, fontWeight: 700 }}>{total}</span>
                    <span style={{ fontSize: 13, color: '#aaa' }}> / 40</span>
                  </span>
                </div>

                {/* 錄取建議 */}
                <div style={{ marginTop: 16 }}>
                  <span style={s.secLabel}>錄取建議</span>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {DECISIONS.filter((d) => d.v !== 'pending').map((d) => (
                      <div
                        key={d.v}
                        onClick={() => setDecision(d.v)}
                        style={{
                          padding: 9, borderRadius: 8, cursor: 'pointer',
                          textAlign: 'center', fontSize: 13, fontWeight: 500,
                          border: ev.decision === d.v ? `2px solid ${d.color}` : '2px solid #e8e7e3',
                          background: ev.decision === d.v ? d.bg : 'white',
                          color: ev.decision === d.v ? d.color : '#555',
                          transition: 'all .15s',
                        }}
                      >
                        {d.label}
                      </div>
                    ))}
                  </div>
                </div>

                {/* 備註 */}
                <div style={{ marginTop: 14 }}>
                  <span style={s.secLabel}>備註 / 觀察</span>
                  <textarea
                    style={s.ta}
                    placeholder="整體觀察、特殊情況記錄..."
                    value={ev.notes}
                    onChange={(e) => setEv((p) => ({ ...p, notes: e.target.value }))}
                  />
                </div>

                {/* 加問 */}
                <div style={{ marginTop: 10 }}>
                  <span style={s.secLabel}>加問問題（選填）</span>
                  <input
                    type="text" style={s.input}
                    placeholder="加問問題 1"
                    value={ev.extraQ1}
                    onChange={(e) => setEv((p) => ({ ...p, extraQ1: e.target.value }))}
                  />
                  <input
                    type="text" style={s.input}
                    placeholder="加問問題 2"
                    value={ev.extraQ2}
                    onChange={(e) => setEv((p) => ({ ...p, extraQ2: e.target.value }))}
                  />
                  <textarea
                    style={{ ...s.ta, minHeight: 50 }}
                    placeholder="針對加問問題的回答記錄..."
                    value={ev.qNotes}
                    onChange={(e) => setEv((p) => ({ ...p, qNotes: e.target.value }))}
                  />
                </div>
              </>
            )}

            <Btn
              variant="primary"
              onClick={handleSave}
              disabled={saving}
              style={{ width: '100%', justifyContent: 'center', marginTop: 16 }}
            >
              {saving ? '儲存中...' : ev.absent ? '儲存（缺席）' : '儲存評分'}
            </Btn>
          </div>
        </Card>

        {/* 面試題目 */}
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
