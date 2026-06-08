import { Btn, Pill } from './UI'
import { DECISIONS } from '../constants'

const decInfo = (v) => DECISIONS.find((d) => d.v === v) || DECISIONS.find((d) => d.v === 'pending')

// 志願序小標籤（第一志願綠底凸顯），待評分／已評分名單共用
function PrefPill({ order }) {
  if (!order) return '—'
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 6,
      fontSize: 12, fontWeight: 600,
      background: order === 1 ? '#dcfce7' : '#f1f5f9',
      color: order === 1 ? '#15803d' : '#475569',
    }}>第 {order} 志願</span>
  )
}

// 多筆評分取 eval_date 最新的一筆（多老師、多輪）
const latestEval = (evs) =>
  (evs || []).reduce((latest, e) =>
    !latest || String(e.eval_date || '') >= String(latest.eval_date || '') ? e : latest, null)

// 第二階段名單（presentational）
// showEvalSummary=true：已評分區，顯示最新建議 badge、已評次數，按鈕為「再次評分」
export default function Stage2List({ students, onOpen, onView = () => {}, loading, showEvalSummary = false }) {
  const th = { padding: '9px 10px', textAlign: 'left', borderBottom: '1px solid #e8e7e3', color: '#666', fontWeight: 500, fontSize: 12 }
  const td = { padding: '8px 10px', borderBottom: '1px solid #f5f4f0', fontSize: 13 }
  const headers = showEvalSummary
    ? ['中文姓名', '英文姓名', '帳號', '志願', '評分結果', '']
    : ['中文姓名', '英文姓名', '帳號', '志願', '國籍', '性別', '一階通過日', '']

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#faf9f6' }}>
            {headers.map((h, i) => <th key={i} style={th}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {students.map((stu) => {
            const last = showEvalSummary ? latestEval(stu.evaluations) : null
            const info = last ? decInfo(last.recommendation) : null
            return (
              <tr key={stu.id}>
                <td style={{ ...td, fontWeight: 500 }}>{stu.name}</td>
                <td style={{ ...td, color: '#777' }}>{stu.name_english}</td>
                {showEvalSummary ? (
                  <>
                    <td style={{ ...td, color: '#999', fontSize: 12 }}>{stu.account}</td>
                    <td style={td}><PrefPill order={stu.preference_order} /></td>
                    <td style={td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {info && <Pill color={info.color} bg={info.bg}>{info.label}</Pill>}
                        <span style={{ fontSize: 11, color: '#aaa' }}>已評 {stu.evaluations.length} 次</span>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td style={{ ...td, color: '#999', fontSize: 12 }}>{stu.account}</td>
                    <td style={td}><PrefPill order={stu.preference_order} /></td>
                    <td style={td}>{stu.nationality}</td>
                    <td style={td}>{stu.gender}</td>
                    <td style={{ ...td, color: '#15803d' }}>{stu.stage1_passed_date || '—'}</td>
                  </>
                )}
                <td style={td}>
                  {showEvalSummary ? (
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <Btn onClick={() => onView(stu)}>查看</Btn>
                      <Btn variant="primary" onClick={() => onOpen(stu)}>再次評分 →</Btn>
                    </div>
                  ) : (
                    <Btn variant="primary" onClick={() => onOpen(stu)}>評分 →</Btn>
                  )}
                </td>
              </tr>
            )
          })}
          {!students.length && (
            <tr><td colSpan={headers.length} style={{ ...td, textAlign: 'center', color: '#aaa', padding: 32 }}>
              {loading ? '載入中…' : (showEvalSummary ? '尚無已評分的學生' : '目前沒有待評分的學生')}
            </td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
