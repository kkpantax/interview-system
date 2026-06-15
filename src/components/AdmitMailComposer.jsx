import { useState, useEffect, useMemo } from 'react'
import { Modal, Btn, s } from './UI'
import { buildMessage, pickLang } from '../mailTemplates'
import { createDrafts, sendDraftBatch, logMail, getMailLog, setStage4Confirm } from '../api'
import { deptI18n } from '../constants'

const KIND = 's4_admit'

// 產生不可猜的確認 token
const newToken = () => {
  const u = () => (crypto?.randomUUID ? crypto.randomUUID().replace(/-/g, '') : Math.random().toString(36).slice(2) + Date.now().toString(36))
  return ('s4' + u()).slice(0, 40)
}
// 期限日期(YYYY/MM/DD) → 台灣時間當日 23:59:59 的 timestamptz
const toDeadlineIso = (ymd) => {
  const d = String(ymd || '').trim().replace(/\//g, '-')
  return d ? `${d}T23:59:59+08:00` : null
}
const fmtYmd = (dt) => `${dt.getFullYear()}/${String(dt.getMonth() + 1).padStart(2, '0')}/${String(dt.getDate()).padStart(2, '0')}`
const plusDays = (n) => fmtYmd(new Date(Date.now() + n * 86400000))

const LANG_TO_I18N = { EN: 'en', VI: 'vi', ID: 'id' }
const CAT_ZH = (r) => (r.stage3_status === 'admitted' ? '正取' : `備取${r.standby_rank ?? ''}`)
const CAT_FX = (r, lang) => {
  if (r.stage3_status === 'admitted') return { EN: 'Admitted', VI: 'Trúng tuyển chính thức', ID: 'Diterima' }[lang] || 'Admitted'
  const n = r.standby_rank ?? ''
  return { EN: `Waitlist No. ${n}`, VI: `Dự bị số ${n}`, ID: `Daftar tunggu No. ${n}` }[lang] || `Waitlist No. ${n}`
}

// recipients: stage4 rows（含 id, account, department, stage3_status, standby_rank, confirm_token, appInfo{name,name_english,email,nationality}）
export default function AdmitMailComposer({ recipients, onClose, onToast }) {
  const [form, setForm] = useState(() => ({
    replyBy: plusDays(7),
    contactPerson: '',
    contactEmail: 'shihchien_ifp@g2.usc.edu.tw',
    unitName: '國際事務處 Office of International Affairs',
  }))
  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const baseRows = useMemo(() => (recipients || [])
    .filter((r) => r.appInfo?.email)
    .map((r) => ({
      id: r.id, account: r.account, department: r.department,
      stage3_status: r.stage3_status, standby_rank: r.standby_rank,
      confirm_token: r.confirm_token || '',
      name: r.appInfo?.name || '', name_english: r.appInfo?.name_english || '',
      email: r.appInfo?.email, nationality: r.appInfo?.nationality || '',
      lang: pickLang(r.appInfo?.nationality), include: true,
    })), [recipients])

  const [rows, setRows] = useState(baseRows)
  useEffect(() => { setRows(baseRows) }, [baseRows])
  const setRow = (id, p) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)))

  const [created, setCreated] = useState({})   // { account: draftId }
  const [sentMap, setSentMap] = useState({})
  const [tokenMap, setTokenMap] = useState({}) // { id: token }（建立草稿時寫入後快取）
  useEffect(() => {
    getMailLog(KIND).then((sm) => {
      setSentMap(sm)
      setCreated((c) => {
        const n = { ...c }
        for (const r of (recipients || [])) {
          const log = sm[r.account]
          if (!n[r.account] && log?.status === 'draft' && log.draft_ids?.length) n[r.account] = log.draft_ids[0]
        }
        return n
      })
    }).catch(() => {})
  }, [recipients])

  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState(null)

  const linkFor = (token) => `${window.location.origin}/#/confirm?t=${token}`
  const dataFor = (r, token) => {
    const il = LANG_TO_I18N[r.lang] || 'en'
    return {
      中文姓名: r.name, 英文姓名: r.name_english || r.name,
      系所中: r.department, 系所外: deptI18n(r.department, il),
      類別中: CAT_ZH(r), 類別外: CAT_FX(r, r.lang),
      確認連結: linkFor(token || r.confirm_token || tokenMap[r.id] || '（寄出時自動產生）'),
      回覆期限: form.replyBy, 承辦人: form.contactPerson,
      聯絡信箱: form.contactEmail, 單位名稱: form.unitName,
    }
  }
  const msgFor = (r, token) => buildMessage({ kind: KIND, lang: r.lang, data: dataFor(r, token) })

  const selected = rows.filter((r) => r.include)

  const validate = () => {
    if (!selected.length) return '沒有勾選任何學生'
    if (!form.replyBy.trim()) return '請填回覆期限'
    return null
  }

  // 建立草稿前：為每位選取者確保 token、寫入 token + 回覆期限到 stage4_confirmations
  const ensureTokens = async () => {
    const deadline = toDeadlineIso(form.replyBy)
    const map = {}
    let i = 0
    for (const r of selected) {
      i += 1
      const token = r.confirm_token || tokenMap[r.id] || newToken()
      const fields = { confirm_deadline: deadline }
      if (!r.confirm_token) fields.confirm_token = token   // 已有 token 則沿用（補寄不變動連結）
      await setStage4Confirm(r.id, fields)
      map[r.id] = token
      if (i % 10 === 0) onToast?.(`設定確認連結 ${i}/${selected.length}…`)
    }
    setTokenMap((m) => ({ ...m, ...map }))
    setRows((rs) => rs.map((r) => (map[r.id] ? { ...r, confirm_token: r.confirm_token || map[r.id] } : r)))
    return map
  }

  const doCreate = async () => {
    const err = validate()
    if (err) { onToast?.(err, 'warn'); return }
    setBusy(true)
    try {
      const tmap = await ensureTokens()
      const messages = selected.map((r) => {
        const m = msgFor(r, tmap[r.id])
        return { to: r.email, subject: m.subject, body: m.body }
      })
      const res = await createDrafts(messages)
      const byEmail = Object.fromEntries((res.drafts || []).map((d) => [d.to, d.draftId]))
      const cmap = {}
      selected.forEach((r) => { if (byEmail[r.email]) cmap[r.account] = byEmail[r.email] })
      setCreated((c) => ({ ...c, ...cmap }))
      await logMail(Object.entries(cmap).map(([account, id]) => ({ account, kind: KIND, status: 'draft', draft_ids: [id] })))
      const failN = (res.failed || []).length
      onToast?.(`已建立 ${res.created} 封草稿到公務信箱${failN ? `（${failN} 封失敗）` : ''}`)
    } catch (e) {
      onToast?.('建立草稿失敗：' + e.message, 'error')
    } finally { setBusy(false) }
  }

  const doSend = async () => {
    const included = new Set(selected.map((r) => r.account))
    const entries = Object.entries(created).filter(([a]) => included.has(a))
    if (!entries.length) { onToast?.('尚未建立草稿（或草稿對應的學生都未勾選）', 'warn'); return }
    if (!window.confirm(`確定送出這批 ${entries.length} 封預計錄取通知嗎？寄件人為公務信箱（會自動分批送出）。`)) return
    const CHUNK = 8
    setBusy(true)
    let sent = 0
    try {
      for (let i = 0; i < entries.length; i += CHUNK) {
        const part = entries.slice(i, i + CHUNK)
        const ids = part.map(([, id]) => id)
        const accounts = part.map(([a]) => a)
        const res = await sendDraftBatch(ids)
        const nowIso = new Date().toISOString()
        await logMail(accounts.map((account) => ({ account, kind: KIND, status: 'sent', sent_at: nowIso })))
        setSentMap((sm) => { const n = { ...sm }; accounts.forEach((a) => { n[a] = { account: a, kind: KIND, status: 'sent', sent_at: nowIso } }); return n })
        setCreated((c) => { const n = { ...c }; accounts.forEach((a) => delete n[a]); return n })
        sent += (res.sent ?? ids.length)
        onToast?.(`已送出 ${sent} / ${entries.length} 封…`)
      }
      onToast?.(`完成：已送出 ${sent} 封預計錄取通知`)
    } catch (e) {
      onToast?.(`送出中斷（已成功 ${sent} 封）：${e.message}。剩餘草稿仍在草稿匣，可再按「送出本批」續送。`, 'error')
    } finally { setBusy(false) }
  }

  const lbl = { fontSize: 12, color: '#666', display: 'block', marginBottom: 3 }
  const th = { padding: '7px 8px', textAlign: 'left', borderBottom: '1px solid #e8e7e3', color: '#888', fontWeight: 500, fontSize: 11, whiteSpace: 'nowrap' }
  const td = { padding: '6px 8px', borderBottom: '1px solid #f5f4f0', fontSize: 12, verticalAlign: 'middle' }
  const inp = (k, ph) => <input style={{ ...s.input, marginBottom: 0 }} value={form[k]} onChange={(e) => setF(k, e.target.value)} placeholder={ph} />
  const statusOf = (account) => {
    if (sentMap[account]?.status === 'sent') return <span style={{ color: '#15803d' }}>已寄送</span>
    if (created[account]) return <span style={{ color: '#b45309' }}>草稿已建</span>
    return <span style={{ color: '#ccc' }}>—</span>
  }

  return (
    <Modal title="寄送預計錄取通知（含就讀確認連結）" onClose={onClose} width={980}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px 14px', marginBottom: 14 }}>
        <div><label style={lbl}>回覆期限（學生需在此日期前確認）</label>{inp('replyBy', '2026/07/20')}</div>
        <div><label style={lbl}>承辦人</label>{inp('contactPerson')}</div>
        <div><label style={lbl}>聯絡信箱</label>{inp('contactEmail')}</div>
        <div><label style={lbl}>單位名稱</label>{inp('unitName')}</div>
      </div>

      <div style={{ maxHeight: '42vh', overflow: 'auto', border: '1px solid #eee', borderRadius: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
          <thead>
            <tr style={{ background: '#faf9f6', position: 'sticky', top: 0 }}>
              <th style={th}><input type="checkbox" checked={selected.length === rows.length && rows.length > 0}
                onChange={(e) => setRows((rs) => rs.map((r) => ({ ...r, include: e.target.checked })))} /></th>
              <th style={th}>姓名</th><th style={th}>系所</th><th style={th}>類別</th>
              <th style={th}>Email</th><th style={th}>語言</th><th style={th}>狀態</th><th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={td}><input type="checkbox" checked={r.include} onChange={(e) => setRow(r.id, { include: e.target.checked })} /></td>
                <td style={td}><div style={{ fontWeight: 500 }}>{r.name}</div><div style={{ color: '#aaa', fontSize: 11 }}>{r.name_english}</div></td>
                <td style={td}>{r.department}</td>
                <td style={td}>{CAT_ZH(r)}</td>
                <td style={td}>{r.email}</td>
                <td style={td}>
                  <select style={{ ...s.sel, padding: '3px 6px' }} value={r.lang} onChange={(e) => setRow(r.id, { lang: e.target.value })}>
                    <option value="EN">中英</option><option value="VI">中越</option><option value="ID">中印尼</option>
                  </select>
                </td>
                <td style={td}>{statusOf(r.account)}</td>
                <td style={td}><button style={{ ...s.btn, ...s.btnSm }} onClick={() => setPreview(r)}>預覽</button></td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={8} style={{ ...td, textAlign: 'center', color: '#aaa', padding: 24 }}>沒有可寄送的名單（需為正取且有 Email）</td></tr>}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
        <span style={{ fontSize: 12, color: '#888' }}>勾選 {selected.length} / {rows.length} 位 · 已建草稿 {Object.keys(created).length} 封</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <Btn onClick={doCreate} disabled={busy}>① 建立草稿（並產生確認連結）</Btn>
          <Btn variant="primary" onClick={doSend} disabled={busy || !Object.keys(created).length}>② 送出本批</Btn>
        </div>
      </div>
      <div style={{ fontSize: 11, color: '#aaa', marginTop: 8, lineHeight: 1.6 }}>
        流程：按「建立草稿」會先為每位學生產生專屬就讀確認連結並寫入回覆期限 → 草稿進公務信箱可逐封檢查 → 回來按「送出本批」。
        學生點信中連結 → 開啟確認頁 → 自行按「確認就讀／放棄」，結果即時回到第四階段統計。期限前學生可改答案，每次變更都會留紀錄。
      </div>

      {preview && (() => {
        const m = msgFor(preview, preview.confirm_token || tokenMap[preview.id])
        return (
          <Modal title={`預覽 — ${preview.name}`} onClose={() => setPreview(null)} width={680}>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>收件人：{preview.email}</div>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>{m?.subject}</div>
            <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 13, background: '#faf9f6', padding: 14, borderRadius: 8, margin: 0 }}>{m?.body}</pre>
            <div style={{ fontSize: 11, color: '#aaa', marginTop: 8 }}>※ 連結會在按「建立草稿」時正式產生；預覽顯示的是占位或既有連結。</div>
          </Modal>
        )
      })()}
    </Modal>
  )
}
