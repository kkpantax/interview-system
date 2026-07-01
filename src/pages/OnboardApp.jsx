import { useState, useEffect, useCallback, useRef } from 'react'
import { onboardInfo, onboardSubmit } from '../api'
import { deptI18n, deptZhFull, ENROLL_STEPS, ONBOARD_STEP1_FIELDS } from '../constants'

// 學生端「入學準備」落地頁。
// Phase 1：token landing + 五步進度條（唯讀）。
// Phase 2：步驟1「資料確認」表單 + 送出（server 寫入後自動進到步驟2）。
// 注意：enroll_progress.step / enroll_settings.step 在 DB 是數字 1~5，
// 前端一律用 ENROLL_STEPS[i].step 查 progress / settings。

// 語言：zh 中文 / en English / vi Tiếng Việt / id Bahasa Indonesia
const LANGS = [
  { code: 'zh', label: '中文' },
  { code: 'en', label: 'English' },
  { code: 'vi', label: 'Tiếng Việt' },
  { code: 'id', label: 'Bahasa' },
]

const T = {
  program:      { zh: '實踐大學國際專修部(1+4)', en: 'Shih Chien University — International Foundation Program (1+4)', vi: 'Đại học Thực Tiễn — International Foundation Program (1+4)', id: 'Shih Chien University — International Foundation Program (1+4)' },
  title:        { zh: '入學準備', en: 'Enrollment Preparation', vi: 'Chuẩn bị nhập học', id: 'Persiapan Pendaftaran' },
  loading:      { zh: '載入中…', en: 'Loading…', vi: 'Đang tải…', id: 'Memuat…' },
  invalid:      { zh: '連結無效或已失效，請洽國際事務處。', en: 'This link is invalid or expired. Please contact the Office of International Affairs.', vi: 'Liên kết không hợp lệ hoặc đã hết hạn. Vui lòng liên hệ Phòng Hợp tác Quốc tế.', id: 'Tautan tidak valid atau kedaluwarsa. Silakan hubungi Kantor Urusan Internasional.' },
  greeting:     { zh: '親愛的 {n} 同學，您好：', en: 'Dear {n},', vi: 'Kính gửi bạn {n},', id: 'Yth. {n},' },
  intro:        { zh: '請依下列步驟完成入學準備，每完成一步並經本校確認後，即可進行下一步。', en: 'Please complete the enrollment steps below. Each step unlocks after the previous one is confirmed by the university.', vi: 'Vui lòng hoàn thành các bước chuẩn bị nhập học dưới đây. Mỗi bước sẽ mở sau khi bước trước được nhà trường xác nhận.', id: 'Mohon selesaikan langkah-langkah pendaftaran di bawah ini. Setiap langkah terbuka setelah langkah sebelumnya dikonfirmasi oleh universitas.' },
  deptLabel:    { zh: '錄取學系', en: 'Program', vi: 'Ngành', id: 'Program studi' },
  campusLabel:  { zh: '校區', en: 'Campus', vi: 'Cơ sở', id: 'Kampus' },
  stLocked:     { zh: '未開放', en: 'Locked', vi: 'Chưa mở', id: 'Terkunci' },
  stOpen:       { zh: '進行中', en: 'In progress', vi: 'Đang thực hiện', id: 'Sedang berlangsung' },
  stSubmitted:  { zh: '待確認', en: 'Under review', vi: 'Chờ xác nhận', id: 'Menunggu konfirmasi' },
  stConfirmed:  { zh: '已完成', en: 'Completed', vi: 'Đã hoàn thành', id: 'Selesai' },
  placeholder:  { zh: '此步驟內容建置中', en: 'This section is under construction.', vi: 'Nội dung bước này đang được xây dựng.', id: 'Konten langkah ini sedang dibangun.' },
  deadline:     { zh: '完成期限', en: 'Deadline', vi: 'Hạn hoàn thành', id: 'Batas waktu' },
  contact:      { zh: '聯絡窗口', en: 'Contact', vi: 'Liên hệ', id: 'Kontak' },
  allDone:      { zh: '🎉 您已完成所有入學準備步驟，我們台灣見！', en: '🎉 You have completed all enrollment steps. See you in Taiwan!', vi: '🎉 Bạn đã hoàn thành tất cả các bước. Hẹn gặp bạn tại Đài Loan!', id: '🎉 Anda telah menyelesaikan semua langkah. Sampai jumpa di Taiwan!' },
  unit:         { zh: '實踐大學 國際事務處', en: 'Office of International Affairs, Shih Chien University', vi: 'Phòng Hợp tác Quốc tế, Đại học Thực Tiễn', id: 'Kantor Urusan Internasional, Shih Chien University' },
  // 步驟1表單
  s1PrefillTitle: { zh: '基本資料（請確認並可修正）', en: 'Basic Information (please check and correct if needed)', vi: 'Thông tin cơ bản (vui lòng kiểm tra và sửa nếu cần)', id: 'Data Dasar (mohon periksa dan perbaiki jika perlu)' },
  s1FillTitle:    { zh: '請填寫以下資料', en: 'Please fill in the following', vi: 'Vui lòng điền các thông tin sau', id: 'Mohon isi data berikut' },
  s1ReqNote:      { zh: '* 為必填欄位', en: '* Required fields', vi: '* Mục bắt buộc', id: '* Wajib diisi' },
  s1LineTitle:    { zh: '加入新生 LINE 群組', en: 'Join the LINE group for new students', vi: 'Tham gia nhóm LINE tân sinh viên', id: 'Gabung grup LINE mahasiswa baru' },
  s1LineHint:     { zh: '請掃描 QR Code 加入群組，重要通知將在群組發布。', en: 'Please scan the QR code to join. Important notices will be posted in the group.', vi: 'Vui lòng quét mã QR để tham gia. Các thông báo quan trọng sẽ được đăng trong nhóm.', id: 'Silakan pindai kode QR untuk bergabung. Pengumuman penting akan diposting di grup.' },
  s1LineNoQr:     { zh: 'QR Code 稍後提供', en: 'QR code will be provided later.', vi: 'Mã QR sẽ được cung cấp sau.', id: 'Kode QR akan tersedia nanti.' },
  s1LineCheck:    { zh: '我已加入 LINE 群組', en: 'I have joined the LINE group', vi: 'Tôi đã tham gia nhóm LINE', id: 'Saya sudah bergabung di grup LINE' },
  s1Submit:       { zh: '確認送出', en: 'Submit', vi: 'Xác nhận gửi', id: 'Kirim' },
  submitting:     { zh: '送出中…', en: 'Submitting…', vi: 'Đang gửi…', id: 'Mengirim…' },
  s1Saved:        { zh: '✓ 資料已送出，已為您開啟下一步。', en: '✓ Submitted. The next step is now open.', vi: '✓ Đã gửi. Bước tiếp theo đã được mở.', id: '✓ Terkirim. Langkah berikutnya sudah terbuka.' },
  s1Missing:      { zh: '請填寫必填欄位：', en: 'Please fill in the required fields: ', vi: 'Vui lòng điền các mục bắt buộc: ', id: 'Mohon isi kolom wajib: ' },
}

const CAMPUS_I18N = {
  '台北校區': { zh: '台北校區', en: 'Taipei Campus', vi: 'Cơ sở Đài Bắc', id: 'Kampus Taipei' },
  '高雄校區': { zh: '高雄校區', en: 'Kaohsiung Campus', vi: 'Cơ sở Cao Hùng', id: 'Kampus Kaohsiung' },
}
const campusName = (camp, lang) => CAMPUS_I18N[camp]?.[lang] || camp

// 依國籍預設語言（同 ConfirmApp）
function langOf(nationality) {
  const sLow = String(nationality || '').toLowerCase()
  if (sLow.includes('越南') || sLow.includes('viet')) return 'vi'
  if (sLow.includes('印尼') || sLow.includes('indonesia')) return 'id'
  if (sLow.includes('台') || sLow.includes('中') || sLow.includes('taiwan')) return 'zh'
  return 'en'
}
const fmtDate = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d)) return String(iso)
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

// gating：confirmed 保持 ✓；「最低一個非 confirmed 的步驟」為 open（DB 若標 submitted
// 則顯示待確認），其後全部視為 locked（不論 DB 存什麼）。以 step 數字為 key。
function effectiveStates(progress) {
  const out = {}
  let gated = false
  for (const st of ENROLL_STEPS) {
    const raw = progress?.[st.step]?.state || 'locked'
    if (raw === 'confirmed') { out[st.step] = 'confirmed'; continue }
    if (!gated) {
      out[st.step] = raw === 'submitted' ? 'submitted' : 'open'
      gated = true
    } else {
      out[st.step] = 'locked'
    }
  }
  return out
}

const ACCENT = '#7c2d12'

const STATE_STYLE = {
  locked:    { bg: '#f3f4f6', color: '#9ca3af', border: '1px solid #e5e7eb' },
  open:      { bg: ACCENT,    color: '#fff',    border: '1px solid ' + ACCENT },
  submitted: { bg: '#fef3c7', color: '#b45309', border: '1px solid #fcd34d' },
  confirmed: { bg: '#dcfce7', color: '#15803d', border: '1px solid #86efac' },
}
const STATE_LABEL_KEY = { locked: 'stLocked', open: 'stOpen', submitted: 'stSubmitted', confirmed: 'stConfirmed' }

export default function OnboardApp({ token }) {
  const [lang, setLang] = useState('zh')
  const [info, setInfo] = useState(undefined)   // undefined=載入中, null=無效
  const [form, setForm] = useState({})
  const [lineJoined, setLineJoined] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)       // 步驟1剛送出成功
  const langInited = useRef(false)
  const tr = (k, vars = {}) => Object.entries(vars).reduce((str, [kk, vv]) => str.split(`{${kk}}`).join(vv), T[k]?.[lang] || T[k]?.zh || k)

  const load = useCallback(async () => {
    if (!token) { setInfo(null); return }
    try {
      const res = await onboardInfo(token)
      setInfo(res)
      if (!langInited.current) {
        setLang(langOf(res.student?.nationality))
        langInited.current = true
      }
      // 步驟1表單回填：已存過的 data 優先，否則帶 prefill
      const saved = res.progress?.[1]?.data || {}
      setForm({ ...(res.prefill || {}), ...saved })
      if (saved.line_joined) setLineJoined(true)
    } catch {
      setInfo(null)
    }
  }, [token])

  useEffect(() => { load() }, [load])

  const submitStep1 = async () => {
    const fields = [...ONBOARD_STEP1_FIELDS.prefill, ...ONBOARD_STEP1_FIELDS.fill]
    const missing = fields.filter((f) => f.req && !String(form[f.key] || '').trim())
    if (missing.length) {
      alert(tr('s1Missing') + missing.map((f) => f[lang] || f.zh).join('、'))
      return
    }
    setBusy(true)
    try {
      await onboardSubmit({ token, step: 1, data: form, line_joined: lineJoined })
      setDone(true)
      await load()
    } catch (e) {
      alert(e.message)
    } finally { setBusy(false) }
  }

  // 版面（同 ConfirmApp）
  const wrap = { minHeight: '100vh', background: '#f5f4f0', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 16px', fontFamily: "system-ui, 'Noto Sans TC', sans-serif", color: '#1a1a18' }
  const card = { background: 'white', borderRadius: 14, border: '1px solid #e8e7e3', maxWidth: 480, width: '100%', marginTop: 40, marginBottom: 40, overflow: 'hidden', boxShadow: '0 2px 18px rgba(0,0,0,.05)' }
  const infoBox = { background: '#faf9f6', border: '1px solid #eee', borderRadius: 10, padding: '14px 16px', marginBottom: 16 }
  const sectionBox = { background: '#fafaf8', border: '1px solid #efeee9', borderRadius: 10, padding: '12px 16px', marginTop: 14 }
  const sectionTitle = { fontSize: 11.5, fontWeight: 700, color: ACCENT, letterSpacing: 0.5, marginBottom: 6 }
  const inputStyle = { width: '100%', padding: '9px 10px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box', background: 'white', color: '#1a1a18' }
  const labelStyle = { fontSize: 12, color: '#666', marginBottom: 3, display: 'block' }

  const langBar = (
    <div style={{ display: 'flex', gap: 6, marginTop: 24, flexWrap: 'wrap', justifyContent: 'center' }}>
      {LANGS.map((l) => (
        <button key={l.code} onClick={() => setLang(l.code)}
          style={{ padding: '5px 12px', borderRadius: 99, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
            border: '1px solid ' + (lang === l.code ? ACCENT : '#ddd'),
            background: lang === l.code ? ACCENT : 'white', color: lang === l.code ? '#fff' : '#777' }}>
          {l.label}
        </button>
      ))}
    </div>
  )

  // 載入中
  if (info === undefined) {
    return <div style={wrap}><div style={{ ...card, padding: 40, textAlign: 'center', color: '#999' }}>{tr('loading')}</div></div>
  }
  // 無效
  if (info === null) {
    return (
      <div style={wrap}>
        {langBar}
        <div style={{ ...card, padding: 36, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 14 }}>🔗</div>
          <div style={{ fontSize: 14, color: '#555', lineHeight: 1.7 }}>{tr('invalid')}</div>
        </div>
      </div>
    )
  }

  const student = info.student || {}
  const states = effectiveStates(info.progress)
  const currentStep = ENROLL_STEPS.find((st) => states[st.step] !== 'confirmed') || null
  const currentSetting = currentStep ? info.settings?.[currentStep.step] : null

  const deptName = lang === 'zh' ? deptZhFull(student.department) : deptI18n(student.department, lang)
  const campusText = student.campus && student.campus !== '其他' ? campusName(student.campus, lang) : ''

  const field = (f) => (
    <div key={f.key} style={{ marginBottom: 10 }}>
      <label style={labelStyle}>
        {f[lang] || f.zh}{f.req && <span style={{ color: '#b91c1c' }}> *</span>}
      </label>
      <input
        style={inputStyle}
        value={form[f.key] ?? ''}
        onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
      />
    </div>
  )

  const step1Setting = info.settings?.[1]
  const lineQr = step1Setting?.extra?.line_qr_url

  const step1Form = (
    <div>
      <div style={{ ...sectionBox, marginTop: 14 }}>
        <div style={sectionTitle}>{tr('s1PrefillTitle')}</div>
        {ONBOARD_STEP1_FIELDS.prefill.map(field)}
      </div>
      <div style={sectionBox}>
        <div style={sectionTitle}>{tr('s1FillTitle')}</div>
        <div style={{ fontSize: 11, color: '#b91c1c', marginBottom: 8 }}>{tr('s1ReqNote')}</div>
        {ONBOARD_STEP1_FIELDS.fill.map(field)}
      </div>
      {/* LINE 群組 */}
      <div style={sectionBox}>
        <div style={sectionTitle}>{tr('s1LineTitle')}</div>
        <div style={{ fontSize: 12.5, color: '#666', lineHeight: 1.7, marginBottom: 10 }}>{tr('s1LineHint')}</div>
        <div style={{ textAlign: 'center', marginBottom: 10 }}>
          {lineQr ? (
            <img src={lineQr} alt="LINE QR" style={{ width: 160, height: 160, objectFit: 'contain', border: '1px solid #eee', borderRadius: 8, background: 'white' }} />
          ) : (
            <div style={{ width: 160, height: 160, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed #ccc', borderRadius: 8, color: '#aaa', fontSize: 12, lineHeight: 1.6, padding: 8, boxSizing: 'border-box', textAlign: 'center' }}>
              {tr('s1LineNoQr')}
            </div>
          )}
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, cursor: 'pointer', fontWeight: 500 }}>
          <input type="checkbox" checked={lineJoined} onChange={(e) => setLineJoined(e.target.checked)} style={{ width: 17, height: 17, accentColor: ACCENT }} />
          {tr('s1LineCheck')}
        </label>
      </div>
      <button
        onClick={submitStep1}
        disabled={!lineJoined || busy}
        style={{ width: '100%', marginTop: 14, padding: '13px', borderRadius: 10, fontSize: 15, fontWeight: 700, fontFamily: 'inherit',
          border: 'none', cursor: !lineJoined || busy ? 'not-allowed' : 'pointer',
          background: !lineJoined || busy ? '#e5e7eb' : ACCENT, color: !lineJoined || busy ? '#9ca3af' : 'white' }}>
        {busy ? tr('submitting') : tr('s1Submit')}
      </button>
    </div>
  )

  return (
    <div style={wrap}>
      {langBar}
      <div style={card}>
        <div style={{ background: ACCENT, color: '#fde7d4', padding: '18px 24px' }}>
          <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 4, lineHeight: 1.4 }}>{tr('program')}</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{tr('title')}</div>
        </div>
        <div style={{ padding: 24 }}>
          <p style={{ fontSize: 15, fontWeight: 600, margin: '0 0 4px' }}>{tr('greeting', { n: lang === 'zh' ? (student.name || student.name_en) : (student.name_en || student.name) })}</p>
          <p style={{ fontSize: 13.5, color: '#555', margin: '0 0 18px', lineHeight: 1.7 }}>{tr('intro')}</p>

          <div style={infoBox}>
            <Row label={tr('deptLabel')} value={deptName} />
            {campusText && <Row label={tr('campusLabel')} value={campusText} />}
          </div>

          {/* 五步進度條 */}
          <div style={{ display: 'flex', alignItems: 'flex-start', margin: '20px 0 6px' }}>
            {ENROLL_STEPS.map((st, i) => {
              const state = states[st.step]
              const c = STATE_STYLE[state]
              const isCurrent = state === 'open' || state === 'submitted'
              return (
                <div key={st.step} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
                  {/* 連接線（畫在左側，第一步不畫） */}
                  {i > 0 && (
                    <div style={{ position: 'absolute', top: 15, right: '50%', width: '100%', height: 2, marginRight: 16,
                      background: state === 'confirmed' || isCurrent ? '#d6b8a4' : '#e5e7eb', zIndex: 0 }} />
                  )}
                  <div style={{ width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: state === 'locked' ? 13 : 14, fontWeight: 700, zIndex: 1, boxSizing: 'border-box',
                    background: c.bg, color: c.color, border: c.border,
                    boxShadow: isCurrent ? '0 0 0 3px rgba(124,45,18,.15)' : 'none' }}>
                    {state === 'confirmed' ? '✓' : state === 'locked' ? '🔒' : i + 1}
                  </div>
                  <div style={{ fontSize: 10.5, lineHeight: 1.35, textAlign: 'center', marginTop: 6, padding: '0 2px',
                    fontWeight: isCurrent ? 700 : 400,
                    color: state === 'locked' ? '#b0b0ab' : state === 'confirmed' ? '#15803d' : isCurrent ? ACCENT : '#555' }}>
                    {st[lang] || st.zh}
                  </div>
                  <div style={{ fontSize: 9.5, marginTop: 2, color: c.color === '#fff' ? ACCENT : c.color, opacity: 0.9 }}>
                    {tr(STATE_LABEL_KEY[state])}
                  </div>
                </div>
              )
            })}
          </div>

          {/* 剛送出成功的提示 */}
          {done && (
            <div style={{ background: '#dcfce7', borderRadius: 10, padding: '12px 14px', textAlign: 'center', marginTop: 14, fontSize: 13.5, fontWeight: 600, color: '#15803d' }}>
              {tr('s1Saved')}
            </div>
          )}

          {/* 目前步驟內容 */}
          {currentStep ? (
            currentStep.step === 1 && states[1] === 'open' ? (
              step1Form
            ) : (
              <div style={sectionBox}>
                <div style={sectionTitle}>{currentStep[lang] || currentStep.zh} · {tr(STATE_LABEL_KEY[states[currentStep.step]])}</div>
                <div style={{ fontSize: 13, color: '#888', lineHeight: 1.8, padding: '10px 0', textAlign: 'center' }}>
                  🚧 {tr('placeholder')}
                </div>
                {currentSetting?.deadline && <Row label={tr('deadline')} value={fmtDate(currentSetting.deadline)} />}
                {(currentSetting?.contact_name || currentSetting?.contact_email) && (
                  <Row label={tr('contact')} value={
                    <span>
                      {currentSetting.contact_name || ''}
                      {currentSetting.contact_email && (
                        <a href={`mailto:${currentSetting.contact_email}`} style={{ color: ACCENT, marginLeft: 6 }}>{currentSetting.contact_email}</a>
                      )}
                    </span>
                  } />
                )}
              </div>
            )
          ) : (
            <div style={{ background: '#dcfce7', borderRadius: 10, padding: '16px', textAlign: 'center', marginTop: 14, fontSize: 14, fontWeight: 600, color: '#15803d', lineHeight: 1.7 }}>
              {tr('allDone')}
            </div>
          )}

          <p style={{ fontSize: 11.5, color: '#bbb', textAlign: 'center', margin: '18px 0 0' }}>{tr('unit')}</p>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '5px 0', fontSize: 13.5 }}>
      <span style={{ color: '#999', flexShrink: 0 }}>{label}</span>
      <span style={{ textAlign: 'right', fontWeight: 500 }}>{value}</span>
    </div>
  )
}
