import * as XLSX from 'xlsx'
import { Btn } from './UI'

// columns: [{ key, label }]；rows: 物件陣列
export function writeXlsx(columns, rows, filename) {
  const aoa = [
    columns.map((c) => c.label),
    ...rows.map((r) => columns.map((c) => r[c.key] ?? '')),
  ]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '名單')
  XLSX.writeFile(wb, filename)
}

// 多分頁版：sheets = [{ name, columns, rows }]
export function writeXlsxMulti(sheets, filename) {
  const wb = XLSX.utils.book_new()
  for (const sh of sheets) {
    const aoa = [
      sh.columns.map((c) => c.label),
      ...sh.rows.map((r) => sh.columns.map((c) => r[c.key] ?? '')),
    ]
    // Excel 分頁名上限 31 字、不可含 []:*?/\
    const name = String(sh.name || '名單').replace(/[\[\]:*?/\\]/g, '').slice(0, 31) || '名單'
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name)
  }
  XLSX.writeFile(wb, filename)
}

export default function ExportBtn({ columns, rows, filename, label = '匯出 Excel', variant, disabled, onEmpty }) {
  const handle = () => {
    if (!rows || !rows.length) { onEmpty && onEmpty(); return }
    writeXlsx(columns, rows, filename)
  }
  return <Btn variant={variant} onClick={handle} disabled={disabled}>{label}</Btn>
}
