import { useState, useEffect, useCallback, useRef } from 'react'
import { onboardInfo, onboardSubmit, onboardUpload, onboardNameChangeRequest } from '../api'
import { deptI18n, deptZhFull, ENROLL_STEPS, ONBOARD_STEP1_FIELDS, ONBOARD_STEP4_FIELDS, VN_PROVINCES } from '../constants'
import { driveImageUrl } from '../utils'

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
  withdrawLink:   { zh: '放棄入學', en: 'Withdraw enrollment', vi: 'Từ bỏ nhập học', id: 'Membatalkan pendaftaran' },
  withdrawTitle:  { zh: '放棄入學', en: 'Withdraw Enrollment', vi: 'Từ bỏ nhập học', id: 'Membatalkan Pendaftaran' },
  withdrawWarn:   { zh: '確定要放棄入學嗎？送出後您的入學資格將被取消、入學準備流程也會結束。如為誤操作，請聯繫下方承辦窗口協助恢復。', en: 'Are you sure you want to withdraw? Once submitted, your enrollment will be cancelled and the preparation process will end. If this was a mistake, please contact the staff below to restore it.', vi: 'Bạn có chắc chắn muốn từ bỏ nhập học? Sau khi gửi, tư cách nhập học của bạn sẽ bị hủy và quy trình chuẩn bị nhập học cũng kết thúc. Nếu thao tác nhầm, vui lòng liên hệ cán bộ phụ trách bên dưới để khôi phục.', id: 'Apakah Anda yakin ingin membatalkan pendaftaran? Setelah dikirim, pendaftaran Anda akan dibatalkan dan proses persiapan berakhir. Jika ini keliru, silakan hubungi petugas di bawah untuk memulihkannya.' },
  auditTitle: { zh: '資料已被退回，請查看原因並補件', en: 'Your submission was returned. Please review and resubmit.', vi: 'Hồ sơ đã bị trả lại. Vui lòng xem lý do và bổ sung.', id: 'Data Anda dikembalikan. Silakan tinjau alasan dan lengkapi kembali.' },
  auditShow:  { zh: '查看原因', en: 'View reason', vi: 'Xem lý do', id: 'Lihat alasan' },
  auditHide:  { zh: '收合', en: 'Hide', vi: 'Ẩn', id: 'Sembunyikan' },
  auditStep1: { zh: '資料確認 · 退回補件', en: 'Data Confirmation · Returned', vi: 'Xác nhận thông tin · Trả lại', id: 'Konfirmasi Data · Dikembalikan' },
  auditStep2: { zh: '繳費 · 退回重傳', en: 'Payment · Returned', vi: 'Thanh toán · Trả lại', id: 'Pembayaran · Dikembalikan' },
  auditNoReason: { zh: '（承辦未填寫原因，請聯繫承辦窗口）', en: '(No reason provided; please contact the coordinator.)', vi: '(Không có lý do; vui lòng liên hệ cán bộ phụ trách.)', id: '(Tidak ada alasan; silakan hubungi petugas.)' },
  nrApproved:      { zh: '✓ 您的中文姓名更改申請已核准，姓名已更新為「{n}」。', en: '✓ Your Chinese name change has been approved. Your name is now "{n}".', vi: '✓ Yêu cầu đổi tên tiếng Hoa của bạn đã được duyệt. Tên hiện tại là「{n}」.', id: '✓ Perubahan nama Mandarin Anda disetujui. Nama Anda sekarang「{n}」.' },
  nrRejectedHead:  { zh: '✗ 您的中文姓名更改申請未通過，您可重新提出申請。', en: '✗ Your Chinese name change request was not approved. You may submit a new request.', vi: '✗ Yêu cầu đổi tên của bạn không được duyệt. Bạn có thể gửi lại yêu cầu.', id: '✗ Permintaan perubahan nama Anda tidak disetujui. Anda dapat mengajukan lagi.' },
  nrRejectedReason:{ zh: '駁回原因：', en: 'Reason: ', vi: 'Lý do: ', id: 'Alasan: ' },
  withdrawReason: { zh: '放棄原因（選填）', en: 'Reason (optional)', vi: 'Lý do (không bắt buộc)', id: 'Alasan (opsional)' },
  withdrawCancel: { zh: '取消', en: 'Cancel', vi: 'Hủy', id: 'Batal' },
  withdrawConfirm:{ zh: '確定放棄', en: 'Confirm withdrawal', vi: 'Xác nhận từ bỏ', id: 'Konfirmasi pembatalan' },
  withdrawnTitle: { zh: '您已放棄入學', en: 'You have withdrawn', vi: 'Bạn đã từ bỏ nhập học', id: 'Anda telah membatalkan pendaftaran' },
  withdrawnBody:  { zh: '您已提出放棄入學，入學準備流程已結束。如為誤操作，請聯繫以下承辦窗口協助恢復。', en: 'You have withdrawn your enrollment and the preparation process has ended. If this was a mistake, please contact the staff below to restore it.', vi: 'Bạn đã từ bỏ nhập học và quy trình chuẩn bị nhập học đã kết thúc. Nếu thao tác nhầm, vui lòng liên hệ cán bộ phụ trách bên dưới để khôi phục.', id: 'Anda telah membatalkan pendaftaran dan proses persiapan telah berakhir. Jika ini keliru, silakan hubungi petugas di bawah untuk memulihkannya.' },
  // 步驟1表單
  s1PrefillTitle: { zh: '基本資料（請確認並可修正）', en: 'Basic Information (please check and correct if needed)', vi: 'Thông tin cơ bản (vui lòng kiểm tra và sửa nếu cần)', id: 'Data Dasar (mohon periksa dan perbaiki jika perlu)' },
  s1FillTitle:    { zh: '請填寫以下資料', en: 'Please fill in the following', vi: 'Vui lòng điền các thông tin sau', id: 'Mohon isi data berikut' },
  s1ReqNote:      { zh: '* 為必填欄位', en: '* Required fields', vi: '* Mục bắt buộc', id: '* Wajib diisi' },
  noPassport:     { zh: '尚未辦理護照', en: 'I do not have a passport yet', vi: 'Tôi chưa làm hộ chiếu', id: 'Belum memiliki paspor' },
  natOtherPh:     { zh: '請輸入國籍', en: 'Please enter your nationality', vi: 'Vui lòng nhập quốc tịch', id: 'Silakan masukkan kewarganegaraan' },
  // 中文姓名更改申請
  ncBtn:     { zh: '申請更改', en: 'Request change', vi: 'Yêu cầu thay đổi', id: 'Ajukan perubahan' },
  ncTitle:   { zh: '中文姓名更改申請', en: 'Chinese Name Change Request', vi: 'Yêu cầu thay đổi tên chữ Hán', id: 'Permintaan Perubahan Nama Mandarin' },
  ncCurrent: { zh: '目前姓名', en: 'Current name', vi: 'Tên hiện tại', id: 'Nama saat ini' },
  ncNewName: { zh: '新姓名', en: 'New name', vi: 'Tên mới', id: 'Nama baru' },
  ncReason:  { zh: '更改原因', en: 'Reason', vi: 'Lý do', id: 'Alasan' },
  ncSend:    { zh: '送出申請', en: 'Submit request', vi: 'Gửi yêu cầu', id: 'Kirim permintaan' },
  ncCancel:  { zh: '取消', en: 'Cancel', vi: 'Hủy', id: 'Batal' },
  ncPending: { zh: '更名審核中：{n}（待校方核准）', en: 'Name change under review: {n} (pending approval)', vi: 'Đang xét duyệt đổi tên: {n} (chờ nhà trường phê duyệt)', id: 'Perubahan nama sedang ditinjau: {n} (menunggu persetujuan)' },
  ncMissing: { zh: '請填寫新姓名與更改原因', en: 'Please fill in the new name and reason.', vi: 'Vui lòng điền tên mới và lý do.', id: 'Mohon isi nama baru dan alasan.' },
  ncDup:     { zh: '您已有一筆待審核的更名申請', en: 'You already have a pending name change request.', vi: 'Bạn đã có một yêu cầu đổi tên đang chờ duyệt.', id: 'Anda sudah memiliki permintaan perubahan nama yang tertunda.' },
  ncDone:    { zh: '✓ 已送出更名申請，請等待校方審核。', en: '✓ Request submitted. Please wait for the university to review it.', vi: '✓ Đã gửi yêu cầu. Vui lòng chờ nhà trường xét duyệt.', id: '✓ Permintaan terkirim. Mohon tunggu peninjauan dari universitas.' },
  s1LineTitle:    { zh: '加入新生 LINE 群組', en: 'Join the LINE group for new students', vi: 'Tham gia nhóm LINE tân sinh viên', id: 'Gabung grup LINE mahasiswa baru' },
  s1LineHint:     { zh: '請掃描 QR Code 加入群組，重要通知將在群組發布。', en: 'Please scan the QR code to join. Important notices will be posted in the group.', vi: 'Vui lòng quét mã QR để tham gia. Các thông báo quan trọng sẽ được đăng trong nhóm.', id: 'Silakan pindai kode QR untuk bergabung. Pengumuman penting akan diposting di grup.' },
  s1LineNoQr:     { zh: 'QR Code 稍後提供', en: 'QR code will be provided later.', vi: 'Mã QR sẽ được cung cấp sau.', id: 'Kode QR akan tersedia nanti.' },
  s1LineCheck:    { zh: '我已加入 LINE 群組', en: 'I have joined the LINE group', vi: 'Tôi đã tham gia nhóm LINE', id: 'Saya sudah bergabung di grup LINE' },
  s1Submit:       { zh: '確認送出', en: 'Submit', vi: 'Xác nhận gửi', id: 'Kirim' },
  submitting:     { zh: '送出中…', en: 'Submitting…', vi: 'Đang gửi…', id: 'Mengirim…' },
  s1Saved:        { zh: '✓ 資料已送出，已為您開啟下一步。', en: '✓ Submitted. The next step is now open.', vi: '✓ Đã gửi. Bước tiếp theo đã được mở.', id: '✓ Terkirim. Langkah berikutnya sudah terbuka.' },
  s1Missing:      { zh: '請填寫必填欄位：', en: 'Please fill in the required fields: ', vi: 'Vui lòng điền các mục bắt buộc: ', id: 'Mohon isi kolom wajib: ' },
  // 共用上傳元件
  uChoose:    { zh: '選擇檔案', en: 'Choose file', vi: 'Chọn tệp', id: 'Pilih berkas' },
  uUpload:    { zh: '上傳', en: 'Upload', vi: 'Tải lên', id: 'Unggah' },
  uUploading: { zh: '上傳中…', en: 'Uploading…', vi: 'Đang tải lên…', id: 'Mengunggah…' },
  uBadType:   { zh: '只接受圖片或 PDF 檔', en: 'Only image or PDF files are accepted', vi: 'Chỉ chấp nhận tệp ảnh hoặc PDF', id: 'Hanya berkas gambar atau PDF' },
  uTooLarge:  { zh: '檔案過大（上限 10MB）', en: 'File too large (max 10MB)', vi: 'Tệp quá lớn (tối đa 10MB)', id: 'Berkas terlalu besar (maks 10MB)' },
  uView:      { zh: '檢視', en: 'View', vi: 'Xem', id: 'Lihat' },
  // 步驟2 繳費
  s2NoticeTitle:  { zh: '繳費注意事項', en: 'Payment Notes', vi: 'Lưu ý khi nộp học phí', id: 'Catatan Pembayaran' },
  s2SlipTitle:    { zh: '繳費單', en: 'Payment Slip', vi: 'Phiếu nộp học phí', id: 'Slip Pembayaran' },
  s2FeeItemsTitle:{ zh: '收費明細', en: 'Fee Details', vi: 'Chi tiết khoản thu', id: 'Rincian Biaya' },
  s2SlipDownload: { zh: '下載繳費單', en: 'Download payment slip', vi: 'Tải phiếu nộp học phí', id: 'Unduh slip pembayaran' },
  s2SlipPending:  { zh: '繳費單準備中，請稍後再回來查看。', en: 'Your payment slip is being prepared. Please check back later.', vi: 'Phiếu nộp học phí đang được chuẩn bị. Vui lòng quay lại sau.', id: 'Slip pembayaran sedang disiapkan. Silakan periksa kembali nanti.' },
  s2ReceiptTitle: { zh: '上傳繳費收據', en: 'Upload Payment Receipt', vi: 'Tải lên biên lai nộp tiền', id: 'Unggah Bukti Pembayaran' },
  s2ReceiptHint:  { zh: '完成匯款後，請上傳銀行匯款收據或繳費證明（JPG／PNG／PDF）。', en: 'After payment, please upload your bank transfer receipt or proof of payment (JPG/PNG/PDF).', vi: 'Sau khi chuyển khoản, vui lòng tải lên biên lai chuyển khoản ngân hàng hoặc chứng từ nộp tiền (JPG/PNG/PDF).', id: 'Setelah membayar, unggah bukti transfer bank atau bukti pembayaran (JPG/PNG/PDF).' },
  s2Submitted:    { zh: '✓ 已收到您的繳費收據，待本校審核確認。', en: '✓ Your receipt has been received and is under review.', vi: '✓ Đã nhận được biên lai của bạn, đang chờ nhà trường xác nhận.', id: '✓ Bukti Anda telah diterima dan sedang ditinjau.' },
  s2Uploaded:     { zh: '已上傳', en: 'Uploaded', vi: 'Đã tải lên', id: 'Terunggah' },
  // 步驟3 簽證
  s3Title:     { zh: '上傳簽證', en: 'Upload Visa', vi: 'Tải lên thị thực', id: 'Unggah Visa' },
  s3Hint:      { zh: '取得學生簽證後，請上傳簽證頁掃描或清晰照片（JPG／PNG／PDF）。', en: 'After obtaining your student visa, please upload a scan or clear photo of the visa page (JPG/PNG/PDF).', vi: 'Sau khi có thị thực du học, vui lòng tải lên bản quét hoặc ảnh rõ nét trang thị thực (JPG/PNG/PDF).', id: 'Setelah memperoleh visa pelajar, unggah pindaian atau foto jelas halaman visa (JPG/PNG/PDF).' },
  s3Submitted: { zh: '✓ 已收到您的簽證檔案，待本校審核確認。', en: '✓ Your visa file has been received and is under review.', vi: '✓ Đã nhận được tệp thị thực của bạn, đang chờ nhà trường xác nhận.', id: '✓ Berkas visa Anda telah diterima dan sedang ditinjau.' },
  // 步驟4 來台時間
  s4Title:     { zh: '來台航班資訊', en: 'Arrival Flight Information', vi: 'Thông tin chuyến bay đến', id: 'Informasi Penerbangan Kedatangan' },
  s4Yes:       { zh: '需要', en: 'Yes', vi: 'Có', id: 'Ya' },
  s4No:        { zh: '不需要', en: 'No', vi: 'Không', id: 'Tidak' },
  // 步驟5 行前通知
  s5NoticeTitle: { zh: '行前須知', en: 'Pre-departure Notice', vi: 'Lưu ý trước khi khởi hành', id: 'Panduan Pra-keberangkatan' },
  s5InfoTitle:   { zh: '個人報到資訊', en: 'Your Check-in Information', vi: 'Thông tin nhập học của bạn', id: 'Informasi Registrasi Anda' },
  s5Dorm:        { zh: '宿舍房號', en: 'Dorm Room', vi: 'Phòng ký túc xá', id: 'Kamar Asrama' },
  s5Bed:         { zh: '床位', en: 'Bed', vi: 'Giường', id: 'Tempat Tidur' },
  s5Classroom:   { zh: '上課教室', en: 'Classroom', vi: 'Phòng học', id: 'Ruang Kelas' },
  s5Pending:     { zh: '宿舍與教室資訊尚未公佈，請稍後再回來查看。', en: 'Dormitory and classroom information has not been announced yet. Please check back later.', vi: 'Thông tin ký túc xá và phòng học chưa được công bố. Vui lòng quay lại sau.', id: 'Informasi asrama dan ruang kelas belum diumumkan. Silakan periksa kembali nanti.' },
  s5Ack:         { zh: '我已閱讀，確認知悉', en: 'I have read and acknowledge', vi: 'Tôi đã đọc và xác nhận', id: 'Saya telah membaca dan memahami' },
}

Object.assign(T, {
  visaLetterTitle: { zh: '錄取通知書與簽證辦理', en: 'Admission Letter and Visa Application', vi: 'Giấy báo nhập học và thủ tục thị thực', id: 'Surat Penerimaan dan Pengajuan Visa' },
  visaLetterHint: { zh: '繳費審核通過後，請依本頁狀態完成錄取通知書確認與簽證辦理回報。', en: 'After your payment is approved, please follow this page to confirm your admission letter and report your visa application status.', vi: 'Sau khi khoản thanh toán được duyệt, vui lòng theo dõi trang này để xác nhận giấy báo nhập học và báo cáo tình trạng xin thị thực.', id: 'Setelah pembayaran Anda disetujui, ikuti halaman ini untuk mengonfirmasi surat penerimaan dan melaporkan status pengajuan visa.' },
  visaLetterDownload: { zh: '下載錄取通知書電子檔', en: 'Download electronic admission letter', vi: 'Tải giấy báo nhập học bản điện tử', id: 'Unduh surat penerimaan elektronik' },
  visaPaymentNoticeSent: { zh: '繳費通過通知已寄出：', en: 'Payment approval notice sent: ', vi: 'Thông báo xác nhận thanh toán đã được gửi: ', id: 'Pemberitahuan persetujuan pembayaran telah dikirim: ' },
  visaVnTitle: { zh: '越南簽證資料收件', en: 'Visa Document Collection in Vietnam', vi: 'Thu hồ sơ thị thực tại Việt Nam', id: 'Pengumpulan Dokumen Visa di Vietnam' },
  visaVnHint: { zh: '學校將另行通知越南實體收件時間與地點。請密切注意通知，並準備簽證辦理所需資料。', en: 'The university will announce the in-person collection time and location in Vietnam separately. Please watch for notices and prepare the required visa documents.', vi: 'Nhà trường sẽ thông báo riêng thời gian và địa điểm thu hồ sơ trực tiếp tại Việt Nam. Vui lòng theo dõi thông báo và chuẩn bị các giấy tờ cần thiết để xin thị thực.', id: 'Universitas akan mengumumkan waktu dan lokasi pengumpulan langsung di Vietnam secara terpisah. Mohon perhatikan pengumuman dan siapkan dokumen visa yang diperlukan.' },
  visaCollectionDate: { zh: '收件日期', en: 'Collection date', vi: 'Ngày thu hồ sơ', id: 'Tanggal pengumpulan' },
  visaCollectionTime: { zh: '收件時間', en: 'Collection time', vi: 'Thời gian thu hồ sơ', id: 'Waktu pengumpulan' },
  visaCollectionCity: { zh: '城市', en: 'City', vi: 'Thành phố', id: 'Kota' },
  visaCollectionPlace: { zh: '地點', en: 'Location', vi: 'Địa điểm', id: 'Lokasi' },
  visaCollectionNote: { zh: '備註', en: 'Note', vi: 'Ghi chú', id: 'Catatan' },
  visaPendingNotice: { zh: '待通知', en: 'To be announced', vi: 'Sẽ thông báo sau', id: 'Akan diumumkan' },
  visaVnAcked: { zh: '✓ 已回覆會準時前往', en: '✓ You have replied that you will attend on time.', vi: '✓ Bạn đã phản hồi sẽ đến đúng giờ.', id: '✓ Anda telah memberi tahu bahwa akan hadir tepat waktu.' },
  visaVnAckBtn: { zh: '我已收到通知，會準時前往', en: 'I received the notice and will attend on time', vi: 'Tôi đã nhận thông báo và sẽ đến đúng giờ', id: 'Saya sudah menerima pemberitahuan dan akan hadir tepat waktu' },
  visaVnCollected: { zh: '✓ 學校已完成收件', en: '✓ The university has collected your documents.', vi: '✓ Nhà trường đã nhận hồ sơ của bạn.', id: '✓ Universitas telah menerima dokumen Anda.' },
  visaOtherTitle: { zh: '紙本錄取通知書與簽證日期', en: 'Printed Admission Letter and Visa Dates', vi: 'Giấy báo nhập học bản giấy và ngày xin thị thực', id: 'Surat Penerimaan Cetak dan Tanggal Visa' },
  visaOtherHint: { zh: '請確認是否已收到紙本錄取通知書。收到後即可安排前往台灣辦事處辦理簽證。', en: 'Please confirm whether you have received the printed admission letter. After receiving it, you may arrange your visa application at the Taiwan office.', vi: 'Vui lòng xác nhận bạn đã nhận được giấy báo nhập học bản giấy hay chưa. Sau khi nhận được, bạn có thể sắp xếp đến văn phòng Đài Loan để xin thị thực.', id: 'Mohon konfirmasi apakah Anda sudah menerima surat penerimaan cetak. Setelah menerimanya, Anda dapat mengatur pengajuan visa di kantor Taiwan.' },
  visaPaperSent: { zh: '紙本寄出：', en: 'Printed letter sent: ', vi: 'Bản giấy đã được gửi: ', id: 'Surat cetak dikirim: ' },
  visaPaperReceivedDone: { zh: '✓ 已回報收到紙本錄取通知書', en: '✓ You have reported receiving the printed admission letter.', vi: '✓ Bạn đã báo đã nhận giấy báo nhập học bản giấy.', id: '✓ Anda telah melaporkan telah menerima surat penerimaan cetak.' },
  visaPaperReceivedBtn: { zh: '已收到紙本錄取通知書', en: 'I have received the printed admission letter', vi: 'Tôi đã nhận giấy báo nhập học bản giấy', id: 'Saya sudah menerima surat penerimaan cetak' },
  visaPaperHelpBtn: { zh: '尚未收到，需要協助', en: 'Not received yet, I need assistance', vi: 'Chưa nhận được, tôi cần hỗ trợ', id: 'Belum menerima, saya perlu bantuan' },
  visaPaperHelpDone: { zh: '已收到您的回報，承辦人員會協助確認紙本通知書寄送狀態。', en: 'Your report has been received. The coordinator will help confirm the delivery status of your printed letter.', vi: 'Nhà trường đã nhận phản hồi của bạn. Cán bộ phụ trách sẽ hỗ trợ kiểm tra tình trạng gửi giấy báo bản giấy.', id: 'Laporan Anda telah diterima. Petugas akan membantu memeriksa status pengiriman surat cetak.' },
  visaApplyDate: { zh: '預計辦理簽證日期 *', en: 'Planned visa application date *', vi: 'Ngày dự kiến xin thị thực *', id: 'Tanggal rencana pengajuan visa *' },
  visaExpectedDate: { zh: '預計取得簽證日期 *', en: 'Expected visa pickup date *', vi: 'Ngày dự kiến nhận thị thực *', id: 'Tanggal perkiraan menerima visa *' },
  visaSaveDates: { zh: '儲存簽證辦理日期', en: 'Save visa dates', vi: 'Lưu ngày làm thủ tục thị thực', id: 'Simpan tanggal visa' },
  visaDatesSubmitted: { zh: '✓ 已回報簽證辦理日期', en: '✓ Visa dates have been submitted.', vi: '✓ Đã báo ngày làm thủ tục thị thực.', id: '✓ Tanggal visa telah dilaporkan.' },
  visaSupplementNotice: { zh: '簽證資料需要補件，請依下方說明補齊後重新上傳。', en: 'Your visa documents need to be supplemented. Please complete them according to the note below and upload again.', vi: 'Hồ sơ thị thực của bạn cần được bổ sung. Vui lòng bổ sung theo ghi chú bên dưới và tải lên lại.', id: 'Dokumen visa Anda perlu dilengkapi. Silakan lengkapi sesuai catatan di bawah lalu unggah ulang.' },
  visaSupplementNoteLabel: { zh: '補件說明：', en: 'Supplement note: ', vi: 'Nội dung cần bổ sung: ', id: 'Catatan kekurangan: ' },
  visaDateOrderErr: { zh: '「預計取得簽證日期」不可早於「預計辦理簽證日期」', en: 'The expected visa pickup date cannot be earlier than the planned application date.', vi: 'Ngày dự kiến nhận thị thực không được sớm hơn ngày dự kiến xin thị thực.', id: 'Tanggal perkiraan menerima visa tidak boleh lebih awal dari tanggal rencana pengajuan.' },
  stepClosedNotice: { zh: '本步驟暫停開放，請稍後再回來查看，或聯繫承辦窗口。', en: 'This step is temporarily closed. Please check back later or contact the coordinator.', vi: 'Bước này tạm thời đóng. Vui lòng quay lại sau hoặc liên hệ cán bộ phụ trách.', id: 'Langkah ini ditutup sementara. Silakan kembali lagi nanti atau hubungi petugas.' },
})

const CAMPUS_I18N = {
  '台北校區': { zh: '台北校區', en: 'Taipei Campus', vi: 'Cơ sở Đài Bắc', id: 'Kampus Taipei' },
  '高雄校區': { zh: '高雄校區', en: 'Kaohsiung Campus', vi: 'Cơ sở Cao Hùng', id: 'Kampus Kaohsiung' },
}
const campusName = (camp, lang) => {
  if (!camp || camp === '其他') return camp || ''
  // enroll_students.campus 為「台北／高雄」（無「校區」），CAMPUS_I18N 以「…校區」為 key，正規化對應
  const key = CAMPUS_I18N[camp] ? camp : `${String(camp).replace(/校區$/, '')}校區`
  return CAMPUS_I18N[key]?.[lang] || camp
}

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
  const [form4, setForm4] = useState({})
  const [visaForm, setVisaForm] = useState({})
  const [lineJoined, setLineJoined] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)       // 步驟1剛送出成功
  const [nameModal, setNameModal] = useState(false)
  const [auditOpen, setAuditOpen] = useState(false)
  const [ncForm, setNcForm] = useState({ new_name: '', reason: '' })   // 更名申請 modal
  const [showWithdraw, setShowWithdraw] = useState(false)              // 放棄入學確認 modal
  const [wReason, setWReason] = useState('')                           // 放棄原因（選填）
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
      const merged = { ...(res.prefill || {}), ...saved }
      // 國籍不在下拉選單內（歷史/自由填資料）→ 折成「其他」+ 自填框帶原值
      const natField = ONBOARD_STEP1_FIELDS.prefill.find((f) => f.key === 'nationality')
      if (merged.nationality && natField && !natField.options.some((o) => o.v === merged.nationality)) {
        merged.nationality_other = merged.nationality_other || merged.nationality
        merged.nationality = '其他'
      }
      merged.no_passport = merged.no_passport === true
      setForm(merged)
      if (saved.line_joined) setLineJoined(true)
      // 步驟4表單回填（若曾送出過）
      setForm4(res.progress?.[4]?.data || {})
      setVisaForm(res.progress?.[3]?.data || {})
    } catch {
      setInfo(null)
    }
  }, [token])

  useEffect(() => { load() }, [load])

  const submitStep1 = async () => {
    const fields = [...ONBOARD_STEP1_FIELDS.prefill, ...ONBOARD_STEP1_FIELDS.fill]
    const missing = fields.filter((f) => {
      if (!f.req) return false
      if (f.key === 'passport_number' && form.no_passport) return false // 勾「尚未辦理護照」免必填
      return !String(form[f.key] || '').trim()
    })
    // 國籍選「其他」時自填框必填
    if (form.nationality === '其他' && !String(form.nationality_other || '').trim()) {
      missing.push(fields.find((f) => f.key === 'nationality'))
    }
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

  // 中文姓名更改申請（不動 name；插入 enroll_name_requests 待行政審核）
  const submitNameChange = async () => {
    if (!ncForm.new_name.trim() || !ncForm.reason.trim()) { alert(tr('ncMissing')); return }
    setBusy(true)
    try {
      await onboardNameChangeRequest({ token, new_name: ncForm.new_name.trim(), reason: ncForm.reason.trim() })
      setNameModal(false)
      alert(tr('ncDone'))
      await load()
    } catch (e) {
      alert(e.status === 409 ? tr('ncDup') : e.message)
    } finally { setBusy(false) }
  }

  // 學生自助放棄入學（即時、單向）；誤按走「聯繫承辦→行政 reactivate」。放棄原因選填。
  const doWithdraw = async () => {
    setBusy(true)
    try {
      await onboardSubmit({ token, action: 'withdraw', reason: wReason.trim() })
      setShowWithdraw(false)
      await load()
    } catch (e) {
      alert(e.message)
    } finally { setBusy(false) }
  }

  const submitStep4 = async () => {
    const missing = ONBOARD_STEP4_FIELDS.filter((f) => f.req && (
      f.type === 'bool' ? typeof form4[f.key] !== 'boolean' : !String(form4[f.key] || '').trim()
    ))
    if (missing.length) {
      alert(tr('s1Missing') + missing.map((f) => f[lang] || f.zh).join('、'))
      return
    }
    setBusy(true)
    try {
      await onboardSubmit({ token, step: 4, data: form4 })
      await load()
    } catch (e) {
      alert(e.message)
    } finally { setBusy(false) }
  }

  const submitStep5 = async () => {
    setBusy(true)
    try {
      await onboardSubmit({ token, step: 5, ack: true })
      await load()
    } catch (e) {
      alert(e.message)
    } finally { setBusy(false) }
  }

  const submitVisaAction = async (action, data = undefined) => {
    setBusy(true)
    try {
      await onboardSubmit({ token, action, ...(data ? { data } : {}) })
      await load()
    } catch (e) {
      alert(e.message)
    } finally { setBusy(false) }
  }

  const submitOtherVisaDates = () => {
    const applyDate = String(visaForm.other_visa_apply_date || '').trim()
    const expectedDate = String(visaForm.other_visa_expected_date || '').trim()
    if (!applyDate || !expectedDate) {
      alert(tr('s1Missing') + [!applyDate && tr('visaApplyDate'), !expectedDate && tr('visaExpectedDate')].filter(Boolean).join('、'))
      return
    }
    if (expectedDate < applyDate) { alert(tr('visaDateOrderErr')); return }
    return submitVisaAction('visa-other-dates', {
      other_visa_apply_date: applyDate,
      other_visa_expected_date: expectedDate,
      other_visa_note: visaForm.other_visa_note,
    })
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

  // 步驟1欄位渲染：依 field.type 出 text / select / date；
  // 特例：name 唯讀、passport_number 帶「尚未辦理護照」勾選、nationality 選「其他」出自填框。
  const field = (f) => {
    const isPassport = f.key === 'passport_number'
    const req = f.req && !(isPassport && form.no_passport)
    const label = (
      <label style={labelStyle}>
        {f[lang] || f.zh}{req && <span style={{ color: '#b91c1c' }}> *</span>}
      </label>
    )
    const set = (k, v) => setForm((p) => ({ ...p, [k]: v }))
    // 中文姓名：唯讀 + 「申請更改」鈕；已有 pending 申請時顯示審核中並隱藏鈕
    if (f.key === 'name') {
      const pendingReq = info?.name_request
      return (
        <div key={f.key} style={{ marginBottom: 10 }}>
          {label}
          <div style={{ display: 'flex', gap: 8 }}>
            <input style={{ ...inputStyle, flex: 1, width: 'auto', background: '#f3f4f6', color: '#888' }}
              value={form.name ?? ''} readOnly />
            {!pendingReq && (
              <button onClick={() => { setNcForm({ new_name: '', reason: '' }); setNameModal(true) }}
                style={{ padding: '0 12px', borderRadius: 8, fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit',
                  cursor: 'pointer', border: '1px solid ' + ACCENT, background: 'white', color: ACCENT, whiteSpace: 'nowrap' }}>
                {tr('ncBtn')}
              </button>
            )}
          </div>
          {pendingReq && (
            <div style={{ fontSize: 12, color: '#b45309', marginTop: 4, lineHeight: 1.6 }}>
              {tr('ncPending', { n: pendingReq.new_name })}
            </div>
          )}
        </div>
      )
    }
    // 省份：越南籍出下拉（2025 改制 34 省市），其他國籍出自由文字欄。
    if (f.key === 'province') {
      const isVN = form.nationality === '越南'
      return (
        <div key={f.key} style={{ marginBottom: 10 }}>
          {label}
          {isVN ? (
            <select style={inputStyle} value={form.province ?? ''} onChange={(e) => set('province', e.target.value)}>
              <option value="" />
              {VN_PROVINCES.map((o) => <option key={o.v} value={o.v}>{lang === 'zh' ? `${o.v}（${o.zh}）` : o.v}</option>)}
            </select>
          ) : (
            <input style={inputStyle} value={form.province ?? ''} onChange={(e) => set('province', e.target.value)} />
          )}
        </div>
      )
    }
    if (f.type === 'select') {
      return (
        <div key={f.key} style={{ marginBottom: 10 }}>
          {label}
          <select style={inputStyle} value={form[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)}>
            <option value="" />
            {(f.options || []).map((o) => <option key={o.v} value={o.v}>{o[lang] || o.zh}</option>)}
          </select>
          {f.key === 'nationality' && form.nationality === '其他' && (
            <input style={{ ...inputStyle, marginTop: 6 }} placeholder={tr('natOtherPh')}
              value={form.nationality_other ?? ''} onChange={(e) => set('nationality_other', e.target.value)} />
          )}
        </div>
      )
    }
    const dimmed = f.readonly || (isPassport && form.no_passport)
    return (
      <div key={f.key} style={{ marginBottom: 10 }}>
        {label}
        <input
          type={f.type === 'date' ? 'date' : 'text'}
          style={{ ...inputStyle, ...(dimmed ? { background: '#f3f4f6', color: '#888' } : {}) }}
          value={form[f.key] ?? ''}
          readOnly={!!f.readonly}
          disabled={isPassport && !!form.no_passport}
          onChange={(e) => set(f.key, e.target.value)}
        />
        {isPassport && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#555', marginTop: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={!!form.no_passport}
              onChange={(e) => setForm((p) => ({ ...p, no_passport: e.target.checked, ...(e.target.checked ? { passport_number: '' } : {}) }))}
              style={{ width: 15, height: 15, accentColor: ACCENT }} />
            {tr('noPassport')}
          </label>
        )}
      </div>
    )
  }

  // LINE 群組 QR：讀 enroll_config.line_qr（{台北,高雄} 分校區或字串通用），依學生校區取對應網址；
  // 校區未設定或該校區無 QR 時顯示「稍後提供」佔位，不擋送出
  const qrCfg = info.line_qr
  const lineQr = driveImageUrl(typeof qrCfg === 'string' ? qrCfg.trim()
    : ((student.campus && qrCfg?.[student.campus]) || '').trim())

  // 承辦窗口：讀 enroll_config.contacts（全域兩組、只分校區），依學生校區取；campus 未設定 → 台北
  const contactsCfg = info.contacts || {}
  const contact = (student.campus && contactsCfg[student.campus]) || contactsCfg['台北'] || {}
  const hasContact = !!(contact.name || contact.email || contact.phone)

  // 共用：期限 / 聯絡窗口小方塊（步驟2/3/4/5 共用）；期限只顯示日期（當日台北 23:59 到期）
  const metaBox = (setting) => (setting?.deadline || hasContact) ? (
    <div style={sectionBox}>
      {setting?.deadline && <Row label={tr('deadline')} value={fmtDate(setting.deadline)} />}
      {hasContact && (
        <Row label={tr('contact')} value={
          <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, lineHeight: 1.5 }}>
            {contact.name && <span>{contact.name}</span>}
            {contact.email && (<a href={`mailto:${contact.email}`} style={{ color: ACCENT, wordBreak: 'break-all' }}>{contact.email}</a>)}
            {contact.phone && <span style={{ color: '#666' }}>{contact.phone}</span>}
          </span>
        } />
      )}
    </div>
  ) : null

  const step1Form = (
    <div>
      <div style={{ ...sectionBox, marginTop: 14 }}>
        <div style={sectionTitle}>{tr('s1PrefillTitle')}</div>
        {/* 學系：唯讀顯示，不進送出資料 */}
        <div style={{ marginBottom: 6 }}><Row label={tr('deptLabel')} value={deptName} /></div>
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

  // ── 步驟2：繳費（注意事項 + 下載繳費單 + 上傳收據）─────────────────────────────
  // 注意事項：enroll_settings[2].extra.notice。相容兩種格式：
  //   舊：中文字串陣列（直接當中文）；新：{zh:[...],en:[...],vi:[...],id:[...]} 依語言取、缺語言退中文。
  const s2Notice = (() => {
    const n = info.settings?.[2]?.extra?.notice
    const arr = Array.isArray(n) ? n
      : (n && typeof n === 'object') ? (n[lang] || n.zh || [])
      : []
    return (Array.isArray(arr) ? arr : []).map((x) => String(x ?? '').trim()).filter(Boolean)
  })()
  const s2FeeItems = (() => {
    const src = info.settings?.[2]?.extra?.fee_items || info.settings?.[2]?.extra?.feeItems
    if (!src) return ''
    const campusKey = String(student.campus || '').replace(/校區$/, '') || '台北'
    const pickText = (v) => {
      if (typeof v === 'string') return v
      if (v && typeof v === 'object' && !Array.isArray(v)) return v[lang] || v.zh || ''
      return ''
    }
    if (typeof src === 'string') return src.trim()
    if (src && typeof src === 'object' && !Array.isArray(src)) {
      const byCampus = src[campusKey] || src[`${campusKey}校區`] || src.common || src.default || src.zh || ''
      return pickText(byCampus).trim()
    }
    return ''
  })()
  const slipUrl = info.progress?.[2]?.data?.slip_url || ''
  const receipts = (info.files || []).filter((f) => f.step === 2 && f.kind === 'receipt')
  const linkBtn = { display: 'inline-block', padding: '9px 16px', borderRadius: 8, fontSize: 13.5, fontWeight: 600, textDecoration: 'none', background: ACCENT, color: '#fff' }
  const onUploadDone = async () => { await load() }

  const step2Content = (
    <div>
      {/* 繳費注意事項（enroll_settings[2].extra.notice；未設定則不顯示此區塊） */}
      {s2Notice.length > 0 && (
        <div style={sectionBox}>
          <div style={sectionTitle}>{tr('s2NoticeTitle')}</div>
          <ol style={{ margin: '4px 0 0', paddingLeft: 20, fontSize: 12.5, color: '#555', lineHeight: 1.75 }}>
            {s2Notice.map((line, i) => (
              // 第 2 條（繳費期限警語，index 1）以紅字加粗凸顯
              <li key={i} style={{ marginBottom: 5, ...(i === 1 ? { color: '#b91c1c', fontWeight: 700 } : {}) }}>{line}</li>
            ))}
          </ol>
        </div>
      )}

      {/* 繳費單下載 */}
      <div style={sectionBox}>
        <div style={sectionTitle}>{tr('s2SlipTitle')}</div>
        {s2FeeItems && (
          <div style={{ background: '#fff', border: '1px solid #eee9dd', borderRadius: 8, padding: '10px 12px', margin: '8px 0 12px', fontSize: 12.5, lineHeight: 1.75, color: '#4b4036' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: ACCENT, marginBottom: 4 }}>{tr('s2FeeItemsTitle')}</div>
            <div style={{ whiteSpace: 'pre-wrap' }}>{s2FeeItems}</div>
          </div>
        )}
        {slipUrl ? (
          <a href={slipUrl} target="_blank" rel="noreferrer" style={linkBtn}>⬇ {tr('s2SlipDownload')}</a>
        ) : (
          <div style={{ fontSize: 13, color: '#888', lineHeight: 1.7, padding: '6px 0' }}>{tr('s2SlipPending')}</div>
        )}
      </div>

      {/* 繳費收據上傳 */}
      <div style={sectionBox}>
        <div style={sectionTitle}>{tr('s2ReceiptTitle')}</div>
        <div style={{ fontSize: 12.5, color: '#666', lineHeight: 1.7, marginBottom: 10 }}>{tr('s2ReceiptHint')}</div>
        {states[2] === 'submitted' && (
          <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 8, padding: '10px 12px', fontSize: 13, fontWeight: 600, color: '#b45309', marginBottom: 10, lineHeight: 1.6 }}>
            {tr('s2Submitted')}
          </div>
        )}
        {receipts.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            {receipts.map((f, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12.5, padding: '4px 0', color: '#555' }}>
                <span>{tr('s2Uploaded')} · {fmtDate(f.uploaded_at)}</span>
                {f.drive_url && <a href={f.drive_url} target="_blank" rel="noreferrer" style={{ color: ACCENT, flexShrink: 0 }}>{tr('uView')}</a>}
              </div>
            ))}
          </div>
        )}
        <FileUpload token={token} step={2} kind="receipt" tr={tr} onDone={onUploadDone} />
      </div>

      {/* 期限 / 聯絡窗口 */}
      {metaBox(currentSetting)}
    </div>
  )

  const bigBtn = (disabled) => ({ width: '100%', marginTop: 14, padding: '13px', borderRadius: 10, fontSize: 15, fontWeight: 700, fontFamily: 'inherit',
    border: 'none', cursor: disabled ? 'not-allowed' : 'pointer', background: disabled ? '#e5e7eb' : ACCENT, color: disabled ? '#9ca3af' : 'white' })

  // ── 步驟3：簽證上傳 ──────────────────────────────────────────────────────────
  const visaFiles = (info.files || []).filter((f) => f.step === 3 && f.kind === 'visa')
  const visaData = info.progress?.[3]?.data || {}
  const isVnVisa = (visaData.visa_track === 'vn') || String(student.nationality || '').toLowerCase().includes('viet') || String(student.nationality || '').includes('越南')
  const admissionUrl = visaData.admission_letter_url || ''
  const smallActionBtn = {
    padding: '9px 12px', borderRadius: 8, fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
    cursor: busy ? 'not-allowed' : 'pointer', border: '1px solid ' + ACCENT, background: ACCENT, color: '#fff',
  }
  const smallGhostBtn = { ...smallActionBtn, background: 'white', color: ACCENT }
  const step3Content = (
    <div>
      {/* 行政標記補件中：顯著提示 + 補件說明（visa_stage 為旁支狀態，不影響 gating） */}
      {visaData.visa_stage === 'supplement' && (
        <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 10, padding: '12px 14px', marginTop: 14, fontSize: 13, color: '#92400e', lineHeight: 1.7 }}>
          <div style={{ fontWeight: 700 }}>⚠ {tr('visaSupplementNotice')}</div>
          {visaData.supplement_note && <div style={{ marginTop: 4 }}>{tr('visaSupplementNoteLabel')}{visaData.supplement_note}</div>}
        </div>
      )}
      <div style={sectionBox}>
        <div style={sectionTitle}>{tr('visaLetterTitle')}</div>
        <div style={{ fontSize: 12.5, color: '#666', lineHeight: 1.7, marginBottom: 10 }}>
          {tr('visaLetterHint')}
        </div>
        {admissionUrl && <a href={admissionUrl} target="_blank" rel="noreferrer" style={linkBtn}>{tr('visaLetterDownload')}</a>}
        {visaData.payment_pass_notice_sent_at && (
          <div style={{ fontSize: 12, color: '#15803d', marginTop: 8 }}>{tr('visaPaymentNoticeSent')}{fmtDate(visaData.payment_pass_notice_sent_at)}</div>
        )}
      </div>

      {isVnVisa ? (
        <div style={sectionBox}>
          <div style={sectionTitle}>{tr('visaVnTitle')}</div>
          <div style={{ fontSize: 12.5, color: '#666', lineHeight: 1.7, marginBottom: 10 }}>
            {tr('visaVnHint')}
          </div>
          {(visaData.vn_collection_date || visaData.vn_collection_place) && (
            <div style={{ ...infoBox, marginBottom: 10 }}>
              <Row label={tr('visaCollectionDate')} value={visaData.vn_collection_date || tr('visaPendingNotice')} />
              <Row label={tr('visaCollectionTime')} value={visaData.vn_collection_time || tr('visaPendingNotice')} />
              <Row label={tr('visaCollectionCity')} value={visaData.vn_collection_city || '-'} />
              <Row label={tr('visaCollectionPlace')} value={visaData.vn_collection_place || tr('visaPendingNotice')} />
              {visaData.vn_collection_note && <Row label={tr('visaCollectionNote')} value={visaData.vn_collection_note} />}
            </div>
          )}
          {visaData.vn_student_ack_at ? (
            <div style={{ color: '#15803d', fontSize: 13, fontWeight: 600 }}>{tr('visaVnAcked')}</div>
          ) : (
            <button onClick={() => submitVisaAction('visa-vn-ack')} disabled={busy || !visaData.vn_collection_date}
              style={bigBtn(busy || !visaData.vn_collection_date)}>
              {tr('visaVnAckBtn')}
            </button>
          )}
          {visaData.vn_documents_collected_at && (
            <div style={{ color: '#15803d', fontSize: 13, fontWeight: 600, marginTop: 8 }}>{tr('visaVnCollected')}</div>
          )}
        </div>
      ) : (
        <div style={sectionBox}>
          <div style={sectionTitle}>{tr('visaOtherTitle')}</div>
          <div style={{ fontSize: 12.5, color: '#666', lineHeight: 1.7, marginBottom: 10 }}>
            {tr('visaOtherHint')}
          </div>
          {visaData.paper_letter_sent_at && <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>{tr('visaPaperSent')}{fmtDate(visaData.paper_letter_sent_at)}</div>}
          {visaData.paper_letter_received_at ? (
            <div style={{ color: '#15803d', fontSize: 13, fontWeight: 600, marginBottom: 10 }}>{tr('visaPaperReceivedDone')}</div>
          ) : (
            <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
              <button onClick={() => submitVisaAction('visa-paper-received')} disabled={busy} style={{ ...smallActionBtn, flex: '1 1 160px' }}>{tr('visaPaperReceivedBtn')}</button>
              <button onClick={() => submitVisaAction('visa-paper-help')} disabled={busy} style={{ ...smallGhostBtn, flex: '1 1 160px' }}>{tr('visaPaperHelpBtn')}</button>
            </div>
          )}
          {visaData.paper_letter_help_requested_at && (
            <div style={{ color: '#b45309', fontSize: 12.5, marginBottom: 10 }}>{tr('visaPaperHelpDone')}</div>
          )}
          <div style={{ display: 'grid', gap: 8 }}>
            <div>
              <label style={labelStyle}>{tr('visaApplyDate')}</label>
              <input type="date" style={inputStyle} value={visaForm.other_visa_apply_date || ''} onChange={(e) => setVisaForm((p) => ({ ...p, other_visa_apply_date: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>{tr('visaExpectedDate')}</label>
              <input type="date" style={inputStyle} value={visaForm.other_visa_expected_date || ''} onChange={(e) => setVisaForm((p) => ({ ...p, other_visa_expected_date: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>{tr('visaCollectionNote')}</label>
              <textarea rows={3} style={{ ...inputStyle, resize: 'vertical' }} value={visaForm.other_visa_note || ''} onChange={(e) => setVisaForm((p) => ({ ...p, other_visa_note: e.target.value }))} />
            </div>
          </div>
          <button onClick={submitOtherVisaDates} disabled={busy} style={bigBtn(busy)}>{tr('visaSaveDates')}</button>
          {visaData.other_visa_dates_submitted_at && (
            <div style={{ color: '#15803d', fontSize: 12.5, marginTop: 8 }}>{tr('visaDatesSubmitted')}</div>
          )}
        </div>
      )}

      <div style={sectionBox}>
        <div style={sectionTitle}>{tr('s3Title')}</div>
        <div style={{ fontSize: 12.5, color: '#666', lineHeight: 1.7, marginBottom: 10 }}>{tr('s3Hint')}</div>
        {states[3] === 'submitted' && (
          <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 8, padding: '10px 12px', fontSize: 13, fontWeight: 600, color: '#b45309', marginBottom: 10, lineHeight: 1.6 }}>
            {tr('s3Submitted')}
          </div>
        )}
        {visaFiles.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            {visaFiles.map((f, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12.5, padding: '4px 0', color: '#555' }}>
                <span>{tr('s2Uploaded')} · {fmtDate(f.uploaded_at)}</span>
                {f.drive_url && <a href={f.drive_url} target="_blank" rel="noreferrer" style={{ color: ACCENT, flexShrink: 0 }}>{tr('uView')}</a>}
              </div>
            ))}
          </div>
        )}
        <FileUpload token={token} step={3} kind="visa" tr={tr} onDone={onUploadDone} />
      </div>
      {metaBox(currentSetting)}
    </div>
  )

  // ── 步驟4：來台時間 ──────────────────────────────────────────────────────────
  const field4 = (f) => {
    if (f.type === 'bool') {
      return (
        <div key={f.key} style={{ marginBottom: 10 }}>
          <label style={labelStyle}>{f[lang] || f.zh}{f.req && <span style={{ color: '#b91c1c' }}> *</span>}</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {[true, false].map((val) => {
              const on = form4[f.key] === val
              return (
                <button key={String(val)} onClick={() => setForm4((p) => ({ ...p, [f.key]: val }))}
                  style={{ flex: 1, padding: '9px', borderRadius: 8, fontSize: 13.5, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
                    border: '1px solid ' + (on ? ACCENT : '#ddd'), background: on ? ACCENT : 'white', color: on ? '#fff' : '#666' }}>
                  {val ? tr('s4Yes') : tr('s4No')}
                </button>
              )
            })}
          </div>
        </div>
      )
    }
    const inputType = f.type === 'date' ? 'date' : f.type === 'time' ? 'time' : 'text'
    return (
      <div key={f.key} style={{ marginBottom: 10 }}>
        <label style={labelStyle}>{f[lang] || f.zh}{f.req && <span style={{ color: '#b91c1c' }}> *</span>}</label>
        <input type={inputType} style={inputStyle} value={form4[f.key] ?? ''} onChange={(e) => setForm4((p) => ({ ...p, [f.key]: e.target.value }))} />
      </div>
    )
  }
  const step4Content = (
    <div>
      <div style={sectionBox}>
        <div style={sectionTitle}>{tr('s4Title')}</div>
        <div style={{ fontSize: 11, color: '#b91c1c', marginBottom: 8 }}>{tr('s1ReqNote')}</div>
        {ONBOARD_STEP4_FIELDS.map(field4)}
      </div>
      {metaBox(currentSetting)}
      <button onClick={submitStep4} disabled={busy} style={bigBtn(busy)}>{busy ? tr('submitting') : tr('s1Submit')}</button>
    </div>
  )

  // ── 步驟5：行前通知 ──────────────────────────────────────────────────────────
  const s5extra = info.settings?.[5]?.extra
  const noticeText = (() => {
    const ex = s5extra
    if (!ex) return ''
    if (typeof ex === 'string') return ex
    // extra.notice 新格式：{台北:{zh,en,vi,id},高雄:{...}}；相容舊格式：字串（通用）或 {台北:"字串"}
    const n = ex.notice ?? ex.by_campus ?? ex.campus ?? ex.common ?? ex.text ?? ex.content ?? ''
    if (typeof n === 'string') return n
    if (!n || typeof n !== 'object') return ''
    // 校區層：campus 未設定 → fallback 台北 → 高雄
    const byCampus = (student.campus && n[student.campus]) || n['台北'] || n['高雄'] || ''
    if (typeof byCampus === 'string') return byCampus
    if (!byCampus || typeof byCampus !== 'object') return ''
    // 語言層：當前語言留空 → fallback 中文
    return byCampus[lang] || byCampus.zh || ''
  })()
  const hasCheckin = !!(student.dorm_room || student.dorm_bed || student.classroom)
  const step5Content = (
    <div>
      <div style={sectionBox}>
        <div style={sectionTitle}>{tr('s5NoticeTitle')}</div>
        <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, color: '#555', lineHeight: 1.8, padding: '4px 0' }}>
          {noticeText || tr('placeholder')}
        </div>
      </div>
      <div style={sectionBox}>
        <div style={sectionTitle}>{tr('s5InfoTitle')}</div>
        {hasCheckin ? (
          <>
            <Row label={tr('s5Dorm')} value={student.dorm_room || '—'} />
            <Row label={tr('s5Bed')} value={student.dorm_bed || '—'} />
            <Row label={tr('s5Classroom')} value={student.classroom || '—'} />
          </>
        ) : (
          <div style={{ fontSize: 13, color: '#888', lineHeight: 1.7, padding: '6px 0' }}>{tr('s5Pending')}</div>
        )}
      </div>
      {metaBox(currentSetting)}
      <button onClick={submitStep5} disabled={!hasCheckin || busy} style={bigBtn(!hasCheckin || busy)}>
        {busy ? tr('submitting') : tr('s5Ack')}
      </button>
    </div>
  )

  // 已放棄入學：顯示平靜的已放棄狀態＋承辦窗口（誤按可聯繫恢復）
  if (student.status === 'abandoned') {
    return (
      <div style={wrap}>
        {langBar}
        <div style={card}>
          <div style={{ background: ACCENT, color: '#fde7d4', padding: '18px 24px' }}>
            <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 4, lineHeight: 1.4 }}>{tr('program')}</div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{tr('title')}</div>
          </div>
          <div style={{ padding: 24, textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🙏</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: ACCENT, marginBottom: 10 }}>{tr('withdrawnTitle')}</div>
            <p style={{ fontSize: 13.5, color: '#555', lineHeight: 1.8, margin: '0 0 16px' }}>{tr('withdrawnBody')}</p>
            {hasContact && (
              <div style={{ ...infoBox, textAlign: 'left', marginBottom: 0 }}>
                <Row label={tr('contact')} value={
                  <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, lineHeight: 1.5 }}>
                    {contact.name && <span>{contact.name}</span>}
                    {contact.email && (<a href={`mailto:${contact.email}`} style={{ color: ACCENT, wordBreak: 'break-all' }}>{contact.email}</a>)}
                    {contact.phone && <span style={{ color: '#666' }}>{contact.phone}</span>}
                  </span>
                } />
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

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

          {/* 退件通知：曾被退回補件時顯示原因 */}
          {info.audit?.length > 0 && (
            <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 10, padding: '12px 14px', marginTop: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: '#92400e' }}>{tr('auditTitle')}</span>
                <button onClick={() => setAuditOpen((v) => !v)}
                  style={{ padding: '4px 12px', borderRadius: 8, fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', border: '1px solid #d97706', background: 'white', color: '#b45309', whiteSpace: 'nowrap' }}>
                  {auditOpen ? tr('auditHide') : tr('auditShow')}
                </button>
              </div>
              {auditOpen && (
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {info.audit.map((a, i) => (
                    <div key={i} style={{ fontSize: 12.5, color: '#78350f', lineHeight: 1.6, borderTop: i ? '1px solid #fde68a' : 'none', paddingTop: i ? 8 : 0 }}>
                      <div style={{ fontWeight: 600 }}>{tr(a.kind === 'reopen_step2' ? 'auditStep2' : 'auditStep1')} · {new Date(a.at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}</div>
                      <div>{a.reason ? a.reason : tr('auditNoReason')}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 中文改名審核結果：無 pending 且有已審核結果時顯示 */}
          {!info.name_request && info.name_review_result && (
            <div style={{ background: info.name_review_result.status === 'approved' ? '#dcfce7' : '#fee2e2', border: '1px solid ' + (info.name_review_result.status === 'approved' ? '#86efac' : '#fca5a5'), borderRadius: 10, padding: '12px 14px', marginTop: 14, fontSize: 13, lineHeight: 1.7, color: info.name_review_result.status === 'approved' ? '#166534' : '#991b1b' }}>
              {info.name_review_result.status === 'approved'
                ? tr('nrApproved', { n: info.name_review_result.new_name })
                : (<>{tr('nrRejectedHead')}{info.name_review_result.review_note ? <div style={{ marginTop: 4 }}>{tr('nrRejectedReason')}{info.name_review_result.review_note}</div> : null}</>)}
            </div>
          )}

          {/* 剛送出成功的提示 */}
          {done && (
            <div style={{ background: '#dcfce7', borderRadius: 10, padding: '12px 14px', textAlign: 'center', marginTop: 14, fontSize: 13.5, fontWeight: 600, color: '#15803d' }}>
              {tr('s1Saved')}
            </div>
          )}

          {/* 目前步驟內容 */}
          {currentStep ? (
            currentSetting?.open === false ? (
              /* 行政緊急關閉（enroll_settings.open=false）：暫停顯示本步內容，僅留期限與聯絡窗口 */
              <div style={sectionBox}>
                <div style={sectionTitle}>{currentStep[lang] || currentStep.zh}</div>
                <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 8, padding: '10px 12px', fontSize: 13, fontWeight: 600, color: '#b45309', lineHeight: 1.7, marginBottom: 10 }}>
                  ⏸ {tr('stepClosedNotice')}
                </div>
                {metaBox(currentSetting)}
              </div>
            ) : currentStep.step === 1 && states[1] === 'open' ? (
              step1Form
            ) : currentStep.step === 2 && (states[2] === 'open' || states[2] === 'submitted') ? (
              step2Content
            ) : currentStep.step === 3 && (states[3] === 'open' || states[3] === 'submitted') ? (
              step3Content
            ) : currentStep.step === 4 && states[4] === 'open' ? (
              step4Content
            ) : currentStep.step === 5 && states[5] === 'open' ? (
              step5Content
            ) : (
              <div style={sectionBox}>
                <div style={sectionTitle}>{currentStep[lang] || currentStep.zh} · {tr(STATE_LABEL_KEY[states[currentStep.step]])}</div>
                <div style={{ fontSize: 13, color: '#888', lineHeight: 1.8, padding: '10px 0', textAlign: 'center' }}>
                  🚧 {tr('placeholder')}
                </div>
                {currentSetting?.deadline && <Row label={tr('deadline')} value={fmtDate(currentSetting.deadline)} />}
                {hasContact && (
                  <Row label={tr('contact')} value={
                    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, lineHeight: 1.5 }}>
                      {contact.name && <span>{contact.name}</span>}
                      {contact.email && (
                        <a href={`mailto:${contact.email}`} style={{ color: ACCENT, wordBreak: 'break-all' }}>{contact.email}</a>
                      )}
                      {contact.phone && <span style={{ color: '#666' }}>{contact.phone}</span>}
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

          {(student.status || 'active') === 'active' && (
            <button onClick={() => { setWReason(''); setShowWithdraw(true) }} disabled={busy}
              style={{ width: '100%', marginTop: 20, padding: '13px', borderRadius: 10, fontSize: 15, fontWeight: 700, fontFamily: 'inherit',
                border: '1px solid #f0f0ee', cursor: busy ? 'not-allowed' : 'pointer', background: '#f9fafb', color: '#9ca3af' }}>
              {tr('withdrawLink')}
            </button>
          )}
          <p style={{ fontSize: 11.5, color: '#bbb', textAlign: 'center', margin: '18px 0 0' }}>{tr('unit')}</p>
        </div>
      </div>

      {/* 中文姓名更改申請 modal */}
      {nameModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 50 }}
          onClick={() => !busy && setNameModal(false)}>
          <div style={{ background: 'white', borderRadius: 14, maxWidth: 420, width: '100%', padding: 20, boxSizing: 'border-box' }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 15, fontWeight: 700, color: ACCENT, marginBottom: 12 }}>{tr('ncTitle')}</div>
            <div style={{ marginBottom: 10 }}>
              <label style={labelStyle}>{tr('ncCurrent')}</label>
              <input style={{ ...inputStyle, background: '#f3f4f6', color: '#888' }} value={form.name ?? ''} readOnly />
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={labelStyle}>{tr('ncNewName')}<span style={{ color: '#b91c1c' }}> *</span></label>
              <input style={inputStyle} value={ncForm.new_name}
                onChange={(e) => setNcForm((p) => ({ ...p, new_name: e.target.value }))} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>{tr('ncReason')}<span style={{ color: '#b91c1c' }}> *</span></label>
              <textarea rows={3} style={{ ...inputStyle, resize: 'vertical' }} value={ncForm.reason}
                onChange={(e) => setNcForm((p) => ({ ...p, reason: e.target.value }))} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setNameModal(false)} disabled={busy}
                style={{ flex: 1, padding: '11px', borderRadius: 10, fontSize: 14, fontWeight: 600, fontFamily: 'inherit',
                  border: '1px solid #ddd', background: 'white', color: '#666', cursor: 'pointer' }}>
                {tr('ncCancel')}
              </button>
              <button onClick={submitNameChange} disabled={busy}
                style={{ flex: 1, padding: '11px', borderRadius: 10, fontSize: 14, fontWeight: 700, fontFamily: 'inherit',
                  border: 'none', cursor: busy ? 'not-allowed' : 'pointer',
                  background: busy ? '#e5e7eb' : ACCENT, color: busy ? '#9ca3af' : 'white' }}>
                {busy ? tr('submitting') : tr('ncSend')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 放棄入學確認 modal（低調入口→這裡才明確警示；即時、單向） */}
      {showWithdraw && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 50 }}
          onClick={() => !busy && setShowWithdraw(false)}>
          <div style={{ background: 'white', borderRadius: 14, maxWidth: 420, width: '100%', padding: 20, boxSizing: 'border-box' }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#b91c1c', marginBottom: 12 }}>{tr('withdrawTitle')}</div>
            <p style={{ fontSize: 13, color: '#555', lineHeight: 1.7, margin: '0 0 14px' }}>{tr('withdrawWarn')}</p>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>{tr('withdrawReason')}</label>
              <textarea rows={3} style={{ ...inputStyle, resize: 'vertical' }} value={wReason}
                onChange={(e) => setWReason(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowWithdraw(false)} disabled={busy}
                style={{ flex: 1, padding: '11px', borderRadius: 10, fontSize: 14, fontWeight: 600, fontFamily: 'inherit',
                  border: '1px solid #ddd', background: 'white', color: '#666', cursor: 'pointer' }}>
                {tr('withdrawCancel')}
              </button>
              <button onClick={doWithdraw} disabled={busy}
                style={{ flex: 1, padding: '11px', borderRadius: 10, fontSize: 14, fontWeight: 700, fontFamily: 'inherit',
                  border: 'none', cursor: busy ? 'not-allowed' : 'pointer',
                  background: busy ? '#e5e7eb' : '#b91c1c', color: busy ? '#9ca3af' : 'white' }}>
                {busy ? tr('submitting') : tr('withdrawConfirm')}
              </button>
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

// 共用檔案上傳元件（選檔 → 預覽檔名 → 上傳中 → 成功/失敗）。
// Phase 4 簽證等步驟可重用；上傳成功後呼叫 onDone(回傳資料) 由外層刷新進度。
function FileUpload({ token, step, kind, tr, onDone }) {
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const inputRef = useRef(null)

  const pick = (e) => {
    setErr('')
    const f = e.target.files?.[0] || null
    if (!f) { setFile(null); return }
    const okType = (f.type || '').startsWith('image/') || f.type === 'application/pdf'
    if (!okType) { setErr(tr('uBadType')); setFile(null); e.target.value = ''; return }
    if (f.size > 10 * 1024 * 1024) { setErr(tr('uTooLarge')); setFile(null); e.target.value = ''; return }
    setFile(f)
  }

  const upload = async () => {
    if (!file || busy) return
    setBusy(true); setErr('')
    try {
      const data = await onboardUpload({ token, step, kind, file })
      setFile(null)
      if (inputRef.current) inputRef.current.value = ''
      await onDone?.(data)
    } catch (e) {
      setErr(e.message || tr('uBadType'))
    } finally { setBusy(false) }
  }

  const chooseBtn = { display: 'inline-block', padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1px solid ' + ACCENT, color: ACCENT, background: 'white', fontFamily: 'inherit' }
  const upBtn = { padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, fontFamily: 'inherit', border: 'none',
    cursor: !file || busy ? 'not-allowed' : 'pointer', background: !file || busy ? '#e5e7eb' : ACCENT, color: !file || busy ? '#9ca3af' : 'white' }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={chooseBtn}>
          {tr('uChoose')}
          <input ref={inputRef} type="file" accept="image/*,application/pdf" onChange={pick} style={{ display: 'none' }} />
        </label>
        {file && <span style={{ fontSize: 12.5, color: '#555', wordBreak: 'break-all', flex: '1 1 120px' }}>{file.name}</span>}
        <button onClick={upload} disabled={!file || busy} style={upBtn}>{busy ? tr('uUploading') : tr('uUpload')}</button>
      </div>
      {err && <div style={{ fontSize: 12.5, color: '#b91c1c', marginTop: 8 }}>{err}</div>}
    </div>
  )
}
