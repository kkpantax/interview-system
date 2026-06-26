import { useState, useEffect, useCallback } from 'react'
import { confirmInfo, confirmSubmit } from '../api'
import { deptI18n, campusOf } from '../constants'

// 語言：zh 中文 / en English / vi Tiếng Việt / id Bahasa Indonesia
const LANGS = [
  { code: 'zh', label: '中文' },
  { code: 'en', label: 'English' },
  { code: 'vi', label: 'Tiếng Việt' },
  { code: 'id', label: 'Bahasa' },
]

const T = {
  program:      { zh: '實踐大學國際專修部(1+4)', en: 'Shih Chien University — International Foundation Program (1+4)', vi: 'Đại học Thực Tiễn — International Foundation Program (1+4)', id: 'Shih Chien University — International Foundation Program (1+4)' },
  title:        { zh: '預計錄取 · 就讀確認', en: 'Enrollment Confirmation', vi: 'Xác nhận nhập học', id: 'Konfirmasi Pendaftaran' },
  loading:      { zh: '載入中…', en: 'Loading…', vi: 'Đang tải…', id: 'Memuat…' },
  invalid:      { zh: '連結無效或已失效，請洽國際事務處。', en: 'This link is invalid or expired. Please contact the Office of International Affairs.', vi: 'Liên kết không hợp lệ hoặc đã hết hạn. Vui lòng liên hệ Phòng Hợp tác Quốc tế.', id: 'Tautan tidak valid atau kedaluwarsa. Silakan hubungi Kantor Urusan Internasional.' },
  greeting:     { zh: '親愛的 {n} 同學，您好：', en: 'Dear {n},', vi: 'Kính gửi bạn {n},', id: 'Yth. {n},' },
  congrats:     { zh: '恭喜您獲本校預計錄取。', en: 'Congratulations on your preliminary admission to our university.', vi: 'Chúc mừng bạn đã được dự kiến trúng tuyển vào trường chúng tôi.', id: 'Selamat atas penerimaan awal Anda di universitas kami.' },
  deptLabel:    { zh: '錄取學系', en: 'Program', vi: 'Ngành', id: 'Program studi' },
  campusLabel:  { zh: '校區', en: 'Campus', vi: 'Cơ sở', id: 'Kampus' },
  resultLabel:  { zh: '錄取結果', en: 'Result', vi: 'Kết quả', id: 'Hasil' },
  admitted:     { zh: '正取', en: 'Admitted', vi: 'Trúng tuyển chính thức', id: 'Diterima' },
  waitlisted:   { zh: '備取 {r}', en: 'Waitlist No. {r}', vi: 'Dự bị số {r}', id: 'Daftar tunggu No. {r}' },
  datesTitle:   { zh: '重要日期', en: 'Important Dates', vi: 'Các mốc thời gian quan trọng', id: 'Tanggal Penting' },
  announceLabel:{ zh: '正式放榜日期', en: 'Official result announcement', vi: 'Ngày công bố kết quả chính thức', id: 'Pengumuman hasil resmi' },
  deadline:     { zh: '意願回覆期限', en: 'Reply by', vi: 'Hạn phản hồi', id: 'Batas waktu balasan' },
  notesTitle:   { zh: '注意事項', en: 'Please Note', vi: 'Lưu ý', id: 'Perhatian' },
  note1:        { zh: '本通知為「預錄取意願調查」，並非正式錄取通知。正式錄取名單以本校正式放榜公告為準。', en: 'This is a preliminary enrollment-intention survey, not a formal admission notice. The official admission list is determined by the University’s official announcement.', vi: 'Đây là khảo sát nguyện vọng nhập học sơ bộ, không phải thông báo trúng tuyển chính thức. Danh sách trúng tuyển chính thức căn cứ theo thông báo chính thức của Nhà trường.', id: 'Ini adalah survei niat pendaftaran awal, bukan pemberitahuan penerimaan resmi. Daftar penerimaan resmi ditentukan oleh pengumuman resmi Universitas.' },
  note2:        { zh: '請於「意願回覆期限」前於本頁完成回覆；逾期將無法修改，視同放棄。', en: 'Please respond on this page before the reply deadline. After the deadline no changes can be made and it will be treated as a withdrawal.', vi: 'Vui lòng phản hồi trên trang này trước hạn. Sau hạn sẽ không thể thay đổi và được xem là từ chối.', id: 'Mohon menanggapi di halaman ini sebelum batas waktu. Setelah batas waktu, perubahan tidak dapat dilakukan dan dianggap mengundurkan diri.' },
  question:     { zh: '請確認您是否將就讀本學系：', en: 'Please confirm whether you will enroll in this program:', vi: 'Vui lòng xác nhận bạn có nhập học ngành này hay không:', id: 'Mohon konfirmasi apakah Anda akan mendaftar di program ini:' },
  btnYes:       { zh: '確認就讀', en: 'Confirm Enrollment', vi: 'Xác nhận nhập học', id: 'Konfirmasi Daftar' },
  btnNo:        { zh: '放棄錄取', en: 'Decline', vi: 'Từ chối', id: 'Tolak' },
  confirmYes:   { zh: '您確定要「確認就讀」嗎？', en: 'Are you sure you want to confirm enrollment?', vi: 'Bạn có chắc muốn xác nhận nhập học không?', id: 'Apakah Anda yakin ingin konfirmasi pendaftaran?' },
  confirmNo:    { zh: '您確定要「放棄錄取」嗎？', en: 'Are you sure you want to decline?', vi: 'Bạn có chắc muốn từ chối không?', id: 'Apakah Anda yakin ingin menolak?' },
  yes:          { zh: '確定', en: 'Yes', vi: 'Đồng ý', id: 'Ya' },
  cancel:       { zh: '取消', en: 'Cancel', vi: 'Hủy', id: 'Batal' },
  chosenYes:    { zh: '您已選擇「確認就讀」。', en: 'You have chosen to ENROLL.', vi: 'Bạn đã chọn NHẬP HỌC.', id: 'Anda telah memilih MENDAFTAR.' },
  chosenNo:     { zh: '您已選擇「放棄錄取」。', en: 'You have chosen to DECLINE.', vi: 'Bạn đã chọn TỪ CHỐI.', id: 'Anda telah memilih MENOLAK.' },
  canChange:    { zh: '期限前可透過本頁隨時修改您的選擇。', en: 'You may change your choice on this page any time before the deadline.', vi: 'Bạn có thể thay đổi lựa chọn trên trang này bất cứ lúc nào trước hạn.', id: 'Anda dapat mengubah pilihan di halaman ini kapan saja sebelum batas waktu.' },
  changeBtn:    { zh: '修改我的選擇', en: 'Change my choice', vi: 'Thay đổi lựa chọn', id: 'Ubah pilihan' },
  expired:      { zh: '已逾回覆期限，無法再修改，請洽國際事務處。', en: 'The deadline has passed; changes are no longer possible. Please contact the Office of International Affairs.', vi: 'Đã quá hạn phản hồi; không thể thay đổi. Vui lòng liên hệ Phòng Hợp tác Quốc tế.', id: 'Batas waktu telah berlalu; perubahan tidak dapat dilakukan. Silakan hubungi Kantor Urusan Internasional.' },
  submitting:   { zh: '送出中…', en: 'Submitting…', vi: 'Đang gửi…', id: 'Mengirim…' },
  saved:        { zh: '已儲存您的選擇，感謝您的回覆。', en: 'Your choice has been saved. Thank you.', vi: 'Lựa chọn của bạn đã được lưu. Cảm ơn bạn.', id: 'Pilihan Anda telah disimpan. Terima kasih.' },
  unit:         { zh: '實踐大學 國際事務處', en: 'Office of International Affairs, Shih Chien University', vi: 'Phòng Hợp tác Quốc tế, Đại học Thực Tiễn', id: 'Kantor Urusan Internasional, Shih Chien University' },
}

const CAMPUS_I18N = {
  '台北校區': { zh: '台北校區', en: 'Taipei Campus', vi: 'Cơ sở Đài Bắc', id: 'Kampus Taipei' },
  '高雄校區': { zh: '高雄校區', en: 'Kaohsiung Campus', vi: 'Cơ sở Cao Hùng', id: 'Kampus Kaohsiung' },
}
const campusName = (camp, lang) => CAMPUS_I18N[camp]?.[lang] || camp

// 依國籍預設語言
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

const ACCENT = '#7c2d12'

export default function ConfirmApp({ token }) {
  const [lang, setLang]   = useState('zh')
  const [info, setInfo]   = useState(undefined)   // undefined=載入中, null=無效
  const [busy, setBusy]   = useState(false)
  const [ask, setAsk]     = useState(null)        // 'enrolled' | 'declined' | null
  const [done, setDone]   = useState(false)       // 本次剛送出
  const tr = (k, vars = {}) => Object.entries(vars).reduce((str, [kk, vv]) => str.split(`{${kk}}`).join(vv), T[k]?.[lang] || T[k]?.zh || k)

  const load = useCallback(async () => {
    if (!token) { setInfo(null); return }
    try {
      const res = await confirmInfo(token)
      if (!res.found) { setInfo(null); return }
      setInfo(res)
      setLang(langOf(res.nationality))
    } catch {
      setInfo(null)
    }
  }, [token])

  useEffect(() => { load() }, [load])

  const submit = async (decision) => {
    setAsk(null); setBusy(true)
    try {
      const res = await confirmSubmit(token, decision)
      if (res.expired) { await load(); return }
      setDone(true)
      setInfo((p) => ({ ...p, status: decision }))
    } catch (e) {
      alert(e.message)
    } finally { setBusy(false) }
  }

  // 版面
  const wrap = { minHeight: '100vh', background: '#f5f4f0', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 16px', fontFamily: "system-ui, 'Noto Sans TC', sans-serif", color: '#1a1a18' }
  const card = { background: 'white', borderRadius: 14, border: '1px solid #e8e7e3', maxWidth: 480, width: '100%', marginTop: 40, marginBottom: 40, overflow: 'hidden', boxShadow: '0 2px 18px rgba(0,0,0,.05)' }
  const infoBox = { background: '#faf9f6', border: '1px solid #eee', borderRadius: 10, padding: '14px 16px', marginBottom: 16 }
  const sectionBox = { background: '#fafaf8', border: '1px solid #efeee9', borderRadius: 10, padding: '12px 16px', marginTop: 14 }
  const sectionTitle = { fontSize: 11.5, fontWeight: 700, color: ACCENT, letterSpacing: 0.5, marginBottom: 6 }

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

  const deptName = lang === 'zh' ? info.department : deptI18n(info.department, lang)
  const campusRaw = campusOf(info.department)
  const campusText = campusRaw && campusRaw !== '其他' ? campusName(campusRaw, lang) : ''
  const resultText = info.type === 'admitted' ? tr('admitted') : tr('waitlisted', { r: info.standby_rank ?? '' })
  const expired = info.expired
  const status = info.status   // pending / enrolled / declined / …
  const hasChosen = status === 'enrolled' || status === 'declined'

  return (
    <div style={wrap}>
      {langBar}
      <div style={card}>
        <div style={{ background: ACCENT, color: '#fde7d4', padding: '18px 24px' }}>
          <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 4, lineHeight: 1.4 }}>{tr('program')}</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{tr('title')}</div>
        </div>
        <div style={{ padding: 24 }}>
          <p style={{ fontSize: 15, fontWeight: 600, margin: '0 0 4px' }}>{tr('greeting', { n: lang === 'zh' ? info.name : (info.name_english || info.name) })}</p>
          <p style={{ fontSize: 13.5, color: '#555', margin: '0 0 18px', lineHeight: 1.7 }}>{tr('congrats')}</p>

          <div style={infoBox}>
            <Row label={tr('deptLabel')} value={deptName} />
            {campusText && <Row label={tr('campusLabel')} value={campusText} />}
            <Row label={tr('resultLabel')} value={<b style={{ color: ACCENT }}>{resultText}</b>} />
          </div>

          {/* 逾期 */}
          {expired ? (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 14px', fontSize: 13, color: '#b91c1c', lineHeight: 1.7 }}>
              ⏰ {tr('expired')}
              {hasChosen && <div style={{ marginTop: 6, color: '#555' }}>{status === 'enrolled' ? tr('chosenYes') : tr('chosenNo')}</div>}
            </div>
          ) : busy ? (
            <div style={{ textAlign: 'center', color: '#999', fontSize: 14, padding: 12 }}>{tr('submitting')}</div>
          ) : (done || hasChosen) ? (
            // 已選擇：顯示目前選擇 + 可修改
            <div>
              <div style={{ background: status === 'enrolled' ? '#dcfce7' : '#fee2e2', borderRadius: 10, padding: '14px 16px', textAlign: 'center', marginBottom: 12 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: status === 'enrolled' ? '#15803d' : '#b91c1c' }}>
                  {status === 'enrolled' ? '✓ ' + tr('chosenYes') : tr('chosenNo')}
                </div>
                {done && <div style={{ fontSize: 12.5, color: '#666', marginTop: 4 }}>{tr('saved')}</div>}
              </div>
              <p style={{ fontSize: 12.5, color: '#888', textAlign: 'center', margin: '0 0 12px' }}>{tr('canChange')}</p>
              <div style={{ display: 'flex', gap: 10 }}>
                {status !== 'enrolled' && <BigBtn onClick={() => setAsk('enrolled')} kind="yes">{tr('btnYes')}</BigBtn>}
                {status !== 'declined' && <BigBtn onClick={() => setAsk('declined')} kind="no">{tr('btnNo')}</BigBtn>}
              </div>
            </div>
          ) : (
            // 尚未選擇：兩顆按鈕
            <div>
              <p style={{ fontSize: 13.5, color: '#333', margin: '0 0 14px', fontWeight: 500 }}>{tr('question')}</p>
              <div style={{ display: 'flex', gap: 10 }}>
                <BigBtn onClick={() => setAsk('enrolled')} kind="yes">{tr('btnYes')}</BigBtn>
                <BigBtn onClick={() => setAsk('declined')} kind="no">{tr('btnNo')}</BigBtn>
              </div>
            </div>
          )}

          {/* 重要日期 */}
          {(info.announce_date || info.deadline) && (
            <div style={sectionBox}>
              <div style={sectionTitle}>{tr('datesTitle')}</div>
              {info.announce_date && <Row label={tr('announceLabel')} value={fmtDate(info.announce_date)} />}
              {info.deadline && <Row label={tr('deadline')} value={fmtDate(info.deadline)} />}
            </div>
          )}

          {/* 注意事項 */}
          <div style={sectionBox}>
            <div style={sectionTitle}>{tr('notesTitle')}</div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#777', lineHeight: 1.85 }}>
              <li>{tr('note1')}</li>
              <li>{tr('note2')}</li>
            </ul>
          </div>

          <p style={{ fontSize: 11.5, color: '#bbb', textAlign: 'center', margin: '18px 0 0' }}>{tr('unit')}</p>
        </div>
      </div>

      {/* 二次確認 */}
      {ask && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 50 }}>
          <div style={{ background: 'white', borderRadius: 12, padding: 24, maxWidth: 360, width: '100%', textAlign: 'center' }}>
            <p style={{ fontSize: 15, fontWeight: 600, margin: '0 0 18px', lineHeight: 1.6 }}>{ask === 'enrolled' ? tr('confirmYes') : tr('confirmNo')}</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setAsk(null)} style={{ flex: 1, padding: '11px', borderRadius: 9, border: '1px solid #ddd', background: 'white', color: '#555', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>{tr('cancel')}</button>
              <button onClick={() => submit(ask)} style={{ flex: 1, padding: '11px', borderRadius: 9, border: 'none', background: ask === 'enrolled' ? '#15803d' : '#b91c1c', color: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>{tr('yes')}</button>
            </div>
          </div>
        </div>
      )}
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
function BigBtn({ children, onClick, kind }) {
  const c = kind === 'yes'
    ? { background: '#dcfce7', color: '#15803d', border: '1px solid #86efac' }
    : { background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5' }
  return (
    <button onClick={onClick} style={{ flex: 1, padding: '13px', borderRadius: 10, fontSize: 14.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', ...c }}>
      {children}
    </button>
  )
}
