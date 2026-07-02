// Vercel Edge Function：學生端「入學準備」公開端點。
// 學生信中連結 → 前端 #/onboard 頁 → GET ?token=xxx 讀取；POST 送出步驟表單。
// 安全設計（鏡像 api/confirm.js）：
//   1. 唯一憑證是 confirm_token（不可猜的隨機字串），端點絕不接受 account / id。
//   2. 用 service key（只在伺服器環境變數）查詢與更新，且只動 token 命中那位學生。
//   3. POST 只接受白名單欄位；step / gating 由伺服器判定，不信前端。
//   4. 只回傳學生看得到的安全欄位（不含 drive_folder_id 等）。
export const config = { runtime: 'edge' }

const SUPABASE_URL = 'https://lveekehjxkfvigwfwgvn.supabase.co'

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })

// 步驟1表單可寫入的欄位白名單（與 src/constants.js ONBOARD_STEP1_FIELDS 對應）；
// no_passport 為布林、另外處理（勾「尚未辦理護照」，後台可據此判讀）。
const STEP1_KEYS = [
  'name', 'name_english', 'gender', 'birth_date', 'nationality', 'nationality_other',
  'passport_number', 'phone', 'email',
  'national_id', 'guardian_name', 'guardian_phone',
  'zip_mail', 'addr_mail', 'tel', 'zip_reg', 'addr_reg',
  'high_school', 'graduation_year',
]

// 生日轉 YYYY-MM-DD：支援 Y-M-D / Y/M/D 與 M/D/Y（Excel 匯入格式）；轉不出來回空字串（不帶入 date 欄）
function toISODate(v) {
  const str = String(v || '').trim()
  if (!str) return ''
  let m = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  m = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/)
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
  return ''
}

// 依 token 撈學生（只取安全欄位）；查無回 null
async function findStudent(token, H) {
  const sel = 'select=account,name,name_en,department,campus,batch,nationality,status,dorm_room,dorm_bed,classroom'
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/enroll_students?confirm_token=eq.${encodeURIComponent(token)}&${sel}&limit=1`,
    { headers: H },
  )
  if (!res.ok) return null
  const rows = await res.json()
  return (Array.isArray(rows) && rows[0]) || null
}

// 撈五步進度，攤平成 { [step]: row }
async function fetchProgress(account, H) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/enroll_progress?account=eq.${encodeURIComponent(account)}&select=step,state,data,submitted_at,confirmed_at`,
    { headers: H },
  )
  const rows = res.ok ? await res.json() : []
  const out = {}
  for (const r of Array.isArray(rows) ? rows : []) out[r.step] = r
  return out
}

export default async function handler(req) {
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!KEY) return json({ ok: false, error: '伺服器尚未設定金鑰' }, 500)
  const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }

  // ── GET：讀取基本資料 + 五步進度 + 梯次設定 + 步驟1預填值 ──────────────────
  if (req.method === 'GET') {
    const token = new URL(req.url).searchParams.get('token') || ''
    if (!token) return json({ ok: false, error: '缺少確認碼' }, 400)

    const student = await findStudent(token, H)
    if (!student) return json({ ok: false, error: '連結無效或已失效' }, 401)

    const [progress, sRes, aRes, fRes, cRes] = await Promise.all([
      fetchProgress(student.account, H),
      fetch(
        `${SUPABASE_URL}/rest/v1/enroll_settings?batch=eq.${encodeURIComponent(student.batch ?? '')}&select=step,open,deadline,contact_name,contact_email,contact_phone,extra`,
        { headers: H },
      ),
      fetch(
        `${SUPABASE_URL}/rest/v1/applications?account=eq.${encodeURIComponent(student.account)}&select=name,name_english,gender,birth_date,passport_number,nationality,phone,email&limit=1`,
        { headers: H },
      ),
      fetch(
        `${SUPABASE_URL}/rest/v1/enroll_files?account=eq.${encodeURIComponent(student.account)}&select=step,kind,drive_url,uploaded_at&order=uploaded_at.desc`,
        { headers: H },
      ),
      fetch(`${SUPABASE_URL}/rest/v1/enroll_config?key=in.(line_qr,contacts)&select=key,value`, { headers: H }),
    ])
    const sRows = sRes.ok ? await sRes.json() : []
    const settings = {}
    for (const r of Array.isArray(sRows) ? sRows : []) settings[r.step] = r

    // 已上傳檔案（供步驟 2/4 顯示收據、簽證等；只回安全欄位，不含 drive_file_id）
    const fRows = fRes.ok ? await fRes.json() : []
    const files = Array.isArray(fRows) ? fRows : []

    // 步驟1預填：applications 為主，查無時回退 enroll_students；
    // 國籍以 enroll_students 為主（放榜名單較新）；生日能轉 YYYY-MM-DD 才帶（date input 用）。
    const aRows = aRes.ok ? await aRes.json() : []
    const app = (Array.isArray(aRows) && aRows[0]) || {}
    const prefill = {
      name: app.name ?? student.name ?? '',
      name_english: app.name_english ?? student.name_en ?? '',
      gender: app.gender ?? '',
      birth_date: toISODate(app.birth_date),
      passport_number: app.passport_number ?? '',
      nationality: student.nationality ?? app.nationality ?? '',
      phone: app.phone ?? '',
      email: app.email ?? '',
      department: student.department ?? '',
    }

    // 全域設定（enroll_config）：line_qr = {台北,高雄}；contacts = {台北:{name,email,phone},高雄:{...}}
    const cRows = cRes.ok ? await cRes.json() : []
    const cfg = {}
    for (const r of Array.isArray(cRows) ? cRows : []) cfg[r.key] = r.value
    const line_qr = cfg.line_qr || {}
    const contacts = cfg.contacts || {}

    return json({ ok: true, student, progress, settings, prefill, files, line_qr, contacts })
  }

  // ── POST：送出步驟表單（server 權威驗證：step / gating 都由伺服器判定）──────────
  if (req.method === 'POST') {
    let payload
    try { payload = await req.json() } catch { return json({ ok: false, error: '無效的請求內容' }, 400) }
    const { token, step, data, line_joined, ack } = payload || {}
    const stepN = Number(step)

    if (!token || typeof token !== 'string') return json({ ok: false, error: '缺少確認碼' }, 400)

    const student = await findStudent(token, H)
    if (!student) return json({ ok: false, error: '連結無效或已失效' }, 401)

    const nowIso = new Date().toISOString()
    const upsertH = { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' }
    const logRow = (action, plStep, plPayload) => fetch(`${SUPABASE_URL}/rest/v1/enroll_log`, {
      method: 'POST', headers: { ...H, Prefer: 'return=minimal' },
      body: JSON.stringify({ account: student.account, step: plStep, action, actor: 'student', payload: plPayload }),
    }).catch(() => { /* log 失敗不影響主流程 */ })

    // ── 步驟1：資料確認（→ confirmed，並自動開步驟2）─────────────────────────
    if (stepN === 1) {
      if (line_joined !== true) return json({ ok: false, error: '請先加入 LINE 群組並勾選確認' }, 400)

      // 只收白名單欄位、一律轉字串修剪；no_passport 為布林（勾選時護照號一律清空）
      const clean = {}
      for (const k of STEP1_KEYS) {
        if (data && data[k] != null) clean[k] = String(data[k]).trim()
      }
      clean.no_passport = data?.no_passport === true
      if (clean.no_passport) clean.passport_number = ''
      clean.line_joined = true

      // 1) 步驟1 → confirmed（免行政確認），保存表單內容
      const up1 = await fetch(`${SUPABASE_URL}/rest/v1/enroll_progress?on_conflict=account,step`, {
        method: 'POST',
        headers: upsertH,
        body: JSON.stringify({
          account: student.account, step: 1, state: 'confirmed',
          data: clean, submitted_at: nowIso, confirmed_at: nowIso,
        }),
      })
      if (!up1.ok) return json({ ok: false, error: '寫入失敗：' + (await up1.text()) }, 500)

      // 2) 步驟2 → open（自動進下一步；已是 submitted/confirmed 則不動，避免倒退）
      const before = await fetchProgress(student.account, H)
      const s2 = before[2]?.state
      if (!s2 || s2 === 'locked' || s2 === 'open') {
        const up2 = await fetch(`${SUPABASE_URL}/rest/v1/enroll_progress?on_conflict=account,step`, {
          method: 'POST',
          headers: upsertH,
          body: JSON.stringify({ account: student.account, step: 2, state: 'open' }),
        })
        if (!up2.ok) return json({ ok: false, error: '寫入失敗：' + (await up2.text()) }, 500)
      }

      // 3) 英文姓名同步回 enroll_students（失敗不阻斷）
      if (clean.name_english) {
        try {
          await fetch(
            `${SUPABASE_URL}/rest/v1/enroll_students?account=eq.${encodeURIComponent(student.account)}`,
            { method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify({ name_en: clean.name_english }) },
          )
        } catch { /* 同步失敗不影響主流程 */ }
      }

      await logRow('step1_submit', 1, clean)
      const progress = await fetchProgress(student.account, H)
      return json({ ok: true, progress })
    }

    // ── 步驟4：來台時間（→ confirmed 免行政確認，並自動開步驟5）──────────────────
    if (stepN === 4) {
      // 白名單：字串欄位轉字串修剪；need_pickup 一律轉布林
      const clean = {}
      for (const k of ['flight_no', 'arrival_date', 'arrival_time', 'note']) {
        if (data && data[k] != null) clean[k] = String(data[k]).trim()
      }
      clean.need_pickup = data?.need_pickup === true || data?.need_pickup === 'true'

      const up4 = await fetch(`${SUPABASE_URL}/rest/v1/enroll_progress?on_conflict=account,step`, {
        method: 'POST',
        headers: upsertH,
        body: JSON.stringify({
          account: student.account, step: 4, state: 'confirmed',
          data: clean, submitted_at: nowIso, confirmed_at: nowIso,
        }),
      })
      if (!up4.ok) return json({ ok: false, error: '寫入失敗：' + (await up4.text()) }, 500)

      // 步驟5 → open（已是 submitted/confirmed 則不動）
      const before = await fetchProgress(student.account, H)
      const s5 = before[5]?.state
      if (!s5 || s5 === 'locked' || s5 === 'open') {
        const up5 = await fetch(`${SUPABASE_URL}/rest/v1/enroll_progress?on_conflict=account,step`, {
          method: 'POST',
          headers: upsertH,
          body: JSON.stringify({ account: student.account, step: 5, state: 'open' }),
        })
        if (!up5.ok) return json({ ok: false, error: '寫入失敗：' + (await up5.text()) }, 500)
      }

      await logRow('step4_submit', 4, clean)
      const progress = await fetchProgress(student.account, H)
      return json({ ok: true, progress })
    }

    // ── 步驟5：行前通知已閱讀（→ confirmed，並把學生 status 標為 completed）──────────
    if (stepN === 5) {
      if (ack !== true) return json({ ok: false, error: '請先閱讀並勾選確認知悉' }, 400)

      const up = await fetch(`${SUPABASE_URL}/rest/v1/enroll_progress?on_conflict=account,step`, {
        method: 'POST',
        headers: upsertH,
        body: JSON.stringify({
          account: student.account, step: 5, state: 'confirmed',
          submitted_at: nowIso, confirmed_at: nowIso,
        }),
      })
      if (!up.ok) return json({ ok: false, error: '寫入失敗：' + (await up.text()) }, 500)

      // 全流程完成 → enroll_students.status = 'completed'（失敗不阻斷）
      try {
        await fetch(
          `${SUPABASE_URL}/rest/v1/enroll_students?account=eq.${encodeURIComponent(student.account)}`,
          { method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'completed' }) },
        )
      } catch { /* 標記失敗不影響主流程 */ }

      await logRow('step5_ack', 5, { ack: true })
      const progress = await fetchProgress(student.account, H)
      return json({ ok: true, progress })
    }

    // 其餘步驟（2 繳費 / 3 簽證）走檔案上傳端點，不經此 POST
    return json({ ok: false, error: '此步驟尚未開放送出' }, 400)
  }

  return json({ ok: false, error: 'Method not allowed' }, 405)
}
