import { useState, useEffect } from 'react'
import { Card, CardHead, s } from './UI'
import { getStage2Progress, getFinalAdmissions, getStage4Data } from '../api'

// 行政後台「進度總覽」：招生漏斗，以「人」為單位。
// 一、四欄位由 AdminApp 已載入的 groups 計算；二、三、四階段資料於切到本分頁時即時撈取。
export default function ProgressOverview({ groups }) {
  const [s2, setS2]   = useState(null)
  const [s3, setS3]   = useState(null)
  const [s4, setS4]   = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    let dead = false
    ;(async () => {
      try {
        const [p2, fa, st4] = await Promise.all([getStage2Progress(), getFinalAdmissions(), getStage4Data()])
        if (dead) return
        setS2(p2)

        // 三階：以人去重 — 任一系正取即「正取」；僅備取（且無任何正取）算「備取」
        const adm = new Set(), wl = new Set()
        for (const r of (fa || [])) {
          if (r.final_status === 'admitted') adm.add(r.account)
          else if (r.final_status === 'waitlisted') wl.add(r.account)
        }
        for (const a of adm) wl.delete(a)
        setS3({ admitted: adm.size, waitlisted: wl.size })

        // 四階：任一筆 contact_status = enrolled 即「已確認就讀」
        const enr = new Set()
        for (const r of (st4 || [])) if (r.contact_status === 'enrolled') enr.add(r.account)
        setS4({ enrolled: enr.size, total: new Set((st4 || []).map((r) => r.account)).size })
      } catch (e) { if (!dead) setErr(e.message) }
    })()
    return () => { dead = true }
  }, [])

  const paperAll = groups.filter((g) => g.apps.every((a) => a.paper_passed !== false)).length

  const steps = [
    { label: '報名人數', value: groups.length, sub: '不重複帳號', hash: '#/stats' },
    { label: '書審全過', value: paperAll, sub: `未全過 ${groups.length - paperAll} 人` },
    { label: '已排面試', value: groups.filter((g) => g.interview_date).length, sub: '已指派面試日', hash: '#/stage1' },
    { label: '一階通過', value: groups.filter((g) => g.status === 'stage1_passed').length, sub: '實體面試確認', hash: '#/confirm1' },
    { label: '二階已評', value: s2 ? s2.evaluated : null, sub: s2 ? `進二階 ${s2.total} · 待評 ${s2.waiting}` : '載入中…', hash: '#/stage2' },
    { label: '放榜正取', value: s3 ? s3.admitted : null, sub: s3 ? `備取 ${s3.waitlisted} 人` : '載入中…', hash: '#/stage3' },
    { label: '確認就讀', value: s4 ? s4.enrolled : null, sub: s4 ? `第四階段名單 ${s4.total} 人` : '載入中…', hash: '#/stage4' },
  ]

  const pct = (v) => (groups.length && v != null ? `${Math.round((v / groups.length) * 100)}%` : '')

  return (
    <div>
      {err && (
        <Card style={{ marginBottom: 16, borderColor: '#fca5a5', background: '#fef2f2' }}>
          <div style={{ padding: 14, color: '#991b1b', fontSize: 13 }}>部分階段資料載入失敗：{err}</div>
        </Card>
      )}

      <Card>
        <CardHead left="招生流程進度" right="以人為單位 · 點卡片直達該階段" />
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 0, padding: 18, flexWrap: 'wrap' }}>
          {steps.map((st, i) => (
            <div key={st.label} style={{ display: 'flex', alignItems: 'center' }}>
              <button
                onClick={() => { if (st.hash) window.location.hash = st.hash }}
                style={{
                  ...s.card, padding: '14px 18px', minWidth: 132, textAlign: 'left',
                  cursor: st.hash ? 'pointer' : 'default', fontFamily: 'inherit',
                  border: '1px solid #e8e7e3', background: 'white',
                }}
              >
                <div style={{ fontSize: 12, color: '#888' }}>{st.label}</div>
                <div style={{ fontSize: 26, fontWeight: 700, color: '#1a1a18', lineHeight: 1.3 }}>
                  {st.value == null ? '…' : st.value}
                  <span style={{ fontSize: 12, fontWeight: 400, color: '#bbb', marginLeft: 6 }}>{pct(st.value)}</span>
                </div>
                <div style={{ fontSize: 11.5, color: '#999', marginTop: 2 }}>{st.sub}</div>
                {st.hash && <div style={{ fontSize: 11, color: '#2563eb', marginTop: 6 }}>前往 →</div>}
              </button>
              {i < steps.length - 1 && (
                <span style={{ margin: '0 8px', color: '#ccc', fontSize: 18 }}>→</span>
              )}
            </div>
          ))}
        </div>
        <div style={{ padding: '0 18px 16px', fontSize: 12, color: '#aaa', lineHeight: 1.7 }}>
          說明：「二階已評」指該生至少一個志願系所已完成評分；「放榜正取」以人去重（同一人多系正取仍計 1 人）、
          「備取」為僅備取且無任何正取者；「確認就讀」為第四階段聯繫狀態為「就讀」者。百分比為占報名人數比例。
        </div>
      </Card>
    </div>
  )
}
