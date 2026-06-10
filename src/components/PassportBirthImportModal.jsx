import { useState, useRef, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { Modal, Btn } from './UI'

// 比對正規化：英文姓名／護照去空白轉大寫；中文姓名去空白。表頭去空白換行轉小寫。
const up   = (v) => String(v ?? '').replace(/\s+/g, '').toUpperCase()
const zh   = (v) => String(v ?? '').replace(/\s+/g, '')
const norm = (k) => String(k).replace(/\s+/g, '').replace(/\n/g, '').toLowerCase()

// 各目標欄位關鍵字（含中／英／越南文）。birth 為要匯入的「值」欄位；其餘為比對識別欄位。
const CATS = {
  account:  ['報名帳號', '帳號', 'account'],
  passport: ['護照號碼', 'passport', 'sốhc', 'sốhộchiếu', '護照'],
  enname:   ['英文姓名', 'têntiếnganh', 'englishname', 'name_english', 'enname', '英文'],
  zhname:   ['中文姓名', 'têntiếngtrung', '姓名', '中文'],
  birth:    ['出生年月日', '生日', 'birthday', 'dateofbirth', 'ngàysinh', '出生'],
}

function resolveCols(headerCells) {
  const map = { account: -1, passport: -1, enname: -1, zhname: -1, birth: -1 }
  headerCells.forEach((h, idx) => {
    const H = norm(h)
    let bestCat = null, bestLen = 0
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
// 標題列分數：只計「識別欄位」(不含 birth)，避免把含「生日」的橫幅誤判成標題
const headerScore = (cells) => {
  const m = resolveCols(cells)
  return [m.account, m.passport, m.enname, m.zhname].filter((v) => v >= 0).length
}

// 生日字串 → YYYY-MM-DD。支援 YYYY/MM/DD、M/D/Y、YYYY-M-D、Date 物件；民國(<1900且為三段)自動+1911。
const toISODate = (v) => {
  if (v == null || v === '') return null
  if (v instanceof Date && !isNaN(v)) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`
  }
  const str = String(v).trim()
  let m = str.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/)            // YYYY/MM/DD 或 YYYY-MM-DD
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)                   // M/D/Y
  if (m) {
    let [, mm, dd, yy] = m
    if (yy.length <= 2) yy = '20' + yy.padStart(2, '0')
    if (yy.length === 3) yy = String(parseInt(yy, 10) + 1911)         // 民國三位數年
    return `${yy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`
  }
  const d = new Date(str)
  if (!isNaN(d)) return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return null
}
const plausibleBirth = (iso) => {
  if (!iso) return null
  const yr = parseInt(iso.slice(0, 4), 10)
  return (yr >= 1900 && yr <= new Date().getFullYear()) ? iso : null
}

// 解析整個檔案（跨工作表）→ rows: [{account, passport, name_en, name_zh, birth_date}]
export function parseRosterFile(arrayBuffer, XLSXlib) {
  const wb = XLSXlib.read(arrayBuffer, { type: 'array', cellDates: true })
  let rows = [], headers = []
  for (const sn of wb.SheetNames) {
    const aoa = XLSXlib.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '', raw: false, blankrows: false })
    let hIdx = -1, best = 0
    for (let i = 0; i < Math.min(aoa.length, 15); i++) {
      const sc = headerScore((aoa[i] || []).map(String))
      if (sc > best) { best = sc; hIdx = i }
    }
    if (hIdx < 0) continue
    if (!headers.length) headers = aoa[hIdx].map(String)
    const cols = resolveCols(aoa[hIdx].map(String))
    const get = (r, c) => (cols[c] >= 0 ? r[cols[c]] : '')
    for (const r of aoa.slice(hIdx + 1)) {
      if (!r.some((c) => String(c).trim() !== '')) continue
      rows.push({
        account:    String(get(r, 'account') ?? '').trim(),
        passport:   String(get(r, 'passport') ?? '').trim(),
        name_en:    String(get(r, 'enname') ?? '').trim(),
        name_zh:    String(get(r, 'zhname') ?? '').trim(),
        birth_date: plausibleBirth(toISODate(get(r, 'birth'))),
      })
    }
  }
  return { rows, headers, sheetCount: wb.SheetNames.length }
}

// 比對主名單 groups，產出可寫入清單（依帳號）＋未比中
export function matchRoster(rows, groups) {
  const byAccount = new Map(), byPassport = new Map(), byEn = new Map(), byZh = new Map()
  for (const g of groups) {
    if (g.account)              byAccount.set(up(g.account), g)
    if (g.rep?.passport_number) byPassport.set(up(g.rep.passport_number), g)
    if (g.rep?.name_english)    byEn.set(up(g.rep.name_english), g)
    if (g.rep?.name)            byZh.set(zh(g.rep.name), g)
  }
  const matched = [], unmatched = [], seen = new Set()
  let dupSkipped = 0
  for (const row of rows) {
    const { account: a, passport: p, name_en: en, name_zh: cn } = row
    const label = en || cn || a || p || '(空白列)'
    if (!a && !p && !en && !cn) continue
    let g = null, via = ''
    if (a && byAccount.has(up(a)))        { g = byAccount.get(up(a));  via = '帳號' }
    else if (en && byEn.has(up(en)))      { g = byEn.get(up(en));      via = '英文姓名' }
    else if (cn && byZh.has(zh(cn)))      { g = byZh.get(zh(cn));      via = '中文姓名' }
    else if (p && byPassport.has(up(p)))  { g = byPassport.get(up(p)); via = '護照' }
    if (g) {
      if (seen.has(g.key)) { dupSkipped++; continue }
      seen.add(g.key)
      matched.push({
        key: g.key, group: g, via, label,
        birth_date: row.birth_date, passport_number: row.passport || null,
      })
    } else {
      unmatched.push({ label, row })
    }
  }
  return { matched, unmatched, dupSkipped }
}

export default function PassportBirthImportModal({ groups = [], onApply, onClose }) {
  const [rows, setRows]         = useState([])
  const [fileName, setFileName] = useState('')
  const [sheetNote, setSheetNote] = useState('')
  const [error, setError]       = useState('')
  const [busy, setBusy]         = useState(false)
  const [progress, setProgress] = useState(null)
  const fileRef = useRef()

  const result = useMemo(() => (rows.length ? matchRoster(rows, groups) : null), [rows, groups])
  const withBirth = result ? result.matched.filter((m) => m.birth_date).length : 0
  const withPass  = result ? result.matched.filter((m) => m.passport_number).length : 0

  const handleFile = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setFileName(file.name); setError(''); setRows([]); setSheetNote('')
    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const { rows: parsed, headers, sheetCount } = parseRosterFile(evt.target.result, XLSX)
        if (!parsed.length) {
          const seen = (headers || []).filter(Boolean).slice(0, 12).join('、')
          setError('找不到可辨識的欄位（需含「英文姓名 / 中文姓名 / 帳號 / 護照」其中之一）。' + (seen ? `\n我看到的欄位：${seen}` : ''))
          return
        }
        setRows(parsed)
        setSheetNote(sheetCount > 1 ? `已合併 ${sheetCount} 個工作表、共 ${parsed.length} 列` : `共 ${parsed.length} 列`)
      } catch (err) {
        setError('讀取失敗：' + err.message)
      }
    }
    reader.readAsArrayBuffer(file)
  }

  const handleConfirm = async () => {
    if (!result || !result.matched.length) { setError('沒有可寫入的比中資料'); return }
    const updates = result.matched
      .filter((m) => m.birth_date || m.passport_number)
      .map((m) => ({ account: m.group.account, birth_date: m.birth_date, passport_number: m.passport_number }))
    if (!updates.length) { setError('比中的人都沒有生日或護照可寫入'); return }
    setBusy(true); setError(''); setProgress({ done: 0, total: updates.length })
    try {
      await onApply(updates, (done, total) => setProgress({ done, total }))
      onClose()
    } catch (err) {
      setError('匯入失敗：' + err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="匯入生日／護照號碼" onClose={onClose} width={760}>
      <div style={{ fontSize: 13, color: '#555', marginBottom: 12, lineHeight: 1.7, background: '#f0fdfa', border: '1px solid #ccfbf1', borderRadius: 8, padding: '10px 12px' }}>
        可上傳「函查名冊」或任何含<b>英文姓名</b>＋<b>護照號碼／出生年月日</b>的名單。系統會依
        「帳號 → 英文姓名 → 中文姓名 → 護照」比對既有學生，只補上<b>生日</b>與<b>護照</b>，
        不更動面試／書審／通過狀態。下方會列出<b>未比中</b>名單供你檢查。
      </div>

      <div
        style={{ border: '2px dashed #ddd', borderRadius: 10, padding: 24, textAlign: 'center', background: '#fafaf8', cursor: 'pointer', marginBottom: 14 }}
        onClick={() => fileRef.current.click()}
      >
        <input ref={fileRef} type="file" accept=".xls,.xlsx,.csv" style={{ display: 'none' }} onChange={handleFile} />
        <div style={{ fontSize: 26, marginBottom: 6 }}>🪪</div>
        <div style={{ fontSize: 14, color: '#555' }}>{fileName || '點此選擇名單（.xls / .xlsx / .csv）'}</div>
        <div style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>自動偵測標題列、依英文姓名等比對主名單</div>
      </div>

      {error && <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 12, whiteSpace: 'pre-line' }}>{error}</div>}

      {result && (
        <>
          <div style={{ display: 'flex', gap: 16, marginBottom: 12, fontSize: 13, flexWrap: 'wrap' }}>
            <span style={{ color: '#16a34a', fontWeight: 600 }}>比中 {result.matched.length} 人</span>
            <span style={{ color: result.unmatched.length ? '#dc2626' : '#aaa', fontWeight: 600 }}>未比中 {result.unmatched.length} 筆</span>
            <span style={{ color: '#0f766e' }}>其中可補生日 {withBirth}、可補護照 {withPass}</span>
            {result.dupSkipped > 0 && <span style={{ color: '#d97706' }}>名單重複略過 {result.dupSkipped}</span>}
            {sheetNote && <span style={{ color: '#aaa' }}>（{sheetNote}）</span>}
          </div>

          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 300 }}>
              <div style={{ fontSize: 12, color: '#16a34a', marginBottom: 6, fontWeight: 600 }}>比中（將寫入生日／護照）</div>
              <div style={{ maxHeight: 230, overflowY: 'auto', border: '1px solid #eee', borderRadius: 8 }}>
                {result.matched.map((m) => (
                  <div key={m.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '6px 10px', borderBottom: '1px solid #f5f4f0', fontSize: 12 }}>
                    <span>{m.group.rep?.name || m.label}<span style={{ color: '#aaa' }}>（{m.group.account}）</span></span>
                    <span style={{ color: '#777', whiteSpace: 'nowrap' }}>
                      {m.birth_date || '—'}{m.passport_number ? ` · ${m.passport_number}` : ''}
                      <span style={{ color: '#bbb' }}> · {m.via}</span>
                    </span>
                  </div>
                ))}
                {!result.matched.length && <div style={{ padding: 12, color: '#aaa', fontSize: 12 }}>無</div>}
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 240 }}>
              <div style={{ fontSize: 12, color: '#dc2626', marginBottom: 6, fontWeight: 600 }}>未比中（主名單查無此人，需手動處理）</div>
              <div style={{ maxHeight: 230, overflowY: 'auto', border: '1px solid #eee', borderRadius: 8 }}>
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
        <Btn variant="primary" onClick={handleConfirm} disabled={!result || !result.matched.length || busy}>
          {busy
            ? `匯入中…${progress ? ` (${progress.done}/${progress.total})` : ''}`
            : `確認匯入${result?.matched.length ? `（${result.matched.length} 人）` : ''}`}
        </Btn>
      </div>
    </Modal>
  )
}
