import { SCORE_ITEMS, DECISIONS, FINAL_RESULTS } from './constants'

export const emptyEval = () => ({
  chinese: 0, communication: 0, motivation: 0, attitude: 0,
  stability: 0, stress: 0, family: 0, impression: 0,
  decision: 'pending', notes: '', extraQ1: '', extraQ2: '', qNotes: '', absent: false,
})

export const sumScore = (ev) =>
  SCORE_ITEMS.reduce((a, i) => a + Number(ev?.[i.key] || 0), 0)

export const avg2 = (a, b) =>
  a > 0 && b > 0 ? ((a + b) / 2).toFixed(1) : (a || b || '—')

export const decInfo = (v) => DECISIONS.find((d) => d.v === v) || DECISIONS[3]
export const finInfo = (v) => FINAL_RESULTS.find((d) => d.v === v) || FINAL_RESULTS[3]

export const todayStr = () => new Date().toLocaleDateString('zh-TW')

export const mergeEval = (found) =>
  found ? { ...emptyEval(), ...found } : emptyEval()

// 由生日（西元）計算年齡。支援 M/D/Y（匯入原始字串）與 Y-M-D（date 欄位）兩種格式。
export const calcAge = (birth) => {
  if (!birth) return null
  const str = String(birth).trim()
  let y, m, d
  if (str.includes('/')) {
    const [mm, dd, yy] = str.split('/').map((x) => parseInt(x, 10))
    m = mm; d = dd; y = yy
  } else if (str.includes('-')) {
    const [yy, mm, dd] = str.split('-').map((x) => parseInt(x, 10))
    y = yy; m = mm; d = dd
  }
  if (!y || !m || !d) return null
  const now = new Date()
  let age = now.getFullYear() - y
  const curM = now.getMonth() + 1
  if (curM < m || (curM === m && now.getDate() < d)) age--
  return age >= 0 && age < 130 ? age : null
}
