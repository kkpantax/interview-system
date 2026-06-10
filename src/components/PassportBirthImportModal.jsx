import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import { Modal, Btn } from './UI'

const norm = (k) => String(k).replace(/\s+/g, '').replace(/\n/g, '')

const toISODate = (v) => {
  if (v == null || v === '') return null
  if (v instanceof Date && !isNaN(v)) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`
  }
  const str = String(v).trim()
  const mdy = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
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

const rocToISO = (v) => {
  if (v == null || v === '') return null
  const m = String(v).trim().match(/^(\d{1,3})\/(\d{1,2})\/(\d{1,2})$/)
  if (!m) return null
  const y = parseInt(m[1], 10) + 1911
  return `${y}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
}

export default function PassportBirthImportModal({ onApply, onClose }) {
  const [rows, setRows]         = useState([])
  const [stats, setStats]       = useState({ withBirth: 0, withPass: 0 })
  const [fileName, setFileName] = useState('')
  const [error, setError]       = useState('')
  const [busy, setBusy]         = useState(false)
  const [progress, setProgress] = useState(null)
  const [loaded, setLoaded]     = useState(false)
  const fileRef = useRef()

  const handleFile = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setFileName(file.name); setError(''); setRows([]); setLoaded(false)

    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const wb  = XLSX.read(evt.target.result, { type: 'array', cellDates: true })
        const ws  = wb.Sheets[wb.SheetNames[0]]
        const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false, blankrows: false })
        if (!aoa.length) { setError('檔案沒有資料'); setLoaded(true); return }

        let hIdx = -1
        for (let i = 0; i < Math.min(aoa.length, 15); i++) {
          if ((aoa[i] || []).some((c) => norm(c) === '帳號')) { hIdx = i; break }
        }
        if (hIdx < 0) {
          setError('找不到「帳號」欄位，請確認上傳的是報名系統匯出的「申請資料」檔。')
          setLoaded(true); return
        }

        const header = aoa[hIdx].map(norm)
        const idxAcc  = header.findIndex((h) => h === '帳號')
        const idxPass = header.findIndex((h) => h === '護照號碼')
        const idxWest = header.findIndex((h) => h === '生日[西元M/D/Y]')
        const idxRoc  = header.findIndex((h) => h === '生日[民國Y/M/D]')

        if (idxPass < 0 && idxWest < 0 && idxRoc < 0) {
          setError('找不到「護照號碼」或「生日」欄位，無法匯入。')
          setLoaded(true); return
        }

        const byAcc = new Map()
        for (const arr of aoa.slice(hIdx + 1)) {
          const account = String(arr[idxAcc] ?? '').trim()
          if (!account) continue
          const passport = idxPass >= 0 ? String(arr[idxPass] ?? '').trim() : ''
          let birth = idxWest >= 0 ? toISODate(arr[idxWest])
                    : idxRoc  >= 0 ? rocToISO(arr[idxRoc]) : null
          if (birth) {
            const yr = parseInt(birth.slice(0, 4), 10)
            if (!(yr >= 1900 && yr <= new Date().getFullYear())) birth = null
          }

          const prev = byAcc.get(account) || { account, birth_date: null, passport_number: null }
          if (!prev.birth_date && birth) prev.birth_date = birth
          if (!prev.passport_number && passport) prev.passport_number = passport
          byAcc.set(account, prev)
        }

        const list = [...byAcc.values()]
        setRows(list)
        setStats({
          withBirth: list.filter((r) => r.birth_date).length,
          withPass:  list.filter((r) => r.passport_number).length,
        })
        setLoaded(true)
      } catch (err) {
        setError('讀取失敗：' + err.message); setLoaded(true)
      }
    }
    reader.readAsArrayBuffer(file)
  }

  const handleConfirm = async () => {
    if (!rows.length) return
    setBusy(true); setError(''); setProgress({ done: 0, total: rows.length })
    try {
      await onApply(rows, (done, total) => setProgress({ done, total }))
      onClose()
    } catch (err) {
      setError('匯入失敗：' + err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="匯入生日／護照號碼" onClose={onClose} width={720}>
      <div style={{ fontSize: 13, color: '#555', marginBottom: 12, lineHeight: 1.7, background: '#f0fdfa', border: '1px solid #ccfbf1', borderRadius: 8, padding: '10px 12px' }}>
        上傳報名系統匯出的申請資料檔，系統會依「帳號」比對既有學生，只補上<b>生日</b>與<b>護照號碼</b>兩個欄位，
        不會更動面試日、書審、通過狀態等流程資料。生日優先取「西元」欄，若只有「民國」欄會自動換算。
      </div>

      <div
        style={{ border: '2px dashed #ddd', borderRadius: 10, padding: 28, textAlign: 'center', background: '#fafaf8', cursor: 'pointer', marginBottom: 16 }}
        onClick={() => fileRef.current.click()}
      >
        <input ref={fileRef} type="file" accept=".xls,.xlsx" style={{ display: 'none' }} onChange={handleFile} />
        <div style={{ fontSize: 28, marginBottom: 8 }}>🪪</div>
        <div style={{ fontSize: 14, color: '#555' }}>{fileName || '點此選擇 Excel 檔（.xls / .xlsx）'}</div>
        <div style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>需含「帳號」欄，以及「護照號碼」或「生日」其中之一</div>
      </div>

      {error && <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 12 }}>{error}</div>}

      {loaded && rows.length === 0 && !error && (
        <div style={{ color: '#d97706', fontSize: 13, marginBottom: 12 }}>
          這個檔案找不到任何有帳號的資料列。
        </div>
      )}

      {rows.length > 0 && (
        <>
          <div style={{ fontSize: 13, color: '#555', marginBottom: 10 }}>
            找到 <b>{rows.length}</b> 位學生（依帳號去重）：含生日 <b style={{ color: '#0f766e' }}>{stats.withBirth}</b> 位、
            含護照 <b style={{ color: '#0f766e' }}>{stats.withPass}</b> 位，預覽前 5 筆：
          </div>
          <div style={{ overflowX: 'auto', marginBottom: 16 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f8f7f3' }}>
                  {['帳號', '生日', '護照號碼'].map((h) => (
                    <th key={h} style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #e8e7e3', color: '#666', fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 5).map((r, i) => (
                  <tr key={i}>
                    <td style={{ padding: '7px 10px', borderBottom: '1px solid #f5f4f0', color: '#888' }}>{r.account}</td>
                    <td style={{ padding: '7px 10px', borderBottom: '1px solid #f5f4f0' }}>{r.birth_date || <span style={{ color: '#ccc' }}>—</span>}</td>
                    <td style={{ padding: '7px 10px', borderBottom: '1px solid #f5f4f0' }}>{r.passport_number || <span style={{ color: '#ccc' }}>—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > 5 && <div style={{ fontSize: 12, color: '#aaa', marginBottom: 16 }}>...還有 {rows.length - 5} 位</div>}
        </>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Btn onClick={onClose}>取消</Btn>
        <Btn variant="primary" onClick={handleConfirm} disabled={!rows.length || busy}>
          {busy
            ? `匯入中…${progress ? ` (${progress.done}/${progress.total})` : ''}`
            : `確認匯入${rows.length ? `（${rows.length} 位）` : ''}`}
        </Btn>
      </div>
    </Modal>
  )
}
