import { useState, useRef, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { Modal, Btn, s } from './UI'

const norm = (k) => String(k ?? '').replace(/\s+/g, '').replace(/\n/g, '').toLowerCase()

// 偵測「帳號」欄的關鍵字
const ACCOUNT_KEYS = ['編號', '帳號', '報名帳號', 'account']
// 偵測「面試日期」欄的關鍵字
const DATE_KEYS = ['面試時間', '面试时间', '面試日期', '面试日期', '日期', '時間', 'date', 'interviewdate']

function findCol(headers, keys) {
  for (let i = 0; i < headers.length; i++) {
    const h = norm(headers[i])
    if (keys.some(k => h.includes(norm(k)))) return i
  }
  return -1
}

// 日期正規化：支援多種格式 → 'YYYY-MM-DD' 或 null
function normalizeDate(val) {
  if (val == null || val === '') return null
  // Excel 數字型日期（SheetJS raw:false 已轉字串，但 raw:true 會是數字）
  if (typeof val === 'number') {
    const d = XLSX.SSF.parse_date_code(val)
    if (d) return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`
    return null
  }
  const s = String(val).trim()
  // 'YYYY-MM-DD ...' or 'YYYY-MM-DD'
  const m1 = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m1) return `${m1[1]}-${m1[2]}-${m1[3]}`
  // 'YYYY/MM/DD'
  const m2 = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/)
  if (m2) return `${m2[1]}-${String(m2[2]).padStart(2,'0')}-${String(m2[3]).padStart(2,'0')}`
  // 'YYYY/MMDD' (如 2026/0621)
  const m3 = s.match(/^(\d{4})\/(\d{2})(\d{2})$/)
  if (m3) return `${m3[1]}-${m3[2]}-${m3[3]}`
  return null
}

function parseFile(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: 'array', raw: false })
  let rows = []
  let parseError = ''

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName]
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false })

    // 找表頭列（前15列找最可能的）
    let headerIdx = -1
    let bestScore = 0
    for (let i = 0; i < Math.min(aoa.length, 15); i++) {
      const cells = (aoa[i] || []).map(String)
      const hasAccount = findCol(cells, ACCOUNT_KEYS) >= 0
      const hasDate = findCol(cells, DATE_KEYS) >= 0
      const score = (hasAccount ? 2 : 0) + (hasDate ? 2 : 0)
      if (score > bestScore) { bestScore = score; headerIdx = i }
    }
    if (headerIdx < 0 || bestScore < 2) continue

    const headers = (aoa[headerIdx] || []).map(String)
    const acctCol = findCol(headers, ACCOUNT_KEYS)
    const dateCol = findCol(headers, DATE_KEYS)
    if (acctCol < 0 || dateCol < 0) continue

    for (const row of aoa.slice(headerIdx + 1)) {
      if (!row.some(c => String(c).trim())) continue
      const account = String(row[acctCol] ?? '').trim()
      const rawDate = row[dateCol]
      if (!account) continue
      rows.push({ account, rawDate, date: normalizeDate(rawDate) })
    }
  }

  return { rows, parseError }
}

export default function InterviewDateModal({ groups, onApply, onClose }) {
  const [fileName, setFileName] = useState('')
  const [parsed, setParsed] = useState(null)  // { rows, parseError }
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const fileRef = useRef()

  // 用帳號建立 groups 的快速查找
  const groupByAccount = useMemo(() => {
    const m = new Map()
    for (const g of groups) if (g.account) m.set(String(g.account).trim(), g)
    return m
  }, [groups])

  // 解析結果分類
  const analysis = useMemo(() => {
    if (!parsed) return null
    const matched = []      // { account, date, group }
    const unmatched = []    // { account, date } — DB 查無此人
    const badDate = []      // { account, rawDate } — 日期無法解析
    const noDate = []       // { account } — 日期欄空白
    const seenAccounts = new Set()

    for (const row of parsed.rows) {
      if (seenAccounts.has(row.account)) continue
      seenAccounts.add(row.account)

      if (!row.rawDate && row.rawDate !== 0) {
        noDate.push(row)
        continue
      }
      if (!row.date) {
        badDate.push(row)
        continue
      }
      const g = groupByAccount.get(row.account)
      if (g) matched.push({ ...row, group: g })
      else unmatched.push(row)
    }

    // 按日期統計
    const byDate = {}
    for (const m of matched) {
      byDate[m.date] = (byDate[m.date] || 0) + 1
    }

    // 已有日期將被覆蓋的人
    const willOverwrite = matched.filter(m => m.group.interview_date && m.group.interview_date !== m.date)

    return { matched, unmatched, badDate, noDate, byDate, willOverwrite }
  }, [parsed, groupByAccount])

  const handleFile = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setFileName(file.name); setError(''); setParsed(null)
    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const result = parseFile(evt.target.result)
        if (!result.rows.length) {
          setError('找不到可辨識的欄位。需要同時包含「帳號/編號」欄和「面試日期/面试时间」欄。')
          return
        }
        setParsed(result)
      } catch (err) {
        setError('讀取失敗：' + err.message)
      }
    }
    reader.readAsArrayBuffer(file)
  }

  const handleConfirm = async () => {
    if (!analysis || !analysis.matched.length) return
    setBusy(true); setError('')
    try {
      // 按日期分組，每組一次 API 請求
      const byDate = {}
      for (const m of analysis.matched) {
        if (!byDate[m.date]) byDate[m.date] = []
        byDate[m.date].push(m.group)
      }
      let totalUpdated = 0
      for (const [date, gs] of Object.entries(byDate)) {
        const ids = gs.flatMap(g => g.ids)
        await onApply(ids, date)
        totalUpdated += gs.length
      }
      onClose(totalUpdated)
    } catch (err) {
      setError('套用失敗：' + err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="📅 上傳 Excel 批次指派面試日期" onClose={onClose} width={780}>
      {/* 上傳區 */}
      <div
        style={{ border: '2px dashed #ddd', borderRadius: 10, padding: 24, textAlign: 'center',
          background: '#fafaf8', cursor: 'pointer', marginBottom: 14 }}
        onClick={() => fileRef.current.click()}
      >
        <input ref={fileRef} type="file" accept=".xls,.xlsx,.csv" style={{ display: 'none' }} onChange={handleFile} />
        <div style={{ fontSize: 28, marginBottom: 6 }}>📋</div>
        <div style={{ fontSize: 14, color: '#555' }}>{fileName || '點此選擇包含「帳號/編號」與「面試日期」欄位的 Excel 檔（.xls / .xlsx）'}</div>
        <div style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>支援多個工作表，自動偵測欄位，同帳號重複列自動略過</div>
      </div>

      {error && <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 12 }}>{error}</div>}

      {analysis && (
        <>
          {/* 摘要統計 */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 14, fontSize: 13, flexWrap: 'wrap' }}>
            <span style={{ color: '#16a34a', fontWeight: 700 }}>✓ 比中 {analysis.matched.length} 人</span>
            {analysis.unmatched.length > 0 && <span style={{ color: '#dc2626', fontWeight: 700 }}>✗ 系統查無 {analysis.unmatched.length} 人</span>}
            {analysis.badDate.length > 0 && <span style={{ color: '#d97706', fontWeight: 700 }}>⚠ 日期無法辨識 {analysis.badDate.length} 筆</span>}
            {analysis.noDate.length > 0 && <span style={{ color: '#9ca3af' }}>— 無日期略過 {analysis.noDate.length} 人</span>}
          </div>

          {/* 日期分佈 */}
          {Object.keys(analysis.byDate).length > 0 && (
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8,
              padding: '10px 14px', marginBottom: 12, fontSize: 13 }}>
              <div style={{ fontWeight: 600, color: '#15803d', marginBottom: 6 }}>各日期人數分佈</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 20px' }}>
                {Object.entries(analysis.byDate).sort().map(([d, cnt]) => (
                  <span key={d}>{d}：<strong>{cnt}</strong> 人</span>
                ))}
              </div>
            </div>
          )}

          {/* 覆蓋警告 */}
          {analysis.willOverwrite.length > 0 && (
            <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8,
              padding: '8px 12px', marginBottom: 12, fontSize: 12, color: '#92400e' }}>
              ⚠ 其中 <strong>{analysis.willOverwrite.length} 人</strong>原本已有面試日期，確認後將改為新日期：
              {analysis.willOverwrite.slice(0, 6).map(m =>
                ` ${m.group.rep?.name || m.account}（${m.group.interview_date} → ${m.date}）`
              ).join('、')}
              {analysis.willOverwrite.length > 6 && ` …等 ${analysis.willOverwrite.length} 人`}
            </div>
          )}

          {/* 日期格式異常警告 */}
          {analysis.badDate.length > 0 && (
            <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8,
              padding: '8px 12px', marginBottom: 12, fontSize: 12, color: '#c2410c' }}>
              ⚠ 以下 {analysis.badDate.length} 筆日期格式無法辨識，將略過不套用：
              {analysis.badDate.map(r => ` ${r.account}（${r.rawDate}）`).join('、')}
            </div>
          )}

          {/* 未比中清單 */}
          {analysis.unmatched.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: '#dc2626', fontWeight: 600, marginBottom: 4 }}>系統查無以下帳號（不影響套用）：</div>
              <div style={{ maxHeight: 80, overflowY: 'auto', border: '1px solid #fee2e2',
                borderRadius: 6, padding: '4px 8px', fontSize: 12, color: '#b91c1c' }}>
                {analysis.unmatched.map((u, i) => <span key={i} style={{ marginRight: 10 }}>{u.account}</span>)}
              </div>
            </div>
          )}
        </>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
        <Btn onClick={() => onClose(0)}>取消</Btn>
        <Btn
          variant="primary"
          onClick={handleConfirm}
          disabled={!analysis || !analysis.matched.length || busy}
        >
          {busy ? '套用中…' : analysis?.matched.length
            ? `確認套用（${analysis.matched.length} 人）`
            : '請先上傳檔案'}
        </Btn>
      </div>
    </Modal>
  )
}
