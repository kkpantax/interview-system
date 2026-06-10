import { useState } from 'react'
import { Modal, Pill, Btn } from './UI'
import { SCORE_ITEMS_STAGE1, DECISIONS_STAGE1 } from '../constants'

const MAX = SCORE_ITEMS_STAGE1.length * 5
const recInfo = (v) => DECISIONS_STAGE1.find((d) => d.v === v) || DECISIONS_STAGE1.find((d) => d.v === 'pending')

// 唯讀檢視某位學生的第一階段評分（可能有多位老師各一筆）。
// recs：stage1_records 陣列；student：{ name, name_english, account }
// onDelete（選填）：傳入時每筆顯示「刪除此筆」按鈕（行政確認頁用）；不傳則純唯讀。
export default function Stage1EvalDetailModal({ student, recs = [], onDelete, onClose }) {
  const [busyId, setBusyId] = useState(null)
  const scored = [...recs]
    .filter((r) => r && r.scores && Object.keys(r.scores).length > 0)
    .sort((a, b) => String(b.record_date || '').localeCompare(String(a.record_date || '')))

  const handleDelete = async (r) => {
    if (!onDelete) return
    const who = r.teacher_name || '（未填老師）'
    if (!window.confirm(`確定刪除「${who}」於 ${r.record_date || ''} 的這筆評分？\n刪除後平均分會重新計算，此動作無法復原。`)) return
    setBusyId(r.id)
    try { await onDelete(r) } finally { setBusyId(null) }
  }

  return (
    <Modal title={`${student?.name || ''} 的實體面試評分`} onClose={onClose} width={560}>
      <div style={{ fontSize: 13, color: '#666', marginBottom: 14 }}>
        {student?.name_english} · {student?.account}
      </div>
      {scored.length === 0 && (
        <div style={{ color: '#aaa', fontSize: 13, textAlign: 'center', padding: 20 }}>尚無評分紀錄（僅有簽到或未評分）</div>
      )}
      {scored.map((r, idx) => {
        const info = recInfo(r.recommendation)
        const sc = r.scores || {}
        const cqs = Array.isArray(r.custom_questions) ? r.custom_questions : []
        return (
          <div key={r.id || idx} style={{ border: '1px solid #e8e7e3', borderRadius: 10, padding: '12px 14px', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              <b style={{ fontSize: 14 }}>{r.teacher_name || '（未填老師）'}</b>
              <span style={{ fontSize: 12, color: '#888' }}>{r.record_date || ''}</span>
              <Pill color={info.color} bg={info.bg}>{info.label}</Pill>
              <span style={{ marginLeft: 'auto', fontSize: 13 }}>
                總分 <b style={{ fontSize: 16 }}>{r.total_score ?? '—'}</b> / {MAX}
              </span>
              {onDelete && (
                <Btn
                  onClick={() => handleDelete(r)}
                  disabled={busyId === r.id}
                  style={{ background: '#fee2e2', borderColor: '#fecaca', color: '#b91c1c', padding: '4px 10px', fontSize: 12 }}
                >
                  {busyId === r.id ? '刪除中…' : '🗑 刪除此筆'}
                </Btn>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 16px', fontSize: 13 }}>
              {SCORE_ITEMS_STAGE1.map((it) => (
                <div key={it.key} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                  <span style={{ color: '#666' }}>{it.label}</span>
                  <span style={{ fontWeight: 600 }}>{sc[it.key] ?? 0}</span>
                </div>
              ))}
            </div>
            {r.teacher_note && (
              <div style={{ marginTop: 10, fontSize: 13, color: '#555', background: '#faf9f6', borderRadius: 6, padding: '8px 10px', whiteSpace: 'pre-wrap' }}>
                備註：{r.teacher_note}
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
