import { useState, useEffect, useMemo } from 'react'
import { Modal, Btn, s } from './UI'
import { createDrafts, sendDraftBatch } from '../api'
import { buildOnboardMail, onboardMailLang, ENROLL_STEPS, batchInfo, deptZhFull, ONBOARD_RESULT_LINK } from '../constants'
import { calcAge } from '../utils'

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

export const VISA_MAIL_TYPES = [
  { key: 'admission_letter_e', label: '電子錄取通知書寄送通知' },
  { key: 'vn_collection', label: '越南現場收件通知', track: 'vn' },
  { key: 'vn_supplement', label: '越南簽證資料補件通知', track: 'vn' },
  { key: 'paper_letter_sent', label: '紙本錄取通知書寄出通知', track: 'other' },
  { key: 'visa_date_reminder', label: '簽證日期回報提醒', track: 'other' },
]

const VISA_MAIL_LABEL = Object.fromEntries(VISA_MAIL_TYPES.map((x) => [x.key, x.label]))

// 簽證批次信（五種 × 四語）。單語組信；雙語整封由 msgFor 縫合（母語在前、中文在後），
// 主旨格式「外語 / 中文」，同其他步驟通知信慣例。
const VISA_MAIL_SUBJECTS = {
  admission_letter_e: {
    zh: '【實踐大學國際專修部】電子錄取通知書已開放下載',
    en: '[Shih Chien University IFP] Your Electronic Admission Letter Is Ready for Download',
    vi: '[Đại học Thực Tiễn - IFP] Giấy báo nhập học điện tử đã sẵn sàng để tải xuống',
    id: '[Universitas Shih Chien - IFP] Surat Penerimaan Elektronik Anda Siap Diunduh',
  },
  vn_collection: {
    zh: '【實踐大學國際專修部】越南簽證資料現場收件通知',
    en: '[Shih Chien University IFP] Visa Document Collection in Vietnam',
    vi: '[Đại học Thực Tiễn - IFP] Thông báo thu hồ sơ thị thực tại Việt Nam',
    id: '[Universitas Shih Chien - IFP] Pengumpulan Dokumen Visa di Vietnam',
  },
  vn_supplement: {
    zh: '【實踐大學國際專修部】簽證資料補件通知',
    en: '[Shih Chien University IFP] Additional Visa Documents Required',
    vi: '[Đại học Thực Tiễn - IFP] Thông báo bổ sung hồ sơ thị thực',
    id: '[Universitas Shih Chien - IFP] Pemberitahuan Kelengkapan Dokumen Visa',
  },
  paper_letter_sent: {
    zh: '【實踐大學國際專修部】紙本錄取通知書已寄出，請留意收件',
    en: '[Shih Chien University IFP] Your Printed Admission Letter Has Been Sent',
    vi: '[Đại học Thực Tiễn - IFP] Giấy báo nhập học bản giấy đã được gửi',
    id: '[Universitas Shih Chien - IFP] Surat Penerimaan Cetak Anda Telah Dikirim',
  },
  visa_date_reminder: {
    zh: '【實踐大學國際專修部】請回報簽證辦理日期',
    en: '[Shih Chien University IFP] Please Report Your Visa Application Dates',
    vi: '[Đại học Thực Tiễn - IFP] Vui lòng báo ngày làm thủ tục thị thực',
    id: '[Universitas Shih Chien - IFP] Mohon Laporkan Tanggal Pengurusan Visa Anda',
  },
}

const buildVisaMail = (kind, data, lang = 'zh') => {
  if (!VISA_MAIL_SUBJECTS[kind]) return null
  const L = ['zh', 'en', 'vi', 'id'].includes(lang) ? lang : 'en'
  const zhName = data.name || data.name_english || '同學'
  const fxName = data.name_english || data.name || 'Student'
  const contact = [data.contact_name, data.contact_email, data.contact_phone].filter(Boolean).join(' / ')
  const contactLine = contact ? {
    zh: `\n\n如有任何問題，歡迎聯繫承辦人 ${contact}。`,
    en: `\n\nIf you have any questions, please contact ${contact}.`,
    vi: `\n\nNếu có thắc mắc, vui lòng liên hệ cán bộ phụ trách ${contact}.`,
    id: `\n\nJika ada pertanyaan, silakan hubungi petugas ${contact}.`,
  }[L] : ''
  const greeting = {
    zh: `親愛的 ${zhName} 同學，您好：`, en: `Dear ${fxName},`,
    vi: `${fxName} thân mến,`, id: `Yth. ${fxName},`,
  }[L]
  const signoff = {
    zh: '實踐大學 國際事務處 敬啟', en: 'Office of International Affairs, Shih Chien University',
    vi: 'Phòng Sự vụ Quốc tế, Đại học Thực Tiễn', id: 'Kantor Urusan Internasional, Universitas Shih Chien',
  }[L]
  const link = data.link || ''
  const letterUrl = data.admission_letter_url || ''
  const na = { zh: '—', en: 'TBA', vi: '(sẽ thông báo sau)', id: '(akan diumumkan)' }[L]
  const noteBlock = data.vn_collection_note ? `\n\n${data.vn_collection_note}` : ''
  // date input 存 YYYY-MM-DD，信中統一顯示 YYYY/MM/DD
  const dstr = (v) => String(v || '').replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$1/$2/$3')
  const vnDate = dstr(data.vn_collection_date)
  const paperSent = dstr(data.paper_letter_sent_at)
  const paperDeadline = dstr(data.paper_letter_deadline)

  const middles = {
    admission_letter_e: {
      zh: `您的電子錄取通知書已開放下載，請由下方連結下載檔案，或登入入學準備系統查看最新狀態。\n\n電子錄取通知書：\n${letterUrl || '（尚未提供，開放後將顯示於系統頁面）'}\n\n入學準備系統：\n${link}\n\n請妥善保存錄取通知書；後續辦理簽證、入境與入學等相關程序時皆會使用，請依各階段通知與系統頁面指示完成。`,
      en: `Your electronic admission letter is now available for download. Please download it via the link below, or log in to the enrollment preparation system to check the latest status.\n\nElectronic admission letter:\n${letterUrl || '(Not yet available — it will appear on your system page once ready.)'}\n\nEnrollment preparation system:\n${link}\n\nPlease keep your admission letter in a safe place. You will need it for your visa application, entry to Taiwan, and enrollment procedures. Please follow the notices for each stage and the instructions on the system page.`,
      vi: `Giấy báo nhập học bản điện tử của bạn đã sẵn sàng để tải xuống. Vui lòng tải tệp qua đường dẫn bên dưới, hoặc đăng nhập hệ thống chuẩn bị nhập học để xem trạng thái mới nhất.\n\nGiấy báo nhập học điện tử:\n${letterUrl || '(Chưa có — sẽ hiển thị trên trang hệ thống khi sẵn sàng.)'}\n\nHệ thống chuẩn bị nhập học:\n${link}\n\nVui lòng lưu giữ cẩn thận giấy báo nhập học; bạn sẽ cần dùng đến khi làm thủ tục thị thực, nhập cảnh và nhập học. Vui lòng thực hiện theo thông báo của từng giai đoạn và hướng dẫn trên trang hệ thống.`,
      id: `Surat penerimaan elektronik Anda kini dapat diunduh. Silakan unduh melalui tautan di bawah ini, atau masuk ke sistem persiapan pendaftaran untuk melihat status terbaru.\n\nSurat penerimaan elektronik:\n${letterUrl || '(Belum tersedia — akan muncul di halaman sistem setelah siap.)'}\n\nSistem persiapan pendaftaran:\n${link}\n\nMohon simpan surat penerimaan Anda dengan baik; surat ini akan diperlukan untuk pengurusan visa, masuk ke Taiwan, dan prosedur pendaftaran. Mohon ikuti pemberitahuan setiap tahap dan petunjuk pada halaman sistem.`,
    },
    vn_collection: {
      zh: `您的入學繳費資料已審核通過。接下來學校將安排人員於越南現場收取簽證辦理所需資料，協助您完成後續簽證程序。\n\n請依以下時間與地點，準備並攜帶簽證辦理所需資料前往：\n\n收件日期：${vnDate || na}\n收件時間：${data.vn_collection_time || na}\n收件城市：${data.vn_collection_city || na}\n收件地點：${data.vn_collection_place || na}${noteBlock}\n\n請登入入學準備系統確認收件資訊，並點選「我已收到通知，會準時前往」：\n${link}`,
      en: `Your enrollment payment has been reviewed and approved. The university will collect your visa application documents in person in Vietnam to assist you with the visa process.\n\nPlease prepare the required visa documents and bring them at the following time and place:\n\nCollection date: ${vnDate || na}\nCollection time: ${data.vn_collection_time || na}\nCity: ${data.vn_collection_city || na}\nLocation: ${data.vn_collection_place || na}${noteBlock}\n\nPlease log in to the enrollment preparation system to check the collection details, then click "I received the notice and will attend on time":\n${link}`,
      vi: `Hồ sơ nộp học phí của bạn đã được kiểm tra và xác nhận. Tiếp theo, nhà trường sẽ cử nhân viên đến thu hồ sơ xin thị thực trực tiếp tại Việt Nam để hỗ trợ bạn hoàn tất thủ tục.\n\nVui lòng chuẩn bị và mang theo các giấy tờ cần thiết cho việc xin thị thực, đến đúng thời gian và địa điểm sau:\n\nNgày thu hồ sơ: ${vnDate || na}\nThời gian thu hồ sơ: ${data.vn_collection_time || na}\nThành phố: ${data.vn_collection_city || na}\nĐịa điểm: ${data.vn_collection_place || na}${noteBlock}\n\nVui lòng đăng nhập hệ thống chuẩn bị nhập học để xem thông tin thu hồ sơ, sau đó nhấn "Tôi đã nhận thông báo và sẽ đến đúng giờ":\n${link}`,
      id: `Pembayaran pendaftaran Anda telah diperiksa dan disetujui. Selanjutnya, pihak universitas akan mengumpulkan dokumen aplikasi visa Anda secara langsung di Vietnam untuk membantu proses visa Anda.\n\nMohon siapkan dan bawa dokumen visa yang diperlukan pada waktu dan tempat berikut:\n\nTanggal pengumpulan: ${vnDate || na}\nWaktu pengumpulan: ${data.vn_collection_time || na}\nKota: ${data.vn_collection_city || na}\nLokasi: ${data.vn_collection_place || na}${noteBlock}\n\nSilakan masuk ke sistem persiapan pendaftaran untuk memeriksa informasi pengumpulan, lalu klik "Saya sudah menerima pemberitahuan dan akan hadir tepat waktu":\n${link}`,
    },
    vn_supplement: {
      zh: `您的簽證資料經檢核後，尚有需要補齊或修正的項目，請依下列說明準備：\n\n補件說明：\n${data.supplement_note || '請依承辦人通知補齊或修正相關資料。'}\n\n請儘快依說明完成補件，並與承辦人保持聯繫，以免影響後續簽證辦理與入學時程。\n\n入學準備系統：\n${link}`,
      en: `After review, some of your visa documents need to be supplemented or corrected. Please prepare them according to the instructions below:\n\nSupplement instructions:\n${data.supplement_note || 'Please supplement or correct the documents as notified by the coordinator.'}\n\nPlease complete the supplement as soon as possible and stay in contact with the coordinator, so that your visa processing and enrollment schedule are not affected.\n\nEnrollment preparation system:\n${link}`,
      vi: `Sau khi kiểm tra, hồ sơ thị thực của bạn còn một số mục cần bổ sung hoặc chỉnh sửa. Vui lòng chuẩn bị theo hướng dẫn dưới đây:\n\nNội dung cần bổ sung:\n${data.supplement_note || 'Vui lòng bổ sung hoặc chỉnh sửa hồ sơ theo thông báo của cán bộ phụ trách.'}\n\nVui lòng hoàn thành việc bổ sung sớm nhất có thể và giữ liên lạc với cán bộ phụ trách, để không ảnh hưởng đến việc xử lý thị thực và lịch trình nhập học của bạn.\n\nHệ thống chuẩn bị nhập học:\n${link}`,
      id: `Setelah diperiksa, beberapa dokumen visa Anda masih perlu dilengkapi atau diperbaiki. Mohon siapkan sesuai petunjuk berikut:\n\nPetunjuk kelengkapan:\n${data.supplement_note || 'Mohon lengkapi atau perbaiki dokumen sesuai pemberitahuan petugas.'}\n\nMohon selesaikan kelengkapan dokumen sesegera mungkin dan tetap berkomunikasi dengan petugas, agar proses visa dan jadwal pendaftaran Anda tidak terpengaruh.\n\nSistem persiapan pendaftaran:\n${link}`,
    },
    paper_letter_sent: {
      zh: `您的紙本錄取通知書已由學校寄出，請留意收件。\n\n寄出日期：${paperSent || na}\n掛號／追蹤號碼：${data.paper_letter_tracking_no || na}\n\n收到紙本錄取通知書後，請登入入學準備系統點選「已收到紙本錄取通知書」，並儘早安排前往當地台灣辦事處辦理簽證。\n\n若您於 ${paperDeadline || '指定期限'} 前仍未收到，請在系統中點選「尚未收到，需要協助」，或直接與承辦人聯繫。\n\n入學準備系統：\n${link}`,
      en: `Your printed admission letter has been sent by the university. Please watch for its delivery.\n\nDate sent: ${paperSent || na}\nRegistered mail / tracking number: ${data.paper_letter_tracking_no || na}\n\nAfter receiving the printed admission letter, please log in to the enrollment preparation system, click "I have received the printed admission letter," and arrange your visa application at your local Taiwan office as soon as possible.\n\nIf you have not received it by ${paperDeadline || 'the specified deadline'}, please click "Not received yet, I need assistance" in the system, or contact the coordinator directly.\n\nEnrollment preparation system:\n${link}`,
      vi: `Giấy báo nhập học bản giấy của bạn đã được nhà trường gửi đi, vui lòng chú ý nhận thư.\n\nNgày gửi: ${paperSent || na}\nSố bảo đảm / mã theo dõi: ${data.paper_letter_tracking_no || na}\n\nSau khi nhận được giấy báo nhập học bản giấy, vui lòng đăng nhập hệ thống chuẩn bị nhập học, nhấn "Tôi đã nhận giấy báo nhập học bản giấy", và sớm sắp xếp đến Văn phòng Kinh tế và Văn hóa Đài Bắc tại địa phương để làm thủ tục xin thị thực.\n\nNếu đến ngày ${paperDeadline || 'thời hạn quy định'} bạn vẫn chưa nhận được, vui lòng nhấn "Chưa nhận được, tôi cần hỗ trợ" trong hệ thống, hoặc liên hệ trực tiếp với cán bộ phụ trách.\n\nHệ thống chuẩn bị nhập học:\n${link}`,
      id: `Surat penerimaan cetak Anda telah dikirim oleh universitas. Mohon perhatikan pengirimannya.\n\nTanggal pengiriman: ${paperSent || na}\nNomor pos tercatat / pelacakan: ${data.paper_letter_tracking_no || na}\n\nSetelah menerima surat penerimaan cetak, silakan masuk ke sistem persiapan pendaftaran, klik "Saya sudah menerima surat penerimaan cetak", dan segera atur pengajuan visa di kantor perwakilan Taiwan setempat.\n\nJika Anda belum menerimanya sebelum ${paperDeadline || 'batas waktu yang ditentukan'}, silakan klik "Belum menerima, saya perlu bantuan" di sistem, atau hubungi petugas secara langsung.\n\nSistem persiapan pendaftaran:\n${link}`,
    },
    visa_date_reminder: {
      zh: `請您於收到紙本錄取通知書後，儘早向當地台灣辦事處預約並辦理簽證。\n\n完成預約或確認辦理時間後，請登入入學準備系統回報以下資訊：\n\n1. 預計辦理簽證日期\n2. 預計取得簽證日期\n3. 其他需要學校協助的事項（備註）\n\n入學準備系統：\n${link}\n\n請務必儘早回報，讓學校掌握您的來台準備進度，以免影響後續入學安排。`,
      en: `After receiving your printed admission letter, please make an appointment with your local Taiwan office and apply for your visa as early as possible.\n\nOnce you have booked or confirmed your application date, please log in to the enrollment preparation system and report the following:\n\n1. Planned visa application date\n2. Expected visa pickup date\n3. Anything else you need the university's assistance with (notes)\n\nEnrollment preparation system:\n${link}\n\nPlease report these dates as early as possible so the university can keep track of your preparation progress and your enrollment schedule is not affected.`,
      vi: `Sau khi nhận được giấy báo nhập học bản giấy, vui lòng sớm đặt lịch hẹn với Văn phòng Kinh tế và Văn hóa Đài Bắc tại địa phương để làm thủ tục xin thị thực.\n\nSau khi đặt lịch hoặc xác nhận thời gian làm thủ tục, vui lòng đăng nhập hệ thống chuẩn bị nhập học và báo các thông tin sau:\n\n1. Ngày dự kiến làm thủ tục thị thực\n2. Ngày dự kiến nhận thị thực\n3. Các vấn đề khác cần nhà trường hỗ trợ (ghi chú)\n\nHệ thống chuẩn bị nhập học:\n${link}\n\nVui lòng báo sớm nhất có thể để nhà trường nắm được tiến độ chuẩn bị đến Đài Loan của bạn, tránh ảnh hưởng đến việc sắp xếp nhập học sau này.`,
      id: `Setelah menerima surat penerimaan cetak, mohon segera membuat janji dengan kantor perwakilan Taiwan setempat dan mengurus visa Anda.\n\nSetelah membuat janji atau memastikan jadwal pengurusan, silakan masuk ke sistem persiapan pendaftaran dan laporkan informasi berikut:\n\n1. Tanggal rencana pengurusan visa\n2. Tanggal perkiraan penerimaan visa\n3. Hal lain yang memerlukan bantuan universitas (catatan)\n\nSistem persiapan pendaftaran:\n${link}\n\nMohon laporkan sesegera mungkin agar universitas dapat memantau persiapan keberangkatan Anda ke Taiwan, sehingga jadwal pendaftaran tidak terpengaruh.`,
    },
  }
  return {
    subject: VISA_MAIL_SUBJECTS[kind][L],
    body: `${greeting}\n\n${middles[kind][L]}${contactLine}\n\n${signoff}`,
  }
}

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

export default function OnboardMailComposer({ step, mailKind = '', initialTier = 'first', recipients, cfg, markDraft, markSent, onClose, onToast }) {
  const visaMailLabel = VISA_MAIL_LABEL[mailKind] || ''
  const stepZh = visaMailLabel || (step === 0 ? '通知信' : (ENROLL_STEPS[step - 1]?.zh || `步驟${step}`))
  const hasTemplate = mailKind ? !!buildVisaMail(mailKind, {}) : !!buildOnboardMail({ step, tier: 'first', lang: 'zh', data: {} })

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
        gender: r.gender || '', birth_date: r.birth_date || '', center: r.center || '',
        data: r.data || {},
        lang: l === 'zh' ? 'en' : l,   // 下拉選的是外語；台/中籍預設中英
        sentCount: mailKind ? (r.data?.visa_mail?.[mailKind]?.sent_count || 0) : sc,
        sentKind: mailKind ? (r.data?.visa_mail?.[mailKind]?.last_tier || null) : sk,
        sentNow: false, include: mailKind ? !(r.data?.visa_mail?.[mailKind]?.sent_count > 0) : suggestInclude({ sentCount: sc, sentKind: sk }, initialTier),
      }
    }), [recipients, initialTier, mailKind])
  const [rows, setRows] = useState(baseRows)
  useEffect(() => { setRows(baseRows) }, [baseRows])
  // 切換通知次別 → 依新 tier 重新預選收件對象（見 suggestInclude）；手動勾選會被重置為建議名單
  useEffect(() => {
    if (mailKind) setRows((rs) => rs.map((r) => ({ ...r, include: !(r.sentCount > 0) })))
    else setRows((rs) => rs.map((r) => ({ ...r, include: suggestInclude(r, tier) })))
  }, [tier, mailKind])
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
      ...(r.data || {}),
    }
  }
  // 雙語組信：外語（該列下拉，依國籍自動帶）在前、中文在後；簽證批次信同規則
  const msgFor = (r) => {
    const data = dataFor(r)
    if (mailKind) {
      const fx = buildVisaMail(mailKind, data, r.lang)
      const zh = buildVisaMail(mailKind, data, 'zh')
      if (!fx || !zh) return null
      if (r.lang === 'zh') return zh
      return { subject: `${fx.subject} / ${zh.subject}`, body: fx.body + SEP + zh.body }
    }
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
    const tierLabel = mailKind ? '批次通知' : TIERS.find(([v]) => v === tier)?.[1]
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
  const studentMeta = (r) => {
    const age = calcAge(r.birth_date)
    const bi = batchInfo(r.account)
    return [r.account, bi.short, r.gender, age != null ? `${age}歲` : ''].filter(Boolean).join('·') || '—'
  }
  const studentCell = (r) => (
    <td style={{ ...td, minWidth: 160, whiteSpace: 'nowrap' }}>
      <div style={{ fontWeight: 500 }}>{r.name || '—'}</div>
      {r.name_en && <div style={{ color: '#aaa', fontSize: 11 }}>{r.name_en}</div>}
      <div style={{ color: '#aaa', fontSize: 11 }}>{studentMeta(r)}</div>
    </td>
  )
  const statusOf = (r) => {
    if (r.sentNow) return <span style={{ color: '#15803d' }}>已寄送</span>
    if (created[r.account]) return <span style={{ color: '#b45309' }}>已建草稿</span>
    if (r.sentCount) return <span style={{ color: '#15803d' }}>已寄送 {r.sentCount} 次{!mailKind && r.sentKind ? `（${TIER_SHORT[r.sentKind] || '—'}）` : ''}</span>
    return <span style={{ color: '#ccc' }}>—</span>
  }

  return (
    <Modal title={`寄送入學準備通知信 — ${stepZh}`} onClose={onClose} width={1040}>
      {/* 模板未提供 */}
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

      <div style={{ marginBottom: 18 }}>
        <span style={s.secLabel}>{mailKind ? '簽證信件類型' : '通知次別'}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {mailKind ? (
            <div style={{ fontSize: 13.5, fontWeight: 700, color: '#444' }}>{visaMailLabel}</div>
          ) : (
            <select style={{ ...s.sel, maxWidth: 220 }} value={tier} onChange={(e) => setTier(e.target.value)}>
              {TIERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          )}
        </div>
        <div style={{ fontSize: 12, color: tier !== 'first' ? '#b45309' : '#999', marginTop: 6, lineHeight: 1.7 }}>
          {mailKind
            ? '簽證批次信依「信件類型」分開計次；已寄過此類型的學生預設不勾，避免重複寄送。'
            : tier !== 'first'
            ? `信件開頭會加註${tier === 'second' ? '「尚未完成」提醒段' : '「最後提醒、逾期恐影響入學」段'}、主旨加上提醒前綴；僅寄給仍未完成者即可。`
            : '一般首次通知（放榜恭喜＋資料確認），信件內容維持原樣。'}
        </div>
      </div>

      {/* 名單 */}
      <span style={s.secLabel}>收件名單</span>
      <div style={{ fontSize: 12, color: '#666', margin: '4px 0 8px', lineHeight: 1.7 }}>
        {mailKind ? (
          <>依「{visaMailLabel}」自動預選 <b>{rows.filter((r) => !(r.sentCount > 0)).length}</b> 位；
          已寄過此類型的 {rows.filter((r) => (r.sentCount || 0) > 0).length} 位預設不勾（仍可手動加選）。</>
        ) : (
          <>依「{TIERS.find(([v]) => v === tier)?.[1]}」自動預選 <b>{rows.filter((r) => suggestInclude(r, tier)).length}</b> 位；
          已寄過本階段信的 {rows.filter((r) => (r.sentCount || 0) > 0).length} 位預設不勾（仍可手動加選）。</>
        )}
      </div>
      <div style={{ maxHeight: '40vh', overflow: 'auto', border: '1px solid #eee', borderRadius: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
          <thead>
            <tr style={{ background: '#faf9f6', position: 'sticky', top: 0 }}>
              <th style={th}><input type="checkbox" checked={selected.length === rows.length && rows.length > 0}
                onChange={(e) => setRows((rs) => rs.map((r) => ({ ...r, include: e.target.checked })))} /></th>
              <th style={th}>姓名</th><th style={th}>系所</th><th style={th}>中心</th><th style={th}>Email</th>
              <th style={th}>語言</th><th style={th}>狀態</th><th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.account}>
                <td style={td}><input type="checkbox" checked={r.include} onChange={(e) => setRow(r.account, { include: e.target.checked })} /></td>
                {studentCell(r)}
                <td style={td}>{deptZhFull(r.department) || r.department || '—'}</td>
                <td style={td}>{r.center || '—'}</td>
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
            {!rows.length && <tr><td colSpan={8} style={{ ...td, textAlign: 'center', color: '#aaa', padding: 24 }}>沒有可寄送的名單（需有 Email）</td></tr>}
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
        或建完草稿直接按「② 送出本批」。信件一律雙語（母語在前、中文在後），語言依國籍自動帶、可逐列改；
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
