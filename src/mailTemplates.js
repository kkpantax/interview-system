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
}

export const TEMPLATES = {

  // ── 第一階段．實體 ──
  S1_OFFLINE_EN: { subject: SUBJ.S1_EN, body:
`Dear {{英文姓名}},

Thank you for applying to "{{申請項目EN}}" at Shih Chien University. Following an initial review, we are pleased to invite you to the first-round interview, which will be held in person on campus.

• Date: {{面試日期}}
• Time: {{面試時間}} ({{時區外}})
• Format: In-person interview
• Venue: {{面試地點}}

Please prepare the following before the interview:
1. Your original passport or ID
2. Original application documents for verification
3. Please arrive 15 minutes early to check in

Kindly reply to this email by {{回覆期限}} to confirm your attendance. Should you have any questions, please contact {{承辦人}} at {{聯絡信箱}}.

Best regards,
{{單位名稱}}, Shih Chien University

────────────────────────────

親愛的 {{中文姓名}} 同學，您好：

感謝您報名本校「{{申請項目}}」。經初步審查，誠摯邀請您參加第一階段面試，本次採實體到校方式進行，相關資訊如下：

▸ 面試日期：{{面試日期}}
▸ 面試時間：{{面試時間}}（{{時區中}}）
▸ 面試方式：實體面試
▸ 面試地點：{{面試地點}}

面試前請準備：
1. 護照或身分證件正本
2. 報名資料正本以供查驗
3. 請提早 15 分鐘到場報到

請於 {{回覆期限}} 前回覆本信確認出席。如有任何問題，歡迎與承辦人 {{承辦人}} 聯繫（{{聯絡信箱}}）。

順頌　時祺
實踐大學 {{單位名稱}}` },

  S1_OFFLINE_VI: { subject: SUBJ.S1_VI, body:
`Kính gửi bạn {{英文姓名}},

Cảm ơn bạn đã đăng ký chương trình "{{申請項目EN}}" tại Đại học Thực Tiễn (Shih Chien University). Sau khi xét duyệt sơ bộ, chúng tôi trân trọng mời bạn tham gia vòng phỏng vấn thứ nhất, được tổ chức trực tiếp tại trường.

• Ngày phỏng vấn: {{面試日期}}
• Thời gian: {{面試時間}} ({{時區外}})
• Hình thức: Phỏng vấn trực tiếp
• Địa điểm: {{面試地點}}

Trước buổi phỏng vấn, vui lòng chuẩn bị:
1. Hộ chiếu hoặc giấy tờ tùy thân bản gốc
2. Hồ sơ đăng ký bản gốc để đối chiếu
3. Vui lòng đến sớm 15 phút để làm thủ tục

Vui lòng trả lời email này trước ngày {{回覆期限}} để xác nhận tham dự. Nếu có thắc mắc, xin liên hệ {{承辦人}} qua email {{聯絡信箱}}.

Trân trọng,
{{單位名稱}}, Đại học Thực Tiễn

────────────────────────────

親愛的 {{中文姓名}} 同學，您好：

感謝您報名本校「{{申請項目}}」。經初步審查，誠摯邀請您參加第一階段面試，本次採實體到校方式進行，相關資訊如下：

▸ 面試日期：{{面試日期}}
▸ 面試時間：{{面試時間}}（{{時區中}}）
▸ 面試方式：實體面試
▸ 面試地點：{{面試地點}}

面試前請準備：
1. 護照或身分證件正本
2. 報名資料正本以供查驗
3. 請提早 15 分鐘到場報到

請於 {{回覆期限}} 前回覆本信確認出席。如有任何問題，歡迎與承辦人 {{承辦人}} 聯繫（{{聯絡信箱}}）。

順頌　時祺
實踐大學 {{單位名稱}}` },

  S1_OFFLINE_ID: { subject: SUBJ.S1_ID, body:
`Kepada Yth. {{英文姓名}},

Terima kasih telah mendaftar program "{{申請項目EN}}" di Shih Chien University. Setelah peninjauan awal, dengan senang hati kami mengundang Anda untuk mengikuti wawancara tahap pertama yang akan diadakan secara langsung di kampus.

• Tanggal: {{面試日期}}
• Waktu: {{面試時間}} ({{時區外}})
• Metode: Wawancara langsung
• Lokasi: {{面試地點}}

Mohon siapkan hal berikut sebelum wawancara:
1. Paspor atau kartu identitas asli
2. Dokumen pendaftaran asli untuk verifikasi
3. Mohon datang 15 menit lebih awal untuk registrasi

Mohon balas email ini sebelum {{回覆期限}} untuk mengonfirmasi kehadiran Anda. Jika ada pertanyaan, silakan hubungi {{承辦人}} melalui {{聯絡信箱}}.

Hormat kami,
{{單位名稱}}, Shih Chien University

────────────────────────────

親愛的 {{中文姓名}} 同學，您好：

感謝您報名本校「{{申請項目}}」。經初步審查，誠摯邀請您參加第一階段面試，本次採實體到校方式進行，相關資訊如下：

▸ 面試日期：{{面試日期}}
▸ 面試時間：{{面試時間}}（{{時區中}}）
▸ 面試方式：實體面試
▸ 面試地點：{{面試地點}}

面試前請準備：
1. 護照或身分證件正本
2. 報名資料正本以供查驗
3. 請提早 15 分鐘到場報到

請於 {{回覆期限}} 前回覆本信確認出席。如有任何問題，歡迎與承辦人 {{承辦人}} 聯繫（{{聯絡信箱}}）。

順頌　時祺
實踐大學 {{單位名稱}}` },

  // ── 第一階段．線上 ──
  S1_ONLINE_EN: { subject: SUBJ.S1_EN, body:
`Dear {{英文姓名}},

Thank you for applying to "{{申請項目EN}}" at Shih Chien University. Following an initial review, we are pleased to invite you to the first-round interview, which will be held online.

• Date: {{面試日期}}
• Time: {{面試時間}} ({{時區外}})
• Format: Online video — Google Meet
• Meeting link: {{會議連結}}

Please prepare the following before the interview:
1. Your original passport or ID
2. Original application documents for verification
3. A stable internet connection with a working camera and microphone

Kindly reply to this email by {{回覆期限}} to confirm your attendance. Should you have any questions, please contact {{承辦人}} at {{聯絡信箱}}.

Best regards,
{{單位名稱}}, Shih Chien University

────────────────────────────

親愛的 {{中文姓名}} 同學，您好：

感謝您報名本校「{{申請項目}}」。經初步審查，誠摯邀請您參加第一階段面試，本次採線上視訊方式進行，相關資訊如下：

▸ 面試日期：{{面試日期}}
▸ 面試時間：{{面試時間}}（{{時區中}}）
▸ 面試方式：線上視訊 Google Meet
▸ 會議連結：{{會議連結}}

面試前請準備：
1. 護照或身分證件正本
2. 報名資料正本以供查驗
3. 確認網路、視訊與麥克風設備正常

請於 {{回覆期限}} 前回覆本信確認出席。如有任何問題，歡迎與承辦人 {{承辦人}} 聯繫（{{聯絡信箱}}）。

順頌　時祺
實踐大學 {{單位名稱}}` },

  S1_ONLINE_VI: { subject: SUBJ.S1_VI, body:
`Kính gửi bạn {{英文姓名}},

Cảm ơn bạn đã đăng ký chương trình "{{申請項目EN}}" tại Đại học Thực Tiễn (Shih Chien University). Sau khi xét duyệt sơ bộ, chúng tôi trân trọng mời bạn tham gia vòng phỏng vấn thứ nhất, được tổ chức theo hình thức trực tuyến.

• Ngày phỏng vấn: {{面試日期}}
• Thời gian: {{面試時間}} ({{時區外}})
• Hình thức: Trực tuyến qua Google Meet
• Liên kết cuộc họp: {{會議連結}}

Trước buổi phỏng vấn, vui lòng chuẩn bị:
1. Hộ chiếu hoặc giấy tờ tùy thân bản gốc
2. Hồ sơ đăng ký bản gốc để đối chiếu
3. Kết nối internet ổn định cùng camera và micro hoạt động tốt

Vui lòng trả lời email này trước ngày {{回覆期限}} để xác nhận tham dự. Nếu có thắc mắc, xin liên hệ {{承辦人}} qua email {{聯絡信箱}}.

Trân trọng,
{{單位名稱}}, Đại học Thực Tiễn

────────────────────────────

親愛的 {{中文姓名}} 同學，您好：

感謝您報名本校「{{申請項目}}」。經初步審查，誠摯邀請您參加第一階段面試，本次採線上視訊方式進行，相關資訊如下：

▸ 面試日期：{{面試日期}}
▸ 面試時間：{{面試時間}}（{{時區中}}）
▸ 面試方式：線上視訊 Google Meet
▸ 會議連結：{{會議連結}}

面試前請準備：
1. 護照或身分證件正本
2. 報名資料正本以供查驗
3. 確認網路、視訊與麥克風設備正常

請於 {{回覆期限}} 前回覆本信確認出席。如有任何問題，歡迎與承辦人 {{承辦人}} 聯繫（{{聯絡信箱}}）。

順頌　時祺
實踐大學 {{單位名稱}}` },

  S1_ONLINE_ID: { subject: SUBJ.S1_ID, body:
`Kepada Yth. {{英文姓名}},

Terima kasih telah mendaftar program "{{申請項目EN}}" di Shih Chien University. Setelah peninjauan awal, dengan senang hati kami mengundang Anda untuk mengikuti wawancara tahap pertama yang akan diadakan secara daring.

• Tanggal: {{面試日期}}
• Waktu: {{面試時間}} ({{時區外}})
• Metode: Video daring — Google Meet
• Tautan rapat: {{會議連結}}

Mohon siapkan hal berikut sebelum wawancara:
1. Paspor atau kartu identitas asli
2. Dokumen pendaftaran asli untuk verifikasi
3. Koneksi internet yang stabil serta kamera dan mikrofon yang berfungsi

Mohon balas email ini sebelum {{回覆期限}} untuk mengonfirmasi kehadiran Anda. Jika ada pertanyaan, silakan hubungi {{承辦人}} melalui {{聯絡信箱}}.

Hormat kami,
{{單位名稱}}, Shih Chien University

────────────────────────────

親愛的 {{中文姓名}} 同學，您好：

感謝您報名本校「{{申請項目}}」。經初步審查，誠摯邀請您參加第一階段面試，本次採線上視訊方式進行，相關資訊如下：

▸ 面試日期：{{面試日期}}
▸ 面試時間：{{面試時間}}（{{時區中}}）
▸ 面試方式：線上視訊 Google Meet
▸ 會議連結：{{會議連結}}

面試前請準備：
1. 護照或身分證件正本
2. 報名資料正本以供查驗
3. 確認網路、視訊與麥克風設備正常

請於 {{回覆期限}} 前回覆本信確認出席。如有任何問題，歡迎與承辦人 {{承辦人}} 聯繫（{{聯絡信箱}}）。

順頌　時祺
實踐大學 {{單位名稱}}` },

  // ── 第二階段．線上 ──
  S2_ONLINE_EN: { subject: SUBJ.S2_EN, body:
`Dear {{英文姓名}},

Congratulations on passing the first-round interview for "{{申請項目EN}}" at Shih Chien University! We are pleased to invite you to the second-round interview, which will be held online.

• Date: {{面試日期}}
• Time: {{面試時間}} ({{時區外}})
• Format: Online video — Google Meet
• Meeting link: {{會議連結}}

Please prepare the following before the interview:
1. Your original passport or ID
2. Original application documents for verification
3. A stable internet connection with a working camera and microphone

Kindly reply to this email by {{回覆期限}} to confirm your attendance. Should you have any questions, please contact {{承辦人}} at {{聯絡信箱}}.

Best regards,
{{單位名稱}}, Shih Chien University

────────────────────────────

親愛的 {{中文姓名}} 同學，您好：

恭喜您通過本校「{{申請項目}}」第一階段面試！誠摯邀請您參加第二階段面試，本階段採線上視訊方式進行，相關資訊如下：

▸ 面試日期：{{面試日期}}
▸ 面試時間：{{面試時間}}（{{時區中}}）
▸ 面試方式：線上視訊 Google Meet
▸ 會議連結：{{會議連結}}

面試前請準備：
1. 護照或身分證件正本
2. 報名資料正本以供查驗
3. 確認網路、視訊與麥克風設備正常

請於 {{回覆期限}} 前回覆本信確認出席。如有任何問題，歡迎與承辦人 {{承辦人}} 聯繫（{{聯絡信箱}}）。

順頌　時祺
實踐大學 {{單位名稱}}` },

  S2_ONLINE_VI: { subject: SUBJ.S2_VI, body:
`Kính gửi bạn {{英文姓名}},

Chúc mừng bạn đã vượt qua vòng phỏng vấn thứ nhất của chương trình "{{申請項目EN}}" tại Đại học Thực Tiễn (Shih Chien University)! Chúng tôi trân trọng mời bạn tham gia vòng phỏng vấn thứ hai, được tổ chức theo hình thức trực tuyến.

• Ngày phỏng vấn: {{面試日期}}
• Thời gian: {{面試時間}} ({{時區外}})
• Hình thức: Trực tuyến qua Google Meet
• Liên kết cuộc họp: {{會議連結}}

Trước buổi phỏng vấn, vui lòng chuẩn bị:
1. Hộ chiếu hoặc giấy tờ tùy thân bản gốc
2. Hồ sơ đăng ký bản gốc để đối chiếu
3. Kết nối internet ổn định cùng camera và micro hoạt động tốt

Vui lòng trả lời email này trước ngày {{回覆期限}} để xác nhận tham dự. Nếu có thắc mắc, xin liên hệ {{承辦人}} qua email {{聯絡信箱}}.

Trân trọng,
{{單位名稱}}, Đại học Thực Tiễn

────────────────────────────

親愛的 {{中文姓名}} 同學，您好：

恭喜您通過本校「{{申請項目}}」第一階段面試！誠摯邀請您參加第二階段面試，本階段採線上視訊方式進行，相關資訊如下：

▸ 面試日期：{{面試日期}}
▸ 面試時間：{{面試時間}}（{{時區中}}）
▸ 面試方式：線上視訊 Google Meet
▸ 會議連結：{{會議連結}}

面試前請準備：
1. 護照或身分證件正本
2. 報名資料正本以供查驗
3. 確認網路、視訊與麥克風設備正常

請於 {{回覆期限}} 前回覆本信確認出席。如有任何問題，歡迎與承辦人 {{承辦人}} 聯繫（{{聯絡信箱}}）。

順頌　時祺
實踐大學 {{單位名稱}}` },

  S2_ONLINE_ID: { subject: SUBJ.S2_ID, body:
`Kepada Yth. {{英文姓名}},

Selamat! Anda telah lulus wawancara tahap pertama untuk program "{{申請項目EN}}" di Shih Chien University. Dengan senang hati kami mengundang Anda untuk mengikuti wawancara tahap kedua yang akan diadakan secara daring.

• Tanggal: {{面試日期}}
• Waktu: {{面試時間}} ({{時區外}})
• Metode: Video daring — Google Meet
• Tautan rapat: {{會議連結}}

Mohon siapkan hal berikut sebelum wawancara:
1. Paspor atau kartu identitas asli
2. Dokumen pendaftaran asli untuk verifikasi
3. Koneksi internet yang stabil serta kamera dan mikrofon yang berfungsi

Mohon balas email ini sebelum {{回覆期限}} untuk mengonfirmasi kehadiran Anda. Jika ada pertanyaan, silakan hubungi {{承辦人}} melalui {{聯絡信箱}}.

Hormat kami,
{{單位名稱}}, Shih Chien University

────────────────────────────

親愛的 {{中文姓名}} 同學，您好：

恭喜您通過本校「{{申請項目}}」第一階段面試！誠摯邀請您參加第二階段面試，本階段採線上視訊方式進行，相關資訊如下：

▸ 面試日期：{{面試日期}}
▸ 面試時間：{{面試時間}}（{{時區中}}）
▸ 面試方式：線上視訊 Google Meet
▸ 會議連結：{{會議連結}}

面試前請準備：
1. 護照或身分證件正本
2. 報名資料正本以供查驗
3. 確認網路、視訊與麥克風設備正常

請於 {{回覆期限}} 前回覆本信確認出席。如有任何問題，歡迎與承辦人 {{承辦人}} 聯繫（{{聯絡信箱}}）。

順頌　時祺
實踐大學 {{單位名稱}}` },

  S1_REJECT_EN: { subject: SUBJ.S1_REJECT, body:
`Dear {{英文姓名}},

Thank you for participating in the first-round interview for "{{申請項目EN}}" at Shih Chien University. After careful review, we regret to inform you that you have not been selected to advance to the next stage of the admissions process.

We sincerely appreciate your interest and the effort you put into your application, and we wish you every success in the future.

Should you have any questions, please contact {{承辦人}} at {{聯絡信箱}}.

Best regards,
{{單位名稱}}, Shih Chien University

────────────────────────────

親愛的 {{中文姓名}} 同學，您好：

感謝您參加本校「{{申請項目}}」第一階段面試。經審慎評估，很遺憾通知您，您此次未能進入下一階段甄選。

感謝您對本校的興趣與用心準備，謹祝您未來一切順利、鵬程萬里。

如有任何問題，歡迎與承辦人 {{承辦人}} 聯繫（{{聯絡信箱}}）。

順頌　時祺
實踐大學 {{單位名稱}}` },

  S1_REJECT_VI: { subject: SUBJ.S1_REJECT, body:
`Kính gửi bạn {{英文姓名}},

Cảm ơn bạn đã tham gia vòng phỏng vấn thứ nhất cho chương trình "{{申請項目EN}}" tại Đại học Thực Tiễn (Shih Chien University). Sau khi xem xét kỹ lưỡng, chúng tôi rất tiếc phải thông báo rằng bạn chưa được chọn vào vòng tuyển chọn tiếp theo.

Chúng tôi trân trọng cảm ơn sự quan tâm và nỗ lực của bạn, và kính chúc bạn mọi điều tốt đẹp trong tương lai.

Nếu có thắc mắc, xin liên hệ {{承辦人}} qua email {{聯絡信箱}}.

Trân trọng,
{{單位名稱}}, Đại học Thực Tiễn

────────────────────────────

親愛的 {{中文姓名}} 同學，您好：

感謝您參加本校「{{申請項目}}」第一階段面試。經審慎評估，很遺憾通知您，您此次未能進入下一階段甄選。

感謝您對本校的興趣與用心準備，謹祝您未來一切順利、鵬程萬里。

如有任何問題，歡迎與承辦人 {{承辦人}} 聯繫（{{聯絡信箱}}）。

順頌　時祺
實踐大學 {{單位名稱}}` },

  S1_REJECT_ID: { subject: SUBJ.S1_REJECT, body:
`Kepada Yth. {{英文姓名}},

Terima kasih telah mengikuti wawancara tahap pertama untuk program "{{申請項目EN}}" di Shih Chien University. Setelah peninjauan yang saksama, dengan menyesal kami sampaikan bahwa Anda belum terpilih untuk melaju ke tahap seleksi berikutnya.

Kami sangat menghargai minat dan usaha Anda, dan kami mendoakan kesuksesan Anda di masa mendatang.

Jika ada pertanyaan, silakan hubungi {{承辦人}} melalui {{聯絡信箱}}.

Hormat kami,
{{單位名稱}}, Shih Chien University

────────────────────────────

親愛的 {{中文姓名}} 同學，您好：

感謝您參加本校「{{申請項目}}」第一階段面試。經審慎評估，很遺憾通知您，您此次未能進入下一階段甄選。

感謝您對本校的興趣與用心準備，謹祝您未來一切順利、鵬程萬里。

如有任何問題，歡迎與承辦人 {{承辦人}} 聯繫（{{聯絡信箱}}）。

順頌　時祺
實踐大學 {{單位名稱}}` },

}
