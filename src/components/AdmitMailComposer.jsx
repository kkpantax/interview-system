import { useState, useEffect, useMemo, useRef } from 'react'
import { Modal, Btn, s } from './UI'
import { buildMessage, pickLang } from '../mailTemplates'
import { createDrafts, sendDraftBatch, logMail, getMailLog, setStage4Confirm } from '../api'
import { deptI18n, batchOf, BATCHES, campusOf } from '../constants'

// 有落地頁（需個人確認連結）的信件種類
const LINK_KINDS = new Set(['s4_admit', 's4_promote'])

const KIND_META = {
  s4_admit:          { title: '寄送預錄取意願調查（正取・含確認連結）', send: '預錄取意願調查' },
  s4_promote:        { title: '寄送備取遞補意願調查（含確認連結）',     send: '備取遞補意願調查' },
  s4_admit_declined: { title: '寄送放棄後感謝信（單向）',               send: '放棄後感謝信' },
  s4_reject:         { title: '寄送不錄取感謝信（單向）',               send: '不錄取感謝信' },
}

// 第二/第三次「催覆」用的提醒前言（僅含連結的正取/備取意願調查信會用到）。
// 中文段共用 zh；外語段依收件人語言挑選 EN/VI/ID。
const REMIND = {
  zh: {
    2: '※ 提醒：本信為「第二次通知」。若您先前已回覆，敬請忽略本信；若尚未回覆，請於回覆期限前透過下方專屬連結告知就讀意願。',
    3: '※ 提醒：本信為「第三次（最後）通知」。若您先前已回覆，敬請忽略；若尚未回覆，請務必於回覆期限前透過下方專屬連結告知就讀意願，逾期恕難受理。',
  },
  EN: {
    2: '※ Reminder: This is our second notice. If you have already responded, please disregard this email; if not, please use your personal link below to indicate your enrollment intent before the deadline.',
    3: '※ Reminder: This is our third and final notice. If you have already responded, please disregard this email; otherwise, please be sure to indicate your intent via the link below before the deadline, as late replies cannot be accepted.',
  },
  VI: {
    2: '※ Nhắc nhở: Đây là thông báo lần thứ hai. Nếu bạn đã phản hồi, vui lòng bỏ qua email này; nếu chưa, vui lòng dùng liên kết cá nhân bên dưới để cho biết nguyện vọng nhập học trước thời hạn.',
    3: '※ Nhắc nhở: Đây là thông báo lần thứ ba và là lần cuối. Nếu bạn đã phản hồi, vui lòng bỏ qua; nếu chưa, vui lòng cho biết nguyện vọng qua liên kết bên dưới trước thời hạn, vì phản hồi trễ sẽ không được chấp nhận.',
  },
  ID: {
    2: '※ Pengingat: Ini adalah pemberitahuan kedua. Jika Anda sudah merespons, abaikan email ini; jika belum, gunakan tautan pribadi di bawah untuk menyatakan minat studi Anda sebelum batas waktu.',
    3: '※ Pengingat: Ini adalah pemberitahuan ketiga sekaligus terakhir. Jika Anda sudah merespons, abaikan; jika belum, pastikan menyatakan minat melalui tautan di bawah sebelum batas waktu, karena balasan terlambat tidak dapat diterima.',
  },
}
const REMIND_SUBJ = '【提醒 Reminder】'
const ZH_GREET = '親愛的 {{中文姓名}} 同學，您好：'
// 外語段加在最前面、中文段加在分隔線後的中文問候語之前。每段自帶結尾換行。
const injectRemind = (body, lang, round) => {
  if (!body || !round || round < 2) return body
  const fx = (REMIND[lang] || REMIND.EN)[round] || ''
  const zh = REMIND.zh[round] || ''
  let out = body
  if (fx) out = fx + '\n\n' + out
  if (zh && out.includes(ZH_GREET)) out = out.replace(ZH_GREET, zh + '\n\n' + ZH_GREET)
  return out
}

const newToken = () => {
  const u = () => (crypto?.randomUUID ? crypto.randomUUID().replace(/-/g, '') : Math.random().toString(36).slice(2) + Date.now().toString(36))
  return ('s4' + u()).slice(0, 40)
}
const toDeadlineIso = (ymd) => {
  const d = String(ymd || '').trim().replace(/\//g, '-')
  return d ? `${d}T23:59:59+08:00` : null
}
const fmtYmd = (dt) => `${dt.getFullYear()}/${String(dt.getMonth() + 1).padStart(2, '0')}/${String(dt.getDate()).padStart(2, '0')}`
const plusDays = (n) => fmtYmd(new Date(Date.now() + n * 86400000))

const LANG_TO_I18N = { EN: 'en', VI: 'vi', ID: 'id' }
// 校區多語名稱（與學生端落地頁 ConfirmApp 的 CAMPUS_I18N 一致）。
const CAMPUS_I18N = {
  '台北校區': { zh: '台北校區', en: 'Taipei Campus', vi: 'Cơ sở Đài Bắc', id: 'Kampus Taipei' },
  '高雄校區': { zh: '高雄校區', en: 'Kaohsiung Campus', vi: 'Cơ sở Cao Hùng', id: 'Kampus Kaohsiung' },
}
// 信件用：把系所所屬校區包成括號附在系名後；無法判定（其他）時回傳空字串，避免空欄。
// zh 用全形括號、外語用半形括號並前置空格，直接接在 {{系所中}}/{{系所外}} 之後。
const campusParens = (dept = '', il = 'en') => {
  const camp = campusOf(dept)
  if (!camp || camp === '其他') return ''
  const name = CAMPUS_I18N[camp]?.[il] || camp
  return il === 'zh' ? `（${name}）` : ` (${name})`
}
const CAT_ZH = (r) => (r.stage3_status === 'admitted' ? '正取' : (r.stage3_status === 'waitlisted' ? `備取${r.standby_rank ?? ''}` : ''))
const CAT_FX = (r, lang) => {
  if (r.stage3_status === 'admitted') return { EN: 'Admitted', VI: 'Trúng tuyển chính thức', ID: 'Diterima' }[lang] || 'Admitted'
  if (r.stage3_status === 'waitlisted') {
    const n = r.standby_rank ?? ''
    return { EN: `Waitlist No. ${n}`, VI: `Dự bị số ${n}`, ID: `Daftar tunggu No. ${n}` }[lang] || `Waitlist No. ${n}`
  }
  return ''
}

// recipients 可為 stage4 列（含 appInfo / id / confirm_token / stage3_status / standby_rank）
// 或扁平列（getStage4Rejected：account/name/name_english/email/nationality/department）
function normalize(recipients) {
  return (recipients || []).map((r, i) => {
    const ai = r.appInfo || {}
    return {
      key: r.id ?? r.account ?? `row${i}`,
      id: r.id ?? null,
      account: r.account,
      department: r.department || '',
      stage3_status: r.stage3_status,
      standby_rank: r.standby_rank ?? null,
      confirm_token: r.confirm_token || '',
      name: ai.name ?? r.name ?? '',
      name_english: ai.name_english ?? r.name_english ?? '',
      email: ai.email ?? r.email ?? '',
      nationality: ai.nationality ?? r.nationality ?? '',
      lang: pickLang(ai.nationality ?? r.nationality),
      include: true,
    }
  }).filter((r) => r.email)
}

// props:
//   kind: 's4_admit' | 's4_promote' | 's4_admit_declined' | 's4_reject'
//   recipients: 上述兩種列皆可
//   defaults: { replyBy, announceDate, contactPerson, contactEmail, unitName, customZh, customForeignEn, customForeignVi, customForeignId }（梯次設定預填，可省）
export default function AdmitMailComposer({ kind = 's4_admit', recipients, defaults, settingsByBatch = {}, onClose, onToast }) {
  const hasLink = LINK_KINDS.has(kind)
  const meta = KIND_META[kind] || KIND_META.s4_admit

  const [form, setForm] = useState(() => ({
    replyBy: defaults?.replyBy || plusDays(7),
    announceDate: defaults?.announceDate || '',
    contactPerson: defaults?.contactPerson || '',
    contactEmail: defaults?.contactEmail || 'shihchien_ifp@g2.usc.edu.tw',
    unitName: defaults?.unitName || '國際事務處 Office of International Affairs',
    customZh: defaults?.customZh || '',
    customForeignEn: defaults?.customForeignEn || '',
    customForeignVi: defaults?.customForeignVi || '',
    customForeignId: defaults?.customForeignId || '',
  }))
  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  // 非同步載入的 defaults 第一次到位時套用一次（不覆蓋使用者後續編輯）
  const appliedRef = useRef(false)
  useEffect(() => {
    if (appliedRef.current || !defaults) return
    const filtered = Object.fromEntries(Object.entries(defaults).filter(([, v]) => v != null && v !== ''))
    if (!Object.keys(filtered).length) return
    appliedRef.current = true
    setForm((f) => ({ ...f, ...filtered }))
  }, [defaults])

  const baseRows = useMemo(() => normalize(recipients), [recipients])
  const [rows, setRows] = useState(baseRows)
  useEffect(() => { setRows(baseRows) }, [baseRows])
  const setRow = (key, p) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)))

  const [created, setCreated] = useState({})
  const [sentMap, setSentMap] = useState({})
  const [tokenMap, setTokenMap] = useState({})
  useEffect(() => {
    getMailLog(kind).then((sm) => {
      setSentMap(sm)
      setCreated((c) => {
        const n = { ...c }
        for (const r of baseRows) {
          const log = sm[r.account]
          if (!n[r.account] && log?.status === 'draft' && log.draft_ids?.length) n[r.account] = log.draft_ids[0]
        }
        return n
      })
    }).catch(() => {})
  }, [kind, baseRows])

  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState(null)
  const [noticeRound, setNoticeRound] = useState(1)   // 1=首次 2=第二次催覆 3=第三次催覆（僅含連結信使用）

  const linkFor = (token) => `${window.location.origin}/#/confirm?t=${token}`
  // 所有梯次相關內容（放榜日期 / 回覆期限 / 承辦資訊）一律依每位收件人帳號的梯次，
  // 從「發送設定」帶入；寄信視窗不再提供可編輯欄位，避免誤改或混批誤帶。
  const settingFor = (r) => settingsByBatch?.[String(batchOf(r.account))] || {}
  const announceFor = (r) => settingFor(r).announce_date || ''
  const replyByFor  = (r) => settingFor(r).reply_by || ''
  const contactPersonFor = (r) => settingFor(r).contact_person || ''
  const contactEmailFor  = (r) => settingFor(r).contact_email || 'shihchien_ifp@g2.usc.edu.tw'
  const unitNameFor      = (r) => settingFor(r).unit_name || '國際事務處 Office of International Affairs'
  const dataFor = (r, token) => {
    const il = LANG_TO_I18N[r.lang] || 'en'
    const base = {
      中文姓名: r.name, 英文姓名: r.name_english || r.name,
      系所中: r.department, 系所外: deptI18n(r.department, il),
      校區中: campusParens(r.department, 'zh'), 校區外: campusParens(r.department, il),
      類別中: CAT_ZH(r), 類別外: CAT_FX(r, r.lang),
      回覆期限: replyByFor(r), 正式放榜日期: announceFor(r),
      承辦人: contactPersonFor(r), 聯絡信箱: contactEmailFor(r), 單位名稱: unitNameFor(r),
      自訂中: form.customZh,
      自訂外: r.lang === 'VI' ? form.customForeignVi : r.lang === 'ID' ? form.customForeignId : form.customForeignEn,
    }
    if (hasLink) base.確認連結 = linkFor(token || r.confirm_token || tokenMap[r.key] || '（寄出時自動產生）')
    return base
  }
  const msgFor = (r, token) => {
    const m = buildMessage({ kind, lang: r.lang, data: dataFor(r, token) })
    if (!m) return m
    if (hasLink && noticeRound > 1) {
      return { subject: REMIND_SUBJ + m.subject, body: injectRemind(m.body, r.lang, noticeRound) }
    }
    return m
  }

  const selected = rows.filter((r) => r.include)

  // 本批名單實際涵蓋的梯次（含該梯發送設定）；供唯讀核對區與寄送前驗證共用。
  const batchEntries = (() => {
    const seen = []
    const has = new Set()
    for (const r of selected) {
      const b = String(batchOf(r.account))
      if (has.has(b)) continue
      has.add(b)
      seen.push({ b, label: BATCHES.find((x) => String(x.v) === b)?.label || `梯次 ${b}`, st: settingsByBatch?.[b] || {} })
    }
    return seen.sort((a, z) => a.b.localeCompare(z.b))
  })()

  const validate = () => {
    if (!selected.length) return '沒有勾選任何學生'
    if (hasLink && selected.some((r) => !r.id)) return '此名單缺少 stage4 紀錄 id，無法產生確認連結'
    if (hasLink) {
      const bad = batchEntries.find((e) => !e.st.announce_date || !e.st.reply_by)
      if (bad) return `${bad.label} 尚未在「發送設定」填寫放榜日期或回覆期限，請先補齊再寄送`
    }
    return null
  }

  const ensureTokens = async () => {
    const map = {}
    let i = 0
    for (const r of selected) {
      i += 1
      const token = r.confirm_token || tokenMap[r.key] || newToken()
      const fields = { confirm_deadline: toDeadlineIso(replyByFor(r)) }
      if (!r.confirm_token) fields.confirm_token = token
      await setStage4Confirm(r.id, fields)
      map[r.key] = token
      if (i % 10 === 0) onToast?.(`設定確認連結 ${i}/${selected.length}…`)
    }
    setTokenMap((m) => ({ ...m, ...map }))
    setRows((rs) => rs.map((r) => (map[r.key] ? { ...r, confirm_token: r.confirm_token || map[r.key] } : r)))
    return map
  }

  const doCreate = async () => {
    const err = validate()
    if (err) { onToast?.(err, 'warn'); return }
    setBusy(true)
    try {
      const tmap = hasLink ? await ensureTokens() : {}
      const messages = selected.map((r) => {
        const m = msgFor(r, tmap[r.key])
        return { to: r.email, subject: m.subject, body: m.body }
      })
      const res = await createDrafts(messages)
      const byEmail = Object.fromEntries((res.drafts || []).map((d) => [d.to, d.draftId]))
      const cmap = {}
      selected.forEach((r) => { if (byEmail[r.email]) cmap[r.account] = byEmail[r.email] })
      setCreated((c) => ({ ...c, ...cmap }))
      await logMail(Object.entries(cmap).map(([account, id]) => ({ account, kind, status: 'draft', draft_ids: [id] })))
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
    if (!window.confirm(`確定送出這批 ${entries.length} 封「${meta.send}」嗎？寄件人為公務信箱（會自動分批送出）。`)) return
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
        await logMail(accounts.map((account) => ({ account, kind, status: 'sent', sent_at: nowIso })))
        setSentMap((sm) => { const n = { ...sm }; accounts.forEach((a) => { n[a] = { account: a, kind, status: 'sent', sent_at: nowIso } }); return n })
        setCreated((c) => { const n = { ...c }; accounts.forEach((a) => delete n[a]); return n })
        sent += (res.sent ?? ids.length)
        onToast?.(`已送出 ${sent} / ${entries.length} 封…`)
      }
      onToast?.(`完成：已送出 ${sent} 封「${meta.send}」`)
    } catch (e) {
      onToast?.(`送出中斷（已成功 ${sent} 封）：${e.message}。剩餘草稿仍在草稿匣，可再按「送出本批」續送。`, 'error')
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
  const colCount = hasLink ? 8 : 7

  return (
    <Modal title={meta.title} onClose={onClose} width={980}>
      <div style={{ marginBottom: 14, background: '#faf9f6', border: '1px solid #eee', borderRadius: 8, padding: '10px 12px' }}>
        <div style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>
          以下內容依各生帳號梯次自動帶入「發送設定」，本視窗不可修改；如需調整，請至第四階段「發送設定」分頁。
        </div>
        {batchEntries.map((e) => (
          <div key={e.b} style={{ fontSize: 12, color: '#444', lineHeight: 1.9 }}>
            <span style={{ fontWeight: 600 }}>{e.label}</span>：
            {hasLink && <>放榜 <b>{e.st.announce_date || '—'}</b> · 回覆 <b>{e.st.reply_by || '—'}</b> · </>}
            承辦 {e.st.contact_person || '—'} · {e.st.contact_email || '—'}
            {hasLink && (!e.st.announce_date || !e.st.reply_by) &&
              <span style={{ color: '#dc2626' }}> ⚠ 此梯放榜日期 / 回覆期限尚未設定</span>}
          </div>
        ))}
        {!batchEntries.length && <div style={{ fontSize: 12, color: '#aaa' }}>尚無勾選對象</div>}
      </div>

      {hasLink && (
        <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <label style={{ ...lbl, marginBottom: 0 }}>通知次別</label>
          <select style={{ ...s.sel, padding: '4px 8px', maxWidth: 220 }} value={noticeRound} onChange={(e) => setNoticeRound(Number(e.target.value))}>
            <option value={1}>首次通知</option>
            <option value={2}>第二次（催覆）</option>
            <option value={3}>第三次（最後催覆）</option>
          </select>
          <span style={{ fontSize: 11, color: noticeRound > 1 ? '#b45309' : '#888' }}>
            {noticeRound > 1
              ? `信件開頭會加註「第${noticeRound === 2 ? '二' : '三'}次通知」提醒、主旨加上「${REMIND_SUBJ}」；專屬連結與回覆期限維持不變，僅寄給仍未回應者即可。`
              : '一般首次通知，信件內容維持原樣。'}
          </span>
        </div>
      )}

      {!hasLink && (
        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>自訂段落（中文）— 帶入中文段</label>
          <textarea style={{ ...s.input, minHeight: 56, marginBottom: 8 }} value={form.customZh} onChange={(e) => setF('customZh', e.target.value)} placeholder="例：本校○○學程／下一梯次仍在招生，歡迎參考…" />
          <label style={lbl}>自訂段落（英文）— 帶入英文版外語段</label>
          <textarea style={{ ...s.input, minHeight: 56, marginBottom: 8 }} value={form.customForeignEn} onChange={(e) => setF('customForeignEn', e.target.value)} placeholder="e.g. Our ○○ program is still open for the next intake…" />
          <label style={lbl}>自訂段落（越南文）— 帶入越南文版外語段</label>
          <textarea style={{ ...s.input, minHeight: 56, marginBottom: 8 }} value={form.customForeignVi} onChange={(e) => setF('customForeignVi', e.target.value)} placeholder="VD: Chương trình ○○ vẫn đang tuyển sinh đợt tới…" />
          <label style={lbl}>自訂段落（印尼文）— 帶入印尼文版外語段</label>
          <textarea style={{ ...s.input, minHeight: 56, marginBottom: 0 }} value={form.customForeignId} onChange={(e) => setF('customForeignId', e.target.value)} placeholder="Mis. Program ○○ kami masih dibuka untuk gelombang berikutnya…" />
        </div>
      )}

      <div style={{ maxHeight: '40vh', overflow: 'auto', border: '1px solid #eee', borderRadius: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
          <thead>
            <tr style={{ background: '#faf9f6', position: 'sticky', top: 0 }}>
              <th style={th}><input type="checkbox" checked={selected.length === rows.length && rows.length > 0}
                onChange={(e) => setRows((rs) => rs.map((r) => ({ ...r, include: e.target.checked })))} /></th>
              <th style={th}>姓名</th><th style={th}>系所</th>{hasLink && <th style={th}>類別</th>}
              <th style={th}>Email</th><th style={th}>語言</th><th style={th}>狀態</th><th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td style={td}><input type="checkbox" checked={r.include} onChange={(e) => setRow(r.key, { include: e.target.checked })} /></td>
                <td style={td}><div style={{ fontWeight: 500 }}>{r.name}</div><div style={{ color: '#aaa', fontSize: 11 }}>{r.name_english}</div></td>
                <td style={td}>{r.department}</td>
                {hasLink && <td style={td}>{CAT_ZH(r)}</td>}
                <td style={td}>{r.email}</td>
                <td style={td}>
                  <select style={{ ...s.sel, padding: '3px 6px' }} value={r.lang} onChange={(e) => setRow(r.key, { lang: e.target.value })}>
                    <option value="EN">中英</option><option value="VI">中越</option><option value="ID">中印尼</option>
                  </select>
                </td>
                <td style={td}>{statusOf(r.account)}</td>
                <td style={td}><button style={{ ...s.btn, ...s.btnSm }} onClick={() => setPreview(r)}>預覽</button></td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={colCount} style={{ ...td, textAlign: 'center', color: '#aaa', padding: 24 }}>沒有可寄送的名單（需有 Email）</td></tr>}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
        <span style={{ fontSize: 12, color: '#888' }}>勾選 {selected.length} / {rows.length} 位 · 已建草稿 {Object.keys(created).length} 封</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <Btn onClick={doCreate} disabled={busy}>① 建立草稿{hasLink ? '（並產生確認連結）' : ''}</Btn>
          <Btn variant="primary" onClick={doSend} disabled={busy || !Object.keys(created).length}>② 送出本批</Btn>
        </div>
      </div>
      <div style={{ fontSize: 11, color: '#aaa', marginTop: 8, lineHeight: 1.6 }}>
        {hasLink
          ? '流程：按「建立草稿」會先為每位學生產生專屬連結並寫入回覆期限 → 草稿進公務信箱可逐封檢查 → 回來按「送出本批」。學生點信中連結 → 開啟意願調查頁 → 自行表達意願，結果即時回到第四階段統計。期限前可改答案，每次變更都會留紀錄。'
          : '流程：此為單向通知信（無確認連結）。按「建立草稿」進公務信箱可逐封檢查 → 回來按「送出本批」。自訂段落會帶入信件對應語言段。'}
      </div>

      {preview && (() => {
        const m = msgFor(preview, preview.confirm_token || tokenMap[preview.key])
        return (
          <Modal title={`預覽 — ${preview.name}`} onClose={() => setPreview(null)} width={680}>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>收件人：{preview.email}</div>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>{m?.subject}</div>
            <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 13, background: '#faf9f6', padding: 14, borderRadius: 8, margin: 0 }}>{m?.body}</pre>
            {hasLink && <div style={{ fontSize: 11, color: '#aaa', marginTop: 8 }}>※ 連結會在按「建立草稿」時正式產生；預覽顯示的是占位或既有連結。</div>}
          </Modal>
        )
      })()}
    </Modal>
  )
}
