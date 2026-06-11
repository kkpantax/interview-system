import { useState, useEffect, useMemo } from 'react'
import { Modal, Btn, s } from './UI'
import { buildMessage, pickLang } from '../mailTemplates'
import { createDrafts, sendDraftBatch, logMail, getMailLog } from '../api'

// stage: '1' | '2'；kind: 's1_invite' | 's2_invite'
export default function MailComposer({ stage, kind, recipients, onClose, onToast }) {
  const isStage1 = String(stage) === '1'
  const title = isStage1 ? '寄送第一階段面試通知' : '寄送第二階段面試通知'

  const [form, setForm] = useState({
    programZh: '國際專修部(1+4)',
    programEn: 'International Foundation Program (1+4)',
    date: '', time: '', location: '', meetLink: '',
    replyBy: '', contactPerson: '', contactEmail: '',
    unitName: '國際暨兩岸事務處',
    batchMode: '線上',
  })
  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const baseRows = useMemo(() => (recipients || [])
    .filter((r) => r.email)
    .map((r) => ({
      account: r.account, name: r.name || '', name_english: r.name_english || '',
      email: r.email, nationality: r.nationality || '', interview_time: r.interview_time || '',
      lang: pickLang(r.nationality), mode: '線上', include: true,
    })), [recipients])

  const [rows, setRows] = useState(baseRows)
  useEffect(() => { setRows(baseRows) }, [baseRows])
  const setRow = (account, p) => setRows((rs) => rs.map((r) => (r.account === account ? { ...r, ...p } : r)))
  const applyBatchMode = (mode) => { setF('batchMode', mode); setRows((rs) => rs.map((r) => ({ ...r, mode }))) }

  const [sentMap, setSentMap] = useState({})
  useEffect(() => { getMailLog(kind).then(setSentMap).catch(() => {}) }, [kind])

  const [created, setCreated] = useState({})   // { account: draftId }
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState(null)

  const dataFor = (r) => ({
    中文姓名: r.name, 英文姓名: r.name_english || r.name,
    申請項目: form.programZh, 申請項目EN: form.programEn,
    面試日期: form.date, 面試時間: r.interview_time || form.time,
    面試地點: form.location, 會議連結: form.meetLink,
    回覆期限: form.replyBy, 承辦人: form.contactPerson,
    聯絡信箱: form.contactEmail, 單位名稱: form.unitName,
  })
  const msgFor = (r) => buildMessage({ stage, mode: isStage1 ? r.mode : '線上', lang: r.lang, data: dataFor(r) })

  const selected = rows.filter((r) => r.include)

  const validate = () => {
    if (!selected.length) return '沒有勾選任何學生'
    if (!form.date.trim()) return '請填面試日期'
    if (isStage1) {
      if (selected.some((r) => r.mode === '實體') && !form.location.trim()) return '有實體面試，請填面試地點'
      if (selected.some((r) => r.mode === '線上') && !form.meetLink.trim()) return '有線上面試，請填會議連結'
    } else if (!form.meetLink.trim()) return '請填會議連結'
    return null
  }

  const doCreate = async () => {
    const err = validate()
    if (err) { onToast?.(err, 'warn'); return }
    setBusy(true)
    try {
      const messages = selected.map((r) => {
        const m = msgFor(r)
        return { to: r.email, subject: m.subject, body: m.body }
      })
      const res = await createDrafts(messages)
      const byEmail = Object.fromEntries((res.drafts || []).map((d) => [d.to, d.draftId]))
      const map = {}
      selected.forEach((r) => { if (byEmail[r.email]) map[r.account] = byEmail[r.email] })
      setCreated((c) => ({ ...c, ...map }))
      await logMail(Object.entries(map).map(([account, id]) => ({ account, kind, status: 'draft', draft_ids: [id] })))
      const failN = (res.failed || []).length
      onToast?.(`已建立 ${res.created} 封草稿到公務信箱${failN ? `（${failN} 封失敗）` : ''}`)
    } catch (e) {
      onToast?.('建立草稿失敗：' + e.message, 'error')
    } finally { setBusy(false) }
  }

  const doSend = async () => {
    const ids = Object.values(created)
    if (!ids.length) { onToast?.('尚未建立草稿', 'warn'); return }
    if (!window.confirm(`確定送出這批 ${ids.length} 封草稿嗎？寄件人為公務信箱。`)) return
    setBusy(true)
    try {
      const res = await sendDraftBatch(ids)
      const nowIso = new Date().toISOString()
      await logMail(Object.keys(created).map((account) => ({ account, kind, status: 'sent', sent_at: nowIso })))
      const sm = { ...sentMap }
      Object.keys(created).forEach((a) => { sm[a] = { account: a, kind, status: 'sent', sent_at: nowIso } })
      setSentMap(sm)
      setCreated({})
      onToast?.(`已送出 ${res.sent} 封`)
    } catch (e) {
      onToast?.('送出失敗：' + e.message, 'error')
    } finally { setBusy(false) }
  }

  const lbl = { fontSize: 12, color: '#666', display: 'block', marginBottom: 3 }
  const th = { padding: '7px 8px', textAlign: 'left', borderBottom: '1px solid #e8e7e3', color: '#888', fontWeight: 500, fontSize: 11, whiteSpace: 'nowrap' }
  const td = { padding: '6px 8px', borderBottom: '1px solid #f5f4f0', fontSize: 12, verticalAlign: 'middle' }
  const statusOf = (account) => {
    if (sentMap[account]?.status === 'sent') return <span style={{ color: '#15803d' }}>已寄送</span>
    if (created[account]) return <span style={{ color: '#b45309' }}>草稿已建</span>
    return <span style={{ color: '#ccc' }}>—</span>
  }

  return (
    <Modal title={title} onClose={onClose} width={1040}>
      {/* 共用欄位 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px 14px', marginBottom: 14 }}>
        <div><label style={lbl}>面試日期</label><input style={{ ...s.input, marginBottom: 0 }} value={form.date} onChange={(e) => setF('date', e.target.value)} placeholder="2026/07/15" /></div>
        <div><label style={lbl}>面試時間（沒帶各人時段時的預設）</label><input style={{ ...s.input, marginBottom: 0 }} value={form.time} onChange={(e) => setF('time', e.target.value)} placeholder="14:00–14:30" /></div>
        <div><label style={lbl}>回覆期限</label><input style={{ ...s.input, marginBottom: 0 }} value={form.replyBy} onChange={(e) => setF('replyBy', e.target.value)} placeholder="2026/07/10" /></div>
        {isStage1 && (
          <div>
            <label style={lbl}>批次面試方式（可逐列改）</label>
            <select style={{ ...s.sel, width: '100%' }} value={form.batchMode} onChange={(e) => applyBatchMode(e.target.value)}>
              <option value="線上">線上（全部）</option>
              <option value="實體">實體（全部）</option>
            </select>
          </div>
        )}
        {isStage1 && (
          <div><label style={lbl}>面試地點（實體用）</label><input style={{ ...s.input, marginBottom: 0 }} value={form.location} onChange={(e) => setF('location', e.target.value)} placeholder="台北市…行政大樓3F" /></div>
        )}
        <div><label style={lbl}>會議連結（線上用）</label><input style={{ ...s.input, marginBottom: 0 }} value={form.meetLink} onChange={(e) => setF('meetLink', e.target.value)} placeholder="https://meet.google.com/…" /></div>
        <div><label style={lbl}>承辦人</label><input style={{ ...s.input, marginBottom: 0 }} value={form.contactPerson} onChange={(e) => setF('contactPerson', e.target.value)} /></div>
        <div><label style={lbl}>聯絡信箱</label><input style={{ ...s.input, marginBottom: 0 }} value={form.contactEmail} onChange={(e) => setF('contactEmail', e.target.value)} /></div>
        <div><label style={lbl}>單位名稱</label><input style={{ ...s.input, marginBottom: 0 }} value={form.unitName} onChange={(e) => setF('unitName', e.target.value)} /></div>
        <div><label style={lbl}>申請項目（中文）</label><input style={{ ...s.input, marginBottom: 0 }} value={form.programZh} onChange={(e) => setF('programZh', e.target.value)} /></div>
        <div><label style={lbl}>申請項目（英文）</label><input style={{ ...s.input, marginBottom: 0 }} value={form.programEn} onChange={(e) => setF('programEn', e.target.value)} /></div>
      </div>

      {/* 名單 */}
      <div style={{ maxHeight: '40vh', overflow: 'auto', border: '1px solid #eee', borderRadius: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
          <thead>
            <tr style={{ background: '#faf9f6', position: 'sticky', top: 0 }}>
              <th style={th}><input type="checkbox" checked={selected.length === rows.length && rows.length > 0}
                onChange={(e) => setRows((rs) => rs.map((r) => ({ ...r, include: e.target.checked })))} /></th>
              <th style={th}>姓名</th><th style={th}>Email</th><th style={th}>國籍</th><th style={th}>語言</th>
              {isStage1 && <th style={th}>方式</th>}
              <th style={th}>狀態</th><th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.account}>
                <td style={td}><input type="checkbox" checked={r.include} onChange={(e) => setRow(r.account, { include: e.target.checked })} /></td>
                <td style={td}><div style={{ fontWeight: 500 }}>{r.name}</div><div style={{ color: '#aaa', fontSize: 11 }}>{r.name_english}</div></td>
                <td style={td}>{r.email}</td>
                <td style={td}>{r.nationality}</td>
                <td style={td}>
                  <select style={{ ...s.sel, padding: '3px 6px' }} value={r.lang} onChange={(e) => setRow(r.account, { lang: e.target.value })}>
                    <option value="EN">中英</option><option value="VI">中越</option><option value="ID">中印尼</option>
                  </select>
                </td>
                {isStage1 && (
                  <td style={td}>
                    <select style={{ ...s.sel, padding: '3px 6px' }} value={r.mode} onChange={(e) => setRow(r.account, { mode: e.target.value })}>
                      <option value="線上">線上</option><option value="實體">實體</option>
                    </select>
                  </td>
                )}
                <td style={td}>{statusOf(r.account)}</td>
                <td style={td}><button style={{ ...s.btn, ...s.btnSm }} onClick={() => setPreview(r)}>預覽</button></td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={isStage1 ? 8 : 7} style={{ ...td, textAlign: 'center', color: '#aaa', padding: 24 }}>沒有可寄送的名單（需有 Email）</td></tr>}
          </tbody>
        </table>
      </div>

      {/* 動作列 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
        <span style={{ fontSize: 12, color: '#888' }}>勾選 {selected.length} / {rows.length} 位 · 已建草稿 {Object.keys(created).length} 封</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <Btn onClick={doCreate} disabled={busy}>① 建立草稿到公務信箱</Btn>
          <Btn variant="primary" onClick={doSend} disabled={busy || !Object.keys(created).length}>② 送出本批</Btn>
        </div>
      </div>
      <div style={{ fontSize: 11, color: '#aaa', marginTop: 8, lineHeight: 1.6 }}>
        流程：先「建立草稿」→ 草稿會進公務信箱草稿夾，可在 Gmail 逐封檢查／微調 → 回來按「送出本批」一次寄出。
        語言依國籍自動帶、可逐列改；第一階段可逐列切實體／線上。
      </div>

      {/* 預覽 */}
      {preview && (() => {
        const m = msgFor(preview)
        return (
          <Modal title={`預覽 — ${preview.name}`} onClose={() => setPreview(null)} width={680}>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>收件人：{preview.email}</div>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>{m?.subject}</div>
            <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 13, background: '#faf9f6', padding: 14, borderRadius: 8, margin: 0 }}>{m?.body}</pre>
          </Modal>
        )
      })()}
    </Modal>
  )
}
