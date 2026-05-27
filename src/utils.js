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
