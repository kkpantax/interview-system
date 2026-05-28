import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import { Modal, Btn } from './UI'
import { APP_XLS_MAP } from '../constants'

// ── 型別轉換（避免 Postgres insert 因型別不符而整批失敗）──────────────────────
const toInt = (v) => {
  const n = parseInt(String(v ?? '').trim(), 10)
  return Number.isFinite(n) ? n : null
}
const toISODate = (v) => {
  if (v == null || v === '') return null
  if (v instanceof Date && !isNaN(v)) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`
  }
  const str = String(v).trim()
  const mdy = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/) // M/D/Y
  if (mdy) {
    let [, mm, dd, yy] = mdy
    if (yy.length === 2) yy = '20' + yy
    return `${yy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`
  }
  const iso = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`
  const d = new Date(str)
  if (!isNaN(d)) return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return null
}

const norm = (k) => String(k).replace(/\s+/g, '').replace(/\n/g, '')

export default function ImportModal({ onImport, onClose }) {
  const [rows, setRows]         = useState([])
  const [skipped, setSkipped]   = useState(0)
  const [fileName, setFileName] = useState('')
  const [error, setError]       = useState('')
  const [busy, setBusy]         = useState(false)
  const [progress, setProgress] = useState(null) // { done, total }
  const fileRef = useRef()

  const handleFile = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setFileName(file.name); setError(''); setRows([]); setSkipped(0)

    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const wb  = XLSX.read(evt.target.result, { type: 'array', cellDates: true })
        const ws  = wb.Sheets[wb.SheetNames[0]]
        const raw = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false })
        if (!raw.length) { setError('檔案沒有資料'); return }

        let skip = 0
        const parsed = []
        for (const r of raw) {
          const row = {}
          for (const [xlsKey, col] of Object.entries(APP_XLS_MAP)) {
            const found = Object.keys(r).find((k) => norm(k) === norm(xlsKey))
            let val = found ? r[found] : ''
            if (col === 'preference_order') val = toInt(val)
            else if (col === 'birth_date')  val = toISODate(val)
            else val = val === '' ? null : String(val).trim()
            row[col] = val
          }
          // 過濾：帳號為空 → 視為未完成報名，跳過
          if (!row.account) { skip++; continue }
          row.status = 'pending'
          parsed.push(row)
        }
        setRows(parsed); setSkipped(skip)
      } catch (err) {
        setError('讀取失敗：' + err.message)
      }
    }
    reader.readAsArrayBuffer(file)
  }

  const handleConfirm = async () => {
    if (!rows.length) return
    setBusy(true); setError(''); setProgress({ done: 0, total: rows.length })
    try {
      // 分批送出（每批 50 筆），全部跑完才關閉並顯示結果
      await onImport(rows, skipped, (done, total) => setProgress({ done, total }))
      onClose()
    } catch (err) {
      setError('匯入失敗：' + err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="匯入報名名單（Excel）" onClose={onClose} width={720}>
      <div
        style={{
          border: '2px dashed #ddd', borderRadius: 10, padding: 28,
          textAlign: 'center', background: '#fafaf8', cursor: 'pointer', marginBottom: 16,
        }}
        onClick={() => fileRef.current.click()}
      >
        <input ref={fileRef} type="file" accept=".xls,.xlsx" style={{ display: 'none' }} onChange={handleFile} />
        <div style={{ fontSize: 28, marginBottom: 8 }}>📂</div>
        <div style={{ fontSize: 14, color: '#555' }}>{fileName || '點此選擇 Excel 檔（.xls / .xlsx）'}</div>
        <div style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>直接上傳報名系統匯出的 xls 檔；帳號為空者會自動略過</div>
      </div>

      {error && <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 12 }}>{error}</div>}

      {rows.length > 0 && (
        <>
          <div style={{ fontSize: 13, color: '#555', marginBottom: 10 }}>
            可匯入 <b>{rows.length}</b> 筆志願
            {skipped > 0 && <span style={{ color: '#d97706' }}>，略過 {skipped} 筆（無帳號）</span>}
            ，預覽前 5 筆：
          </div>
          <div style={{ overflowX: 'auto', marginBottom: 16 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f8f7f3' }}>
                  {['帳號', '中文姓名', '英文姓名', '系所', '志願序', '國籍'].map((h) => (
                    <th key={h} style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #e8e7e3', color: '#666', fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 5).map((r, i) => (
                  <tr key={i}>
                    <td style={{ padding: '7px 10px', borderBottom: '1px solid #f5f4f0', color: '#888' }}>{r.account}</td>
                    <td style={{ padding: '7px 10px', borderBottom: '1px solid #f5f4f0', fontWeight: 500 }}>{r.name}</td>
                    <td style={{ padding: '7px 10px', borderBottom: '1px solid #f5f4f0', color: '#777' }}>{r.name_english}</td>
                    <td style={{ padding: '7px 10px', borderBottom: '1px solid #f5f4f0', color: '#777', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.department}</td>
                    <td style={{ padding: '7px 10px', borderBottom: '1px solid #f5f4f0' }}>{r.preference_order ?? '—'}</td>
                    <td style={{ padding: '7px 10px', borderBottom: '1px solid #f5f4f0' }}>{r.nationality}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > 5 && <div style={{ fontSize: 12, color: '#aaa', marginBottom: 16 }}>...還有 {rows.length - 5} 筆</div>}
        </>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Btn onClick={onClose}>取消</Btn>
        <Btn variant="primary" onClick={handleConfirm} disabled={!rows.length || busy}>
          {busy
            ? `匯入中…${progress ? ` (${progress.done}/${progress.total})` : ''}`
            : `確認匯入${rows.length ? `（${rows.length} 筆）` : ''}`}
        </Btn>
      </div>
    </Modal>
  )
}
