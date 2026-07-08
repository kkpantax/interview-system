import { useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { Modal, Btn } from './UI'

const COLUMNS = [
  { key: 'account', label: '帳號', aliases: ['帳號', '報名帳號', 'account'] },
  { key: 'department', label: '系所別', aliases: ['系所別', '科系', '系所', 'department'] },
  { key: 'preference_order', label: '志願序', aliases: ['志願序', '志願', 'preference_order'] },
  { key: 'name', label: '中文姓名', aliases: ['中文姓名', '姓名', 'name'] },
  { key: 'name_english', label: '英文姓名', aliases: ['英文姓名', '英文名字', 'englishname', 'name_english'] },
  { key: 'passport_number', label: '護照號碼', aliases: ['護照號碼', '護照', 'passport', 'passport_number'] },
  { key: 'nationality', label: '國籍', aliases: ['國籍', 'nationality'] },
  { key: 'gender', label: '性別', aliases: ['性別', 'gender'] },
  { key: 'birth_date', label: '生日', aliases: ['生日', '生日[西元M/D/Y]', '出生年月日', '出生日期', 'dateofbirth', 'birth_date'] },
  { key: 'email', label: 'Email', aliases: ['email', 'e-mail', '電子郵件'] },
  { key: 'phone', label: '行動電話', aliases: ['行動電話', '電話', '手機', 'phone'] },
  { key: 'high_school', label: '最高學歷畢業學校', aliases: ['最高學歷畢業學校', '畢業學校', '高中', 'high_school'] },
  { key: 'interview_date', label: '第一階段面試日期', aliases: ['第一階段面試日期', '面試日期', '面試時間', 'interviewdate', 'interview_date'] },
  { key: 'center', label: '面試中心', aliases: ['面試中心', '中心', 'center'] },
  { key: 'materials_url', label: '書面資料雲端連結', aliases: ['書面資料雲端連結', '雲端連結', '書面資料', '資料連結', '連結', 'url', 'materials_url'] },
]

const APP_KEYS = [
  'account', 'department', 'preference_order', 'name', 'name_english',
  'passport_number', 'nationality', 'gender', 'birth_date', 'email', 'phone', 'high_school',
]
const ACCOUNT_KEYS = ['birth_date', 'passport_number', 'materials_url', 'interview_date', 'center']

const norm = (v) => String(v ?? '').replace(/\s+/g, '').replace(/\n/g, '').toLowerCase()
const clean = (v) => (v == null || v === '') ? '' : String(v).trim()
const nonEmpty = (v) => v != null && String(v).trim() !== ''

function toInt(v) {
  const n = parseInt(String(v ?? '').trim(), 10)
  return Number.isFinite(n) ? n : null
}

function toISODate(v) {
  if (v == null || v === '') return ''
  if (v instanceof Date && !isNaN(v)) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`
  }
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v)
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
  }
  const str = String(v).trim()
  let m = str.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (m) {
    let [, mm, dd, yy] = m
    if (yy.length === 2) yy = (parseInt(yy, 10) < 50 ? '20' : '19') + yy
    if (yy.length === 3) yy = String(parseInt(yy, 10) + 1911)
    return `${yy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`
  }
  const d = new Date(str)
  return isNaN(d) ? '' : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function resolveCols(headers) {
  const out = {}
  headers.forEach((h, idx) => {
    const H = norm(h)
    let best = null
    let bestLen = 0
    for (const col of COLUMNS) {
      for (const alias of col.aliases) {
        const a = norm(alias)
        if (a && H.includes(a) && a.length > bestLen) {
          best = col.key
          bestLen = a.length
        }
      }
    }
    if (best && out[best] == null) out[best] = idx
  })
  return out
}

function parseWorkbook(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true })
  const sheetName = wb.SheetNames.includes('整合匯入') ? '整合匯入' : wb.SheetNames[0]
  const aoa = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '', raw: true, blankrows: false })
  if (!aoa.length) throw new Error('檔案沒有資料')

  let headerIdx = -1
  let bestScore = 0
  for (let i = 0; i < Math.min(aoa.length, 15); i++) {
    const cols = resolveCols((aoa[i] || []).map(String))
    const score = (cols.account != null ? 3 : 0) + Object.keys(cols).length
    if (score > bestScore) {
      bestScore = score
      headerIdx = i
    }
  }
  if (headerIdx < 0) throw new Error('找不到「帳號」欄位，請確認上傳整合匯入模板或含帳號欄的 Excel。')

  const cols = resolveCols((aoa[headerIdx] || []).map(String))
  if (cols.account == null) throw new Error('找不到「帳號」欄位，請確認表頭名稱。')

  const applications = []
  const updatesByAccount = new Map()
  const preview = []
  let skippedNoAccount = 0
  let skippedNoDepartment = 0

  for (const arr of aoa.slice(headerIdx + 1)) {
    if (!arr.some((c) => nonEmpty(c))) continue
    const raw = {}
    for (const col of COLUMNS) {
      const idx = cols[col.key]
      let val = idx == null ? '' : arr[idx]
      if (col.key === 'preference_order') val = toInt(val)
      else if (col.key === 'birth_date' || col.key === 'interview_date') val = toISODate(val)
      else val = clean(val)
      raw[col.key] = val
    }
    if (!raw.account) {
      skippedNoAccount++
      continue
    }

    if (raw.department) {
      const app = {}
      for (const key of APP_KEYS) {
        if (key === 'preference_order') app[key] = raw[key]
        else if (nonEmpty(raw[key])) app[key] = raw[key]
      }
      app.status = 'pending'
      applications.push(app)
    } else {
      skippedNoDepartment++
    }

    const patch = updatesByAccount.get(raw.account) || { account: raw.account }
    for (const key of ACCOUNT_KEYS) {
      if (nonEmpty(raw[key])) patch[key] = raw[key]
    }
    updatesByAccount.set(raw.account, patch)
    if (preview.length < 8) preview.push(raw)
  }

  const accountUpdates = [...updatesByAccount.values()].filter((row) =>
    ACCOUNT_KEYS.some((key) => nonEmpty(row[key])),
  )

  return {
    applications,
    accountUpdates,
    preview,
    sheetName,
    skippedNoAccount,
    skippedNoDepartment,
    rowCount: applications.length + skippedNoDepartment,
  }
}

function rowsForTemplate(groups) {
  const rows = []
  for (const g of groups || []) {
    for (const app of g.apps || []) {
      rows.push({
        '帳號': app.account || '',
        '系所別': app.department || '',
        '志願序': app.preference_order ?? '',
        '中文姓名': app.name || g.rep?.name || '',
        '英文姓名': app.name_english || g.rep?.name_english || '',
        '護照號碼': app.passport_number || g.rep?.passport_number || '',
        '國籍': app.nationality || g.rep?.nationality || '',
        '性別': app.gender || g.rep?.gender || '',
        '生日': app.birth_date || g.rep?.birth_date || '',
        'Email': app.email || g.rep?.email || '',
        '行動電話': app.phone || g.rep?.phone || '',
        '最高學歷畢業學校': app.high_school || g.rep?.high_school || '',
        '第一階段面試日期': app.interview_date || g.interview_date || '',
        '面試中心': app.center || g.center || '',
        '書面資料雲端連結': app.materials_url || g.rep?.materials_url || '',
      })
    }
  }
  if (!rows.length) {
    rows.push(Object.fromEntries(COLUMNS.map((col) => [col.label, ''])))
  }
  return rows
}

function downloadTemplate(groups, centers) {
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(rowsForTemplate(groups), { header: COLUMNS.map((c) => c.label) })
  ws['!cols'] = [
    { wch: 14 }, { wch: 28 }, { wch: 8 }, { wch: 14 }, { wch: 24 },
    { wch: 16 }, { wch: 12 }, { wch: 8 }, { wch: 13 }, { wch: 26 },
    { wch: 16 }, { wch: 24 }, { wch: 16 }, { wch: 18 }, { wch: 42 },
  ]
  XLSX.utils.book_append_sheet(wb, ws, '整合匯入')

  const noteRows = [
    { 欄位: '一列代表一個志願', 說明: '同一帳號有多個志願時請保留多列；面試日期、中心、生日、護照、書面連結會依帳號套用到所有志願。' },
    { 欄位: '帳號', 說明: '必填，系統用帳號比對學生。' },
    { 欄位: '系所別＋志願序', 說明: '有填系所別才會新增或更新主名單志願；只想補資料時可只填帳號與補充欄位。' },
    { 欄位: '日期', 說明: '建議使用 YYYY-MM-DD，例如 2026-06-21。' },
    { 欄位: '空白格', 說明: '匯入時不會用空白覆蓋系統既有資料。' },
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(noteRows), '填寫說明')
  if (centers?.length) {
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(centers.map((c) => ({ 面試中心: c.name }))),
      '中心清單',
    )
  }
  XLSX.writeFile(wb, `第一階段整合匯入模板_${new Date().toISOString().slice(0, 10)}.xlsx`)
}

export default function IntegratedImportModal({ groups = [], centers = [], onImport, onClose }) {
  const [fileName, setFileName] = useState('')
  const [parsed, setParsed] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const fileRef = useRef()

  const totals = useMemo(() => {
    if (!parsed) return null
    return {
      applications: parsed.applications.length,
      accounts: new Set(parsed.accountUpdates.map((u) => u.account)).size,
      dates: parsed.accountUpdates.filter((u) => u.interview_date).length,
      centers: parsed.accountUpdates.filter((u) => u.center).length,
      birthPass: parsed.accountUpdates.filter((u) => u.birth_date || u.passport_number).length,
      links: parsed.accountUpdates.filter((u) => u.materials_url).length,
    }
  }, [parsed])

  const handleFile = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setFileName(file.name)
    setError('')
    setParsed(null)
    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        setParsed(parseWorkbook(evt.target.result))
      } catch (err) {
        setError('讀取失敗：' + err.message)
      }
    }
    reader.readAsArrayBuffer(file)
  }

  const handleConfirm = async () => {
    if (!parsed || (!parsed.applications.length && !parsed.accountUpdates.length)) return
    setBusy(true)
    setError('')
    setProgress('準備匯入…')
    try {
      await onImport(parsed, setProgress)
      onClose()
    } catch (err) {
      setError('匯入失敗：' + err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="整合匯入第一階段資料" onClose={onClose} width={860}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <Btn variant="blue" onClick={() => downloadTemplate(groups, centers)}>⬇ 下載整合 Excel 模板</Btn>
        <span style={{ fontSize: 12, color: '#777' }}>
          模板會帶入目前名單；可一次補名單、面試日期、生日護照、書面連結與中心。
        </span>
      </div>

      <div style={{ fontSize: 13, color: '#555', marginBottom: 12, lineHeight: 1.7, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px' }}>
        上傳時系統會先新增／更新「主名單志願」，再依帳號把面試日期、中心、生日、護照與書面資料連結同步套用到該生所有志願。Excel 空白欄位會略過，不會清掉原本資料。
      </div>

      <div
        style={{ border: '2px dashed #ddd', borderRadius: 10, padding: 24, textAlign: 'center', background: '#fafaf8', cursor: 'pointer', marginBottom: 14 }}
        onClick={() => fileRef.current.click()}
      >
        <input ref={fileRef} type="file" accept=".xls,.xlsx,.csv" style={{ display: 'none' }} onChange={handleFile} />
        <div style={{ fontSize: 26, marginBottom: 6 }}>📂</div>
        <div style={{ fontSize: 14, color: '#555' }}>{fileName || '點此選擇整合 Excel 檔（.xls / .xlsx / .csv）'}</div>
        <div style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>建議使用下載的「整合匯入」工作表格式</div>
      </div>

      {error && <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 12, whiteSpace: 'pre-line' }}>{error}</div>}

      {totals && (
        <>
          <div style={{ display: 'flex', gap: 12, marginBottom: 12, fontSize: 13, flexWrap: 'wrap' }}>
            <span style={{ color: '#1d4ed8', fontWeight: 700 }}>主名單志願 {totals.applications} 筆</span>
            <span style={{ color: '#15803d', fontWeight: 700 }}>補充資料 {totals.accounts} 位</span>
            <span style={{ color: '#1e40af' }}>面試日期 {totals.dates} 位</span>
            <span style={{ color: '#6d28d9' }}>中心 {totals.centers} 位</span>
            <span style={{ color: '#0f766e' }}>生日／護照 {totals.birthPass} 位</span>
            <span style={{ color: '#b45309' }}>書面連結 {totals.links} 位</span>
          </div>

          {(parsed.skippedNoAccount > 0 || parsed.skippedNoDepartment > 0) && (
            <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: '#c2410c' }}>
              已略過 {parsed.skippedNoAccount} 列無帳號資料；另有 {parsed.skippedNoDepartment} 列未填系所別，不會新增主名單志願，但若有補充欄位仍會依帳號更新。
            </div>
          )}

          <div style={{ overflowX: 'auto', marginBottom: 16 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, whiteSpace: 'nowrap' }}>
              <thead>
                <tr style={{ background: '#f8f7f3' }}>
                  {['帳號', '姓名', '系所', '志願序', '面試日期', '中心', '生日', '護照', '書面連結'].map((h) => (
                    <th key={h} style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #e8e7e3', color: '#666', fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsed.preview.map((r, i) => (
                  <tr key={i}>
                    <td style={cell}>{r.account}</td>
                    <td style={cell}>{r.name || r.name_english || '—'}</td>
                    <td style={{ ...cell, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.department || '—'}</td>
                    <td style={cell}>{r.preference_order ?? '—'}</td>
                    <td style={cell}>{r.interview_date || '—'}</td>
                    <td style={cell}>{r.center || '—'}</td>
                    <td style={cell}>{r.birth_date || '—'}</td>
                    <td style={cell}>{r.passport_number || '—'}</td>
                    <td style={{ ...cell, color: r.materials_url ? '#1d4ed8' : '#aaa' }}>{r.materials_url ? '有' : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {busy && <div style={{ fontSize: 12, color: '#555', marginBottom: 10 }}>{progress}</div>}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Btn onClick={onClose}>取消</Btn>
        <Btn variant="primary" onClick={handleConfirm} disabled={!parsed || busy || (!parsed.applications.length && !parsed.accountUpdates.length)}>
          {busy ? '匯入中…' : '確認整合匯入'}
        </Btn>
      </div>
    </Modal>
  )
}

const cell = { padding: '7px 10px', borderBottom: '1px solid #f5f4f0', color: '#555' }
