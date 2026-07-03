import { useState, useEffect, useMemo } from 'react'
import { Modal, Btn, s } from './UI'
import { createDrafts, sendDraftBatch } from '../api'
import { buildOnboardMail, onboardMailLang, ENROLL_STEPS, deptZhFull } from '../constants'

// 入學準備通知信寄送視窗（比照 Stage4 MailComposer 版型；模板走 constants.js buildOnboardMail）。
// 與 Stage4 MailComposer 的差異：
//   - 信是單語整封（zh/en/vi/id 依國籍自動帶、可逐列改），非中外雙段。
//   - 承辦窗口／截止日／放榜連結唯讀（依校區・梯次從 cfg 帶入），要改去後台「⚙ 設定」分頁。
//   - 寄送＝createDrafts → sendDraftBatch 一氣呵成（每批 8 封，直接寄出、非只建草稿）；
//     每批成功後呼叫 markSent 回報後端（enroll_progress reminder_count+1 / last_reminder_*、
//     enroll_log mail_sent），不走 mail_log（onboard 以 step×tier 記次，帳號+kind 的 mail_log 裝不下）。
// props：
//   step：步驟（模板目前僅步驟①；其餘 buildOnboardMail 回 null → 顯示提示、禁用寄送）
//   initialTier：預設次別（first/second/final，視窗內可改）
//   recipients：mail-recipients 名單列（account/name/name_en/department/campus/batch/nationality/
//     confirm_token/email/reminder_count/last_reminder_kind）
//   cfg：{ contacts: {台北,高雄}, resultLink: {台北,高雄}, deadlines: { '1': 'YYYY/MM/DD', '2': ... } }
//   markSent(accounts, tier)：每批寄成功後回報後端
//   onClose / onToast

const TIERS = [['first', '首次通知'], ['second', '二次提醒'], ['final', '最後提醒']]
const TIER_SHORT = { first: '首次', second: '二次', final: '最後' }
const LANGS = [['zh', '中文'], ['en', '英文'], ['vi', '越南文'], ['id', '印尼文']]
const CHUNK = 8   // 每批寄出封數（同 Stage4，避免 Apps Script 逾時）

export default function OnboardMailComposer({ step, initialTier = 'first', recipients, cfg, markSent, onClose, onToast }) {
  const stepZh = ENROLL_STEPS[step - 1]?.zh || `步驟${step}`
  const hasTemplate = !!buildOnboardMail({ step, tier: 'first', lang: 'zh', data: {} })

  const [tier, setTier] = useState(initialTier)
  const [form, setForm] = useState({ customZh: '', customEn: '', customVi: '', customId: '' })
  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const baseRows = useMemo(() => (recipients || [])
    .filter((r) => r.email)
    .map((r) => ({
      account: r.account, name: r.name || '', name_en: r.name_en || '',
      department: r.department || '', campus: r.campus || '', batch: String(r.batch ?? ''),
      nationality: r.nationality || '', confirm_token: r.confirm_token || '', email: r.email,
      lang: onboardMailLang(r.nationality),
      sentCount: r.reminder_count || 0, sentKind: r.last_reminder_kind || null,
      include: true,
    })), [recipients])
  const [rows, setRows] = useState(baseRows)
  useEffect(() => { setRows(baseRows) }, [baseRows])
  const setRow = (account, p) => setRows((rs) => rs.map((r) => (r.account === account ? { ...r, ...p } : r)))

  const [busy, setBusy] = useState(false)
  const [prog, setProg] = useState(null)      // { done, total }
  const [failed, setFailed] = useState([])    // [{ account, name, error }]
  const [preview, setPreview] = useState(null)

  const contacts = cfg?.contacts || {}
  const resultLink = cfg?.resultLink || {}
  const deadlines = cfg?.deadlines || {}

  const customFor = (lang) =>
    lang === 'zh' ? form.customZh : lang === 'vi' ? form.customVi : lang === 'id' ? form.customId : form.customEn
  const dataFor = (r) => {
    const camp = r.campus || '台北'
    const c = contacts[camp] || contacts['台北'] || {}
    return {
      name: r.name || '',
      link: `${window.location.origin}/#/onboard?t=${r.confirm_token}`,
      result_link: String(resultLink[camp] || resultLink['台北'] || '').trim(),
      deadline: deadlines[r.batch] || '',
      contact_name: c.name || '', contact_email: c.email || '', contact_phone: c.phone || '',
      custom: customFor(r.lang),
    }
  }
  const msgFor = (r) => buildOnboardMail({ step, tier, lang: r.lang, data: dataFor(r) })

  const selected = rows.filter((r) => r.include)

  // 寄出（targets 未帶＝勾選列；帶＝重試失敗名單）。每批：建草稿 → 立即送出 → markSent 回報。
  const doSend = async (targets) => {
    if (busy) return
    const list = targets || selected
    if (!hasTemplate) { onToast?.('此步驟的信件模板尚未提供', 'warn'); return }
    if (!list.length) { onToast?.('沒有勾選任何學生', 'warn'); return }
    const noToken = list.filter((r) => !r.confirm_token)
    if (noToken.length) {
      onToast?.(`以下學生缺少專屬連結 token，無法寄送：${noToken.map((r) => r.account).join('、')}`, 'warn')
      return
    }
    const tierLabel = TIERS.find(([v]) => v === tier)?.[1]
    if (!window.confirm(`確定寄出 ${list.length} 封「${stepZh}｜${tierLabel}」通知信？\n寄件人為公務信箱，將直接寄出（自動分批，每批 ${CHUNK} 封）。`)) return
    setBusy(true); setFailed([]); setProg({ done: 0, total: list.length })
    let sent = 0
    const fails = []
    try {
      for (let i = 0; i < list.length; i += CHUNK) {
        const part = list.slice(i, i + CHUNK)
        try {
          const messages = part.map((r) => {
            const m = msgFor(r)
            return { to: r.email, subject: m.subject, body: m.body }
          })
          const res = await createDrafts(messages)
          const byEmail = Object.fromEntries((res.drafts || []).map((d) => [d.to, d.draftId]))
          const okRows = part.filter((r) => byEmail[r.email])
          part.filter((r) => !byEmail[r.email]).forEach((r) => fails.push({ account: r.account, name: r.name, error: '建立草稿失敗' }))
          if (okRows.length) {
            await sendDraftBatch(okRows.map((r) => byEmail[r.email]))
            sent += okRows.length
            setRows((rs) => rs.map((r) => (okRows.some((o) => o.account === r.account)
              ? { ...r, sentCount: r.sentCount + 1, sentKind: tier } : r)))
            // 信已寄出，回報失敗只提示、不列入失敗名單（避免重試造成重複寄信）
            try { await markSent?.(okRows.map((r) => r.account), tier) }
            catch { onToast?.('信已寄出，但寄送紀錄回報失敗（次數統計可能少計）', 'warn') }
          }
        } catch (e) {
          part.forEach((r) => fails.push({ account: r.account, name: r.name, error: e.message }))
        }
        setProg({ done: Math.min(i + CHUNK, list.length), total: list.length })
        onToast?.(`已寄出 ${sent} / ${list.length} 封…`)
      }
      setFailed(fails)
      onToast?.(fails.length ? `完成：寄出 ${sent} 封、失敗 ${fails.length} 封（可重試）` : `完成：已寄出 ${sent} 封`, fails.length ? 'warn' : 'ok')
    } finally { setBusy(false); setProg(null) }
  }
  const retryFailed = () => {
    const bad = new Set(failed.map((f) => f.account))
    doSend(rows.filter((r) => bad.has(r.account)))
  }

  const lbl = { fontSize: 12, color: '#666', display: 'block', marginBottom: 3 }
  const th = { padding: '7px 8px', textAlign: 'left', borderBottom: '1px solid #e8e7e3', color: '#888', fontWeight: 500, fontSize: 11, whiteSpace: 'nowrap' }
  const td = { padding: '6px 8px', borderBottom: '1px solid #f5f4f0', fontSize: 12, verticalAlign: 'middle' }
  const statusOf = (r) => r.sentCount
    ? <span style={{ color: '#15803d' }}>已寄送 {r.sentCount} 次{r.sentKind ? `（${TIER_SHORT[r.sentKind] || '—'}）` : ''}</span>
    : <span style={{ color: '#ccc' }}>—</span>

  return (
    <Modal title={`寄送入學準備通知信 — ${stepZh}`} onClose={onClose} width={1040}>
      {/* 模板未提供（步驟②~⑤） */}
      {!hasTemplate && (
        <div style={{ marginBottom: 14, background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#b45309', lineHeight: 1.7 }}>
          「{stepZh}」的信件模板將於後續版本提供，目前僅能檢視名單，無法寄送。
        </div>
      )}

      {/* 唯讀帶入資訊：承辦窗口 / 放榜連結（依校區）＋ 該步截止日（依梯次） */}
      <div style={{ marginBottom: 14, background: '#faf9f6', border: '1px solid #eee', borderRadius: 8, padding: '10px 12px' }}>
        <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>
          以下內容依各生校區・梯次自動帶入，本視窗不可修改；如需調整請至後台「⚙ 設定」分頁。
        </div>
        {['台北', '高雄'].map((c) => {
          const ct = contacts[c] || {}
          const hasRl = !!String(resultLink[c] || '').trim()
          return (
            <div key={c} style={{ fontSize: 12, color: '#444', lineHeight: 1.9 }}>
              <span style={{ fontWeight: 600 }}>{c}校區</span>：
              承辦 {ct.name || '—'} · {ct.email || '—'}{ct.phone ? ` · ${ct.phone}` : ''} · 放榜連結{' '}
              {hasRl ? '已設定' : <span style={{ color: '#b45309' }}>未設定（信中略過該段）</span>}
            </div>
          )
        })}
        <div style={{ fontSize: 12, color: '#444', lineHeight: 1.9 }}>
          <span style={{ fontWeight: 600 }}>「{stepZh}」截止日</span>：第一梯 {deadlines['1'] || '—'} · 第二梯 {deadlines['2'] || '—'}
          {(!deadlines['1'] || !deadlines['2']) && <span style={{ color: '#b45309' }}>（未設定的梯次，信中略過期限句）</span>}
        </div>
      </div>

      {/* 次別（換信首提醒段＋主旨前綴，沿用模板 tier 語意） */}
      <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <label style={{ ...lbl, marginBottom: 0 }}>通知次別</label>
        <select style={{ ...s.sel, padding: '4px 8px', maxWidth: 220 }} value={tier} onChange={(e) => setTier(e.target.value)}>
          {TIERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <span style={{ fontSize: 11, color: tier !== 'first' ? '#b45309' : '#888' }}>
          {tier !== 'first'
            ? `信件開頭會加註${tier === 'second' ? '「尚未完成」提醒段' : '「最後提醒、逾期恐影響入學」段'}、主旨加上提醒前綴；僅寄給仍未完成者即可。`
            : '一般首次通知（放榜恭喜＋資料確認），信件內容維持原樣。'}
        </span>
      </div>

      {/* 四語自訂段落（插在簽名檔前；依收件人語言擇一帶入） */}
      <div style={{ marginBottom: 14 }}>
        <label style={lbl}>自訂段落（中文）— 帶入中文信</label>
        <textarea style={{ ...s.input, minHeight: 52, marginBottom: 8 }} value={form.customZh} onChange={(e) => setF('customZh', e.target.value)} placeholder="例：開學典禮訂於 9/1 舉行，詳細資訊將另行通知…" />
        <label style={lbl}>自訂段落（英文）— 帶入英文信</label>
        <textarea style={{ ...s.input, minHeight: 52, marginBottom: 8 }} value={form.customEn} onChange={(e) => setF('customEn', e.target.value)} placeholder="e.g. The opening ceremony will be held on Sept 1…" />
        <label style={lbl}>自訂段落（越南文）— 帶入越南文信</label>
        <textarea style={{ ...s.input, minHeight: 52, marginBottom: 8 }} value={form.customVi} onChange={(e) => setF('customVi', e.target.value)} placeholder="VD: Lễ khai giảng sẽ được tổ chức vào ngày 1/9…" />
        <label style={lbl}>自訂段落（印尼文）— 帶入印尼文信</label>
        <textarea style={{ ...s.input, minHeight: 52, marginBottom: 0 }} value={form.customId} onChange={(e) => setF('customId', e.target.value)} placeholder="Mis. Upacara pembukaan akan diadakan pada 1 September…" />
      </div>

      {/* 名單 */}
      <div style={{ maxHeight: '40vh', overflow: 'auto', border: '1px solid #eee', borderRadius: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
          <thead>
            <tr style={{ background: '#faf9f6', position: 'sticky', top: 0 }}>
              <th style={th}><input type="checkbox" checked={selected.length === rows.length && rows.length > 0}
                onChange={(e) => setRows((rs) => rs.map((r) => ({ ...r, include: e.target.checked })))} /></th>
              <th style={th}>姓名</th><th style={th}>系所</th><th style={th}>Email</th>
              <th style={th}>語言</th><th style={th}>狀態</th><th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.account}>
                <td style={td}><input type="checkbox" checked={r.include} onChange={(e) => setRow(r.account, { include: e.target.checked })} /></td>
                <td style={td}><div style={{ fontWeight: 500 }}>{r.name}</div><div style={{ color: '#aaa', fontSize: 11 }}>{r.name_en}</div></td>
                <td style={td}>{deptZhFull(r.department) || r.department || '—'}</td>
                <td style={td}>{r.email}</td>
                <td style={td}>
                  <select style={{ ...s.sel, padding: '3px 6px' }} value={r.lang} onChange={(e) => setRow(r.account, { lang: e.target.value })}>
                    {LANGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </td>
                <td style={td}>{statusOf(r)}</td>
                <td style={td}><button style={{ ...s.btn, ...s.btnSm }} disabled={!hasTemplate} onClick={() => setPreview(r)}>預覽</button></td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={7} style={{ ...td, textAlign: 'center', color: '#aaa', padding: 24 }}>沒有可寄送的名單（需有 Email）</td></tr>}
          </tbody>
        </table>
      </div>

      {/* 失敗名單（可重試） */}
      {failed.length > 0 && (
        <div style={{ marginTop: 12, fontSize: 12.5, color: '#b45309', lineHeight: 1.8, wordBreak: 'break-all' }}>
          失敗 {failed.length} 筆：{failed.map((f) => `${f.name || f.account}（${f.error}）`).join('、')}
          <button style={{ ...s.btn, ...s.btnSm, marginLeft: 8 }} disabled={busy} onClick={retryFailed}>重試失敗名單</button>
        </div>
      )}

      {/* 動作列 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
        <span style={{ fontSize: 12, color: '#888' }}>勾選 {selected.length} / {rows.length} 位</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <Btn variant="primary" onClick={() => doSend()} disabled={busy || !hasTemplate || !selected.length}>
            {busy ? (prog ? `寄出中 ${prog.done}/${prog.total}…` : '寄出中…') : `✉ 寄出（${selected.length} 封）`}
          </Btn>
        </div>
      </div>
      <div style={{ fontSize: 11, color: '#aaa', marginTop: 8, lineHeight: 1.6 }}>
        按「寄出」即以公務信箱直接寄出（自動分批，每批 {CHUNK} 封；中斷可對失敗名單重試）。
        語言依國籍自動帶、可逐列改；建議先按逐列「預覽」確認內容再寄。寄成功會計入「已寄送次數」，同一人可重寄。
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
