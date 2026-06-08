import { useState, useEffect } from 'react'
import { Card, CardHead, Pill, s } from './UI'
import { getDepartmentCampuses, setDepartmentCampus } from '../api'
import { CAMPUS_OPTIONS, campusOf, resolveCampus } from '../constants'

// 各系所屬校區設定：行政可逐系指定校區，覆寫關鍵字預設。
// 選系頁（第二階段）依此分組。未設定的系沿用系名關鍵字判斷。
export default function CampusManager({ depts = [], showToast }) {
  const [overrides, setOverrides] = useState({})
  const [loading, setLoading]     = useState(true)
  const [savingDept, setSavingDept] = useState(null)

  const reload = async () => {
    setLoading(true)
    try {
      setOverrides(await getDepartmentCampuses())
    } catch (e) {
      showToast('載入失敗：' + e.message, 'error')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { reload() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (d, campus) => {
    setSavingDept(d)
    try {
      await setDepartmentCampus(d, campus)
      setOverrides((p) => ({ ...p, [d]: campus }))
      showToast(`已將「${d}」設為 ${campus}`)
    } catch (e) {
      showToast('儲存失敗：' + e.message, 'error')
    } finally {
      setSavingDept(null)
    }
  }

  const rank = (d) => ({ 台北校區: 0, 高雄校區: 1, 其他: 2 }[resolveCampus(d, overrides)] ?? 2)
  const ordered = [...depts].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, 'zh-Hant'))

  const th = { padding: '9px 10px', textAlign: 'left', borderBottom: '1px solid #e8e7e3', color: '#666', fontWeight: 500, fontSize: 12 }
  const td = { padding: '8px 10px', borderBottom: '1px solid #f5f4f0', fontSize: 13 }

  return (
    <Card>
      <CardHead left="各系所屬校區" right={`${depts.length} 系`} />
      <div style={{ padding: '8px 18px 0', fontSize: 12, color: '#888', lineHeight: 1.7 }}>
        此設定決定第二階段「各系評分」選系頁的校區分組。系所清單由匯入的學生名單自動產生；
        尚未設定的系會以系名自動判斷（標示「自動」），可在此手動指定覆寫。
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#faf9f6' }}>
              {['目前校區', '系所', '設定校區', ''].map((h, i) => <th key={i} style={th}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {ordered.map((d) => {
              const isAuto = overrides[d] == null
              const current = resolveCampus(d, overrides)
              return (
                <tr key={d}>
                  <td style={td}>
                    <Pill color="#475569" bg="#f1f5f9">{current}</Pill>
                    {isAuto && <span style={{ fontSize: 11, color: '#aaa', marginLeft: 6 }}>自動</span>}
                  </td>
                  <td style={{ ...td, fontWeight: 500 }}>{d}</td>
                  <td style={td}>
                    <select
                      style={{ ...s.input, width: 140, marginBottom: 0, padding: '7px 9px' }}
                      value={overrides[d] ?? ''}
                      disabled={savingDept === d}
                      onChange={(e) => { if (e.target.value) save(d, e.target.value) }}
                    >
                      <option value="">（自動：{campusOf(d)}）</option>
                      {CAMPUS_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </td>
                  <td style={{ ...td, color: '#aaa', fontSize: 12 }}>
                    {savingDept === d ? '儲存中…' : ''}
                  </td>
                </tr>
              )
            })}
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
