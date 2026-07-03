// Vercel Edge Function：入學準備「後台管理」專用端點（service role，需 superadmin 驗證）。
// 鏡像 api/reset.js 的驗證方式：POST body 帶 { username, password }，伺服器用 service key
// 撈 teachers 比對 password_hash === btoa(username:password) 且 role === 'superadmin' 才放行。
// 單一端點以 action 分派：list / confirm / abandon / reactivate / settings / save-settings / save-line-qr。
//   - list：回全部 enroll_students（預設排除 is_test）＋每人五步 state＋各步檔案連結，
//     支援 batch(all/1/2) 與 campus(all/台北/高雄) 篩選。
//   - confirm：{account, step} → 該步 confirmed，並自動把下一步 locked→open；log admin_confirm。
//   - abandon：{account, reason} → enroll_students.status='abandoned'；log abandon。
//   - reactivate：{account} → status 回 'active'；log reactivate。
//   - settings：回全部 enroll_settings（batch×step 10 列）＋ enroll_config 的 line_qr 與 contacts。
//   - save-settings：{batch, step, deadline?, notice?} → upsert 該 (batch,step) 列；
//     deadline 收日期字串(YYYY-MM-DD)，存為當日 Asia/Taipei 23:59:59（null 允許）；
//     step=5 時把 notice（{台北:{zh,en,vi,id},高雄:{...}}，原樣存）合併進 extra.notice；log settings_save。
//     （承辦人已改存 enroll_config，本 action 不再寫 contact_* 欄。）
//   - save-contacts：{value: {台北:{name,email,phone}, 高雄:{...}}} → upsert enroll_config
//     key='contacts'（全域兩組、只分校區不分梯次）；log config_save。
//   - save-line-qr：{value: {台北, 高雄}} → 更新 enroll_config key='line_qr'；log config_save。
//   - import-students：{rows: [{account, fields:{student_id?,dorm_room?,dorm_bed?,classroom?}}]}
//     → 逐筆 PATCH enroll_students（以 account 對應，只更新收到的欄＝空欄不覆蓋）；log import。
//   - name-requests：回 pending 更名申請（join enroll_students 帶系所/校區）。
//   - name-review：{id, decision:'approve'|'reject', note?} → approve 才真的改 enroll_students.name；
//     兩者皆寫 reviewed_by/at（reject 另存 review_note）；log name_review。
//   - mail-recipients：{step, batch, campus} → 卡在該步（open/submitted）且 status=active 的收件名單
//     （email 取 applications，帶已寄提醒次數）。
//   - mail-mark-sent：{step, tier, accounts[]} → 寄送成功後回報：這些人該步 reminder_count+1 /
//     last_reminder_at / last_reminder_kind=tier；log mail_sent。（OnboardMailComposer 每批寄完呼叫。）
//   - mail-build-drafts（已停用，保留相容）：Phase A 的「建 Gmail 草稿」流程；UI 已改用系統內
//     OnboardMailComposer（createDrafts → sendDraftBatch 直接寄出），不再呼叫此 action。
// 總覽漏斗統計由前端就地從 list 推導（比照 Stage4App 的 client-side 統計慣例）。
export const config = { runtime: 'edge' }

import { buildOnboardMail, onboardMailLang } from '../src/constants.js'

const SUPABASE_URL = 'https://lveekehjxkfvigwfwgvn.supabase.co'

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })

// timestamptz → 台北時區日期字串（YYYY/MM/DD，信件顯示用；截止日固定存當日台北 23:59:59）
const isoToTpeYmd = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d)) return ''
  const t = new Date(d.getTime() + 8 * 3600 * 1000)
  return `${t.getUTCFullYear()}/${String(t.getUTCMonth() + 1).padStart(2, '0')}/${String(t.getUTCDate()).padStart(2, '0')}`
}

// 撈「卡在某步（state open/submitted）、status=active、非測試」的通知信收件名單。
// email 取 applications（同帳號多志願共用，任一筆有值即用）；帶已寄提醒次數供前端顯示。
async function fetchMailRecipients(step, batch, campus, H) {
  let sUrl = `${SUPABASE_URL}/rest/v1/enroll_students?select=account,name,name_en,department,campus,batch,nationality,confirm_token&status=eq.active&is_test=eq.false`
  if (batch && batch !== 'all') sUrl += `&batch=eq.${encodeURIComponent(String(batch))}`
  if (campus && campus !== 'all') sUrl += `&campus=eq.${encodeURIComponent(String(campus))}`
  const [sRes, pRes] = await Promise.all([
    fetch(sUrl, { headers: H }),
    fetch(
      `${SUPABASE_URL}/rest/v1/enroll_progress?step=eq.${step}&state=in.(open,submitted)&select=account,state,reminder_count,last_reminder_at,last_reminder_kind`,
      { headers: H },
    ),
  ])
  const sRows = sRes.ok ? await sRes.json() : []
  const pRows = pRes.ok ? await pRes.json() : []
  const pMap = {}
  for (const p of Array.isArray(pRows) ? pRows : []) pMap[p.account] = p
  const stuck = (Array.isArray(sRows) ? sRows : []).filter((x) => pMap[x.account])

  const emails = {}
  if (stuck.length) {
    const accs = stuck.map((x) => x.account).join(',')
    const aRes = await fetch(
      `${SUPABASE_URL}/rest/v1/applications?account=in.(${encodeURIComponent(accs)})&select=account,email`,
      { headers: H },
    )
    const aRows = aRes.ok ? await aRes.json() : []
    for (const a of Array.isArray(aRows) ? aRows : []) if (a.email && !emails[a.account]) emails[a.account] = a.email
  }
  return stuck.map((x) => ({
    account: x.account, name: x.name, name_en: x.name_en, department: x.department, campus: x.campus, batch: x.batch,
    nationality: x.nationality, confirm_token: x.confirm_token, email: emails[x.account] || '',
    state: pMap[x.account].state,
    reminder_count: pMap[x.account].reminder_count || 0,
    last_reminder_at: pMap[x.account].last_reminder_at || null,
    last_reminder_kind: pMap[x.account].last_reminder_kind || null,
  }))
}

// 攤平某帳號的五步進度 { [step]: row }
async function fetchProgress(account, H) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/enroll_progress?account=eq.${encodeURIComponent(account)}&select=step,state,submitted_at,confirmed_at`,
    { headers: H },
  )
  const rows = res.ok ? await res.json() : []
  const out = {}
  for (const r of Array.isArray(rows) ? rows : []) out[r.step] = r
  return out
}

export default async function handler(req) {
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405)

  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!KEY) return json({ ok: false, error: '伺服器尚未設定金鑰' }, 500)
  const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }

  let body
  try { body = await req.json() } catch { return json({ ok: false, error: '無效的請求內容' }, 400) }
  const { username, password, action } = body || {}
  if (!username || !password) return json({ ok: false, error: '請輸入帳號與密碼' }, 400)

  // 驗證：service key 撈 teachers 比對帳密 + 角色（同 api/reset.js）
  const vRes = await fetch(
    `${SUPABASE_URL}/rest/v1/teachers?username=eq.${encodeURIComponent(username)}&select=role,password_hash`,
    { headers: H },
  )
  const vRows = await vRes.json()
  const teacher = Array.isArray(vRows) ? vRows[0] : null
  if (!teacher || teacher.password_hash !== btoa(`${username}:${password}`)) {
    return json({ ok: false, error: '帳號或密碼錯誤' }, 401)
  }
  if (teacher.role !== 'superadmin') {
    return json({ ok: false, error: '只有超級管理員可使用入學準備後台' }, 403)
  }

  const nowIso = new Date().toISOString()
  const upsertH = { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' }
  const logRow = (account, step, act, payload) => fetch(`${SUPABASE_URL}/rest/v1/enroll_log`, {
    method: 'POST', headers: { ...H, Prefer: 'return=minimal' },
    body: JSON.stringify({ account, step: step ?? null, action: act, actor: 'admin', payload: payload || {} }),
  }).catch(() => { /* log 失敗不阻斷 */ })

  // ── list：全部學生 + 五步 state + 檔案 ────────────────────────────────────────
  if (action === 'list') {
    const batch = body.batch && body.batch !== 'all' ? String(body.batch) : ''
    const campus = body.campus && body.campus !== 'all' ? String(body.campus) : ''
    const includeTest = body.includeTest === true

    let sUrl = `${SUPABASE_URL}/rest/v1/enroll_students?select=account,name,department,campus,batch,status,abandoned_at,abandoned_by,abandon_reason,dorm_room,dorm_bed,classroom,is_test`
    if (batch) sUrl += `&batch=eq.${encodeURIComponent(batch)}`
    if (campus) sUrl += `&campus=eq.${encodeURIComponent(campus)}`
    if (!includeTest) sUrl += `&is_test=eq.false`

    const [sRes, pRes, fRes] = await Promise.all([
      fetch(sUrl, { headers: H }),
      fetch(`${SUPABASE_URL}/rest/v1/enroll_progress?select=account,step,state,submitted_at,confirmed_at`, { headers: H }),
      fetch(`${SUPABASE_URL}/rest/v1/enroll_files?select=account,step,kind,drive_url,uploaded_at&order=uploaded_at.desc`, { headers: H }),
    ])
    if (!sRes.ok) return json({ ok: false, error: '查詢學生失敗' }, 500)
    const students = await sRes.json()
    const progress = pRes.ok ? await pRes.json() : []
    const files = fRes.ok ? await fRes.json() : []

    // 依 account 分組
    const progByAcct = {}
    for (const r of Array.isArray(progress) ? progress : []) {
      (progByAcct[r.account] ||= {})[r.step] = { state: r.state, submitted_at: r.submitted_at, confirmed_at: r.confirmed_at }
    }
    const filesByAcct = {}
    for (const r of Array.isArray(files) ? files : []) {
      (filesByAcct[r.account] ||= []).push({ step: r.step, kind: r.kind, drive_url: r.drive_url, uploaded_at: r.uploaded_at })
    }

    const list = (Array.isArray(students) ? students : []).map((s) => ({
      account: s.account, name: s.name, department: s.department, campus: s.campus,
      batch: s.batch, status: s.status,
      abandoned_at: s.abandoned_at, abandoned_by: s.abandoned_by, abandon_reason: s.abandon_reason,
      dorm_room: s.dorm_room, dorm_bed: s.dorm_bed, classroom: s.classroom,
      steps: progByAcct[s.account] || {},
      files: filesByAcct[s.account] || [],
    }))
    return json({ ok: true, list })
  }

  // ── confirm：確認某步（→ confirmed）並自動開下一步 ───────────────────────────
  if (action === 'confirm') {
    const { account } = body
    const step = Number(body.step)
    if (!account || !Number.isInteger(step) || step < 1 || step > 5) {
      return json({ ok: false, error: '參數錯誤' }, 400)
    }
    const up = await fetch(`${SUPABASE_URL}/rest/v1/enroll_progress?on_conflict=account,step`, {
      method: 'POST', headers: upsertH,
      body: JSON.stringify({ account, step, state: 'confirmed', confirmed_at: nowIso, confirmed_by: username }),
    })
    if (!up.ok) return json({ ok: false, error: '確認失敗：' + (await up.text()) }, 500)

    // 自動把下一步 locked→open（不倒退已 open/submitted/confirmed 者）
    if (step < 5) {
      const before = await fetchProgress(account, H)
      const ns = before[step + 1]?.state
      if (!ns || ns === 'locked') {
        await fetch(`${SUPABASE_URL}/rest/v1/enroll_progress?on_conflict=account,step`, {
          method: 'POST', headers: upsertH,
          body: JSON.stringify({ account, step: step + 1, state: 'open' }),
        }).catch(() => { /* 開下一步失敗不阻斷 */ })
      }
    }
    await logRow(account, step, 'admin_confirm', { step })
    return json({ ok: true })
  }

  // ── abandon：標記放棄 ────────────────────────────────────────────────────────
  if (action === 'abandon') {
    const { account, reason } = body
    if (!account) return json({ ok: false, error: '缺少帳號' }, 400)
    const up = await fetch(
      `${SUPABASE_URL}/rest/v1/enroll_students?account=eq.${encodeURIComponent(account)}`,
      { method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
        body: JSON.stringify({ status: 'abandoned', abandoned_at: nowIso, abandoned_by: username, abandon_reason: reason || null }) },
    )
    if (!up.ok) return json({ ok: false, error: '標記放棄失敗：' + (await up.text()) }, 500)
    await logRow(account, null, 'abandon', { reason: reason || '' })
    return json({ ok: true })
  }

  // ── reactivate：放棄復原 ─────────────────────────────────────────────────────
  if (action === 'reactivate') {
    const { account } = body
    if (!account) return json({ ok: false, error: '缺少帳號' }, 400)
    const up = await fetch(
      `${SUPABASE_URL}/rest/v1/enroll_students?account=eq.${encodeURIComponent(account)}`,
      { method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
        body: JSON.stringify({ status: 'active', abandoned_at: null, abandoned_by: null, abandon_reason: null }) },
    )
    if (!up.ok) return json({ ok: false, error: '復原失敗：' + (await up.text()) }, 500)
    await logRow(account, null, 'reactivate', {})
    return json({ ok: true })
  }

  // ── settings：全部 enroll_settings ＋ enroll_config 的 line_qr / contacts ─────
  if (action === 'settings') {
    const [sRes, cRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/enroll_settings?select=batch,step,open,deadline,contact_name,contact_email,contact_phone,extra&order=batch.asc,step.asc`, { headers: H }),
      fetch(`${SUPABASE_URL}/rest/v1/enroll_config?key=in.(line_qr,contacts,result_link)&select=key,value`, { headers: H }),
    ])
    if (!sRes.ok) return json({ ok: false, error: '查詢設定失敗' }, 500)
    const settings = await sRes.json()
    const cRows = cRes.ok ? await cRes.json() : []
    const cfg = {}
    for (const r of Array.isArray(cRows) ? cRows : []) cfg[r.key] = r.value
    return json({ ok: true, settings: Array.isArray(settings) ? settings : [], line_qr: cfg.line_qr || {}, contacts: cfg.contacts || {}, result_link: cfg.result_link || {} })
  }

  // ── save-settings：upsert (batch,step) 截止日/承辦資訊；step5 另存 extra.notice ──
  if (action === 'save-settings') {
    const batch = String(body.batch ?? '')
    const step = Number(body.step)
    if (!['1', '2'].includes(batch) || !Number.isInteger(step) || step < 1 || step > 5) {
      return json({ ok: false, error: '參數錯誤' }, 400)
    }
    // 只寫有帶的欄位（merge-duplicates 不動未帶欄位），deadline-only 或 notice-only 皆可
    const row = { batch, step, updated_at: nowIso }
    // deadline 收日期字串（YYYY-MM-DD），一律存為當日台北時間 23:59:59
    if ('deadline' in body) {
      const dl = body.deadline
      if (!dl) row.deadline = null
      else {
        const m = String(dl).match(/^(\d{4})-(\d{2})-(\d{2})/)
        if (!m) return json({ ok: false, error: '截止日格式錯誤（需為 YYYY-MM-DD）' }, 400)
        row.deadline = `${m[1]}-${m[2]}-${m[3]}T23:59:59+08:00`
      }
    }
    // step5 的行前須知寫進 extra.notice（字串或 {台北,高雄} 物件原樣存），保留 extra 其他鍵
    if (step === 5 && 'notice' in body) {
      const exRes = await fetch(
        `${SUPABASE_URL}/rest/v1/enroll_settings?batch=eq.${encodeURIComponent(batch)}&step=eq.5&select=extra&limit=1`,
        { headers: H },
      )
      const exRows = exRes.ok ? await exRes.json() : []
      const extra = (Array.isArray(exRows) && exRows[0]?.extra) || {}
      row.extra = { ...(extra && typeof extra === 'object' && !Array.isArray(extra) ? extra : {}), notice: body.notice }
    }
    const up = await fetch(`${SUPABASE_URL}/rest/v1/enroll_settings?on_conflict=batch,step`, {
      method: 'POST', headers: upsertH, body: JSON.stringify(row),
    })
    if (!up.ok) return json({ ok: false, error: '儲存失敗：' + (await up.text()) }, 500)
    await logRow(null, step, 'settings_save', { batch, step })
    return json({ ok: true })
  }

  // ── save-contacts：承辦窗口（全域、分校區）→ enroll_config key='contacts' ──────
  if (action === 'save-contacts') {
    const v = body.value
    if (!v || typeof v !== 'object' || Array.isArray(v)) return json({ ok: false, error: '參數錯誤' }, 400)
    const value = {}
    for (const c of ['台北', '高雄']) {
      const src = v[c] || {}
      value[c] = {
        name: String(src.name ?? '').trim(),
        email: String(src.email ?? '').trim(),
        phone: String(src.phone ?? '').trim(),
      }
    }
    const up = await fetch(`${SUPABASE_URL}/rest/v1/enroll_config?on_conflict=key`, {
      method: 'POST', headers: upsertH, body: JSON.stringify({ key: 'contacts', value, updated_at: nowIso }),
    })
    if (!up.ok) return json({ ok: false, error: '儲存失敗：' + (await up.text()) }, 500)
    await logRow(null, null, 'config_save', { key: 'contacts' })
    return json({ ok: true })
  }

  // ── save-line-qr：更新 enroll_config key='line_qr' 的 value（{台北,高雄}）──────
  if (action === 'save-line-qr') {
    const v = body.value
    if (!v || typeof v !== 'object' || Array.isArray(v)) return json({ ok: false, error: '參數錯誤' }, 400)
    const value = { 台北: String(v['台北'] ?? '').trim(), 高雄: String(v['高雄'] ?? '').trim() }
    const up = await fetch(`${SUPABASE_URL}/rest/v1/enroll_config?on_conflict=key`, {
      method: 'POST', headers: upsertH, body: JSON.stringify({ key: 'line_qr', value, updated_at: nowIso }),
    })
    if (!up.ok) return json({ ok: false, error: '儲存失敗：' + (await up.text()) }, 500)
    await logRow(null, null, 'config_save', { key: 'line_qr' })
    return json({ ok: true })
  }

  // ── import-students：批次帶入學號/宿舍資訊（account 對應鍵，只更新有值欄）──────
  if (action === 'import-students') {
    const rows = Array.isArray(body.rows) ? body.rows : []
    if (!rows.length) return json({ ok: false, error: '沒有可匯入的資料' }, 400)
    if (rows.length > 2000) return json({ ok: false, error: '一次最多匯入 2000 筆' }, 400)

    const ALLOW = ['student_id', 'dorm_room', 'dorm_bed', 'classroom']
    let updated = 0
    const skipped = []   // 帳號查無（或無可寫入欄）的清單
    for (const r of rows) {
      const account = String(r?.account ?? '').trim()
      if (!account) continue
      // 只收白名單且有值的欄位——payload 不含空欄，後端也只更新收到的欄
      const patch = {}
      for (const k of ALLOW) {
        const v = r?.fields?.[k]
        if (v != null && String(v).trim() !== '') patch[k] = String(v).trim()
      }
      if (!Object.keys(patch).length) { skipped.push(account); continue }
      const up = await fetch(
        `${SUPABASE_URL}/rest/v1/enroll_students?account=eq.${encodeURIComponent(account)}&select=account`,
        { method: 'PATCH', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify(patch) },
      )
      if (!up.ok) { skipped.push(account); continue }
      const out = await up.json().catch(() => [])
      if (Array.isArray(out) && out.length) updated++
      else skipped.push(account)   // 帳號不存在（前端預覽已擋，後端仍防守）
    }
    await logRow(null, null, 'import', { updated, skipped_accounts: skipped })
    return json({ ok: true, updated, skipped })
  }

  // ── name-requests：pending 更名申請清單（join enroll_students 帶系所/校區）─────
  if (action === 'name-requests') {
    const rRes = await fetch(
      `${SUPABASE_URL}/rest/v1/enroll_name_requests?status=eq.pending&select=id,account,old_name,new_name,reason,created_at&order=created_at.asc`,
      { headers: H },
    )
    if (!rRes.ok) return json({ ok: false, error: '查詢更名申請失敗' }, 500)
    const reqs = await rRes.json()
    const accts = [...new Set((Array.isArray(reqs) ? reqs : []).map((r) => r.account))]
    const stuMap = {}
    if (accts.length) {
      const sRes = await fetch(
        `${SUPABASE_URL}/rest/v1/enroll_students?account=in.(${encodeURIComponent(accts.join(','))})&select=account,name,department,campus`,
        { headers: H },
      )
      const sRows = sRes.ok ? await sRes.json() : []
      for (const st of Array.isArray(sRows) ? sRows : []) stuMap[st.account] = st
    }
    const list = (Array.isArray(reqs) ? reqs : []).map((r) => ({
      ...r,
      name: stuMap[r.account]?.name ?? r.old_name,
      department: stuMap[r.account]?.department ?? '',
      campus: stuMap[r.account]?.campus ?? '',
    }))
    return json({ ok: true, list })
  }

  // ── name-review：核准/駁回更名申請；核准才真的改 enroll_students.name ──────────
  if (action === 'name-review') {
    const { id, decision } = body
    const note = String(body.note ?? '').trim()
    if (!id || !['approve', 'reject'].includes(decision)) return json({ ok: false, error: '參數錯誤' }, 400)

    const rRes = await fetch(
      `${SUPABASE_URL}/rest/v1/enroll_name_requests?id=eq.${encodeURIComponent(id)}&select=id,account,old_name,new_name,status&limit=1`,
      { headers: H },
    )
    const rRows = rRes.ok ? await rRes.json() : []
    const reqRow = (Array.isArray(rRows) && rRows[0]) || null
    if (!reqRow) return json({ ok: false, error: '找不到這筆更名申請' }, 404)
    if (reqRow.status !== 'pending') return json({ ok: false, error: '這筆申請已處理過' }, 409)

    if (decision === 'approve') {
      // 先改學生姓名、成功才標記 approved（失敗時申請仍保持 pending，可重試）
      const upS = await fetch(
        `${SUPABASE_URL}/rest/v1/enroll_students?account=eq.${encodeURIComponent(reqRow.account)}`,
        { method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify({ name: reqRow.new_name }) },
      )
      if (!upS.ok) return json({ ok: false, error: '更新學生姓名失敗：' + (await upS.text()) }, 500)
    }
    const upR = await fetch(
      `${SUPABASE_URL}/rest/v1/enroll_name_requests?id=eq.${encodeURIComponent(id)}`,
      { method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
        body: JSON.stringify({ status: decision === 'approve' ? 'approved' : 'rejected', reviewed_by: username, reviewed_at: nowIso, review_note: note || null }) },
    )
    if (!upR.ok) return json({ ok: false, error: '更新申請狀態失敗：' + (await upR.text()) }, 500)

    await logRow(reqRow.account, null, 'name_review', { id, action: decision })
    return json({ ok: true })
  }

  // ── mail-recipients：某步通知信收件名單（卡在該步、active，含 email/已提醒次數）──
  if (action === 'mail-recipients') {
    const step = Number(body.step)
    if (!Number.isInteger(step) || step < 1 || step > 5) return json({ ok: false, error: '參數錯誤' }, 400)
    const list = await fetchMailRecipients(step, body.batch, body.campus, H)
    return json({ ok: true, list })
  }

  // ── mail-mark-sent：寄送成功回報（reminder_count+1 / last_reminder_*；log mail_sent）──
  if (action === 'mail-mark-sent') {
    const step = Number(body.step)
    const tier = ['first', 'second', 'final'].includes(body.tier) ? body.tier : 'first'
    const accounts = Array.isArray(body.accounts) ? body.accounts.map((a) => String(a).trim()).filter(Boolean) : []
    if (!Number.isInteger(step) || step < 1 || step > 5 || !accounts.length) {
      return json({ ok: false, error: '參數錯誤' }, 400)
    }
    if (accounts.length > 50) return json({ ok: false, error: '一次最多回報 50 筆' }, 400)

    // 先撈現值再逐筆 +1（收件名單來自 mail-recipients，該步進度列必然存在）
    const pRes = await fetch(
      `${SUPABASE_URL}/rest/v1/enroll_progress?step=eq.${step}&account=in.(${encodeURIComponent(accounts.join(','))})&select=account,reminder_count`,
      { headers: H },
    )
    const pRows = pRes.ok ? await pRes.json() : []
    const cur = {}
    for (const r of Array.isArray(pRows) ? pRows : []) cur[r.account] = r.reminder_count || 0

    let updated = 0
    for (const a of accounts) {
      const up = await fetch(
        `${SUPABASE_URL}/rest/v1/enroll_progress?account=eq.${encodeURIComponent(a)}&step=eq.${step}`,
        { method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
          body: JSON.stringify({ reminder_count: (cur[a] || 0) + 1, last_reminder_at: nowIso, last_reminder_kind: tier }) },
      ).catch(() => null)
      if (up?.ok) updated++
      await logRow(a, step, 'mail_sent', { step, tier, account: a })
    }
    return json({ ok: true, updated })
  }

  // ── mail-build-drafts（已停用；UI 改用 OnboardMailComposer 系統內寄送，保留相容）────
  if (action === 'mail-build-drafts') {
    const step = Number(body.step)
    const tier = String(body.tier || 'first')
    if (!Number.isInteger(step) || step < 1 || step > 5 || !['first', 'second', 'final'].includes(tier)) {
      return json({ ok: false, error: '參數錯誤' }, 400)
    }
    if (step !== 1) return json({ ok: false, error: '此步驟的信件模板尚未提供（本階段僅步驟①）' }, 400)
    const DRAFT_URL = process.env.DRAFT_SERVICE_URL
    const DRAFT_TOKEN = process.env.DRAFT_SERVICE_TOKEN
    if (!DRAFT_URL || !DRAFT_TOKEN) return json({ ok: false, error: '伺服器未設定 DRAFT_SERVICE_URL / DRAFT_SERVICE_TOKEN' }, 500)

    // 名單以伺服器端資格為準（卡在該步、active），accounts 只做交集＝分批/個別寄
    let list = await fetchMailRecipients(step, body.batch, body.campus, H)
    const wanted = Array.isArray(body.accounts) && body.accounts.length
      ? new Set(body.accounts.map((a) => String(a))) : null
    if (wanted) list = list.filter((r) => wanted.has(String(r.account)))
    if (!list.length) return json({ ok: true, built: 0, failed: [] })
    if (list.length > 20) return json({ ok: false, error: '一次最多 20 封，請分批呼叫（建議每批 8 封）' }, 400)

    // 截止日（該步、各梯）＋ 承辦窗口 / 放榜連結（enroll_config，依校區）
    const [dlRes, cfgRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/enroll_settings?step=eq.${step}&select=batch,deadline`, { headers: H }),
      fetch(`${SUPABASE_URL}/rest/v1/enroll_config?key=in.(contacts,result_link)&select=key,value`, { headers: H }),
    ])
    const dlRows = dlRes.ok ? await dlRes.json() : []
    const deadlines = {}
    for (const r of Array.isArray(dlRows) ? dlRows : []) deadlines[String(r.batch)] = isoToTpeYmd(r.deadline)
    const cfgRows = cfgRes.ok ? await cfgRes.json() : []
    const cfg = {}
    for (const r of Array.isArray(cfgRows) ? cfgRows : []) cfg[r.key] = r.value
    const contacts = cfg.contacts || {}
    const resultLink = cfg.result_link || {}

    // 逐人組信（依國籍選語言、依校區取窗口/放榜連結、依梯次取截止日）
    const origin = new URL(req.url).origin
    const failed = []
    const messages = []
    const byEmail = {}   // email → recipient（建草稿結果以 to 對回帳號，同 Stage4 慣例）
    for (const r of list) {
      if (!r.email) { failed.push({ account: r.account, error: '查無 Email' }); continue }
      if (!r.confirm_token) { failed.push({ account: r.account, error: '缺少 confirm_token' }); continue }
      const camp = r.campus || '台北'
      const c = contacts[camp] || contacts['台北'] || {}
      const m = buildOnboardMail({
        step, tier, lang: onboardMailLang(r.nationality),
        data: {
          name: r.name || '',
          link: `${origin}/#/onboard?t=${r.confirm_token}`,
          result_link: String(resultLink[camp] || resultLink['台北'] || '').trim(),
          deadline: deadlines[String(r.batch)] || '',
          contact_name: c.name || '', contact_email: c.email || '', contact_phone: c.phone || '',
        },
      })
      messages.push({ to: r.email, subject: m.subject, body: m.body })
      byEmail[r.email] = r
    }

    // 呼叫 Apps Script 草稿服務（同 api/draftmail.js 的轉發格式）
    let drafts = []
    if (messages.length) {
      const up = await fetch(DRAFT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: DRAFT_TOKEN, action: 'create_drafts', messages }),
        redirect: 'follow',
      })
      let out
      try { out = await up.json() } catch { out = null }
      if (!up.ok || !out || out.ok === false) {
        return json({ ok: false, error: '草稿服務失敗：' + (out?.error || `HTTP ${up.status}`) }, 502)
      }
      drafts = out.drafts || []
    }

    // 每成功一人：reminder_count+1、last_reminder_at/kind；寫 enroll_log（失敗者留在 failed 供重試）
    let built = 0
    const okEmails = new Set(drafts.map((d) => d.to))
    for (const m of messages) {
      const r = byEmail[m.to]
      if (!okEmails.has(m.to)) { failed.push({ account: r.account, error: '建立草稿失敗' }); continue }
      built++
      await fetch(
        `${SUPABASE_URL}/rest/v1/enroll_progress?account=eq.${encodeURIComponent(r.account)}&step=eq.${step}`,
        { method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
          body: JSON.stringify({ reminder_count: (r.reminder_count || 0) + 1, last_reminder_at: nowIso, last_reminder_kind: tier }) },
      ).catch(() => { /* 計數失敗不阻斷 */ })
      await logRow(r.account, step, 'mail_draft', { step, tier, account: r.account })
    }
    return json({ ok: true, built, failed })
  }

  return json({ ok: false, error: '未知的操作' }, 400)
}
