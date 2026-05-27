import { useState, useCallback } from 'react'
import { apiGet, apiPost } from './api'
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
      const [stuRes, evRes] = await Promise.all([
        apiGet('getStudents'),
        apiGet('getEvals'),
      ])
      if (stuRes && !stuRes.error) setStudents(stuRes)
      if (evRes  && !evRes.error)  setEvals(evRes)
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
      setSyncing(true)
      try {
        await apiPost({ action: 'saveEval', eval: ev })
      } finally {
        setSyncing(false)
      }
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
    setSyncing(true)
    try {
      await apiPost({ action: 'updateStudent', student: updated })
    } finally {
      setSyncing(false)
    }
  }, [])

  // ── 匯入學生 ─────────────────────────────────────────────────────────────
  const importStudents = useCallback(async (parsed) => {
    const existingIds = new Set(students.map((s) => String(s.id)))
    const newOnes = parsed.filter((s) => !existingIds.has(String(s.id)))
    setStudents((prev) => [...prev, ...newOnes])
    const res = await apiPost({ action: 'importStudents', students: parsed })
    return { added: res?.added ?? newOnes.length }
  }, [students])

  // ── 進二階 ───────────────────────────────────────────────────────────────
  const promoteToStage2 = useCallback(async (studentId) => {
    await updateStudent({ id: studentId, stage2Status: 'pending', stage2Date: '' })
    await apiPost({ action: 'promoteToStage2', studentIds: [studentId] })
  }, [updateStudent])

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
