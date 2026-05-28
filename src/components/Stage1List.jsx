import { Btn, s } from './UI'
import { CENTERS } from '../constants'

// 第一階段每日簽到名單（presentational）
export default function Stage1List({ students, draft, onChange, onSaveRow, savingId, loading }) {
  const th = { padding: '9px 10px', textAlign: 'left', borderBottom: '1px solid #e8e7e3', color: '#666', fontWeight: 500, fontSize: 12, whiteSpace: 'nowrap' }
  const td = { padding: '8px 10px', borderBottom: '1px solid #f5f4f0', fontSize: 13, verticalAlign: 'middle' }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
        <thead>
          <tr style={{ background: '#faf9f6' }}>
            {['姓名', '系所', '志願', '國籍', '出席', '中心', '備註', ''].map((h, i) => (
              <th key={i} style={th}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {students.map((stu) => {
            const d = draft[stu.id] || {}
            return (
              <tr key={stu.id}>
                <td style={td}>
                  <div style={{ fontWeight: 500 }}>{stu.name}</div>
                  <div style={{ fontSize: 11, color: '#999' }}>{stu.name_english}</div>
                </td>
                <td style={{ ...td, color: '#777', maxWidth: 160 }}>{stu.department}</td>
                <td style={td}>{stu.preference_order ?? '—'}</td>
                <td style={td}>{stu.nationality}</td>
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
                  <select
                    style={{ ...s.sel, padding: '5px 8px' }}
                    value={d.center || ''}
                    onChange={(e) => onChange(stu.id, { center: e.target.value })}
                  >
                    <option value="">—</option>
                    {CENTERS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </td>
                <td style={td}>
                  <input
                    style={{ ...s.input, marginBottom: 0, width: 160, padding: '6px 8px' }}
                    placeholder="備註"
                    value={d.note || ''}
                    onChange={(e) => onChange(stu.id, { note: e.target.value })}
                  />
                </td>
                <td style={td}>
                  <Btn variant="primary" disabled={savingId === stu.id} onClick={() => onSaveRow(stu)}>
                    {savingId === stu.id ? '…' : '儲存'}
                  </Btn>
                </td>
              </tr>
            )
          })}
          {!students.length && (
            <tr><td colSpan={8} style={{ ...td, textAlign: 'center', color: '#aaa', padding: 32 }}>
              {loading ? '載入中…' : '此日期沒有應試學生'}
            </td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
