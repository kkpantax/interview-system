import { useMemo } from 'react'
import { Card } from './UI'
import { computeStage4Summary } from '../stage4Stats'

const ACCENT = '#7c2d12'

// 各系即時就讀確認統計表（純呈現；資料由 Stage4App 以 30 秒輪詢更新後傳入）
export default function Stage4SummaryTable({ data, quotas, overrides, updatedAt }) {
  const { list, totals } = useMemo(
    () => computeStage4Summary(data || [], quotas || {}, overrides || {}),
    [data, quotas, overrides],
  )

  const th = { padding: '8px 10px', textAlign: 'center', borderBottom: '1px solid #e8e7e3', color: '#777', fontWeight: 600, fontSize: 11.5, whiteSpace: 'nowrap' }
  const thL = { ...th, textAlign: 'left' }
  const td = { padding: '7px 10px', textAlign: 'center', borderBottom: '1px solid #f5f4f0', fontSize: 13 }
  const tdL = { ...td, textAlign: 'left' }
  const num = (v, color) => <span style={{ color: v ? color : '#ccc', fontWeight: v ? 600 : 400 }}>{v}</span>

  // 出缺：>0 紅底提示（還缺人），=0 綠字（補滿），null（未設名額）灰
  const vacancyCell = (v) => {
    if (v == null) return <span style={{ color: '#ccc' }}>—</span>
    if (v === 0) return <span style={{ color: '#15803d', fontWeight: 600 }}>0</span>
    return <span style={{ display: 'inline-block', minWidth: 22, padding: '1px 7px', borderRadius: 99, background: '#fee2e2', color: '#b91c1c', fontWeight: 700 }}>{v}</span>
  }

  let lastCampus = null

  return (
    <Card style={{ marginBottom: 16 }}>
      <div style={{ padding: '12px 18px', borderBottom: '1px solid #f0efeb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>各系就讀確認即時統計</span>
        <span style={{ fontSize: 11.5, color: '#aaa' }}>
          每 30 秒自動更新{updatedAt ? ` · 更新於 ${updatedAt}` : ''}
        </span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
          <thead>
            <tr style={{ background: '#faf9f6' }}>
              <th style={thL}>系所</th>
              <th style={th}>名額</th>
              <th style={th}>正取</th>
              <th style={th}>備取</th>
              <th style={th}>等待回應</th>
              <th style={th}>候補詢問</th>
              <th style={th}>確定就讀</th>
              <th style={th}>拒絕</th>
              <th style={th}>出缺</th>
            </tr>
          </thead>
          <tbody>
            {list.map((d) => {
              const showCampus = d.campus !== lastCampus
              lastCampus = d.campus
              return (
                <tr key={d.department}>
                  <td style={tdL}>
                    {showCampus && <div style={{ fontSize: 10.5, color: ACCENT, fontWeight: 700, letterSpacing: '.04em' }}>{d.campus}</div>}
                    <span>{d.department}</span>
                  </td>
                  <td style={td}>{d.quota == null ? <span style={{ color: '#ccc' }}>—</span> : d.quota}</td>
                  <td style={td}>{num(d.admitted, '#1a1a18')}</td>
                  <td style={td}>{num(d.waitlisted, '#6b7280')}</td>
                  <td style={td}>{num(d.pending, '#b45309')}</td>
                  <td style={td}>{num(d.negotiating, '#1e40af')}</td>
                  <td style={td}>{num(d.enrolled, '#15803d')}</td>
                  <td style={td}>{num(d.declined, '#dc2626')}</td>
                  <td style={td}>{vacancyCell(d.vacancy)}</td>
                </tr>
              )
            })}
            {!list.length && (
              <tr><td colSpan={9} style={{ ...td, color: '#aaa', padding: 24 }}>尚無資料</td></tr>
            )}
          </tbody>
          {list.length > 0 && (
            <tfoot>
              <tr style={{ background: '#faf9f6', fontWeight: 700 }}>
                <td style={{ ...tdL, fontWeight: 700 }}>合計</td>
                <td style={td}>{totals.quotaSet ? totals.quota : '—'}</td>
                <td style={td}>{totals.admitted}</td>
                <td style={td}>{totals.waitlisted}</td>
                <td style={{ ...td, color: '#b45309' }}>{totals.pending}</td>
                <td style={{ ...td, color: '#1e40af' }}>{totals.negotiating}</td>
                <td style={{ ...td, color: '#15803d' }}>{totals.enrolled}</td>
                <td style={{ ...td, color: '#dc2626' }}>{totals.declined}</td>
                <td style={td}>{totals.quotaSet ? totals.vacancy : '—'}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </Card>
  )
}
