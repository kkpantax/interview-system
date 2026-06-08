import { useState, useRef, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { Modal, Btn, s } from './UI'

// ── 比對核心（純函式，方便單元測試）──────────────────────────────────────────
const up = (v) => String(v ?? '').replace(/\s+/g, '').toUpperCase()
const zh = (v) => String(v ?? '').replace(/\s+/g, '')
const norm = (k) => String(k).replace(/\s+/g, '').replace(/\n/g, '')

const ACCOUNT_KEYS  = ['帳號', 'account', '報名帳號', '帳號account']
const PASSPORT_KEYS = ['護照', 'passport', '護照號碼']
const ENNAME_KEYS   = ['英文姓名', 'englishname', 'name_english', 'enname', '英文']
const ZHNAME_KEYS   = ['中文姓名', '姓名', 'name', '中文']

function pick(row, candidates) {
  const keys = Object.keys(row)
  for (const cand of candidates) {
    const hit = keys.find((k) => norm(k).toLowerCase() === norm(cand).toLowerCase())
    if (hit && String(row[hit] ?? '').trim() !== '') return String(row[hit]).trim()
  }
  for (const cand of candidates) {
    const hit = keys.find((k) => norm(k).toLowerCase().includes(norm(cand).toLowerCase()))
    if (hit && String(row[hit] ?? '').trim() !== '') return String(row[hit]).trim()
  }
  return ''
}

export function matchCenterRows(uploadedRows, groups) {
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

  for (const row of uploadedRows) {
    const acct = pick(row, ACCOUNT_KEYS)
    const pass = pick(row, PASSPORT_KEYS)
    const en   = pick(row, ENNAME_KEYS)
    const cn   = pick(row, ZHNAME_KEYS)
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
    setFileName(file.name); setError(''); setUploaded([])
    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const wb  = XLSX.read(evt.target.result, { type: 'array' })
        const ws  = wb.Sheets[wb.SheetNames[0]]
        const raw = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false })
        if (!raw.length) { setError('檔案沒有資料'); return }
        setUploaded(raw)
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

      {error && <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 12 }}>{error}</div>}

      {result && (
        <>
          <div style={{ display: 'flex', gap: 16, marginBottom: 12, fontSize: 13 }}>
            <span style={{ color: '#16a34a', fontWeight: 600 }}>比中 {result.matched.length} 人</span>
            <span style={{ color: result.unmatched.length ? '#dc2626' : '#aaa', fontWeight: 600 }}>
              未比中 {result.unmatched.length} 筆
            </span>
            {result.dupSkipped > 0 && <span style={{ color: '#d97706' }}>名單重複略過 {result.dupSkipped} 筆</span>}
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
