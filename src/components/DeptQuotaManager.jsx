import { useState, useEffect } from 'react'
import { Btn, Card, CardHead, Pill, s } from './UI'
import { getDepartmentQuotas, setDepartmentQuota } from '../api'
import { campusOf } from '../constants'

export default function DeptQuotaManager({ depts = [], showToast }) {
  const [quotas, setQuotas]         = useState({})
  const [loading, setLoading]       = useState(true)
  const [savingDept, setSavingDept] = useState(null)

  const reload = async () => {
    setLoading(true)
    try {
      const q = await getDepartmentQuotas()
      setQuotas(Object.fromEntries(depts.map((d) => [d, q[d] == null ? '' : String(q[d])])))
    } catch (e) {
      showToast('載入失敗：' + e.message, 'error')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { reload() }, [depts.join('|')]) // eslint-disable-line react-hooks/exhaustive-deps

  const setVal = (d, v) => setQuotas((p) => ({ ...p, [d]: v.replace(/[^0-9]/g, '') }))

  const save = async (d) => {
    const n = parseInt(quotas[d], 10)
    if (Number.isNaN(n) || n < 0) { showToast('請輸入有效的人數', 'warn'); return }
    setSavingDept(d)
    try {
      await setDepartmentQuota(d, n)
      showToast(`已設定「${d}」預計錄取 ${n} 人`)
    } catch (e) {
      showToast('儲存失敗：' + e.message, 'error')
    } finally {
      setSavingDept(null)
    }
  }

  const rank = (d) => ({ 台北校區: 0, 高雄校區: 1, 其他: 2 }[campusOf(d)] ?? 2)
  const ordered = [...depts].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, 'zh-Hant'))

  const th = { padding: '9px 10px', textAlign: 'left', borderBottom: '1px solid #e8e7e3', color: '#666', fontWeight: 500, fontSize: 12 }
  const td = { padding: '8px 10px', borderBottom: '1px solid #f5f4f0', fontSize: 13 }

  return (
    <Card>
      <CardHead left="各系預計錄取人數" right={`${depts.length} 系`} />
      <div style={{ padding: '8px 18px 0', fontSize: 12, color: '#888' }}>
        此名額為固定值，會顯示在第二階段「各系評分」選系頁的每張卡片上，供老師與行政人員參考。
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#faf9f6' }}>
              {['校區', '系所', '預計錄取人數', ''].map((h, i) => <th key={i} style={th}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {ordered.map((d) => (
              <tr key={d}>
                <td style={td}><Pill color="#475569" bg="#f1f5f9">{campusOf(d)}</Pill></td>
                <td style={{ ...td, fontWeight: 500 }}>{d}</td>
                <td style={td}>
                  <input
                    style={{ ...s.input, width: 100, marginBottom: 0 }}
                    inputMode="numeric" placeholder="0"
                    value={quotas[d] ?? ''}
                    onChange={(e) => setVal(d, e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') save(d) }}
                  />
                </td>
                <td style={td}>
                  <Btn variant="primary" onClick={() => save(d)} disabled={savingDept === d}>
                    {savingDept === d ? '儲存中…' : '儲存'}
                  </Btn>
                </td>
              </tr>
            ))}
            {(!ordered.length || loading) && (
              <tr><td colSpan={4} style={{ ...td, textAlign: 'center', color: '#aaa', padding: 32 }}>
                {loading ? '載入中…' : '尚無系所資料（需先匯入學生名單）'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
