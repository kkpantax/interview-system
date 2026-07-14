import { useState } from 'react'
import { getMyLetter } from '../api'
import { s, Btn } from '../components/UI'

// 學生自助下載「錄取通知單」落地頁（公開，#/letter）。
// 輸入帳號＋護照號碼，驗證通過後下載自己的通知單；尚未備妥則顯示 7/24 開放。
// 語言：可切換 zh 中文 / en English / vi Tiếng Việt / id Bahasa Indonesia（比照 ConfirmApp 做法）。
const ACCENT = '#1a1a18'

const LANGS = [
  { code: 'zh', label: '中文' },
  { code: 'en', label: 'English' },
  { code: 'vi', label: 'Tiếng Việt' },
  { code: 'id', label: 'Bahasa' },
]

const T = {
  brand:    { zh: '實踐大學國際專修部', en: 'Shih Chien University · IFP', vi: 'Đại học Thực Tiễn · IFP', id: 'Shih Chien University · IFP' },
  title:    { zh: '錄取通知單下載', en: 'Admission Letter Download', vi: 'Tải thư báo trúng tuyển', id: 'Unduh Surat Penerimaan' },
  subtitle: {
    zh: '請輸入你的申請帳號與護照號碼，下載你的錄取通知單。',
    en: 'Enter your application account and passport number to download your admission letter.',
    vi: 'Nhập tài khoản và số hộ chiếu của bạn để tải thư báo trúng tuyển.',
    id: 'Masukkan akun dan nomor paspor Anda untuk mengunduh surat penerimaan.',
  },
  account:  { zh: '申請帳號', en: 'Account', vi: 'Tài khoản', id: 'Akun' },
  passport: { zh: '護照號碼', en: 'Passport No.', vi: 'Số hộ chiếu', id: 'Nomor Paspor' },
  submit:   { zh: '查詢並下載', en: 'Search & Download', vi: 'Tra cứu và tải', id: 'Cari & Unduh' },
  loading:  { zh: '查詢中…', en: 'Checking…', vi: 'Đang tra cứu…', id: 'Memeriksa…' },
  fillboth: {
    zh: '請輸入帳號與護照號碼。',
    en: 'Please fill in both fields.',
    vi: 'Vui lòng nhập cả tài khoản và số hộ chiếu.',
    id: 'Harap isi akun dan nomor paspor.',
  },
  notReady: {
    zh: '你的錄取通知單尚未開放下載，將於 2026/7/24 提供，屆時請再回到本頁下載。',
    en: 'Your admission letter is not available yet. It will be ready on 24 Jul 2026 — please come back then.',
    vi: 'Thư báo trúng tuyển của bạn chưa sẵn sàng, sẽ có vào ngày 24/07/2026. Vui lòng quay lại sau.',
    id: 'Surat penerimaan Anda belum tersedia. Akan tersedia pada 24 Jul 2026 — silakan kembali lagi.',
  },
  ready: {
    zh: '驗證成功，開始下載。若未自動下載，請點下方按鈕。',
    en: 'Verified. Your download should start automatically; if not, click below.',
    vi: 'Xác minh thành công. Tệp sẽ tự tải xuống; nếu không, hãy nhấn nút bên dưới.',
    id: 'Terverifikasi. Unduhan akan dimulai otomatis; jika tidak, klik tombol di bawah.',
  },
  download: { zh: '⬇ 下載通知單', en: '⬇ Download PDF', vi: '⬇ Tải thư báo', id: '⬇ Unduh PDF' },
  err: {
    zh: '帳號或護照號碼不正確，請確認後再試。',
    en: 'Account or passport number is incorrect. Please check and try again.',
    vi: 'Tài khoản hoặc số hộ chiếu không đúng. Vui lòng kiểm tra lại.',
    id: 'Akun atau nomor paspor salah. Silakan periksa kembali.',
  },
  contact: {
    zh: '如有問題請聯繫國際專修部 shihchien_ifp@g2.usc.edu.tw',
    en: 'Questions? Contact IFP: shihchien_ifp@g2.usc.edu.tw',
    vi: 'Có thắc mắc? Liên hệ IFP: shihchien_ifp@g2.usc.edu.tw',
    id: 'Ada pertanyaan? Hubungi IFP: shihchien_ifp@g2.usc.edu.tw',
  },
}

const LANG_CODES = LANGS.map((l) => l.code)

export default function LetterApp({ lang: initialLang = '' } = {}) {
  // 預設語言：信件連結帶的 ?lang=（走學生語言），未帶則越南文。
  const [lang, setLang]     = useState(LANG_CODES.includes(initialLang) ? initialLang : 'vi')
  const [account, setAccount]   = useState('')
  const [passport, setPassport] = useState('')
  const [busy, setBusy]     = useState(false)
  const [result, setResult] = useState(null)   // { ready, url } | null
  const [error, setError]   = useState('')

  const tr = (k) => T[k]?.[lang] || T[k]?.zh || k

  async function submit(e) {
    e?.preventDefault()
    setError(''); setResult(null)
    const acc = account.trim(), pass = passport.trim()
    if (!acc || !pass) { setError(tr('fillboth')); return }
    setBusy(true)
    try {
      const r = await getMyLetter(acc, pass)
      setResult(r)
      if (r.ready && r.url) {
        const a = document.createElement('a')
        a.href = r.url; a.rel = 'noopener'
        document.body.appendChild(a); a.click(); a.remove()
      }
    } catch (err) {
      setError(err.message || tr('err'))
    } finally {
      setBusy(false)
    }
  }

  const langBar = (
    <div style={{ display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap', justifyContent: 'center' }}>
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

  return (
    <div style={{ minHeight: '100vh', background: '#f5f4f0', display: 'flex',
                  alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px' }}>
      <div style={{ width: '100%', maxWidth: 460 }}>
        {langBar}

        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <div style={{ fontSize: 13, color: '#9a8f7d', letterSpacing: '.08em', marginBottom: 6 }}>
            {tr('brand')}
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1a1a18' }}>{tr('title')}</h1>
        </div>

        <div style={{ ...s.card, padding: 22 }}>
          <p style={{ fontSize: 13, color: '#555', lineHeight: 1.6, marginBottom: 16 }}>{tr('subtitle')}</p>

          <form onSubmit={submit}>
            <label style={s.secLabel}>{tr('account')}</label>
            <input style={s.input} value={account} inputMode="numeric"
                   onChange={(e) => setAccount(e.target.value)} placeholder="11510003" autoComplete="off" />

            <label style={{ ...s.secLabel, marginTop: 10 }}>{tr('passport')}</label>
            <input style={s.input} value={passport}
                   onChange={(e) => setPassport(e.target.value)} placeholder="B1234567" autoComplete="off" />

            <Btn variant="primary" style={{ width: '100%', justifyContent: 'center', marginTop: 14, padding: '10px' }}
                 disabled={busy} onClick={submit}>
              {busy ? tr('loading') : tr('submit')}
            </Btn>
          </form>

          {error && (
            <div style={{ marginTop: 16, padding: '12px 14px', borderRadius: 8,
                          background: '#fee2e2', color: '#991b1b', fontSize: 12.5, lineHeight: 1.6 }}>
              {error}
            </div>
          )}

          {result && !result.ready && (
            <div style={{ marginTop: 16, padding: '12px 14px', borderRadius: 8,
                          background: '#fef3c7', color: '#92400e', fontSize: 12.5, lineHeight: 1.6 }}>
              {tr('notReady')}
            </div>
          )}

          {result && result.ready && (
            <div style={{ marginTop: 16, padding: '12px 14px', borderRadius: 8,
                          background: '#dcfce7', color: '#15803d', fontSize: 12.5, lineHeight: 1.6 }}>
              {tr('ready')}
              <div style={{ marginTop: 10 }}>
                <a href={result.url} rel="noopener"
                   style={{ ...s.btn, background: '#15803d', color: 'white', borderColor: '#15803d',
                            textDecoration: 'none' }}>
                  {tr('download')}
                </a>
              </div>
            </div>
          )}
        </div>

        <p style={{ textAlign: 'center', fontSize: 11.5, color: '#aaa', marginTop: 16, lineHeight: 1.6 }}>
          {tr('contact')}
        </p>
      </div>
    </div>
  )
}
