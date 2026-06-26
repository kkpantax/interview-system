// 面試通知信件範本（系統端）
// 範本內 {{欄位}} 由 fillTemplate 帶入。外語段用 {{英文姓名}}，中文段用 {{中文姓名}}。
// 欄位：中文姓名 英文姓名 申請項目 面試日期 面試時間 面試地點 會議連結 回覆期限 承辦人 聯絡信箱 單位名稱

// 依國籍判斷語言；nationality 可能是中文（越南／印尼）或英文
export function pickLang(nationality) {
  const s = String(nationality || '').toLowerCase()
  if (s.includes('越南') || s.includes('viet')) return 'VI'
  if (s.includes('印尼') || s.includes('indonesia')) return 'ID'
  return 'EN'
}

// 階段 + 方式 + 語言 → 範本代碼
export function templateKey({ kind, stage, mode, lang }) {
  const L = String(lang || 'EN').toUpperCase()
  if (kind === 's1_reject') return `S1_REJECT_${L}`
  if (kind === 's1_noshow') return `S1_NOSHOW_${L}`
  if (kind === 's4_admit') return `S4_ADMIT_${L}`
  if (kind === 's4_promote') return `S4_PROMOTE_${L}`
  if (kind === 's4_admit_declined') return `S4_DECLINE_${L}`
  if (kind === 's4_reject') return `S4_REJECT_${L}`
  if (kind === 's2_invite' || String(stage) === '2') return `S2_ONLINE_${L}`
  return `S1_${mode === '實體' ? 'OFFLINE' : 'ONLINE'}_${L}`
}

// 帶入欄位（{{欄位}} → 值）
export function fillTemplate(text, data) {
  let out = String(text || '')
  for (const [k, v] of Object.entries(data || {})) {
    out = out.split(`{{${k}}}`).join(v == null ? '' : String(v))
  }
  return out
}

// 取出已合併好的 { subject, body }
export function buildMessage({ kind, stage, mode, lang, data }) {
  const tpl = TEMPLATES[templateKey({ kind, stage, mode, lang })]
  if (!tpl) return null
  return { subject: fillTemplate(tpl.subject, data), body: fillTemplate(tpl.body, data) }
}

const SUBJ = {
  S1_EN: '【Shih Chien University】First-Round Interview Notification 第一階段面試通知 — {{中文姓名}}',
  S1_VI: '【Shih Chien University】Thông báo phỏng vấn vòng 1 第一階段面試通知 — {{中文姓名}}',
  S1_ID: '【Shih Chien University】Pemberitahuan Wawancara Tahap 1 第一階段面試通知 — {{中文姓名}}',
  S2_EN: '【Shih Chien University】Second-Round Interview Notification 第二階段面試通知 — {{中文姓名}}',
  S2_VI: '【Shih Chien University】Thông báo phỏng vấn vòng 2 第二階段面試通知 — {{中文姓名}}',
  S2_ID: '【Shih Chien University】Pemberitahuan Wawancara Tahap 2 第二階段面試通知 — {{中文姓名}}',
  S1_REJECT: '【Shih Chien University】Interview Result Notification 第一階段面試結果通知 — {{中文姓名}}',
  S1_NOSHOW: '【Shih Chien University】Interview Reschedule Notice 第一階段面試改期通知 — {{中文姓名}}',
  S4_ADMIT_EN: '【Shih Chien University】Preliminary Admission Intent Survey 預錄取意願調查 — {{中文姓名}}',
  S4_ADMIT_VI: '【Shih Chien University】Khảo sát nguyện vọng trúng tuyển sơ bộ 預錄取意願調查 — {{中文姓名}}',
  S4_ADMIT_ID: '【Shih Chien University】Survei Minat Penerimaan Awal 預錄取意願調查 — {{中文姓名}}',
  S4_PROMOTE_EN: '【Shih Chien University】Waitlist Vacancy · Intent Survey 備取遞補意願調查 — {{中文姓名}}',
  S4_PROMOTE_VI: '【Shih Chien University】Khảo sát nguyện vọng bổ sung dự bị 備取遞補意願調查 — {{中文姓名}}',
  S4_PROMOTE_ID: '【Shih Chien University】Survei Minat Penggantian Daftar Tunggu 備取遞補意願調查 — {{中文姓名}}',
  S4_DECLINE: '【Shih Chien University】Thank You 感謝您的回覆 — {{中文姓名}}',
  S4_REJECT: '【Shih Chien University】Admission Result Notification 甄選結果通知 — {{中文姓名}}',
}

export const TEMPLATES = {

  // ── 第一階段．實體 ──
  S1_OFFLINE_EN: { subject: SUBJ.S1_EN, body:
`Dear {{英文姓名}},

Thank you for applying to "{{申請項目EN}}" at Shih Chien University. Following an initial review, we are pleased to invite you to the first-round interview, which will be held in person on campus.

• Date: {{面試日期}}
• Time: {{面試時間顯示外}}
• Format: In-person interview
• Venue: {{面試地點}}

Please prepare the following before the interview:
1. Your original passport or ID
2. Original application documents for verification
3. Please arrive 15 minutes early to check in

Kindly reply to this email by {{回覆期限}} to confirm your attendance. Should you have any questions, please contact {{承辦人}} at {{聯絡信箱}}{{聯絡電話外}}.

Best regards,
{{單位名稱}}, Shih Chien University

────────────────────────────

親愛的 {{中文姓名}} 同學，您好：

感謝您報名本校「{{申請項目}}」。經初步審查，誠摯邀請您參加第一階段面試，本次採實體到校方式進行，相關資訊如下：

▸ 面試日期：{{面試日期}}
▸ 面試時間：{{面試時間顯示中}}
▸ 面試方式：實體面試
▸ 面試地點：{{面試地點}}

面試前請準備：
1. 護照或身分證件正本
2. 報名資料正本以供查驗
3. 請提早 15 分鐘到場報到

請於 {{回覆期限}} 前回覆本信確認出席。如有任何問題，歡迎與承辦人 {{承辦人}} 聯繫（{{聯絡信箱}}{{聯絡電話中}}）。

順頌　時祺
實踐大學 {{單位名稱}}` },

  S1_OFFLINE_VI: { subject: SUBJ.S1_VI, body:
`Kính gửi bạn {{英文姓名}},

Cảm ơn bạn đã đăng ký chương trình "{{申請項目EN}}" tại Đại học Thực Tiễn (Shih Chien University). Sau khi xét duyệt sơ bộ, chúng tôi trân trọng mời bạn tham gia vòng phỏng vấn thứ nhất, được tổ chức trực tiếp tại trường.

• Ngày phỏng vấn: {{面試日期}}
• Thời gian: {{面試時間顯示外}}
• Hình thức: Phỏng vấn trực tiếp
• Địa điểm: {{面試地點}}

Trước buổi phỏng vấn, vui lòng chuẩn bị:
1. Hộ chiếu hoặc giấy tờ tùy thân bản gốc
2. Hồ sơ đăng ký bản gốc để đối chiếu
3. Vui lòng đến sớm 15 phút để làm thủ tục

Vui lòng trả lời email này trước ngày {{回覆期限}} để xác nhận tham dự. Nếu có thắc mắc, xin liên hệ {{承辦人}} qua email {{聯絡信箱}}{{聯絡電話外}}.

Trân trọng,
{{單位名稱}}, Đại học Thực Tiễn

────────────────────────────

親愛的 {{中文姓名}} 同學，您好：

感謝您報名本校「{{申請項目}}」。經初步審查，誠摯邀請您參加第一階段面試，本次採實體到校方式進行，相關資訊如下：

▸ 面試日期：{{面試日期}}
▸ 面試時間：{{面試時間顯示中}}
▸ 面試方式：實體面試
▸ 面試地點：{{面試地點}}

面試前請準備：
1. 護照或身分證件正本
2. 報名資料正本以供查驗
3. 請提早 15 分鐘到場報到

請於 {{回覆期限}} 前回覆本信確認出席。如有任何問題，歡迎與承辦人 {{承辦人}} 聯繫（{{聯絡信箱}}{{聯絡電話中}}）。

順頌　時祺
實踐大學 {{單位名稱}}` },

  S1_OFFLINE_ID: { subject: SUBJ.S1_ID, body:
`Kepada Yth. {{英文姓名}},

Terima kasih telah mendaftar program "{{申請項目EN}}" di Shih Chien University. Setelah peninjauan awal, dengan senang hati kami mengundang Anda untuk mengikuti wawancara tahap pertama yang akan diadakan secara langsung di kampus.

• Tanggal: {{面試日期}}
• Waktu: {{面試時間顯示外}}
• Metode: Wawancara langsung
• Lokasi: {{面試地點}}

Mohon siapkan hal berikut sebelum wawancara:
1. Paspor atau kartu identitas asli
2. Dokumen pendaftaran asli untuk verifikasi
3. Mohon datang 15 menit lebih awal untuk registrasi

Mohon balas email ini sebelum {{回覆期限}} untuk mengonfirmasi kehadiran Anda. Jika ada pertanyaan, silakan hubungi {{承辦人}} melalui {{聯絡信箱}}{{聯絡電話外}}.

Hormat kami,
{{單位名稱}}, Shih Chien University

────────────────────────────

親愛的 {{中文姓名}} 同學，您好：

感謝您報名本校「{{申請項目}}」。經初步審查，誠摯邀請您參加第一階段面試，本次採實體到校方式進行，相關資訊如下：

▸ 面試日期：{{面試日期}}
▸ 面試時間：{{面試時間顯示中}}
▸ 面試方式：實體面試
▸ 面試地點：{{面試地點}}

面試前請準備：
1. 護照或身分證件正本
2. 報名資料正本以供查驗
3. 請提早 15 分鐘到場報到

請於 {{回覆期限}} 前回覆本信確認出席。如有任何問題，歡迎與承辦人 {{承辦人}} 聯繫（{{聯絡信箱}}{{聯絡電話中}}）。

順頌　時祺
實踐大學 {{單位名稱}}` },

  // ── 第一階段．線上 ──
  S1_ONLINE_EN: { subject: SUBJ.S1_EN, body:
`Dear {{英文姓名}},

Thank you for applying to "{{申請項目EN}}" at Shih Chien University. Following an initial review, we are pleased to invite you to the first-round interview, which will be held online.

• Date: {{面試日期}}
• Time: {{面試時間顯示外}}
• Format: Online video — Google Meet
• Meeting link: {{會議連結}}

Please prepare the following before the interview:
1. Your original passport or ID
2. Original application documents for verification
3. A stable internet connection with a working camera and microphone

Kindly reply to this email by {{回覆期限}} to confirm your attendance. Should you have any questions, please contact {{承辦人}} at {{聯絡信箱}}{{聯絡電話外}}.

Best regards,
{{單位名稱}}, Shih Chien University

────────────────────────────

親愛的 {{中文姓名}} 同學，您好：

感謝您報名本校「{{申請項目}}」。經初步審查，誠摯邀請您參加第一階段面試，本次採線上視訊方式進行，相關資訊如下：

▸ 面試日期：{{面試日期}}
▸ 面試時間：{{面試時間顯示中}}
▸ 面試方式：線上視訊 Google Meet
▸ 會議連結：{{會議連結}}

面試前請準備：
1. 護照或身分證件正本
2. 報名資料正本以供查驗
3. 確認網路、視訊與麥克風設備正常

請於 {{回覆期限}} 前回覆本信確認出席。如有任何問題，歡迎與承辦人 {{承辦人}} 聯繫（{{聯絡信箱}}{{聯絡電話中}}）。

順頌　時祺
實踐大學 {{單位名稱}}` },

  S1_ONLINE_VI: { subject: SUBJ.S1_VI, body:
`Kính gửi bạn {{英文姓名}},

Cảm ơn bạn đã đăng ký chương trình "{{申請項目EN}}" tại Đại học Thực Tiễn (Shih Chien University). Sau khi xét duyệt sơ bộ, chúng tôi trân trọng mời bạn tham gia vòng phỏng vấn thứ nhất, được tổ chức theo hình thức trực tuyến.

• Ngày phỏng vấn: {{面試日期}}
• Thời gian: {{面試時間顯示外}}
• Hình thức: Trực tuyến qua Google Meet
• Liên kết cuộc họp: {{會議連結}}

Trước buổi phỏng vấn, vui lòng chuẩn bị:
1. Hộ chiếu hoặc giấy tờ tùy thân bản gốc
2. Hồ sơ đăng ký bản gốc để đối chiếu
3. Kết nối internet ổn định cùng camera và micro hoạt động tốt

Vui lòng trả lời email này trước ngày {{回覆期限}} để xác nhận tham dự. Nếu có thắc mắc, xin liên hệ {{承辦人}} qua email {{聯絡信箱}}{{聯絡電話外}}.

Trân trọng,
{{單位名稱}}, Đại học Thực Tiễn

────────────────────────────

親愛的 {{中文姓名}} 同學，您好：

感謝您報名本校「{{申請項目}}」。經初步審查，誠摯邀請您參加第一階段面試，本次採線上視訊方式進行，相關資訊如下：

▸ 面試日期：{{面試日期}}
▸ 面試時間：{{面試時間顯示中}}
▸ 面試方式：線上視訊 Google Meet
▸ 會議連結：{{會議連結}}

面試前請準備：
1. 護照或身分證件正本
2. 報名資料正本以供查驗
3. 確認網路、視訊與麥克風設備正常

請於 {{回覆期限}} 前回覆本信確認出席。如有任何問題，歡迎與承辦人 {{承辦人}} 聯繫（{{聯絡信箱}}{{聯絡電話中}}）。

順頌　時祺
實踐大學 {{單位名稱}}` },

  S1_ONLINE_ID: { subject: SUBJ.S1_ID, body:
`Kepada Yth. {{英文姓名}},

Terima kasih telah mendaftar program "{{申請項目EN}}" di Shih Chien University. Setelah peninjauan awal, dengan senang hati kami mengundang Anda untuk mengikuti wawancara tahap pertama yang akan diadakan secara daring.

• Tanggal: {{面試日期}}
• Waktu: {{面試時間顯示外}}
• Metode: Video daring — Google Meet
• Tautan rapat: {{會議連結}}

Mohon siapkan hal berikut sebelum wawancara:
1. Paspor atau kartu identitas asli
2. Dokumen pendaftaran asli untuk verifikasi
3. Koneksi internet yang stabil serta kamera dan mikrofon yang berfungsi

Mohon balas email ini sebelum {{回覆期限}} untuk mengonfirmasi kehadiran Anda. Jika ada pertanyaan, silakan hubungi {{承辦人}} melalui {{聯絡信箱}}{{聯絡電話外}}.

Hormat kami,
{{單位名稱}}, Shih Chien University

────────────────────────────

親愛的 {{中文姓名}} 同學，您好：

感謝您報名本校「{{申請項目}}」。經初步審查，誠摯邀請您參加第一階段面試，本次採線上視訊方式進行，相關資訊如下：

▸ 面試日期：{{面試日期}}
▸ 面試時間：{{面試時間顯示中}}
▸ 面試方式：線上視訊 Google Meet
▸ 會議連結：{{會議連結}}

面試前請準備：
1. 護照或身分證件正本
2. 報名資料正本以供查驗
3. 確認網路、視訊與麥克風設備正常

請於 {{回覆期限}} 前回覆本信確認出席。如有任何問題，歡迎與承辦人 {{承辦人}} 聯繫（{{聯絡信箱}}{{聯絡電話中}}）。

順頌　時祺
實踐大學 {{單位名稱}}` },

  // ── 第二階段．線上 ──
  S2_ONLINE_EN: { subject: SUBJ.S2_EN, body:
`Dear {{英文姓名}},

Congratulations on passing the first-round interview for "{{申請項目EN}}" at Shih Chien University! We are pleased to invite you to the second-round interview, which will be held online.

• Date: {{面試日期}}
• Time: {{面試時間顯示外}}
• Format: Online video — Google Meet
• Meeting link: {{會議連結}}

Please prepare the following before the interview:
1. Your original passport or ID
2. Original application documents for verification
3. A stable internet connection with a working camera and microphone

Kindly reply to this email by {{回覆期限}} to confirm your attendance. Should you have any questions, please contact {{承辦人}} at {{聯絡信箱}}{{聯絡電話外}}.

Best regards,
{{單位名稱}}, Shih Chien University

────────────────────────────

親愛的 {{中文姓名}} 同學，您好：

恭喜您通過本校「{{申請項目}}」第一階段面試！誠摯邀請您參加第二階段面試，本階段採線上視訊方式進行，相關資訊如下：

▸ 面試日期：{{面試日期}}
▸ 面試時間：{{面試時間顯示中}}
▸ 面試方式：線上視訊 Google Meet
▸ 會議連結：{{會議連結}}

面試前請準備：
1. 護照或身分證件正本
2. 報名資料正本以供查驗
3. 確認網路、視訊與麥克風設備正常

請於 {{回覆期限}} 前回覆本信確認出席。如有任何問題，歡迎與承辦人 {{承辦人}} 聯繫（{{聯絡信箱}}{{聯絡電話中}}）。

順頌　時祺
實踐大學 {{單位名稱}}` },

  S2_ONLINE_VI: { subject: SUBJ.S2_VI, body:
`Kính gửi bạn {{英文姓名}},

Chúc mừng bạn đã vượt qua vòng phỏng vấn thứ nhất của chương trình "{{申請項目EN}}" tại Đại học Thực Tiễn (Shih Chien University)! Chúng tôi trân trọng mời bạn tham gia vòng phỏng vấn thứ hai, được tổ chức theo hình thức trực tuyến.

• Ngày phỏng vấn: {{面試日期}}
• Thời gian: {{面試時間顯示外}}
• Hình thức: Trực tuyến qua Google Meet
• Liên kết cuộc họp: {{會議連結}}

Trước buổi phỏng vấn, vui lòng chuẩn bị:
1. Hộ chiếu hoặc giấy tờ tùy thân bản gốc
2. Hồ sơ đăng ký bản gốc để đối chiếu
3. Kết nối internet ổn định cùng camera và micro hoạt động tốt

Vui lòng trả lời email này trước ngày {{回覆期限}} để xác nhận tham dự. Nếu có thắc mắc, xin liên hệ {{承辦人}} qua email {{聯絡信箱}}{{聯絡電話外}}.

Trân trọng,
{{單位名稱}}, Đại học Thực Tiễn

────────────────────────────

親愛的 {{中文姓名}} 同學，您好：

恭喜您通過本校「{{申請項目}}」第一階段面試！誠摯邀請您參加第二階段面試，本階段採線上視訊方式進行，相關資訊如下：

▸ 面試日期：{{面試日期}}
▸ 面試時間：{{面試時間顯示中}}
▸ 面試方式：線上視訊 Google Meet
▸ 會議連結：{{會議連結}}

面試前請準備：
1. 護照或身分證件正本
2. 報名資料正本以供查驗
3. 確認網路、視訊與麥克風設備正常

請於 {{回覆期限}} 前回覆本信確認出席。如有任何問題，歡迎與承辦人 {{承辦人}} 聯繫（{{聯絡信箱}}{{聯絡電話中}}）。

順頌　時祺
實踐大學 {{單位名稱}}` },

  S2_ONLINE_ID: { subject: SUBJ.S2_ID, body:
`Kepada Yth. {{英文姓名}},

Selamat! Anda telah lulus wawancara tahap pertama untuk program "{{申請項目EN}}" di Shih Chien University. Dengan senang hati kami mengundang Anda untuk mengikuti wawancara tahap kedua yang akan diadakan secara daring.

• Tanggal: {{面試日期}}
• Waktu: {{面試時間顯示外}}
• Metode: Video daring — Google Meet
• Tautan rapat: {{會議連結}}

Mohon siapkan hal berikut sebelum wawancara:
1. Paspor atau kartu identitas asli
2. Dokumen pendaftaran asli untuk verifikasi
3. Koneksi internet yang stabil serta kamera dan mikrofon yang berfungsi

Mohon balas email ini sebelum {{回覆期限}} untuk mengonfirmasi kehadiran Anda. Jika ada pertanyaan, silakan hubungi {{承辦人}} melalui {{聯絡信箱}}{{聯絡電話外}}.

Hormat kami,
{{單位名稱}}, Shih Chien University

────────────────────────────

親愛的 {{中文姓名}} 同學，您好：

恭喜您通過本校「{{申請項目}}」第一階段面試！誠摯邀請您參加第二階段面試，本階段採線上視訊方式進行，相關資訊如下：

▸ 面試日期：{{面試日期}}
▸ 面試時間：{{面試時間顯示中}}
▸ 面試方式：線上視訊 Google Meet
▸ 會議連結：{{會議連結}}

面試前請準備：
1. 護照或身分證件正本
2. 報名資料正本以供查驗
3. 確認網路、視訊與麥克風設備正常

請於 {{回覆期限}} 前回覆本信確認出席。如有任何問題，歡迎與承辦人 {{承辦人}} 聯繫（{{聯絡信箱}}{{聯絡電話中}}）。

順頌　時祺
實踐大學 {{單位名稱}}` },

  S1_REJECT_EN: { subject: SUBJ.S1_REJECT, body:
`Dear {{英文姓名}},

Thank you for participating in the first-round interview for "{{申請項目EN}}" at Shih Chien University. After careful review, we regret to inform you that you have not been selected to advance to the next stage of the admissions process.

We sincerely appreciate your interest and the effort you put into your application, and we wish you every success in the future.

Should you have any questions, please contact {{承辦人}} at {{聯絡信箱}}{{聯絡電話外}}.

Best regards,
{{單位名稱}}, Shih Chien University

────────────────────────────

親愛的 {{中文姓名}} 同學，您好：

感謝您參加本校「{{申請項目}}」第一階段面試。經審慎評估，很遺憾通知您，您此次未能進入下一階段甄選。

感謝您對本校的興趣與用心準備，謹祝您未來一切順利、鵬程萬里。

如有任何問題，歡迎與承辦人 {{承辦人}} 聯繫（{{聯絡信箱}}{{聯絡電話中}}）。

順頌　時祺
實踐大學 {{單位名稱}}` },

  S1_REJECT_VI: { subject: SUBJ.S1_REJECT, body:
`Kính gửi bạn {{英文姓名}},

Cảm ơn bạn đã tham gia vòng phỏng vấn thứ nhất cho chương trình "{{申請項目EN}}" tại Đại học Thực Tiễn (Shih Chien University). Sau khi xem xét kỹ lưỡng, chúng tôi rất tiếc phải thông báo rằng bạn chưa được chọn vào vòng tuyển chọn tiếp theo.

Chúng tôi trân trọng cảm ơn sự quan tâm và nỗ lực của bạn, và kính chúc bạn mọi điều tốt đẹp trong tương lai.

Nếu có thắc mắc, xin liên hệ {{承辦人}} qua email {{聯絡信箱}}{{聯絡電話外}}.

Trân trọng,
{{單位名稱}}, Đại học Thực Tiễn

────────────────────────────

親愛的 {{中文姓名}} 同學，您好：

感謝您參加本校「{{申請項目}}」第一階段面試。經審慎評估，很遺憾通知您，您此次未能進入下一階段甄選。

感謝您對本校的興趣與用心準備，謹祝您未來一切順利、鵬程萬里。

如有任何問題，歡迎與承辦人 {{承辦人}} 聯繫（{{聯絡信箱}}{{聯絡電話中}}）。

順頌　時祺
實踐大學 {{單位名稱}}` },

  S1_REJECT_ID: { subject: SUBJ.S1_REJECT, body:
`Kepada Yth. {{英文姓名}},

Terima kasih telah mengikuti wawancara tahap pertama untuk program "{{申請項目EN}}" di Shih Chien University. Setelah peninjauan yang saksama, dengan menyesal kami sampaikan bahwa Anda belum terpilih untuk melaju ke tahap seleksi berikutnya.

Kami sangat menghargai minat dan usaha Anda, dan kami mendoakan kesuksesan Anda di masa mendatang.

Jika ada pertanyaan, silakan hubungi {{承辦人}} melalui {{聯絡信箱}}{{聯絡電話外}}.

Hormat kami,
{{單位名稱}}, Shih Chien University

────────────────────────────

親愛的 {{中文姓名}} 同學，您好：

感謝您參加本校「{{申請項目}}」第一階段面試。經審慎評估，很遺憾通知您，您此次未能進入下一階段甄選。

感謝您對本校的興趣與用心準備，謹祝您未來一切順利、鵬程萬里。

如有任何問題，歡迎與承辦人 {{承辦人}} 聯繫（{{聯絡信箱}}{{聯絡電話中}}）。

順頌　時祺
實踐大學 {{單位名稱}}` },

  S1_NOSHOW_EN: { subject: SUBJ.S1_NOSHOW, body:
`Dear {{英文姓名}},

Thank you for applying to "{{申請項目EN}}" at Shih Chien University. We noticed that you were unable to attend your scheduled first-round interview.

We would still be delighted to welcome you to Shih Chien University, and we hope you remain interested in studying with us. If so, we would be happy to arrange a new interview time for you.

Please reply to this email by {{回覆期限}} to let us know whether you would like to reschedule, and we will arrange a new interview time as soon as possible.

Should you have any questions, please contact {{承辦人}} at {{聯絡信箱}}{{聯絡電話外}}.

Best regards,
{{單位名稱}}, Shih Chien University

────────────

親愛的 {{中文姓名}} 同學，您好：

感謝您報名本校「{{申請項目}}」。本次第一階段面試我們未能與您見面，您並未到場參加。

我們仍非常期待您加入實踐大學，也希望您對本校保有興趣。若是如此，我們很樂意為您安排改期面試。

請於 {{回覆期限}} 前回覆本信，告知您是否希望另約面試時間，我們將儘速為您安排。

如有任何問題，歡迎與承辦人 {{承辦人}} 聯繫（{{聯絡信箱}}{{聯絡電話中}}）。

順頌　時祺
實踐大學 {{單位名稱}}` },

  S1_NOSHOW_VI: { subject: SUBJ.S1_NOSHOW, body:
`Kính gửi bạn {{英文姓名}},

Cảm ơn bạn đã đăng ký chương trình "{{申請項目EN}}" tại Đại học Thực Tiễn (Shih Chien University). Chúng tôi nhận thấy bạn đã không thể tham dự buổi phỏng vấn vòng một theo lịch.

Chúng tôi vẫn rất mong được chào đón bạn đến với Đại học Thực Tiễn và hy vọng bạn vẫn quan tâm đến việc học tập tại trường. Nếu vậy, chúng tôi sẵn lòng sắp xếp một buổi phỏng vấn vào thời gian khác cho bạn.

Vui lòng phản hồi email này trước ngày {{回覆期限}} để cho chúng tôi biết bạn có muốn dời lịch phỏng vấn hay không, và chúng tôi sẽ sắp xếp thời gian mới sớm nhất có thể.

Nếu có thắc mắc, xin liên hệ {{承辦人}} qua email {{聯絡信箱}}{{聯絡電話外}}.

Trân trọng,
{{單位名稱}}, Đại học Thực Tiễn

────────────

親愛的 {{中文姓名}} 同學，您好：

感謝您報名本校「{{申請項目}}」。本次第一階段面試我們未能與您見面，您並未到場參加。

我們仍非常期待您加入實踐大學，也希望您對本校保有興趣。若是如此，我們很樂意為您安排改期面試。

請於 {{回覆期限}} 前回覆本信，告知您是否希望另約面試時間，我們將儘速為您安排。

如有任何問題，歡迎與承辦人 {{承辦人}} 聯繫（{{聯絡信箱}}{{聯絡電話中}}）。

順頌　時祺
實踐大學 {{單位名稱}}` },

  S1_NOSHOW_ID: { subject: SUBJ.S1_NOSHOW, body:
`Kepada Yth. {{英文姓名}},

Terima kasih telah mendaftar program "{{申請項目EN}}" di Shih Chien University. Kami memperhatikan bahwa Anda tidak dapat menghadiri wawancara tahap pertama yang telah dijadwalkan.

Kami tetap akan dengan senang hati menyambut Anda di Shih Chien University dan berharap Anda masih berminat untuk berkuliah di sini. Jika demikian, kami dengan senang hati mengatur jadwal wawancara baru untuk Anda.

Mohon balas email ini sebelum {{回覆期限}} untuk memberi tahu kami apakah Anda ingin menjadwalkan ulang wawancara, dan kami akan mengatur waktu wawancara baru sesegera mungkin.

Jika ada pertanyaan, silakan hubungi {{承辦人}} melalui {{聯絡信箱}}{{聯絡電話外}}.

Hormat kami,
{{單位名稱}}, Shih Chien University

────────────

親愛的 {{中文姓名}} 同學，您好：

感謝您報名本校「{{申請項目}}」。本次第一階段面試我們未能與您見面，您並未到場參加。

我們仍非常期待您加入實踐大學，也希望您對本校保有興趣。若是如此，我們很樂意為您安排改期面試。

請於 {{回覆期限}} 前回覆本信，告知您是否希望另約面試時間，我們將儘速為您安排。

如有任何問題，歡迎與承辦人 {{承辦人}} 聯繫（{{聯絡信箱}}{{聯絡電話中}}）。

順頌　時祺
實踐大學 {{單位名稱}}` },

  // ── 第四階段．預錄取意願調查（正取，含個人確認連結）──
  S4_ADMIT_EN: { subject: SUBJ.S4_ADMIT_EN, body:
`Dear {{英文姓名}},

Thank you for taking part in the admissions selection for the International Foundation Program (1+4) at Shih Chien University ({{系所外}}). Following the interview evaluation, your preliminary result is as follows:

• Preliminary program: {{系所外}}
• Preliminary result: {{類別外}}

※ This message is a Preliminary Admission Intent Survey, not a formal admission notice. Your response will serve as the basis for our official announcement: if you express your intent to enroll, your admission will be confirmed at the official announcement; if you decline, your place will be released to waitlisted applicants.

Please use your personal link below to indicate your enrollment intent:

{{確認連結}}

▸ Intent survey deadline: {{回覆期限}}
▸ Official announcement date: {{正式放榜日期}}
▸ You may change your choice through the same link any time before the deadline.
▸ This link is unique to you — please do not share it.

If you do not respond by the deadline, it may be treated as a withdrawal, which could affect your eligibility. If you have any questions, please contact {{承辦人}} at {{聯絡信箱}}.

Best regards,
Office of International Affairs, Shih Chien University

────────────────────────────

親愛的 {{中文姓名}} 同學，您好：

感謝您參加本校「{{系所中}}」的1+4國際專修部招生甄選。經面試評選，您的預錄取結果為：

▸ 預錄取學系：{{系所中}}
▸ 預錄取結果：{{類別中}}

※ 本通知為「預錄取意願調查」，並非正式錄取通知。您的回覆將作為本校正式放榜的依據：表達就讀意願者，將於正式放榜確認錄取；若放棄，名額將釋出予備取生遞補。

請透過下方專屬連結，告知您的就讀意願：

{{確認連結}}

▸ 意願調查回覆期限：{{回覆期限}}
▸ 正式放榜日期：{{正式放榜日期}}
▸ 期限前可透過同一連結隨時修改您的選擇。
▸ 此連結為您個人專屬，請勿轉傳他人。

逾期未回覆者，本校得視為放棄，相關權益可能受影響。如有任何問題，歡迎與承辦人 {{承辦人}} 聯繫（{{聯絡信箱}}）。

順頌　時祺
實踐大學 國際事務處` },
  S4_ADMIT_VI: { subject: SUBJ.S4_ADMIT_VI, body:
`Kính gửi bạn {{英文姓名}},

Cảm ơn bạn đã tham gia kỳ tuyển sinh International Foundation Program (1+4) tại Đại học Thực Tiễn (Shih Chien University) ({{系所外}}). Sau khi đánh giá phỏng vấn, kết quả sơ bộ của bạn như sau:

• Ngành dự kiến: {{系所外}}
• Kết quả sơ bộ: {{類別外}}

※ Thông báo này là Khảo sát nguyện vọng trúng tuyển sơ bộ, không phải thông báo trúng tuyển chính thức. Phản hồi của bạn sẽ là căn cứ cho việc công bố chính thức: nếu bạn bày tỏ nguyện vọng nhập học, việc trúng tuyển sẽ được xác nhận khi công bố chính thức; nếu bạn từ chối, chỗ của bạn sẽ được chuyển cho thí sinh trong danh sách dự bị.

Vui lòng dùng liên kết cá nhân dưới đây để cho biết nguyện vọng nhập học của bạn:

{{確認連結}}

▸ Hạn khảo sát nguyện vọng: {{回覆期限}}
▸ Ngày công bố chính thức: {{正式放榜日期}}
▸ Bạn có thể thay đổi lựa chọn qua cùng liên kết bất cứ lúc nào trước hạn.
▸ Liên kết này là riêng của bạn — xin đừng chia sẻ cho người khác.

Nếu bạn không phản hồi trước hạn, điều này có thể được xem là từ bỏ và ảnh hưởng đến quyền lợi của bạn. Nếu có thắc mắc, xin liên hệ {{承辦人}} qua {{聯絡信箱}}.

Trân trọng,
Office of International Affairs, Đại học Thực Tiễn

────────────────────────────

親愛的 {{中文姓名}} 同學，您好：

感謝您參加本校「{{系所中}}」的1+4國際專修部招生甄選。經面試評選，您的預錄取結果為：

▸ 預錄取學系：{{系所中}}
▸ 預錄取結果：{{類別中}}

※ 本通知為「預錄取意願調查」，並非正式錄取通知。您的回覆將作為本校正式放榜的依據：表達就讀意願者，將於正式放榜確認錄取；若放棄，名額將釋出予備取生遞補。

請透過下方專屬連結，告知您的就讀意願：

{{確認連結}}

▸ 意願調查回覆期限：{{回覆期限}}
▸ 正式放榜日期：{{正式放榜日期}}
▸ 期限前可透過同一連結隨時修改您的選擇。
▸ 此連結為您個人專屬，請勿轉傳他人。

逾期未回覆者，本校得視為放棄，相關權益可能受影響。如有任何問題，歡迎與承辦人 {{承辦人}} 聯繫（{{聯絡信箱}}）。

順頌　時祺
實踐大學 國際事務處` },
  S4_ADMIT_ID: { subject: SUBJ.S4_ADMIT_ID, body:
`Yth. {{英文姓名}},

Terima kasih telah mengikuti seleksi penerimaan International Foundation Program (1+4) di Shih Chien University ({{系所外}}). Setelah evaluasi wawancara, hasil sementara Anda adalah sebagai berikut:

• Program sementara: {{系所外}}
• Hasil sementara: {{類別外}}

※ Pemberitahuan ini adalah Survei Minat Penerimaan Awal, bukan pemberitahuan penerimaan resmi. Tanggapan Anda akan menjadi dasar pengumuman resmi kami: jika Anda menyatakan minat untuk mendaftar, penerimaan Anda akan dikonfirmasi pada pengumuman resmi; jika Anda menolak, tempat Anda akan dialihkan kepada pelamar daftar tunggu.

Silakan gunakan tautan pribadi Anda di bawah ini untuk menyatakan minat pendaftaran Anda:

{{確認連結}}

▸ Batas waktu survei minat: {{回覆期限}}
▸ Tanggal pengumuman resmi: {{正式放榜日期}}
▸ Anda dapat mengubah pilihan melalui tautan yang sama kapan saja sebelum batas waktu.
▸ Tautan ini khusus untuk Anda — mohon jangan dibagikan.

Jika Anda tidak merespons sebelum batas waktu, hal ini dapat dianggap sebagai pengunduran diri dan memengaruhi hak Anda. Jika ada pertanyaan, silakan hubungi {{承辦人}} melalui {{聯絡信箱}}.

Hormat kami,
Office of International Affairs, Shih Chien University

────────────────────────────

親愛的 {{中文姓名}} 同學，您好：

感謝您參加本校「{{系所中}}」的1+4國際專修部招生甄選。經面試評選，您的預錄取結果為：

▸ 預錄取學系：{{系所中}}
▸ 預錄取結果：{{類別中}}

※ 本通知為「預錄取意願調查」，並非正式錄取通知。您的回覆將作為本校正式放榜的依據：表達就讀意願者，將於正式放榜確認錄取；若放棄，名額將釋出予備取生遞補。

請透過下方專屬連結，告知您的就讀意願：

{{確認連結}}

▸ 意願調查回覆期限：{{回覆期限}}
▸ 正式放榜日期：{{正式放榜日期}}
▸ 期限前可透過同一連結隨時修改您的選擇。
▸ 此連結為您個人專屬，請勿轉傳他人。

逾期未回覆者，本校得視為放棄，相關權益可能受影響。如有任何問題，歡迎與承辦人 {{承辦人}} 聯繫（{{聯絡信箱}}）。

順頌　時祺
實踐大學 國際事務處` },

  // ── 第四階段．備取遞補意願調查（正取放棄後詢問對應備取，含確認連結）──
  S4_PROMOTE_EN: { subject: SUBJ.S4_PROMOTE_EN, body:
`Dear {{英文姓名}},

Thank you for taking part in the admissions selection for the International Foundation Program (1+4) at Shih Chien University ({{系所外}}). You were placed on the waitlist ({{類別外}}) for this program. A place has now become available, and we would like to ask whether you are willing to take it.

※ This message is a Preliminary Admission Intent Survey, not a formal admission notice. If you indicate that you are willing to be admitted from the waitlist, your admission will be confirmed at the official announcement according to the available places and ranking.

Please use your personal link below to indicate your intent:

{{確認連結}}

▸ Intent survey deadline: {{回覆期限}}
▸ Official announcement date: {{正式放榜日期}}
▸ You may change your choice through the same link any time before the deadline.
▸ This link is unique to you — please do not share it.

As waitlist places are limited and time-sensitive, please reply as soon as possible. If you have any questions, please contact {{承辦人}} at {{聯絡信箱}}.

Best regards,
Office of International Affairs, Shih Chien University

────────────────────────────

親愛的 {{中文姓名}} 同學，您好：

感謝您參加本校「{{系所中}}」的1+4國際專修部招生甄選。您原為本系「{{類別中}}」，目前該學系出現名額，本校誠摯詢問您是否願意遞補。

※ 本通知為「預錄取意願調查」，並非正式錄取通知。若您表達願意遞補，將於正式放榜依缺額與排序確認是否錄取。

請透過下方專屬連結，告知您的意願：

{{確認連結}}

▸ 意願調查回覆期限：{{回覆期限}}
▸ 正式放榜日期：{{正式放榜日期}}
▸ 期限前可透過同一連結隨時修改您的選擇。
▸ 此連結為您個人專屬，請勿轉傳他人。

由於遞補名額有限且具時效，敬請儘速回覆。如有任何問題，歡迎與承辦人 {{承辦人}} 聯繫（{{聯絡信箱}}）。

順頌　時祺
實踐大學 國際事務處` },
  S4_PROMOTE_VI: { subject: SUBJ.S4_PROMOTE_VI, body:
`Kính gửi bạn {{英文姓名}},

Cảm ơn bạn đã tham gia kỳ tuyển sinh International Foundation Program (1+4) tại Đại học Thực Tiễn (Shih Chien University) ({{系所外}}). Bạn thuộc danh sách dự bị ({{類別外}}) của ngành này. Hiện đã có một suất trống, và chúng tôi muốn hỏi bạn có sẵn lòng nhận suất này hay không.

※ Thông báo này là Khảo sát nguyện vọng trúng tuyển sơ bộ, không phải thông báo trúng tuyển chính thức. Nếu bạn cho biết sẵn lòng được trúng tuyển bổ sung từ danh sách dự bị, việc trúng tuyển sẽ được xác nhận khi công bố chính thức theo số suất trống và thứ hạng.

Vui lòng dùng liên kết cá nhân dưới đây để cho biết nguyện vọng của bạn:

{{確認連結}}

▸ Hạn khảo sát nguyện vọng: {{回覆期限}}
▸ Ngày công bố chính thức: {{正式放榜日期}}
▸ Bạn có thể thay đổi lựa chọn qua cùng liên kết bất cứ lúc nào trước hạn.
▸ Liên kết này là riêng của bạn — xin đừng chia sẻ cho người khác.

Do số suất bổ sung có hạn và mang tính thời hạn, vui lòng phản hồi sớm nhất có thể. Nếu có thắc mắc, xin liên hệ {{承辦人}} qua {{聯絡信箱}}.

Trân trọng,
Office of International Affairs, Đại học Thực Tiễn

────────────────────────────

親愛的 {{中文姓名}} 同學，您好：

感謝您參加本校「{{系所中}}」的1+4國際專修部招生甄選。您原為本系「{{類別中}}」，目前該學系出現名額，本校誠摯詢問您是否願意遞補。

※ 本通知為「預錄取意願調查」，並非正式錄取通知。若您表達願意遞補，將於正式放榜依缺額與排序確認是否錄取。

請透過下方專屬連結，告知您的意願：

{{確認連結}}

▸ 意願調查回覆期限：{{回覆期限}}
▸ 正式放榜日期：{{正式放榜日期}}
▸ 期限前可透過同一連結隨時修改您的選擇。
▸ 此連結為您個人專屬，請勿轉傳他人。

由於遞補名額有限且具時效，敬請儘速回覆。如有任何問題，歡迎與承辦人 {{承辦人}} 聯繫（{{聯絡信箱}}）。

順頌　時祺
實踐大學 國際事務處` },
  S4_PROMOTE_ID: { subject: SUBJ.S4_PROMOTE_ID, body:
`Yth. {{英文姓名}},

Terima kasih telah mengikuti seleksi penerimaan International Foundation Program (1+4) di Shih Chien University ({{系所外}}). Anda berada dalam daftar tunggu ({{類別外}}) untuk program ini. Saat ini tersedia satu tempat, dan kami ingin menanyakan apakah Anda bersedia menerimanya.

※ Pemberitahuan ini adalah Survei Minat Penerimaan Awal, bukan pemberitahuan penerimaan resmi. Jika Anda menyatakan bersedia diterima dari daftar tunggu, penerimaan Anda akan dikonfirmasi pada pengumuman resmi sesuai tempat yang tersedia dan peringkat.

Silakan gunakan tautan pribadi Anda di bawah ini untuk menyatakan minat Anda:

{{確認連結}}

▸ Batas waktu survei minat: {{回覆期限}}
▸ Tanggal pengumuman resmi: {{正式放榜日期}}
▸ Anda dapat mengubah pilihan melalui tautan yang sama kapan saja sebelum batas waktu.
▸ Tautan ini khusus untuk Anda — mohon jangan dibagikan.

Karena tempat penggantian terbatas dan terikat waktu, mohon balas sesegera mungkin. Jika ada pertanyaan, silakan hubungi {{承辦人}} melalui {{聯絡信箱}}.

Hormat kami,
Office of International Affairs, Shih Chien University

────────────────────────────

親愛的 {{中文姓名}} 同學，您好：

感謝您參加本校「{{系所中}}」的1+4國際專修部招生甄選。您原為本系「{{類別中}}」，目前該學系出現名額，本校誠摯詢問您是否願意遞補。

※ 本通知為「預錄取意願調查」，並非正式錄取通知。若您表達願意遞補，將於正式放榜依缺額與排序確認是否錄取。

請透過下方專屬連結，告知您的意願：

{{確認連結}}

▸ 意願調查回覆期限：{{回覆期限}}
▸ 正式放榜日期：{{正式放榜日期}}
▸ 期限前可透過同一連結隨時修改您的選擇。
▸ 此連結為您個人專屬，請勿轉傳他人。

由於遞補名額有限且具時效，敬請儘速回覆。如有任何問題，歡迎與承辦人 {{承辦人}} 聯繫（{{聯絡信箱}}）。

順頌　時祺
實踐大學 國際事務處` },

  // ── 第四階段．放棄後感謝（正取放棄／備取不願候補，單向；{{自訂中}}{{自訂外}}可編輯）──
  S4_DECLINE_EN: { subject: SUBJ.S4_DECLINE, body:
`Dear {{英文姓名}},

Thank you for responding to the enrollment intent survey for the International Foundation Program (1+4) ({{系所外}}) at Shih Chien University. We have received your reply and fully respect your decision.

We are sorry that we will not have the chance to welcome you to Shih Chien this time, and we sincerely thank you for your interest and trust in our university.

{{自訂外}}

Should any opportunity for study or cooperation arise in the future, you are most welcome to contact us. If you have any questions, please reach {{承辦人}} at {{聯絡信箱}}.

With best wishes for your success,
Office of International Affairs, Shih Chien University

────────────────────────────

親愛的 {{中文姓名}} 同學，您好：

感謝您回覆本校1+4國際專修部「{{系所中}}」的就讀意願調查。我們已收到您的回覆，尊重並理解您的選擇。

很可惜這次無法與您在實踐相聚，仍由衷感謝您對本校的肯定與信任。

{{自訂中}}

未來若有任何就學或合作的機會，都非常歡迎您與我們聯繫。如有任何問題，請洽承辦人 {{承辦人}}（{{聯絡信箱}}）。

敬祝　學業順利、鵬程萬里
實踐大學 國際事務處` },
  S4_DECLINE_VI: { subject: SUBJ.S4_DECLINE, body:
`Kính gửi bạn {{英文姓名}},

Cảm ơn bạn đã phản hồi khảo sát nguyện vọng nhập học của International Foundation Program (1+4) ({{系所外}}) tại Đại học Thực Tiễn (Shih Chien University). Chúng tôi đã nhận được phản hồi của bạn và hoàn toàn tôn trọng quyết định của bạn.

Rất tiếc lần này chúng tôi chưa có cơ hội được chào đón bạn đến với Thực Tiễn, và chúng tôi chân thành cảm ơn sự quan tâm cùng tin tưởng của bạn dành cho trường.

{{自訂外}}

Trong tương lai, nếu có bất kỳ cơ hội học tập hay hợp tác nào, rất hoan nghênh bạn liên hệ với chúng tôi. Nếu có thắc mắc, xin liên hệ {{承辦人}} qua {{聯絡信箱}}.

Kính chúc bạn mọi sự thành công,
Office of International Affairs, Đại học Thực Tiễn

────────────────────────────

親愛的 {{中文姓名}} 同學，您好：

感謝您回覆本校1+4國際專修部「{{系所中}}」的就讀意願調查。我們已收到您的回覆，尊重並理解您的選擇。

很可惜這次無法與您在實踐相聚，仍由衷感謝您對本校的肯定與信任。

{{自訂中}}

未來若有任何就學或合作的機會，都非常歡迎您與我們聯繫。如有任何問題，請洽承辦人 {{承辦人}}（{{聯絡信箱}}）。

敬祝　學業順利、鵬程萬里
實踐大學 國際事務處` },
  S4_DECLINE_ID: { subject: SUBJ.S4_DECLINE, body:
`Yth. {{英文姓名}},

Terima kasih telah menanggapi survei minat pendaftaran International Foundation Program (1+4) ({{系所外}}) di Shih Chien University. Kami telah menerima balasan Anda dan sepenuhnya menghormati keputusan Anda.

Kami menyayangkan bahwa kali ini kami belum berkesempatan menyambut Anda di Shih Chien, dan kami dengan tulus berterima kasih atas minat serta kepercayaan Anda kepada universitas kami.

{{自訂外}}

Apabila di masa mendatang ada kesempatan studi atau kerja sama, Anda sangat dipersilakan menghubungi kami. Jika ada pertanyaan, silakan hubungi {{承辦人}} melalui {{聯絡信箱}}.

Dengan harapan terbaik untuk kesuksesan Anda,
Office of International Affairs, Shih Chien University

────────────────────────────

親愛的 {{中文姓名}} 同學，您好：

感謝您回覆本校1+4國際專修部「{{系所中}}」的就讀意願調查。我們已收到您的回覆，尊重並理解您的選擇。

很可惜這次無法與您在實踐相聚，仍由衷感謝您對本校的肯定與信任。

{{自訂中}}

未來若有任何就學或合作的機會，都非常歡迎您與我們聯繫。如有任何問題，請洽承辦人 {{承辦人}}（{{聯絡信箱}}）。

敬祝　學業順利、鵬程萬里
實踐大學 國際事務處` },

  // ── 第四階段．不錄取感謝（全系所皆未錄取，單向；{{自訂中}}{{自訂外}}可編輯）──
  S4_REJECT_EN: { subject: SUBJ.S4_REJECT, body:
`Dear {{英文姓名}},

Thank you for applying to and taking part in the admissions selection for the International Foundation Program (1+4) at Shih Chien University. After careful evaluation, we regret to inform you that you have not been admitted this time.

We understand the considerable effort you put into your application, and we sincerely appreciate your dedication and your interest in our university.

{{自訂外}}

We wish you every success in your future studies. If you have any questions, please contact {{承辦人}} at {{聯絡信箱}}.

Best regards,
Office of International Affairs, Shih Chien University

────────────────────────────

親愛的 {{中文姓名}} 同學，您好：

感謝您報名並參與實踐大學1+4國際專修部的招生甄選。經審慎評估，很遺憾通知您，本次未能錄取。

我們深知您為申請付出許多心力，謹對您的努力與對本校的興趣致上誠摯謝意。

{{自訂中}}

謹祝您未來學途順遂、鵬程萬里。如有任何問題，歡迎與承辦人 {{承辦人}} 聯繫（{{聯絡信箱}}）。

順頌　時祺
實踐大學 國際事務處` },
  S4_REJECT_VI: { subject: SUBJ.S4_REJECT, body:
`Kính gửi bạn {{英文姓名}},

Cảm ơn bạn đã đăng ký và tham gia kỳ tuyển sinh International Foundation Program (1+4) tại Đại học Thực Tiễn (Shih Chien University). Sau khi đánh giá kỹ lưỡng, chúng tôi rất tiếc phải thông báo rằng bạn chưa trúng tuyển lần này.

Chúng tôi hiểu rằng bạn đã dành nhiều tâm huyết cho hồ sơ của mình, và chân thành cảm ơn sự nỗ lực cùng quan tâm của bạn dành cho trường.

{{自訂外}}

Kính chúc bạn mọi điều tốt đẹp trên con đường học vấn sắp tới. Nếu có thắc mắc, xin liên hệ {{承辦人}} qua {{聯絡信箱}}.

Trân trọng,
Office of International Affairs, Đại học Thực Tiễn

────────────────────────────

親愛的 {{中文姓名}} 同學，您好：

感謝您報名並參與實踐大學1+4國際專修部的招生甄選。經審慎評估，很遺憾通知您，本次未能錄取。

我們深知您為申請付出許多心力，謹對您的努力與對本校的興趣致上誠摯謝意。

{{自訂中}}

謹祝您未來學途順遂、鵬程萬里。如有任何問題，歡迎與承辦人 {{承辦人}} 聯繫（{{聯絡信箱}}）。

順頌　時祺
實踐大學 國際事務處` },
  S4_REJECT_ID: { subject: SUBJ.S4_REJECT, body:
`Yth. {{英文姓名}},

Terima kasih telah mendaftar dan mengikuti seleksi penerimaan International Foundation Program (1+4) di Shih Chien University. Setelah evaluasi yang saksama, dengan menyesal kami sampaikan bahwa Anda belum diterima kali ini.

Kami memahami besarnya usaha yang Anda curahkan dalam pendaftaran ini, dan kami dengan tulus menghargai dedikasi serta minat Anda kepada universitas kami.

{{自訂外}}

Kami mendoakan kesuksesan Anda dalam studi di masa mendatang. Jika ada pertanyaan, silakan hubungi {{承辦人}} melalui {{聯絡信箱}}.

Hormat kami,
Office of International Affairs, Shih Chien University

────────────────────────────

親愛的 {{中文姓名}} 同學，您好：

感謝您報名並參與實踐大學1+4國際專修部的招生甄選。經審慎評估，很遺憾通知您，本次未能錄取。

我們深知您為申請付出許多心力，謹對您的努力與對本校的興趣致上誠摯謝意。

{{自訂中}}

謹祝您未來學途順遂、鵬程萬里。如有任何問題，歡迎與承辦人 {{承辦人}} 聯繫（{{聯絡信箱}}）。

順頌　時祺
實踐大學 國際事務處` },

}
