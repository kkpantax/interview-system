import { useState, useCallback } from 'react'
import { apiGet, apiPost, apiPatch, toApplicationRow, fromApplicationRow } from './api'
import { emptyEval, sumScore } from './utils'

export function useStore() {
  const [students, setStudents] = useState([])
  const [evals, setEvals] = useState([])
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)

  // ── 載入 ──────────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      // applications 表存的是申請者資料；評分（evals）目前只在本地，待後端建表後再載入。
      const stuRes = await apiGet('getStudents')
      if (Array.isArray(stuRes)) setStudents(stuRes.map(fromApplicationRow))
    } catch (e) {
      console.error('loadData error', e)
    } finally {
      setLoading(false)
    }
  }, [])

  // ── 取得某學生某角色的評分 ────────────────────────────────────────────────
  const getEval = useCallback(
    (studentId, role) => {
      const found = evals.find(
        (e) => String(e.studentId) === String(studentId) && e.role === role
      )
      return found ? { ...emptyEval(), ...found } : emptyEval()
    },
    [evals]
  )

  // ── 儲存評分 ─────────────────────────────────────────────────────────────
  const saveEval = useCallback(
    async (studentId, role, stage, data) => {
      const ev = {
        ...data,
        studentId: String(studentId),
        role,
        stage: String(stage),
        total: sumScore(data),
        timestamp: new Date().toISOString(),
      }
      // 樂觀更新
      setEvals((prev) => {
        const idx = prev.findIndex(
          (e) => String(e.studentId) === String(studentId) && e.role === role
        )
        if (idx >= 0) {
          const next = [...prev]
          next[idx] = ev
          return next
        }
        return [...prev, ev]
      })
      // applications 表沒有評分欄位，評分目前只保存在本地 state。
      // TODO: 後端建立 evals 表後，在這裡改成對 evals 表呼叫 apiPost / apiPatch 寫入。
    },
    []
  )

  // ── 更新學生欄位 ──────────────────────────────────────────────────────────
  const updateStudent = useCallback(async (updated) => {
    setStudents((prev) =>
      prev.map((s) =>
        String(s.id) === String(updated.id) ? { ...s, ...updated } : s
      )
    )
    // 只同步 applications 表有的欄位（id 當條件用，不放進 body）。
    const { id, ...rest } = updated
    const row = toApplicationRow(rest)
    if (id === undefined || Object.keys(row).length === 0) return
    setSyncing(true)
    try {
      await apiPatch(id, row)
    } finally {
      setSyncing(false)
    }
  }, [])

  // ── 匯入學生 ─────────────────────────────────────────────────────────────
  const importStudents = useCallback(async (parsed) => {
    // id 改由 DB 產生 uuid，因此用護照號碼（applications 表內穩定的識別欄位）去重。
    const existing = new Set(students.map((s) => s.passportNo).filter(Boolean))
    const newOnes = parsed.filter((s) => !s.passportNo || !existing.has(s.passportNo))
    if (!newOnes.length) return { added: 0 }
    // 整批插入 applications 表（重命名為 snake_case、丟掉非該表欄位、不送 id）。
    const res = await apiPost(newOnes.map(toApplicationRow))
    // 用 DB 回傳（含產生的 uuid）更新本地 state，讓前端的 id 與後端一致。
    const created = Array.isArray(res) ? res.map(fromApplicationRow) : newOnes
    setStudents((prev) => [...prev, ...created])
    return { added: created.length }
  }, [students])

  // ── 進二階 ───────────────────────────────────────────────────────────────
  const promoteToStage2 = useCallback(async (studentId) => {
    setStudents((prev) =>
      prev.map((s) =>
        String(s.id) === String(studentId)
          ? { ...s, stage2Status: 'pending', stage2Date: '' }
          : s
      )
    )
    setSyncing(true)
    try {
      await apiPatch(studentId, { status: 'stage2_pending' })
    } finally {
      setSyncing(false)
    }
  }, [])

  // ── 設定最終結果 ──────────────────────────────────────────────────────────
  const setFinalResult = useCallback(async (studentId, result) => {
    await updateStudent({ id: studentId, finalResult: result })
  }, [updateStudent])

  return {
    students, evals, loading, syncing,
    loadData, getEval, saveEval, updateStudent,
    importStudents, promoteToStage2, setFinalResult,
    setStudents,
  }
}
