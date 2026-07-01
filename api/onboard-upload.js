// Vercel Edge Function：學生端「入學準備」檔案上傳，代理到 Google Drive 的 Apps Script。
// 學生只憑 confirm_token（同 /api/onboard），Apps Script 的 secret 收在伺服器環境變數，
// 前端永遠拿不到；資料夾命名用 DB 裡的 account + name（不信前端傳的名字）。
//
// 需在 Vercel 設定環境變數（設定後要重新部署才生效）：
//   ONBOARD_UPLOAD_URL   = Apps Script 網頁應用程式 URL（.../exec）
//   ONBOARD_UPLOAD_TOKEN = 與 Apps Script 內 SHARED_SECRET 完全相同的密鑰
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
  const { token, kind, filename, mimeType, dataBase64, step } = payload || {}

  if (!token || typeof token !== 'string') return json({ ok: false, error: '缺少確認碼' }, 400)
  if (!kind || typeof kind !== 'string') return json({ ok: false, error: '缺少檔案類別' }, 400)
  if (!dataBase64 || typeof dataBase64 !== 'string') return json({ ok: false, error: '缺少檔案內容' }, 400)
  if (dataBase64.length > MAX_B64_LEN) return json({ ok: false, error: '檔案過大（上限約 3MB），請壓縮後再上傳' }, 413)
  if (!ALLOWED_MIME.includes(mimeType)) return json({ ok: false, error: '只接受 JPG / PNG / WEBP / HEIC / PDF' }, 400)

  // 驗 token → 學生（folder 命名資料以 DB 為準）
  const sRes = await fetch(
    `${SUPABASE_URL}/rest/v1/enroll_students?confirm_token=eq.${encodeURIComponent(token)}&select=account,name,drive_folder_id&limit=1`,
    { headers: H },
  )
  if (!sRes.ok) return json({ ok: false, error: '查詢失敗' }, 500)
  const sRows = await sRes.json()
  const student = (Array.isArray(sRows) && sRows[0]) || null
  if (!student) return json({ ok: false, error: '連結無效或已失效' }, 401)

  // 檔名：kind_時間戳_原檔名（去除路徑字元），方便同類多次上傳不互蓋
  const safeName = String(filename || '').replace(/[\\/]/g, '_').slice(0, 120)
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)
  const finalName = `${kind}_${stamp}${safeName ? '_' + safeName : ''}`

  // 轉發給 Apps Script（帶伺服器端 secret）
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

  // 首次上傳把 Drive 資料夾 id 記回 enroll_students（失敗不阻斷）
  if (result.folderId && !student.drive_folder_id) {
    try {
      await fetch(
        `${SUPABASE_URL}/rest/v1/enroll_students?account=eq.${encodeURIComponent(student.account)}`,
        { method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify({ drive_folder_id: result.folderId }) },
      )
    } catch { /* 記錄失敗不影響上傳結果 */ }
  }

  // 稽核軌跡（失敗不阻斷）
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/enroll_log`, {
      method: 'POST',
      headers: { ...H, Prefer: 'return=minimal' },
      body: JSON.stringify({
        account: student.account,
        step: Number(step) || null,
        action: 'file_upload',
        actor: 'student',
        payload: { kind, filename: finalName, mimeType, fileId: result.fileId, url: result.url },
      }),
    })
  } catch { /* log 失敗不影響上傳結果 */ }

  return json({ ok: true, kind, filename: finalName, fileId: result.fileId, url: result.url })
}
