import { useState, useRef, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { Modal, Btn, s } from './UI'

// ── 比對核心（純函式，方便單元測試）──────────────────────────────────────────
// 比對前一律正規化：護照／英文姓名去空白轉大寫（大小寫不敏感）；中文姓名去空白。
const up = (v) => String(v ?? '').replace(/\s+/g, '').toUpperCase()
const zh = (v) => String(v ?? '').replace(/\s+/g, '')
// 表頭正規化：去空白與換行、轉小寫，供關鍵字比對
const norm = (k) => String(k).replace(/\s+/g, '').replace(/\n/g, '').toLowerCase()

// 每個目標欄位的關鍵字（含中／英／越南文）。比對時每個表頭取「最長(最精確)」命中者，
// 避免像「英文姓名（依護照, 全大寫）」這種含有「護照」字樣的欄被誤判成護照欄。
const CATS = {
  account:  ['報名帳號', '帳號', 'account'],
  passport: ['護照號碼', 'passport', 'sốhc', 'sốhộchiếu', '護照'],
  enname:   ['英文姓名', 'têntiếnganh', 'englishname', 'name_english', 'enname', '英文'],
  zhname:   ['中文姓名', 'têntiếngtrung', '姓名', '中文'],
}

// 從一列表頭字串，決定每個目標欄位落在第幾欄（同欄位取第一個命中的索引）
function resolveCols(headerCells) {
  const map = { account: -1, passport: -1, enname: -1, zhname: -1 }
  headerCells.forEach((h, idx) => {
    const H = norm(h)
    let bestCat = null
    let bestLen = 0
    for (const [cat, keys] of Object.entries(CATS)) {
      for (const k of keys) {
        const kk = norm(k)
        if (kk && H.includes(kk) && kk.length > bestLen) { bestLen = kk.length; bestCat = cat }
      }
    }
    if (bestCat && map[bestCat] === -1) map[bestCat] = idx
  })
  return map
}
const headerScore = (cells) => Object.values(resolveCols(cells)).filter((v) => v >= 0).length

// 解析單一工作表 → 正規化列 [{account, passport, name_en, name_zh}]。
// 會自動在前 15 列裡找「最像表頭」的那列（容忍最上方的空白列／橫幅標題）。
function parseSheet(ws, XLSXlib) {
  const aoa = XLSXlib.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false })
  let headerIdx = -1
  let best = 0
  for (let i = 0; i < Math.min(aoa.length, 15); i++) {
    const sc = headerScore((aoa[i] || []).map(String))
    if (sc > best) { best = sc; headerIdx = i }
  }
  if (headerIdx < 0) return { rows: [], headers: aoa[0] ? aoa[0].map(String) : [] }
  const cols = resolveCols(aoa[headerIdx].map(String))
  const get = (r, c) => (cols[c] >= 0 ? String(r[cols[c]] ?? '').trim() : '')
  const rows = aoa.slice(headerIdx + 1)
    .filter((r) => r.some((c) => String(c).trim() !== ''))
    .map((r) => ({ account: get(r, 'account'), passport: get(r, 'passport'), name_en: get(r, 'enname'), name_zh: get(r, 'zhname') }))
  return { rows, headers: aoa[headerIdx].map(String) }
}

// 解析整個檔案（跨所有工作表合併）→ { rows, sheetCount, headers }
export function parseCenterFile(arrayBuffer, XLSXlib) {
  const wb = XLSXlib.read(arrayBuffer, { type: 'array' })
  let rows = []
  let headers = []
  for (const sn of wb.SheetNames) {
    const r = parseSheet(wb.Sheets[sn], XLSXlib)
    rows = rows.concat(r.rows)
    if (!headers.length && r.headers.length) headers = r.headers
  }
  return { rows, sheetCount: wb.SheetNames.length, headers }
}

// rows：已正規化的中心名單列（{account, passport, name_en, name_zh}）。groups：主名單分組。
export function matchCenterRows(rows, groups) {
  const byAccount  = new Map()
  const byPassport = new Map()
  const byEnName   = new Map()
  const byZhName   = new Map()
  for (const g of groups) {
    if (g.account)              byAccount.set(up(g.account), g)
    if (g.rep?.passport_number) byPassport.set(up(g.rep.passport_number), g)
    if (g.rep?.name_english)    byEnName.set(up(g.rep.name_english), g)
    if (g.rep?.name)            byZhName.set(zh(g.rep.name), g)
  }

  const matched = []
  const unmatched = []
  const seenKeys = new Set()
  let dupSkipped = 0

  for (const row of rows) {
    const acct = row.account
    const pass = row.passport
    const en   = row.name_en
    const cn   = row.name_zh
    const label = acct || cn || en || pass || '(空白列)'

    let g = null
    let via = ''
    if (acct && byAccount.has(up(acct)))       { g = byAccount.get(up(acct));  via = '帳號' }
    else if (pass && byPassport.has(up(pass))) { g = byPassport.get(up(pass)); via = '護照' }
    else if (en && byEnName.has(up(en)))       { g = byEnName.get(up(en));     via = '英文姓名' }
    else if (cn && byZhName.has(zh(cn)))       { g = byZhName.get(zh(cn));     via = '中文姓名' }

    if (!acct && !pass && !en && !cn) continue

    if (g) {
      if (seenKeys.has(g.key)) { dupSkipped++; continue }
      seenKeys.add(g.key)
      matched.push({ key: g.key, group: g, via, label })
    } else {
      unmatched.push({ row, label })
    }
  }
  return { matched, unmatched, dupSkipped }
}

export default function CenterMatchModal({ centers, groups, onApply, onClose }) {
  const [center, setCenter]     = useState('')
  const [fileName, setFileName] = useState('')
  const [uploaded, setUploaded] = useState([])
  const [sheetNote, setSheetNote] = useState('')
  const [error, setError]       = useState('')
  const [busy, setBusy]         = useState(false)
  const fileRef = useRef()

  const result = useMemo(
    () => (uploaded.length ? matchCenterRows(uploaded, groups) : null),
    [uploaded, groups],
  )

  const handleFile = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setFileName(file.name); setError(''); setUploaded([]); setSheetNote('')
    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const { rows, sheetCount, headers } = parseCenterFile(evt.target.result, XLSX)
        if (!rows.length) {
          const seen = (headers || []).filter(Boolean).slice(0, 12).join('、')
          setError(
            '在這個檔案裡找不到可辨識的欄位（需含「中文姓名 / 英文姓名 / 護照」其中之一）。' +
            (seen ? `\n我看到的欄位有：${seen}` : ''),
          )
          return
        }
        setUploaded(rows)
        setSheetNote(sheetCount > 1 ? `已合併 ${sheetCount} 個工作表、共 ${rows.length} 列` : `共 ${rows.length} 列`)
      } catch (err) {
        setError('讀取失敗：' + err.message)
      }
    }
    reader.readAsArrayBuffer(file)
  }

  const handleConfirm = async () => {
    if (!center) { setError('請先選擇此名單對應的中心'); return }
    if (!result || !result.matched.length) { setError('沒有可套用的比中人員'); return }
    setBusy(true); setError('')
    try {
      const ids = result.matched.flatMap((m) => m.group.ids)
      await onApply(center, ids, result.matched.length)
      onClose()
    } catch (err) {
      setError('套用失敗：' + err.message)
    } finally {
      setBusy(false)
    }
  }

  const conflicts = result
    ? result.matched.filter((m) => m.group.center && m.group.center !== center)
    : []

  return (
    <Modal title="上傳中心名單核對" onClose={onClose} width={760}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: '#555' }}>此名單對應中心：</span>
        <select style={{ ...s.sel, minWidth: 180 }} value={center} onChange={(e) => setCenter(e.target.value)}>
          <option value="">— 請選擇 —</option>
          {centers.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
        </select>
      </div>

      <div
        style={{
          border: '2px dashed #ddd', borderRadius: 10, padding: 24,
          textAlign: 'center', background: '#fafaf8', cursor: 'pointer', marginBottom: 14,
        }}
        onClick={() => fileRef.current.click()}
      >
        <input ref={fileRef} type="file" accept=".xls,.xlsx,.csv" style={{ display: 'none' }} onChange={handleFile} />
        <div style={{ fontSize: 26, marginBottom: 6 }}>📋</div>
        <div style={{ fontSize: 14, color: '#555' }}>{fileName || '點此選擇中心提供的名單（.xls / .xlsx / .csv）'}</div>
        <div style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>自動依「帳號 → 護照 → 英文姓名 → 中文姓名」順序比對主名單</div>
      </div>

      {error && <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 12, whiteSpace: 'pre-line' }}>{error}</div>}

      {result && (
        <>
          <div style={{ display: 'flex', gap: 16, marginBottom: 12, fontSize: 13 }}>
            <span style={{ color: '#16a34a', fontWeight: 600 }}>比中 {result.matched.length} 人</span>
            <span style={{ color: result.unmatched.length ? '#dc2626' : '#aaa', fontWeight: 600 }}>
              未比中 {result.unmatched.length} 筆
            </span>
            {result.dupSkipped > 0 && <span style={{ color: '#d97706' }}>名單重複略過 {result.dupSkipped} 筆</span>}
            {sheetNote && <span style={{ color: '#aaa' }}>（{sheetNote}）</span>}
          </div>

          {conflicts.length > 0 && (
            <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: '#92400e' }}>
              ⚠ 其中 {conflicts.length} 人原本已被指派到其他中心，確認後會改成「{center || '—'}」：
              {conflicts.slice(0, 8).map((m) => `${m.label}（${m.group.center}）`).join('、')}
              {conflicts.length > 8 && ` …等 ${conflicts.length} 人`}
            </div>
          )}

          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 280 }}>
              <div style={{ fontSize: 12, color: '#16a34a', marginBottom: 6, fontWeight: 600 }}>比中（將套用中心）</div>
              <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid #eee', borderRadius: 8 }}>
                {result.matched.map((m) => (
                  <div key={m.key} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', borderBottom: '1px solid #f5f4f0', fontSize: 12 }}>
                    <span>{m.group.rep?.name || m.label}<span style={{ color: '#aaa' }}>（{m.group.account}）</span></span>
                    <span style={{ color: '#aaa' }}>比對：{m.via}</span>
                  </div>
                ))}
                {!result.matched.length && <div style={{ padding: 12, color: '#aaa', fontSize: 12 }}>無</div>}
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 280 }}>
              <div style={{ fontSize: 12, color: '#dc2626', marginBottom: 6, fontWeight: 600 }}>未比中（主名單查無此人）</div>
              <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid #eee', borderRadius: 8 }}>
                {result.unmatched.map((u, i) => (
                  <div key={i} style={{ padding: '6px 10px', borderBottom: '1px solid #f5f4f0', fontSize: 12, color: '#b45309' }}>{u.label}</div>
                ))}
                {!result.unmatched.length && <div style={{ padding: 12, color: '#aaa', fontSize: 12 }}>全部比中 🎉</div>}
              </div>
            </div>
          </div>
        </>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Btn onClick={onClose}>取消</Btn>
        <Btn variant="primary" onClick={handleConfirm} disabled={!result || !result.matched.length || !center || busy}>
          {busy ? '套用中…' : `確認標註中心${result?.matched.length ? `（${result.matched.length} 人）` : ''}`}
        </Btn>
      </div>
    </Modal>
  )
}
