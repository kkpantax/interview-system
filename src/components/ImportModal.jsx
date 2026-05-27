import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import { Modal, Btn, s } from './UI'
import { XLS_FIELD_MAP } from '../constants'

export default function ImportModal({ onImport, onClose }) {
  const [preview, setPreview]   = useState([])
  const [headers, setHeaders]   = useState([])
  const [fileName, setFileName] = useState('')
  const [error, setError]       = useState('')
  const fileRef = useRef()

  const handleFile = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setFileName(file.name)
    setError('')

    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const wb  = XLSX.read(evt.target.result, { type: 'array' })
        const ws  = wb.Sheets[wb.SheetNames[0]]
        const raw = XLSX.utils.sheet_to_json(ws, { defval: '' })
        if (!raw.length) { setError('檔案沒有資料'); return }

        setHeaders(Object.keys(raw[0]))
        const parsed = raw.map((row, i) => {
          const obj = {
            stage1Status: '', stage1Date: '',
            stage2Status: '', stage2Date: '',
            finalResult: '',
          }
          for (const [xlsKey, appKey] of Object.entries(XLS_FIELD_MAP)) {
            // 容錯：欄位名可能有換行或空白
            const found = Object.keys(row).find(k =>
              k.replace(/\s+/g, '').replace(/\n/g, '') ===
              xlsKey.replace(/\s+/g, '').replace(/\n/g, '')
            )
            obj[appKey] = found ? String(row[found] ?? '') : ''
          }
          // fallback id
          if (!obj.id) obj.id = String(i + 1)
          return obj
        }).filter(s => s.chName || s.enName)

        setPreview(parsed)
      } catch (err) {
        setError('讀取失敗：' + err.message)
      }
    }
    reader.readAsArrayBuffer(file)
  }

  const handleConfirm = async () => {
    if (!preview.length) return
    await onImport(preview)
    onClose()
  }

  return (
    <Modal title="匯入學生名單（Excel）" onClose={onClose} width={680}>
      {/* 上傳區 */}
      <div
        style={{
          border: '2px dashed #ddd', borderRadius: 10,
          padding: '28px', textAlign: 'center',
          background: '#fafaf8', cursor: 'pointer', marginBottom: 16,
        }}
        onClick={() => fileRef.current.click()}
      >
        <input
          ref={fileRef} type="file"
          accept=".xls,.xlsx"
          style={{ display: 'none' }}
          onChange={handleFile}
        />
        <div style={{ fontSize: 28, marginBottom: 8 }}>📂</div>
        <div style={{ fontSize: 14, color: '#555' }}>
          {fileName || '點此選擇 Excel 檔案（.xls / .xlsx）'}
        </div>
        <div style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>
          直接上傳從報名系統下載的 xls 檔即可
        </div>
      </div>

      {error && (
        <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 12 }}>{error}</div>
      )}

      {/* 預覽表格 */}
      {preview.length > 0 && (
        <>
          <div style={{ fontSize: 13, color: '#555', marginBottom: 10 }}>
            讀取到 <b>{preview.length}</b> 筆學生資料，預覽前 5 筆：
          </div>
          <div style={{ overflowX: 'auto', marginBottom: 16 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f8f7f3' }}>
                  {['序號','中文姓名','英文姓名','系所','國籍','性別','獎學金'].map(h => (
                    <th key={h} style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #e8e7e3', color: '#666', fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.slice(0, 5).map((s, i) => (
                  <tr key={i}>
                    <td style={{ padding: '7px 10px', borderBottom: '1px solid #f5f4f0', color: '#aaa' }}>{s.id}</td>
                    <td style={{ padding: '7px 10px', borderBottom: '1px solid #f5f4f0', fontWeight: 500 }}>{s.chName}</td>
                    <td style={{ padding: '7px 10px', borderBottom: '1px solid #f5f4f0', color: '#777' }}>{s.enName}</td>
                    <td style={{ padding: '7px 10px', borderBottom: '1px solid #f5f4f0', color: '#777', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.dept}</td>
                    <td style={{ padding: '7px 10px', borderBottom: '1px solid #f5f4f0' }}>{s.nationality}</td>
                    <td style={{ padding: '7px 10px', borderBottom: '1px solid #f5f4f0' }}>{s.gender}</td>
                    <td style={{ padding: '7px 10px', borderBottom: '1px solid #f5f4f0' }}>{s.scholarship}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.length > 5 && (
            <div style={{ fontSize: 12, color: '#aaa', marginBottom: 16 }}>...還有 {preview.length - 5} 筆</div>
          )}
        </>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Btn onClick={onClose}>取消</Btn>
        <Btn variant="primary" onClick={handleConfirm} disabled={!preview.length}>
          確認匯入 {preview.length > 0 ? `（${preview.length} 位）` : ''}
        </Btn>
      </div>
    </Modal>
  )
}
