import { useState } from 'react'
import { Modal, Btn, Pill } from './UI'
import { SCORE_ITEMS, DECISIONS } from '../constants'

// 第二階段評分明細 Modal（唯讀；傳入 onDelete 才會顯示刪除鈕）。
// student 需含 { name, name_english, account, department, evaluations: [...] }
export default function EvalDetailModal({ student, onDelete, onClose }) {
  const [busyId, setBusyId] = useState(null)
  const decInfo = (v) => DECISIONS.find((d) => d.v === v) || DECISIONS.find((d) => d.v === 'pending')
  const evs = [...(student.evaluations || [])].sort(
    (a, b) => String(b.eval_date || '').localeCompare(String(a.eval_date || '')),
  )
  const handleDelete = async (e) => {
    if (!onDelete) return
    const who = e.evaluator_name || '（未填老師）'
    if (!window.confirm(`確定刪除「${who}」於 ${e.eval_date || ''} 的這筆評分？\n刪除後該生可重新評分，此動作無法復原。`)) return
    setBusyId(e.id)
    try { await onDelete(e) } finally { setBusyId(null) }
  }
  return (
    <Modal title={`${student.name} 的評分紀錄`} onClose={onClose} width={560}>
      <div style={{ fontSize: 13, color: '#666', marginBottom: 14 }}>
        {student.name_english} · {student.account} · {student.department}
      </div>
      {evs.length === 0 && (
        <div style={{ color: '#aaa', fontSize: 13, textAlign: 'center', padding: 20 }}>尚無評分紀錄</div>
      )}
      {evs.map((e, idx) => {
        const info = decInfo(e.recommendation)
        const sc = e.scores || {}
        const cqs = Array.isArray(e.custom_questions) ? e.custom_questions : []
        return (
          <div key={e.id || idx} style={{ border: '1px solid #e8e7e3', borderRadius: 10, padding: '12px 14px', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              <b style={{ fontSize: 14 }}>{e.evaluator_name || '（未填老師）'}</b>
              {e.translator_name ? <span style={{ fontSize: 12, color: '#15803d' }}>翻譯：{e.translator_name}</span> : null}
              <span style={{ fontSize: 12, color: '#888' }}>{e.eval_date || ''}</span>
              <Pill color={info.color} bg={info.bg}>{info.label}</Pill>
              <span style={{ marginLeft: 'auto', fontSize: 13 }}>
                總分 <b style={{ fontSize: 16 }}>{e.total_score ?? '—'}</b> / 40
              </span>
              {onDelete && (
                <Btn onClick={() => handleDelete(e)} disabled={busyId === e.id}
                  style={{ background: '#fee2e2', borderColor: '#fecaca', color: '#b91c1c', padding: '4px 10px', fontSize: 12 }}>
                  {busyId === e.id ? '刪除中…' : '🗑 刪除此筆'}
                </Btn>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 16px', fontSize: 13 }}>
              {SCORE_ITEMS.map((it) => (
                <div key={it.key} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                  <span style={{ color: '#666' }}>{it.label}</span>
                  <span style={{ fontWeight: 600 }}>{sc[it.key] ?? 0}</span>
                </div>
              ))}
            </div>
            {e.teacher_note && (
              <div style={{ marginTop: 10, fontSize: 13, color: '#555', background: '#faf9f6', borderRadius: 6, padding: '8px 10px', whiteSpace: 'pre-wrap' }}>
                備註：{e.teacher_note}
              </div>
            )}
            {cqs.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>自訂題目</div>
                {cqs.map((c, i) => (
                  <div key={i} style={{ padding: '4px 0', borderTop: i ? '1px solid #f5f4f0' : 'none', fontSize: 13 }}>
                    <div style={{ fontWeight: 500 }}>{i + 1}. {c.question}</div>
                    {c.note && <div style={{ color: '#666', marginTop: 2 }}>{c.note}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </Modal>
  )
}
