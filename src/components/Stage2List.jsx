import { Btn, Pill } from './UI'
import { DECISIONS, batchOf } from '../constants'

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

// 書面資料狀態（三態，依梯次）：有連結→可點；二梯無連結→未上傳(橘)；其餘→非線上(灰，避免誤判未繳交)
function MaterialsCell({ stu }) {
  if (stu.materials_url) return (
    <a href={stu.materials_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
      style={{ display: 'inline-flex', alignItems: 'center', padding: '4px 9px', borderRadius: 6, fontSize: 12, fontWeight: 600, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', textDecoration: 'none' }}
    >📎 資料</a>
  )
  if (batchOf(stu.account) === 2) return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '4px 9px', borderRadius: 6, fontSize: 12, fontWeight: 600, background: '#fef3c7', color: '#b45309' }}>⚠ 未上傳</span>
  )
  return <span style={{ fontSize: 12, color: '#cbd5e1' }} title="第一梯次非線上繳交">非線上</span>
}

// 多筆評分取 eval_date 最新的一筆（多老師、多輪）
const latestEval = (evs) =>
  (evs || []).reduce((latest, e) =>
    !latest || String(e.eval_date || '') >= String(latest.eval_date || '') ? e : latest, null)

// 報到狀態小膠囊（依本系 checkinMap[account] 顯示）
function CheckinPill({ info }) {
  if (info === undefined) return <span style={{ color: '#ccc' }}>—</span>   // 未傳 checkinMap
  let st = { bg: '#f3f4f6', color: '#9ca3af', text: '⚪ 未報到' }
  if (info) {
    if (info.deptStatus === 'sent') st = { bg: '#dbeafe', color: '#1e40af', text: '🔵 面試中' }
    else if (info.deptStatus === 'going') st = { bg: '#fef3c7', color: '#b45309', text: '🟡 前往中（請準備）' }
    else if (info.deptStatus === 'done') st = { bg: '#dcfce7', color: '#15803d', text: '✅ 已完成' }
    else if (info.deptStatus === 'abandoned') st = { bg: '#fafafa', color: '#9ca3af', text: '🚫 放棄面試' }
    else if (info.arrived) st = { bg: '#ecfdf5', color: '#15803d', text: '🟢 已報到' }
  }
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 6,
      fontSize: 12, fontWeight: (info?.deptStatus === 'sent' || info?.deptStatus === 'going') ? 700 : 600,
      background: st.bg, color: st.color,
    }}>{st.text}</span>
  )
}

// 第二階段名單（presentational）
// showEvalSummary=true：已評分區，顯示最新建議 badge、已評次數，按鈕為「再次評分」
// checkinMap：account → { arrived, deptStatus }（待評分區才用，不傳則顯示「—」）
// onMarkInterview / onCancelInterview / markingAccount：老師標記「面試中」（選填，不傳則維持原樣）
export default function Stage2List({ students, onOpen, onView = () => {}, loading, showEvalSummary = false, checkinMap, onMarkInterview, onCancelInterview, markingAccount, abandoned = false }) {
  const th = { padding: '9px 10px', textAlign: 'left', borderBottom: '1px solid #e8e7e3', color: '#666', fontWeight: 500, fontSize: 12 }
  const td = { padding: '8px 10px', borderBottom: '1px solid #f5f4f0', fontSize: 13 }
  const headers = showEvalSummary
    ? ['中文姓名', '英文姓名', '帳號', '志願', '評分結果', '']
    : ['中文姓名', '英文姓名', '帳號', '志願', '國籍', '性別', '報到', '二階面試日', '']

  // 待評分區（有 checkinMap 時）依報到動態排序：🔵面試中 → 🟡前往中 → 🟢已報到 → 其他
  const ckRank = (stu) => {
    const i = checkinMap?.[stu.account]
    if (!i) return 3
    if (i.deptStatus === 'sent') return 0
    if (i.deptStatus === 'going') return 1
    if (i.arrived) return 2
    return 3
  }
  const list = checkinMap ? [...students].sort((a, b) => ckRank(a) - ckRank(b)) : students

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#faf9f6' }}>
            {headers.map((h, i) => <th key={i} style={th}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {list.map((stu) => {
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
                    <td style={td}><CheckinPill info={checkinMap ? (checkinMap[stu.account] || null) : undefined} /></td>
                    <td style={{ ...td, color: '#1e40af' }}>{stu.stage2_date || '—'}</td>
                  </>
                )}
                <td style={td}>
                  {showEvalSummary ? (
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <MaterialsCell stu={stu} />
                      <Btn onClick={() => onView(stu)}>查看</Btn>
                      <Btn variant="primary" onClick={() => onOpen(stu)}>再次評分 →</Btn>
                    </div>
                  ) : abandoned ? (
                    <span style={{ fontSize: 12, color: '#9ca3af', fontWeight: 600 }}>🚫 已放棄，無需評分</span>
                  ) : (
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <MaterialsCell stu={stu} />
                      {onMarkInterview && (() => {
                        const ds = checkinMap?.[stu.account]?.deptStatus
                        const busy = markingAccount === stu.account
                        if (ds === 'done') return null
                        if (ds === 'sent') return <Btn disabled={busy} onClick={() => onCancelInterview(stu)}>↩ 取消面試中</Btn>
                        return <Btn variant="blue" disabled={busy} onClick={() => onMarkInterview(stu)}>🎤 開始面試</Btn>
                      })()}
                      <Btn variant="primary" onClick={() => onOpen(stu)}>評分 →</Btn>
                    </div>
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
