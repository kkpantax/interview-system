// Vercel Edge Function：學生端「入學準備」檔案上傳 relay，代理到校方 Google Drive 的 Apps Script。
// 學生只憑 confirm_token（同 /api/onboard），Apps Script 的 secret 收在伺服器環境變數，
// 前端永遠拿不到；資料夾命名用 DB 裡的 account + name（不信前端傳的名字）。
//
// 需在 Vercel 設定環境變數（設定後要重新部署才生效）：
//   ONBOARD_UPLOAD_URL   = Apps Script 網頁應用程式 URL（.../exec）
//   ONBOARD_UPLOAD_TOKEN = 與 Apps Script 內 SHARED_SECRET 完全相同的密鑰
//
// 流程（POST，token-only）：
//   body = { token, step, kind, filename, mimeType, dataBase64 }
//   1. 用 confirm_token 查 enroll_students（account, name, drive_folder_id）；查無回 401。
//   2. 轉呼叫 Apps Script（帶伺服器端 secret）；回 { ok, folderId, fileId, url }。
//   3. 成功後（service role）：補 drive_folder_id、insert enroll_files、
//      enroll_progress 該步 → submitted（已 confirmed 不降級）、寫 enroll_log。
//      **不自動開下一步**（步驟 2/3 需行政確認）。
//   4. 回 { ok:true, url, states:<更新後五步 progress> }。
export const config = { runtime: 'edge' }

const SUPABASE_URL = 'https://lveekehjxkfvigwfwgvn.supabase.co'

// Vercel Edge 請求體上限約 4MB；base64 膨脹 ~33%，故檔案實際上限約 3MB
const MAX_B64_LEN = 4_200_000

const ALLOWED_MIME = [
  'image/jpeg', 'image/png', 'image/webp', 'image/heic',
  'application/pdf',
]

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })

// 撈五步進度，攤平成 { [step]: row }（與 api/onboard.js 一致）
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
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405)

  const url = process.env.ONBOARD_UPLOAD_URL
  const secret = process.env.ONBOARD_UPLOAD_TOKEN
  if (!url || !secret) return json({ ok: false, error: '伺服器未設定 ONBOARD_UPLOAD_URL / ONBOARD_UPLOAD_TOKEN' }, 500)

  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!KEY) return json({ ok: false, error: '伺服器尚未設定金鑰' }, 500)
  const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }

  let payload
  try { payload = await req.json() } catch { return json({ ok: false, error: '無效的請求內容' }, 400) }
  const { token, kind, filename, mimeType, dataBase64 } = payload || {}
  const step = Number(payload?.step)

  if (!token || typeof token !== 'string') return json({ ok: false, error: '缺少確認碼' }, 400)
  if (!kind || typeof kind !== 'string') return json({ ok: false, error: '缺少檔案類別' }, 400)
  if (!Number.isInteger(step) || step < 1 || step > 5) return json({ ok: false, error: '步驟參數錯誤' }, 400)
  if (!dataBase64 || typeof dataBase64 !== 'string') return json({ ok: false, error: '缺少檔案內容' }, 400)
  if (dataBase64.length > MAX_B64_LEN) return json({ ok: false, error: '檔案過大（上限約 3MB），請壓縮後再上傳' }, 413)
  if (!ALLOWED_MIME.includes(mimeType)) return json({ ok: false, error: '只接受 JPG / PNG / WEBP / HEIC / PDF' }, 400)

  // 1) 驗 token → 學生（folder 命名資料以 DB 為準）
  const sRes = await fetch(
    `${SUPABASE_URL}/rest/v1/enroll_students?confirm_token=eq.${encodeURIComponent(token)}&select=account,name,drive_folder_id&limit=1`,
    { headers: H },
  )
  if (!sRes.ok) return json({ ok: false, error: '查詢失敗' }, 500)
  const sRows = await sRes.json()
  const student = (Array.isArray(sRows) && sRows[0]) || null
  if (!student) return json({ ok: false, error: '連結無效或已失效' }, 401)

  // 1.5) 伺服器端 gating（與學生端 effectiveStates 同規則）：前面步驟都 confirmed、
  //      本步尚未 confirmed 才可上傳。簽證補件：行政設 supplement 時會把已確認的步驟3
  //      退回 submitted（見 onboard-admin.js set-visa-stage），故補件重傳不會被擋
  const before = await fetchProgress(student.account, H)
  for (let s = 1; s < step; s++) {
    if (before[s]?.state !== 'confirmed') return json({ ok: false, error: '此步驟尚未開放，無法上傳' }, 409)
  }
  if (before[step]?.state === 'confirmed') {
    return json({ ok: false, error: '此步驟已確認完成，如需補件請聯繫承辦人員' }, 409)
  }

  // 檔名：kind_時間戳_原檔名（去除路徑字元），方便同類多次上傳不互蓋
  const safeName = String(filename || '').replace(/[\\/]/g, '_').slice(0, 120)
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)
  const finalName = `${kind}_${stamp}${safeName ? '_' + safeName : ''}`

  // 2) 轉發給 Apps Script（帶伺服器端 secret）
  const upstream = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      secret,
      account: student.account,
      name: student.name || '',
      kind,
      filename: finalName,
      mimeType,
      dataBase64,
    }),
    redirect: 'follow',   // Apps Script /exec 會 302 到 googleusercontent
  })
  let result
  try { result = await upstream.json() } catch { return json({ ok: false, error: '上傳服務回應異常' }, 502) }
  if (!result.ok) return json({ ok: false, error: '上傳失敗：' + (result.error || '') }, 502)

  const nowIso = new Date().toISOString()

  // 3a) 首次上傳把 Drive 資料夾 id 記回 enroll_students（失敗不阻斷）
  if (result.folderId && !student.drive_folder_id) {
    try {
      await fetch(
        `${SUPABASE_URL}/rest/v1/enroll_students?account=eq.${encodeURIComponent(student.account)}`,
        { method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify({ drive_folder_id: result.folderId }) },
      )
    } catch { /* 記錄失敗不影響上傳結果 */ }
  }

  // 3b) 檔案清單（每次上傳都新增一筆，保留歷史；失敗不阻斷）
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/enroll_files`, {
      method: 'POST',
      headers: { ...H, Prefer: 'return=minimal' },
      body: JSON.stringify({
        account: student.account, step, kind,
        drive_file_id: result.fileId, drive_url: result.url, uploaded_by: 'student',
      }),
    })
  } catch { /* 記錄失敗不影響上傳結果 */ }

  // 3c) 該步 → submitted（待行政確認）；若已 confirmed 不降級。不自動開下一步。
  //     （before 已於 gating 時撈過；上傳期間狀態不會被本請求改動）
  if (before[step]?.state !== 'confirmed') {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/enroll_progress?on_conflict=account,step`, {
        method: 'POST',
        headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ account: student.account, step, state: 'submitted', submitted_at: nowIso }),
      })
    } catch { /* 進度更新失敗不影響上傳結果 */ }
  }

  // 3c-2) 步驟3 簽證：學生自助上傳＝簽證已到位，visa_stage → uploaded（保留 visa_track 等既有欄）
  if (step === 3 && kind === 'visa') {
    try {
      const d0 = (before[3] && before[3].data) || {}
      await fetch(`${SUPABASE_URL}/rest/v1/enroll_progress?account=eq.${encodeURIComponent(student.account)}&step=eq.3`, {
        method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
        body: JSON.stringify({ data: { ...d0, visa_stage: 'uploaded' } }),
      })
    } catch { /* visa_stage 更新失敗不影響上傳結果 */ }
  }

  // 3d) 稽核軌跡（失敗不阻斷）
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/enroll_log`, {
      method: 'POST',
      headers: { ...H, Prefer: 'return=minimal' },
      body: JSON.stringify({
        account: student.account, step, action: 'upload', actor: 'student',
        payload: { step, kind, fileId: result.fileId },
      }),
    })
  } catch { /* log 失敗不影響上傳結果 */ }

  // 4) 回更新後五步 progress，前端可直接刷新進度條
  const states = await fetchProgress(student.account, H)
  return json({ ok: true, url: result.url, kind, filename: finalName, fileId: result.fileId, states })
}
