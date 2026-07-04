import { useState, useEffect, useMemo } from 'react'
import { Modal, Btn, s } from './UI'
import { createDrafts, sendDraftBatch } from '../api'
import { buildOnboardMail, onboardMailLang, ENROLL_STEPS, deptZhFull, ONBOARD_RESULT_LINK } from '../constants'

// 入學準備通知信寄送視窗（比照 Stage4 MailComposer 版型；模板走 constants.js buildOnboardMail）。
// 與 Stage4 MailComposer 的差異：
//   - 信一律雙語整封：外語在前、中文在後（buildOnboardMail 呼叫兩次拼接，主旨「外語 / 中文」）；
//     逐列語言下拉選的是外語（中英→en、中越→vi、中印尼→id）。無自訂段落欄
//     （步驟①定稿不需要；日後某步要加回時，buildOnboardMail 仍支援 data.custom）。
//   - 承辦窗口／截止日／放榜連結唯讀（依校區・梯次從 cfg 帶入），要改去後台「⚙ 設定」分頁。
//   - 兩鈕流程同 Stage4：「① 建立草稿到公務信箱」createDrafts（可到 Gmail 逐封檢查／微調，
//     每批成功呼叫 markDraft 寫 enroll_log mail_draft、不加提醒計數）→「② 送出本批」
//     sendDraftBatch 一次寄出（每批成功呼叫 markSent：reminder_count+1 / last_reminder_* /
//     enroll_log mail_sent）。不走 mail_log（onboard 以 step×tier 記次，帳號+kind 的 mail_log 裝不下），
//     故草稿 draftId 只存在本視窗 state，關閉視窗後請直接在 Gmail 草稿匣寄出。
// props：
//   step：步驟（模板目前僅步驟①；其餘 buildOnboardMail 回 null → 顯示提示、禁用寄送）
//   initialTier：預設次別（first/second/final，視窗內可改）
//   recipients：mail-recipients 名單列（account/name/name_en/name_english/department/campus/batch/
//     nationality/confirm_token/email/reminder_count/last_reminder_kind）
//   cfg：{ contacts: {台北,高雄}, resultLink: {台北,高雄}, deadlines: { '1': 'YYYY/MM/DD', '2': ... } }
//   markDraft(accounts, tier)：每批草稿建立成功後回報（log mail_draft）
//   markSent(accounts, tier)：每批寄出成功後回報（計次 + log mail_sent）
//   onClose / onToast

const TIERS = [['first', '首次通知'], ['second', '二次提醒'], ['final', '最後提醒']]
const TIER_SHORT = { first: '首次', second: '二次', final: '最後' }
const LANGS = [['en', '中英'], ['vi', '中越'], ['id', '中印尼']]
const CHUNK = 8   // 每批封數（建草稿／送出皆分批，同 Stage4，避免 Apps Script 逾時）
const SEP = '\n\n────────────────────────────\n\n'   // 外語段／中文段分隔線（同 mailTemplates 慣例）

// 依通知次別自動預選收件對象：
//   first  → 只勾「從未寄過」的新到者（sentCount===0）；
//   second → 只勾「已收首次(first)、仍卡關」者；
//   final  → 只勾「已收二次(second)、仍卡關」者。
// 名單本就只含卡在該步(open/submitted)者，故「仍卡關」隱含成立。
// 目的：行政每天開同一 tier 重寄時，不會再寄給已收過的人，毋須人腦記次數（計次存在 enroll_progress）。
const suggestInclude = (r, tier) => {
  const kind = r.sentKind || null
  if (tier === 'second') return kind === 'first'
  if (tier === 'final') return kind === 'second'
  return (r.sentCount || 0) === 0   // first
}

export default function OnboardMailComposer({ step, initialTier = 'first', recipients, cfg, markDraft, markSent, onClose, onToast }) {
  const stepZh = step === 0 ? '通知信' : (ENROLL_STEPS[step - 1]?.zh || `步驟${step}`)
  const hasTemplate = !!buildOnboardMail({ step, tier: 'first', lang: 'zh', data: {} })

  const [tier, setTier] = useState(initialTier)

  const baseRows = useMemo(() => (recipients || [])
    .filter((r) => r.email)
    .map((r) => {
      const l = onboardMailLang(r.nationality)
      const sc = r.reminder_count || 0
      const sk = r.last_reminder_kind || null
      return {
        account: r.account, name: r.name || '', name_en: r.name_english || r.name_en || '',
        department: r.department || '', campus: r.campus || '', batch: String(r.batch ?? ''),
        nationality: r.nationality || '', confirm_token: r.confirm_token || '', email: r.email,
        lang: l === 'zh' ? 'en' : l,   // 下拉選的是外語；台/中籍預設中英
        sentCount: sc, sentKind: sk,
        sentNow: false, include: suggestInclude({ sentCount: sc, sentKind: sk }, initialTier),
      }
    }), [recipients, initialTier])
  const [rows, setRows] = useState(baseRows)
  useEffect(() => { setRows(baseRows) }, [baseRows])
  // 切換通知次別 → 依新 tier 重新預選收件對象（見 suggestInclude）；手動勾選會被重置為建議名單
  useEffect(() => {
    setRows((rs) => rs.map((r) => ({ ...r, include: suggestInclude(r, tier) })))
  }, [tier])
  const setRow = (account, p) => setRows((rs) => rs.map((r) => (r.account === account ? { ...r, ...p } : r)))

  const [created, setCreated] = useState({})   // { account: draftId }（僅本視窗有效）
  const [busy, setBusy] = useState(false)
  const [prog, setProg] = useState(null)      // { done, total }
  const [failed, setFailed] = useState([])    // 建草稿失敗 [{ account, name, error }]
  const [preview, setPreview] = useState(null)

  const contacts = cfg?.contacts || {}
  const deadlines = cfg?.deadlines || {}

  const dataFor = (r) => {
    const camp = r.campus || '台北'
    const c = contacts[camp] || contacts['台北'] || {}
    return {
      name: r.name || '', name_english: r.name_en || '',
      // 傳原始系所/校區，由 buildOnboardMail 依語言解析（zh 全名、外語 DEPT_I18N 定稿）
      department: r.department || '', campus: r.campus || '',
      link: `${window.location.origin}/#/onboard?t=${r.confirm_token}`,
      result_link: ONBOARD_RESULT_LINK,
      deadline: deadlines[r.batch] || '',
      contact_name: c.name || '', contact_email: c.email || '', contact_phone: c.phone || '',
    }
  }
  // 雙語組信：外語（該列下拉）在前、中文在後
  const msgFor = (r) => {
    const data = dataFor(r)
    const fx = buildOnboardMail({ step, tier, lang: r.lang, data })
    const zh = buildOnboardMail({ step, tier, lang: 'zh', data })
    if (!fx || !zh) return null
    return { subject: `${fx.subject} / ${zh.subject}`, body: fx.body + SEP + zh.body }
  }

  const selected = rows.filter((r) => r.include)

  // ① 建立草稿到公務信箱（targets 未帶＝勾選列；帶＝重試失敗名單）。每批成功後 markDraft 回報。
  const doCreate = async (targets) => {
    if (busy) return
    const list = targets || selected
    if (!hasTemplate) { onToast?.('此步驟的信件模板尚未提供', 'warn'); return }
    if (!list.length) { onToast?.('沒有勾選任何學生', 'warn'); return }
    const noToken = list.filter((r) => !r.confirm_token)
    if (noToken.length) {
      onToast?.(`以下學生缺少專屬連結 token，無法寄送：${noToken.map((r) => r.account).join('、')}`, 'warn')
      return
    }
    setBusy(true); setFailed([]); setProg({ done: 0, total: list.length })
    let built = 0
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
            built += okRows.length
            setCreated((c) => ({ ...c, ...Object.fromEntries(okRows.map((r) => [r.account, byEmail[r.email]])) }))
            // 只記 log（mail_draft），不加提醒計數；回報失敗不擋流程
            try { await markDraft?.(okRows.map((r) => r.account), tier) } catch { /* log 失敗不阻斷 */ }
          }
        } catch (e) {
          part.forEach((r) => fails.push({ account: r.account, name: r.name, error: e.message }))
        }
        setProg({ done: Math.min(i + CHUNK, list.length), total: list.length })
      }
      setFailed(fails)
      onToast?.(fails.length
        ? `已建立 ${built} 封草稿、失敗 ${fails.length} 封（可重試）`
        : `已建立 ${built} 封草稿到公務信箱`, fails.length ? 'warn' : 'ok')
    } finally { setBusy(false); setProg(null) }
  }
  const retryFailed = () => {
    const bad = new Set(failed.map((f) => f.account))
    doCreate(rows.filter((r) => bad.has(r.account)))
  }

  // ② 送出本批：把已建草稿（且仍勾選者）分批 sendDraftBatch；每批成功後 markSent 計次。
  const doSend = async () => {
    if (busy) return
    const included = new Set(selected.map((r) => r.account))
    const entries = Object.entries(created).filter(([a]) => included.has(a))   // [[account, draftId], ...]
    if (!entries.length) { onToast?.('尚未建立草稿（或草稿對應的學生都未勾選）', 'warn'); return }
    const tierLabel = TIERS.find(([v]) => v === tier)?.[1]
    if (!window.confirm(`確定送出這批 ${entries.length} 封「${stepZh}｜${tierLabel}」草稿嗎？\n寄件人為公務信箱（自動分批，每批 ${CHUNK} 封）。`)) return
    setBusy(true)
    let sent = 0
    try {
      for (let i = 0; i < entries.length; i += CHUNK) {
        const part = entries.slice(i, i + CHUNK)
        const ids = part.map(([, id]) => id)
        const accounts = part.map(([a]) => a)
        await sendDraftBatch(ids)
        sent += ids.length
        const accSet = new Set(accounts)
        setRows((rs) => rs.map((r) => (accSet.has(r.account)
          ? { ...r, sentNow: true, sentCount: r.sentCount + 1, sentKind: tier } : r)))
        setCreated((c) => { const n = { ...c }; accounts.forEach((a) => delete n[a]); return n })
        // 信已寄出，回報失敗只提示、不中斷（避免重送造成重複寄信）
        try { await markSent?.(accounts, tier) }
        catch { onToast?.('信已寄出，但寄送紀錄回報失敗（次數統計可能少計）', 'warn') }
        onToast?.(`已送出 ${sent} / ${entries.length} 封…`)
      }
      onToast?.(`完成：已送出 ${sent} 封`)
    } catch (e) {
      onToast?.(`送出中斷（已成功 ${sent} 封）：${e.message}。剩餘草稿仍在公務信箱草稿匣，可再按一次「② 送出本批」續送。`, 'error')
    } finally { setBusy(false) }
  }

  const th = { padding: '9px 12px', textAlign: 'left', borderBottom: '1px solid #e8e7e3', color: '#888', fontWeight: 500, fontSize: 11, whiteSpace: 'nowrap' }
  const td = { padding: '8px 12px', borderBottom: '1px solid #f5f4f0', fontSize: 12.5, lineHeight: 1.5, verticalAlign: 'middle' }
  const statusOf = (r) => {
    if (r.sentNow) return <span style={{ color: '#15803d' }}>已寄送</span>
    if (created[r.account]) return <span style={{ color: '#b45309' }}>已建草稿</span>
    if (r.sentCount) return <span style={{ color: '#15803d' }}>已寄送 {r.sentCount} 次{r.sentKind ? `（${TIER_SHORT[r.sentKind] || '—'}）` : ''}</span>
    return <span style={{ color: '#ccc' }}>—</span>
  }

  return (
    <Modal title={`寄送入學準備通知信 — ${stepZh}`} onClose={onClose} width={1040}>
      {/* 模板未提供（步驟②~⑤） */}
      {!hasTemplate && (
        <div style={{ marginBottom: 18, background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#b45309', lineHeight: 1.7 }}>
          「{stepZh}」的信件模板將於後續版本提供，目前僅能檢視名單，無法寄送。
        </div>
      )}

      {/* 唯讀帶入資訊：承辦窗口 / 放榜連結（依校區）＋ 該步截止日（依梯次） */}
      <div style={{ marginBottom: 18, background: '#faf9f6', border: '1px solid #eee', borderRadius: 10, padding: '12px 16px' }}>
        <div style={{ fontSize: 11.5, color: '#999', marginBottom: 8 }}>
          以下內容依各生校區・梯次自動帶入，本視窗不可修改；如需調整請至後台「⚙ 設定」分頁。
        </div>
        {['台北', '高雄'].map((c) => {
          const ct = contacts[c] || {}
          return (
            <div key={c} style={{ fontSize: 12.5, color: '#444', lineHeight: 2 }}>
              <span style={{ fontWeight: 600 }}>{c}校區</span>：
              承辦 {ct.name || '—'} · {ct.email || '—'}{ct.phone ? ` · ${ct.phone}` : ''}
            </div>
          )
        })}
        <div style={{ fontSize: 12.5, color: '#444', lineHeight: 2 }}>
          <span style={{ fontWeight: 600 }}>放榜名單連結（固定）</span>：{ONBOARD_RESULT_LINK}
        </div>
        <div style={{ fontSize: 12.5, color: '#444', lineHeight: 2 }}>
          <span style={{ fontWeight: 600 }}>「{stepZh}」截止日</span>：第一梯 {deadlines['1'] || '—'} · 第二梯 {deadlines['2'] || '—'}
          {(!deadlines['1'] || !deadlines['2']) && <span style={{ color: '#b45309' }}>（未設定的梯次，信中略過期限句）</span>}
        </div>
      </div>

      {/* 次別（換信首提醒段＋主旨前綴，沿用模板 tier 語意）；說明獨立一行不跟下拉擠 */}
      <div style={{ marginBottom: 18 }}>
        <span style={s.secLabel}>通知次別</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <select style={{ ...s.sel, maxWidth: 220 }} value={tier} onChange={(e) => setTier(e.target.value)}>
            {TIERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div style={{ fontSize: 12, color: tier !== 'first' ? '#b45309' : '#999', marginTop: 6, lineHeight: 1.7 }}>
          {tier !== 'first'
            ? `信件開頭會加註${tier === 'second' ? '「尚未完成」提醒段' : '「最後提醒、逾期恐影響入學」段'}、主旨加上提醒前綴；僅寄給仍未完成者即可。`
            : '一般首次通知（放榜恭喜＋資料確認），信件內容維持原樣。'}
        </div>
      </div>

      {/* 名單 */}
      <span style={s.secLabel}>收件名單</span>
      <div style={{ fontSize: 12, color: '#666', margin: '4px 0 8px', lineHeight: 1.7 }}>
        依「{TIERS.find(([v]) => v === tier)?.[1]}」自動預選 <b>{rows.filter((r) => suggestInclude(r, tier)).length}</b> 位；
        已寄過本階段信的 {rows.filter((r) => (r.sentCount || 0) > 0).length} 位預設不勾（仍可手動加選）。
      </div>
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

      {/* 建草稿失敗名單（可重試） */}
      {failed.length > 0 && (
        <div style={{ marginTop: 12, fontSize: 12.5, color: '#b45309', lineHeight: 1.8, wordBreak: 'break-all' }}>
          失敗 {failed.length} 筆：{failed.map((f) => `${f.name || f.account}（${f.error}）`).join('、')}
          <button style={{ ...s.btn, ...s.btnSm, marginLeft: 8 }} disabled={busy} onClick={retryFailed}>重試失敗名單</button>
        </div>
      )}

      {/* 動作列（兩鈕流程同 Stage4） */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
        <span style={{ fontSize: 12, color: '#888' }}>勾選 {selected.length} / {rows.length} 位 · 已建草稿 {Object.keys(created).length} 封</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <Btn onClick={() => doCreate()} disabled={busy || !hasTemplate || !selected.length}>
            {busy && prog ? `建立草稿中 ${prog.done}/${prog.total}…` : '① 建立草稿到公務信箱'}
          </Btn>
          <Btn variant="primary" onClick={doSend} disabled={busy || !Object.keys(created).length}>② 送出本批</Btn>
        </div>
      </div>
      <div style={{ fontSize: 11.5, color: '#aaa', marginTop: 10, lineHeight: 1.8 }}>
        流程：先「① 建立草稿」→ 草稿會進公務信箱草稿夾，可在 Gmail 逐封檢查／微調 → 回來按「② 送出本批」一次寄出；
        或建完草稿直接按「② 送出本批」。信件一律雙語（外語在前、中文在後），語言依國籍自動帶、可逐列改；
        建議先按逐列「預覽」確認內容。送出成功才計入「已寄送次數」，同一人可重寄。
      </div>

      {/* 預覽（顯示的即是雙語 body：外語在上、中文在下） */}
      {preview && (() => {
        const m = msgFor(preview)
        return (
          <Modal title={`預覽 — ${preview.name}`} onClose={() => setPreview(null)} width={680}>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>收件人：{preview.email}</div>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>{m?.subject}</div>
            <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 13, lineHeight: 1.8, background: '#faf9f6', padding: '14px 16px', borderRadius: 10, margin: 0 }}>{m?.body}</pre>
          </Modal>
        )
      })()}
    </Modal>
  )
}
