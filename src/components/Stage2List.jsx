import { Btn } from './UI'

// 第二階段待評分名單（presentational）
export default function Stage2List({ students, onOpen, loading }) {
  const th = { padding: '9px 10px', textAlign: 'left', borderBottom: '1px solid #e8e7e3', color: '#666', fontWeight: 500, fontSize: 12 }
  const td = { padding: '8px 10px', borderBottom: '1px solid #f5f4f0', fontSize: 13 }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#faf9f6' }}>
            {['中文姓名', '英文姓名', '國籍', '性別', '一階通過日', ''].map((h, i) => (
              <th key={i} style={th}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {students.map((stu) => (
            <tr key={stu.id}>
              <td style={{ ...td, fontWeight: 500 }}>{stu.name}</td>
              <td style={{ ...td, color: '#777' }}>{stu.name_english}</td>
              <td style={td}>{stu.nationality}</td>
              <td style={td}>{stu.gender}</td>
              <td style={{ ...td, color: '#15803d' }}>{stu.stage1_passed_date || '—'}</td>
              <td style={td}>
                <Btn variant="primary" onClick={() => onOpen(stu)}>評分 →</Btn>
              </td>
            </tr>
          ))}
          {!students.length && (
            <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: '#aaa', padding: 32 }}>
              {loading ? '載入中…' : '目前沒有待評分的學生（需先通過第一階段）'}
            </td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
