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
// 總覽漏斗統計由前端就地從 list 推導（比照 Stage4App 的 client-side 統計慣例）。
export const config = { runtime: 'edge' }

const SUPABASE_URL = 'https://lveekehjxkfvigwfwgvn.supabase.co'

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })

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
      fetch(`${SUPABASE_URL}/rest/v1/enroll_config?key=in.(line_qr,contacts)&select=key,value`, { headers: H }),
    ])
    if (!sRes.ok) return json({ ok: false, error: '查詢設定失敗' }, 500)
    const settings = await sRes.json()
    const cRows = cRes.ok ? await cRes.json() : []
    const cfg = {}
    for (const r of Array.isArray(cRows) ? cRows : []) cfg[r.key] = r.value
    return json({ ok: true, settings: Array.isArray(settings) ? settings : [], line_qr: cfg.line_qr || {}, contacts: cfg.contacts || {} })
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

  return json({ ok: false, error: '未知的操作' }, 400)
}
