import { Btn, Pill, s } from './UI'
import { DECISIONS_STAGE1 } from '../constants'

const recInfo = (v) => DECISIONS_STAGE1.find((d) => d.v === v) || DECISIONS_STAGE1.find((d) => d.v === 'pending')
// 是否已評分：簽到只寫 appeared/note，評分才會寫入 scores（6 個項目）
const isScored = (rec) => !!rec && !!rec.scores && Object.keys(rec.scores).length > 0

// 第一階段每日簽到 + 評分名單（presentational）
// records：{ [application_id]: stage1_record }，onScore(stu)：開啟評分表
export default function Stage1List({ students, draft, onChange, onSaveRow, savingId, loading, records = {}, onScore }) {
  const th = { padding: '9px 10px', textAlign: 'left', borderBottom: '1px solid #e8e7e3', color: '#666', fontWeight: 500, fontSize: 12, whiteSpace: 'nowrap' }
  const td = { padding: '8px 10px', borderBottom: '1px solid #f5f4f0', fontSize: 13, verticalAlign: 'middle' }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
        <thead>
          <tr style={{ background: '#faf9f6' }}>
            {['姓名', '系所', '志願', '國籍', '中心', '出席', '備註', '評分狀態', ''].map((h, i) => (
              <th key={i} style={th}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {students.map((stu) => {
            const d = draft[stu.id] || {}
            const rec = records[stu.id]
            const scored = isScored(rec)
            return (
              <tr key={stu.id}>
                <td style={td}>
                  <div style={{ fontWeight: 500 }}>{stu.name}</div>
                  <div style={{ fontSize: 11, color: '#999' }}>{stu.name_english}</div>
                </td>
                <td style={{ ...td, color: '#777', maxWidth: 160 }}>{stu.department}</td>
                <td style={td}>{stu.preference_order ?? '—'}</td>
                <td style={td}>{stu.nationality}</td>
                <td style={{ ...td, color: stu.center ? '#1e40af' : '#ccc' }}>{stu.center || '—'}</td>
                <td style={td}>
                  <button
                    onClick={() => onChange(stu.id, { appeared: !d.appeared })}
                    style={{
                      ...s.btn, ...s.btnSm,
                      background: d.appeared ? '#dcfce7' : 'white',
                      color: d.appeared ? '#15803d' : '#888',
                      borderColor: d.appeared ? '#86efac' : '#ddd',
                    }}
                  >
                    {d.appeared ? '✓ 已到' : '✗ 未到'}
                  </button>
                </td>
                <td style={td}>
                  <input
                    style={{ ...s.input, marginBottom: 0, width: 150, padding: '6px 8px' }}
                    placeholder="備註"
                    value={d.note || ''}
                    onChange={(e) => onChange(stu.id, { note: e.target.value })}
                  />
                </td>
                <td style={td}>
                  {!rec ? (
                    <span style={{ fontSize: 12, color: '#ccc' }}>先儲存簽到</span>
                  ) : scored ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {(() => { const r = recInfo(rec.recommendation); return <Pill color={r.color} bg={r.bg}>{r.label}</Pill> })()}
                      <span style={{ fontSize: 11, color: '#aaa' }}>{rec.total_score ?? 0} 分</span>
                      <button onClick={() => onScore(stu)} style={{ ...s.btn, ...s.btnSm }}>重新評分</button>
                    </div>
                  ) : rec.appeared ? (
                    <button onClick={() => onScore(stu)}
                      style={{ ...s.btn, ...s.btnSm, background: '#dbeafe', borderColor: '#93c5fd', color: '#1e40af' }}>評分 →</button>
                  ) : (
                    <span style={{ fontSize: 12, color: '#ccc' }}>未到，免評分</span>
                  )}
                </td>
                <td style={td}>
                  <Btn variant="primary" disabled={savingId === stu.id} onClick={() => onSaveRow(stu)}>
                    {savingId === stu.id ? '…' : '儲存簽到'}
                  </Btn>
                </td>
              </tr>
            )
          })}
          {!students.length && (
            <tr><td colSpan={9} style={{ ...td, textAlign: 'center', color: '#aaa', padding: 32 }}>
              {loading ? '載入中…' : '此日期沒有應試學生'}
            </td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
