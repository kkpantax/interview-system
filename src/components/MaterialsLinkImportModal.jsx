import { useState, useRef, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { Modal, Btn } from './UI'

// 比對正規化：英文姓名／護照去空白轉大寫；中文姓名去空白。表頭去空白換行轉小寫。
const up   = (v) => String(v ?? '').replace(/\s+/g, '').toUpperCase()
const zh   = (v) => String(v ?? '').replace(/\s+/g, '')
const norm = (k) => String(k).replace(/\s+/g, '').replace(/\n/g, '').toLowerCase()

// 從任意字串抓出第一個網址（Google 表單上傳欄常為 drive.google.com 連結；多檔時取第一個）
const firstUrl = (v) => {
  const m = String(v ?? '').match(/https?:\/\/[^\s,;、，]+/i)
  return m ? m[0].replace(/[.,;、，)]+$/, '') : ''
}

// 各目標欄位關鍵字（含中／英／越南文）。link 為要匯入的「值」欄位；其餘為比對識別欄位。
const CATS = {
  account:  ['報名帳號', '帳號', 'account'],
  passport: ['護照號碼', 'passport', 'sốhc', 'sốhộchiếu', '護照'],
  enname:   ['英文姓名', 'têntiếnganh', 'englishname', 'name_english', 'enname', '英文'],
  zhname:   ['中文姓名', 'têntiếngtrung', '姓名', '中文'],
  link:     ['雲端連結', '雲端硬碟', '雲端', '資料連結', '書面資料', '上傳檔案', '上傳', '檔案連結', '連結', '網址', 'drive', 'googledrive', 'link', 'url'],
}

function resolveCols(headerCells) {
  const map = { account: -1, passport: -1, enname: -1, zhname: -1, link: -1 }
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
// 標題列分數：只計「識別欄位」(不含 link)，避免把含「連結」的橫幅誤判成標題
const headerScore = (cells) => {
  const m = resolveCols(cells)
  return [m.account, m.passport, m.enname, m.zhname].filter((v) => v >= 0).length
}

// 解析整個檔案（跨工作表）→ rows: [{account, passport, name_en, name_zh, materials_url}]
// 連結欄找不到、或該格沒有網址時，會掃整列任一含 http 的儲存格作為後備。
export function parseLinksFile(arrayBuffer, XLSXlib) {
  const wb = XLSXlib.read(arrayBuffer, { type: 'array' })
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
      // 先用 link 欄；抓不到網址就掃整列找第一個 http
      let url = firstUrl(get(r, 'link'))
      if (!url) for (const cell of r) { const u = firstUrl(cell); if (u) { url = u; break } }
      rows.push({
        account:       String(get(r, 'account') ?? '').trim(),
        passport:      String(get(r, 'passport') ?? '').trim(),
        name_en:       String(get(r, 'enname') ?? '').trim(),
        name_zh:       String(get(r, 'zhname') ?? '').trim(),
        materials_url: url,
      })
    }
  }
  return { rows, headers, sheetCount: wb.SheetNames.length }
}

// 比對主名單 groups，產出可寫入清單（依帳號）＋未比中
export function matchLinks(rows, groups) {
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
    const label = a || cn || en || p || '(空白列)'
    if (!a && !p && !en && !cn) continue
    let g = null, via = ''
    if (a && byAccount.has(up(a)))        { g = byAccount.get(up(a));  via = '帳號' }
    else if (en && byEn.has(up(en)))      { g = byEn.get(up(en));      via = '英文姓名' }
    else if (cn && byZh.has(zh(cn)))      { g = byZh.get(zh(cn));      via = '中文姓名' }
    else if (p && byPassport.has(up(p)))  { g = byPassport.get(up(p)); via = '護照' }
    if (g) {
      if (seen.has(g.key)) { dupSkipped++; continue }
      seen.add(g.key)
      matched.push({ key: g.key, group: g, via, label, materials_url: row.materials_url })
    } else {
      unmatched.push({ label, row })
    }
  }
  return { matched, unmatched, dupSkipped }
}

export default function MaterialsLinkImportModal({ groups = [], onApply, onClose }) {
  const [rows, setRows]         = useState([])
  const [fileName, setFileName] = useState('')
  const [sheetNote, setSheetNote] = useState('')
  const [error, setError]       = useState('')
  const [busy, setBusy]         = useState(false)
  const [progress, setProgress] = useState(null)
  const fileRef = useRef()

  const result = useMemo(() => (rows.length ? matchLinks(rows, groups) : null), [rows, groups])
  const withUrl = result ? result.matched.filter((m) => m.materials_url).length : 0

  const handleFile = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setFileName(file.name); setError(''); setRows([]); setSheetNote('')
    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const { rows: parsed, headers, sheetCount } = parseLinksFile(evt.target.result, XLSX)
        if (!parsed.length) {
          const seen = (headers || []).filter(Boolean).slice(0, 12).join('、')
          setError('找不到可辨識的欄位（需含「帳號 / 英文姓名 / 中文姓名 / 護照」其中之一）。' + (seen ? `\n我看到的欄位：${seen}` : ''))
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
      .filter((m) => m.materials_url)
      .map((m) => ({ account: m.group.account, materials_url: m.materials_url }))
    if (!updates.length) { setError('比中的人都沒有抓到雲端連結（請確認檔案有放網址那一欄）'); return }
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
    <Modal title="匯入書面資料雲端連結" onClose={onClose} width={760}>
      <div style={{ fontSize: 13, color: '#555', marginBottom: 12, lineHeight: 1.7, background: '#eff6ff', border: '1px solid #dbeafe', borderRadius: 8, padding: '10px 12px' }}>
        可上傳含<b>帳號／英文姓名</b>＋<b>雲端連結</b>的名單（例如 Google 表單回應表）。系統會依
        「帳號 → 英文姓名 → 中文姓名 → 護照」比對既有學生，把連結寫入該生資料，
        <b>二階系所評分</b>畫面就會出現「📎 查看書面資料」按鈕。連結欄抓不到時會自動掃整列找網址。
      </div>

      <div
        style={{ border: '2px dashed #ddd', borderRadius: 10, padding: 24, textAlign: 'center', background: '#fafaf8', cursor: 'pointer', marginBottom: 14 }}
        onClick={() => fileRef.current.click()}
      >
        <input ref={fileRef} type="file" accept=".xls,.xlsx,.csv" style={{ display: 'none' }} onChange={handleFile} />
        <div style={{ fontSize: 26, marginBottom: 6 }}>📎</div>
        <div style={{ fontSize: 14, color: '#555' }}>{fileName || '點此選擇名單（.xls / .xlsx / .csv）'}</div>
        <div style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>自動偵測標題列、依帳號等比對主名單</div>
      </div>

      {error && <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 12, whiteSpace: 'pre-line' }}>{error}</div>}

      {result && (
        <>
          <div style={{ display: 'flex', gap: 16, marginBottom: 12, fontSize: 13, flexWrap: 'wrap' }}>
            <span style={{ color: '#16a34a', fontWeight: 600 }}>比中 {result.matched.length} 人</span>
            <span style={{ color: result.unmatched.length ? '#dc2626' : '#aaa', fontWeight: 600 }}>未比中 {result.unmatched.length} 筆</span>
            <span style={{ color: '#1d4ed8' }}>其中含連結 {withUrl}</span>
            {result.dupSkipped > 0 && <span style={{ color: '#d97706' }}>名單重複略過 {result.dupSkipped}</span>}
            {sheetNote && <span style={{ color: '#aaa' }}>（{sheetNote}）</span>}
          </div>

          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 300 }}>
              <div style={{ fontSize: 12, color: '#16a34a', marginBottom: 6, fontWeight: 600 }}>比中（將寫入連結）</div>
              <div style={{ maxHeight: 230, overflowY: 'auto', border: '1px solid #eee', borderRadius: 8 }}>
                {result.matched.map((m) => (
                  <div key={m.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '6px 10px', borderBottom: '1px solid #f5f4f0', fontSize: 12 }}>
                    <span>{m.group.rep?.name || m.label}<span style={{ color: '#aaa' }}>（{m.group.account}）</span></span>
                    <span style={{ color: m.materials_url ? '#1d4ed8' : '#dc2626', whiteSpace: 'nowrap' }}>
                      {m.materials_url ? '🔗 有連結' : '⚠ 無連結'}
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
            : `確認匯入${withUrl ? `（${withUrl} 人有連結）` : ''}`}
        </Btn>
      </div>
    </Modal>
  )
}
