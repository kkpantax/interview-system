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

export default function ExportBtn({ columns, rows, filename, label = '匯出 Excel', variant, disabled, onEmpty }) {
  const handle = () => {
    if (!rows || !rows.length) { onEmpty && onEmpty(); return }
    writeXlsx(columns, rows, filename)
  }
  return <Btn variant={variant} onClick={handle} disabled={disabled}>{label}</Btn>
}
