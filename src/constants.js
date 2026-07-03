export const SCORE_ITEMS = [
  { key: 'chinese',       label: '中文表達能力' },
  { key: 'communication', label: '溝通能力' },
  { key: 'motivation',    label: '學習動機' },
  { key: 'attitude',      label: '態度禮貌' },
  { key: 'stability',     label: '穩定度' },
  { key: 'stress',        label: '抗壓能力' },
  { key: 'family',        label: '家庭支持度' },
  { key: 'impression',    label: '整體印象' },
]

// 第一階段評分項目（6 項，較精簡）
export const SCORE_ITEMS_STAGE1 = [
  { key: 'appearance',  label: '儀容服裝' },
  { key: 'attitude',    label: '態度禮貌' },
  { key: 'expression',  label: '語言表達' },
  { key: 'motivation',  label: '來台動機' },
  { key: 'stability',   label: '穩定度' },
  { key: 'impression',  label: '整體印象' },
]

// 共用基礎題（7 題）：第一、第二階段評分表旁的題目參考清單共用。
export const QUESTIONS_STAGE1 = [
  { q: '請簡單介紹一下自己。' },
  { q: '為什麼想來台灣念書？' },
  { q: '為什麼選擇實踐大學與這個科系？' },
  { q: '你對這個科系目前有哪些了解？' },
  { q: '來台灣念書有什麼計畫或規劃？' },
  { q: '畢業後你會留在台灣工作嗎？' },
  { q: '有沒有想問我們的問題？' },
]

// 第二階段延伸參考題庫（原 QUESTIONS），依 cat 分組顯示
export const QUESTIONS_STAGE2 = [
  { cat: '基本自我介紹', q: '請簡單介紹一下自己。',         focus: '表達能力、自信度' },
  { cat: '基本自我介紹', q: '為什麼想來台灣讀書？',          focus: '留學動機' },
  { cat: '基本自我介紹', q: '為什麼選擇本校與這個科系？',    focus: '是否了解學校與科系' },
  { cat: '基本自我介紹', q: '家人支持你來台灣嗎？',          focus: '家庭支持度' },
  { cat: '基本自我介紹', q: '你未來有什麼規劃？',            focus: '目標與企圖心' },
  { cat: '學習態度',     q: '你在高中最喜歡哪一科？為什麼？',focus: '學習興趣' },
  { cat: '學習態度',     q: '如果中文課很辛苦，你會怎麼辦？',focus: '抗壓性' },
  { cat: '學習態度',     q: '遇到困難時通常如何解決？',      focus: '問題解決能力' },
  { cat: '學習態度',     q: '你曾經參加過什麼活動或社團嗎？',focus: '參與度與合作能力' },
  { cat: '學習態度',     q: '如果需要打工與讀書兼顧，你會如何安排？', focus: '時間管理' },
  { cat: '品行觀察',     q: '你認為準時重要嗎？',            focus: '責任感' },
  { cat: '品行觀察',     q: '如果和室友發生衝突，你會怎麼處理？', focus: '人際溝通' },
  { cat: '品行觀察',     q: '你是否願意遵守學校與宿舍規定？',focus: '配合度' },
  { cat: '品行觀察',     q: '你覺得來台灣後最大的挑戰是什麼？', focus: '心理成熟度' },
]

export const DECISIONS = [
  { v: 'admit',    label: '建議錄取',   color: '#16a34a', bg: '#dcfce7' },
  { v: 'waitlist', label: '備取',       color: '#d97706', bg: '#fef3c7' },
  { v: 'reject',   label: '不建議錄取', color: '#dc2626', bg: '#fee2e2' },
  { v: 'pending',  label: '待定',       color: '#6b7280', bg: '#f3f4f6' },
]

// 第一階段建議（pass / fail / pending），對應 stage1_records.recommendation
export const DECISIONS_STAGE1 = [
  { v: 'pass',    label: '建議通過', color: '#16a34a', bg: '#dcfce7' },
  { v: 'fail',    label: '不通過',   color: '#dc2626', bg: '#fee2e2' },
  { v: 'pending', label: '待定',     color: '#6b7280', bg: '#f3f4f6' },
]

export const FINAL_RESULTS = [
  { v: 'admitted',   label: '正取',   color: '#16a34a', bg: '#dcfce7' },
  { v: 'waitlisted', label: '備取',   color: '#d97706', bg: '#fef3c7' },
  { v: 'rejected',   label: '不錄取', color: '#dc2626', bg: '#fee2e2' },
  { v: '',           label: '未定',   color: '#6b7280', bg: '#f3f4f6' },
]

export const FIXED_ROLES = [
  { id: 'admin',    label: '行政人員',   icon: '⚙' },
  { id: 't1a',      label: '一階老師 A', icon: 'A' },
  { id: 't1b',      label: '一階老師 B', icon: 'B' },
  { id: 'director', label: '主任',       icon: '★' },
]

// Excel 欄位對應（舊版，給已淘汰的 useStore/ListPage 用）
export const XLS_FIELD_MAP = {
  '序號':              'id',
  '中文姓名':          'chName',
  '英文姓名':          'enName',
  '系所別':            'dept',
  '國籍':              'nationality',
  '性別':              'gender',
  '護照號碼':          'passportNo',
  'Email':             'email',
  '行動電話':          'phone',
  '申請獎學金 (Y/N)':  'scholarship',
  '志願序':            'preference',
  '學位別':            'degree',
}

// 新版 Excel 欄位對應（application_export_...xls）→ applications 的 snake_case 欄位
export const APP_XLS_MAP = {
  '帳號':              'account',
  '系所別':            'department',
  '志願序':            'preference_order',
  '中文姓名':          'name',
  '英文姓名':          'name_english',
  '護照號碼':          'passport_number',
  '國籍':              'nationality',
  '性別':              'gender',
  '生日[西元M/D/Y]':   'birth_date',
  'Email':             'email',
  '行動電話':          'phone',
  '最高學歷畢業學校':  'high_school',
}

// 面試中心改由行政人員在 centers 資料表動態管理（見 api.js getCenters），不再寫死常數。

// 申請狀態流轉
export const STATUS = {
  pending:        '待面試',
  stage1_passed:  '通過一階',
  rejected:       '未通過',
}

// ── 兩校區與所屬系所 ──
// 以系名關鍵字比對（容忍 (專) 等後綴）；先比台北、再比高雄。
export const CAMPUSES = [
  { name: '台北校區', keywords: ['家庭研究', '建築設計', '社會工作', '資訊科技與管理', '食品營養', '餐飲管理'] },
  { name: '高雄校區', keywords: ['休閒產業', '資訊科技與通訊', '資訊管理'] },
]
export const campusOf = (dept = '') => {
  const d = String(dept || '')
  for (const c of CAMPUSES) if (c.keywords.some((k) => d.includes(k))) return c.name
  return '其他'
}

// ── 系所簡稱（多分頁匯出用：Excel 分頁名）──
// 比對採關鍵字 includes（容忍 (專) 後綴）；長關鍵字在前避免誤判。
export const DEPT_SHORT = [
  ['資訊科技與管理', '資訊'],
  ['資訊科技與通訊', '資通'],
  ['資訊管理',       '資管'],
  ['餐飲管理',       '餐管'],
  ['食品營養',       '食保'],
  ['家庭研究',       '家兒'],
  ['社會工作',       '社工'],
  ['建築設計',       '建築'],
  ['休閒產業',       '休產'],
]
export const deptShort = (dept = '') => {
  const d = String(dept || '')
  for (const [k, v] of DEPT_SHORT) if (d.includes(k)) return v
  return (d.replace(/學系\(專\)$/, '') || d).slice(0, 8)
}

// 系所名稱多語對照（vi 越南文 / id 印尼文 / en 英文），供派遣通知訊息使用。
// 關鍵字 includes 比對、長關鍵字在前（與 DEPT_SHORT 同規則），容忍 (專) 等後綴。
export const DEPT_I18N = [
  ['資訊科技與管理', { vi: 'Công nghệ Thông tin và Quản lý',                          id: 'Jurusan Teknologi Informasi dan Manajemen',              en: 'Department of Information Technology and Management' }],
  ['資訊科技與通訊', { vi: 'Công nghệ Thông tin và Truyền thông',                     id: 'Jurusan Teknologi Informasi dan Komunikasi',             en: 'Department of Information Technology and Communication' }],
  ['資訊管理',       { vi: 'Quản lý Thông tin',                                       id: 'Jurusan Manajemen Informasi',                            en: 'Department of Information Management' }],
  ['餐飲管理',       { vi: 'Quản lý Nhà hàng – Khách sạn',                            id: 'Jurusan Manajemen Makanan dan Minuman',                  en: 'Department of Food and Beverage Management' }],
  ['食品營養',       { vi: 'Khoa học Thực phẩm, Dinh dưỡng và Công nghệ Sinh học',    id: 'Jurusan Ilmu Pangan, Gizi, dan Bioteknologi Nutrasetikal', en: 'Department of Food Science, Nutrition, and Nutraceutical Biotechnology' }],
  ['家庭研究',       { vi: 'Nghiên cứu Gia đình và Phát triển Trẻ em',                id: 'Jurusan Studi Keluarga dan Perkembangan Anak',           en: 'Department of Family Studies and Child Development' }],
  ['社會工作',       { vi: 'Công tác Xã hội',                                         id: 'Jurusan Pekerjaan Sosial',                               en: 'Department of Social Work' }],
  ['建築設計',       { vi: 'Kiến trúc',                                               id: 'Jurusan Arsitektur',                                     en: 'Department of Architecture' }],
  ['休閒產業',       { vi: 'Quản lý Dịch vụ và Giải trí',                             id: 'Jurusan Manajemen Industri Rekreasi',                    en: 'Department of Recreation Industry Management' }],
]
// 取得系所外語名稱；查無對照時退回原中文系名
export const deptI18n = (dept = '', lang = 'en') => {
  const d = String(dept || '')
  for (const [k, v] of DEPT_I18N) if (d.includes(k)) return v[lang] || d
  return d
}

// 中文系所全名（學生端落地頁顯示用）；keyword includes 比對、長關鍵字在前、容忍 (專) 後綴。
// 查無對照時退回原字串。需登記全名請在值結尾補「(專)」。
export const DEPT_ZH_FULL = [
  ['資訊科技與管理', '資訊科技與管理學系'],
  ['資訊科技與通訊', '資訊科技與通訊學系'],
  ['資訊管理',       '資訊管理學系'],
  ['餐飲管理',       '餐飲管理學系'],
  ['食品營養',       '食品營養與保健生技學系'],
  ['家庭研究',       '家庭研究與兒童發展學系'],
  ['社會工作',       '社會工作學系'],
  ['建築設計',       '建築設計學系'],
  ['休閒產業',       '休閒產業管理學系'],
]
export const deptZhFull = (dept = '') => {
  for (const [k, v] of DEPT_ZH_FULL) if (String(dept).includes(k)) return v
  return dept
}

// 後台「校區設定」可選的校區（同時也是選系頁的分組順序來源）
export const CAMPUS_OPTIONS = ['台北校區', '高雄校區', '其他']

// 解析某系所屬校區：優先用後台手動設定（overrides: { 系名: 校區 }），
// 未設定者回退關鍵字判斷（campusOf）。overrides 由 department_campus 載入。
export const resolveCampus = (dept = '', overrides = {}) =>
  (overrides && overrides[dept]) || campusOf(dept)

// ── 報名梯次（由帳號第 4 碼判定）──────────────────────────────────────────────
// 帳號格式＝民國年(3) + 梯次(1) + 流水號(4)。
//   11510001 → 115 年「第一梯」、11520001 → 115 年「第二梯（加報）」。
// 第二梯為加報者，最終與第一梯一起放榜、共用同一系所名額；此處僅作「看得出來是哪一梯」的區分，
// 不影響任何評分、預計錄取或正/備取排序邏輯。第 4 碼非 1/2（或無帳號）回傳 0＝未分梯。
export const batchOf = (account) => {
  const d = String(account ?? '')[3]
  return d === '1' ? 1 : d === '2' ? 2 : 0
}
export const BATCHES = [
  { v: 1, label: '第一梯',       short: '一梯', color: '#1e40af', bg: '#dbeafe' },
  { v: 2, label: '第二梯（加報）', short: '二梯', color: '#c2410c', bg: '#ffedd5' },
  { v: 0, label: '未分梯',       short: '未分', color: '#6b7280', bg: '#f3f4f6' },
]
// 取得某帳號的梯次資訊物件（含顏色 / 標籤），查無回退「未分梯」
export const batchInfo = (account) =>
  BATCHES.find((b) => b.v === batchOf(account)) || BATCHES[2]

// ── 入學準備（onboarding）五步驟 ─────────────────────────────────────────────
// step 對應 enroll_progress.step / enroll_settings.step（DB 為 smallint 1~5）；
// key 為程式內識別名；四語標籤供學生端 #/onboard 顯示。
export const ENROLL_STEPS = [
  { step: 1, key: 'confirm',      zh: '資料確認', en: 'Information Confirmation', vi: 'Xác nhận thông tin',            id: 'Konfirmasi Data' },
  { step: 2, key: 'payment',      zh: '繳費',     en: 'Tuition Payment',          vi: 'Đóng học phí',                  id: 'Pembayaran' },
  { step: 3, key: 'visa',         zh: '簽證',     en: 'Visa',                     vi: 'Thị thực (Visa)',               id: 'Visa' },
  { step: 4, key: 'arrival',      zh: '來台時間', en: 'Arrival Date',             vi: 'Thời gian đến Đài Loan',        id: 'Waktu Kedatangan' },
  { step: 5, key: 'predeparture', zh: '行前通知', en: 'Pre-departure Notice',     vi: 'Thông báo trước khởi hành',     id: 'Informasi Pra-keberangkatan' },
]

// ── 入學準備 · 步驟1「資料確認」表單欄位 ──────────────────────────────────────
// prefill 組：從後端帶入（applications / enroll_students）；fill 組：庫裡沒有、由學生填寫。
// type: 'text'（預設）/ 'select'（帶 options）/ 'date'（<input type=date>）。
// select 的 options：{ v: 存入 DB 的值（中文）, zh/en/vi/id: 顯示文字 }；
// 顯示規則＝zh 純中文、其他語言「中文(譯文)」。req: true 為必填（前端標 * 並擋送出）。
// 特例（OnboardApp 以 key 判斷）：
//   name 唯讀顯示（readonly）；passport_number 下方帶「尚未辦理護照」checkbox（勾選→清空+disable+免必填，
//   data.no_passport=true）；nationality 選「其他」→ 顯示自填框存 nationality_other。
export const ONBOARD_STEP1_FIELDS = {
  prefill: [
    { key: 'name',            zh: '中文姓名',   en: 'Chinese Name',              vi: 'Họ tên (chữ Hán)',            id: 'Nama Mandarin',              req: true, readonly: true },
    { key: 'name_english',    zh: '英文姓名（同護照）', en: 'English Name (as in passport)', vi: 'Họ tên tiếng Anh (theo hộ chiếu)', id: 'Nama (sesuai paspor)', req: true },
    { key: 'gender',          zh: '性別',       en: 'Gender',                    vi: 'Giới tính',                   id: 'Jenis Kelamin',              req: true, type: 'select', options: [
      { v: '男', zh: '男', en: '男 (Male)',   vi: '男 (Nam)', id: '男 (Laki-laki)' },
      { v: '女', zh: '女', en: '女 (Female)', vi: '女 (Nữ)',  id: '女 (Perempuan)' },
    ] },
    { key: 'birth_date',      zh: '出生日期',   en: 'Date of Birth',             vi: 'Ngày sinh',                   id: 'Tanggal Lahir',              req: true, type: 'date' },
    { key: 'nationality',     zh: '國籍',       en: 'Nationality',               vi: 'Quốc tịch',                   id: 'Kewarganegaraan',            req: true, type: 'select', options: [
      { v: '越南',     zh: '越南',     en: '越南 (Vietnam)',      vi: '越南 (Việt Nam)',     id: '越南 (Vietnam)' },
      { v: '印尼',     zh: '印尼',     en: '印尼 (Indonesia)',    vi: '印尼 (Indonesia)',    id: '印尼 (Indonesia)' },
      { v: '泰國',     zh: '泰國',     en: '泰國 (Thailand)',     vi: '泰國 (Thái Lan)',     id: '泰國 (Thailand)' },
      { v: '巴基斯坦', zh: '巴基斯坦', en: '巴基斯坦 (Pakistan)', vi: '巴基斯坦 (Pakistan)', id: '巴基斯坦 (Pakistan)' },
      { v: '其他',     zh: '其他',     en: '其他 (Other)',        vi: '其他 (Khác)',         id: '其他 (Lainnya)' },
    ] },
    { key: 'passport_number', zh: '護照號碼',   en: 'Passport No.',              vi: 'Số hộ chiếu',                 id: 'Nomor Paspor',               req: true },
    { key: 'phone',           zh: '學生手機',   en: 'Mobile Phone',              vi: 'Số điện thoại di động',       id: 'Nomor HP',                   req: true },
    { key: 'email',           zh: 'E-mail',     en: 'E-mail',                    vi: 'E-mail',                      id: 'E-mail',                     req: true },
  ],
  fill: [
    { key: 'national_id',     zh: '本國身分證號（母國，非台灣）', en: 'National ID (home country)', vi: 'Số CMND/CCCD (nước bạn)',  id: 'Nomor KTP (negara asal)' },
    { key: 'guardian_name',   zh: '監護人姓名', en: 'Guardian Name',             vi: 'Họ tên người giám hộ',        id: 'Nama Wali',                  req: true },
    { key: 'guardian_phone',  zh: '家長手機',   en: "Guardian's Phone",          vi: 'SĐT phụ huynh',               id: 'Nomor HP Orang Tua',         req: true },
    { key: 'zip_mail',        zh: '通訊郵遞區號', en: 'Mailing Zip Code',        vi: 'Mã bưu điện (liên lạc)',      id: 'Kode Pos (surat)',           req: true },
    { key: 'addr_mail',       zh: '通訊地址',   en: 'Mailing Address',           vi: 'Địa chỉ liên lạc',            id: 'Alamat Surat-menyurat',      req: true },
    { key: 'tel',             zh: '市話（選填）', en: 'Telephone (optional)',    vi: 'Điện thoại bàn (tùy chọn)',   id: 'Telepon Rumah (opsional)' },
    { key: 'zip_reg',         zh: '戶籍郵遞區號', en: 'Registered Zip Code',     vi: 'Mã bưu điện (hộ khẩu)',       id: 'Kode Pos (domisili)',        req: true },
    { key: 'addr_reg',        zh: '戶籍地址',   en: 'Registered Address',        vi: 'Địa chỉ hộ khẩu',             id: 'Alamat Domisili',            req: true },
    { key: 'high_school',     zh: '畢業學校',   en: 'School Graduated',          vi: 'Trường tốt nghiệp',           id: 'Sekolah Asal',               req: true },
    { key: 'graduation_year', zh: '畢業年度',   en: 'Year of Graduation',        vi: 'Năm tốt nghiệp',              id: 'Tahun Lulus',                req: true },
  ],
}

// ── 入學準備 · 通知信（OnboardMailComposer 組信用模板）────────────────────────
// 變數用 {{變數}}（比照 mailTemplates.js 慣例）：
//   {{name}} 中文姓名（zh 稱呼）、{{name_english}} 英文姓名（en/vi/id 稱呼，空值 fallback 中文名）、
//   {{dept_seg}} 錄取學系＋校區句段（department/campus 空值時整段省略，campus 空時只略校區括號）、
//   {{result_seg}} 榜單連結句（result_link 空值省略）、{{link}} 學生 onboard 專屬連結（#/onboard?t=token）、
//   {{deadline}} 該梯該步截止日（只日期；空值時整句改「請儘速完成」語氣）、
//   {{contact_name}}/{{contact_email}}/{{contact_phone}} 承辦窗口（依校區；電話空值省略）。
// tier：first 首次通知 / second 二次提醒 / final 最後提醒——同一 body，只換開頭 tier_intro 一段＋主旨前綴。
// 簽名檔比照 S4 慣例：每語言硬編。本階段僅步驟①（放榜恭喜＋資料確認），②~⑥ 後續補。

// 通知信語言：越南→vi、印尼→id、台/中→zh、其餘→en（與學生端 langOf 同規則）
export const onboardMailLang = (nationality) => {
  const s = String(nationality || '').toLowerCase()
  if (s.includes('越南') || s.includes('viet')) return 'vi'
  if (s.includes('印尼') || s.includes('indonesia')) return 'id'
  if (s.includes('台') || s.includes('中') || s.includes('taiwan')) return 'zh'
  return 'en'
}

export const ONBOARD_MAIL_S1 = {
  subject: {
    zh: '【實踐大學國際專修部】恭喜錄取・入學準備通知',
    en: '[Shih Chien University IFP] Congratulations on Your Admission — Enrollment Preparation Notice',
    vi: '[Đại học Thực Tiễn - IFP] Chúc mừng trúng tuyển — Thông báo chuẩn bị nhập học',
    id: '[Universitas Shih Chien - IFP] Selamat atas Kelulusan — Pemberitahuan Persiapan Pendaftaran',
  },
  // second/final 加在主旨最前（first 不加）
  subjectPrefix: { second: '【提醒 Reminder】', final: '【最後提醒 Final Reminder】' },
  // second/final 加在信件最開頭的提醒段（first 無）
  tierIntro: {
    second: {
      zh: '【提醒】您尚未完成「資料確認」，煩請儘快處理。以下為完整通知：',
      en: '[Reminder] You have not yet completed the "Data Confirmation" step. Please complete it as soon as possible. Full notice below:',
      vi: '[Nhắc nhở] Bạn chưa hoàn thành bước "Xác nhận thông tin". Vui lòng hoàn thành sớm nhất có thể. Nội dung đầy đủ bên dưới:',
      id: '[Pengingat] Anda belum menyelesaikan langkah "Konfirmasi Data". Mohon segera diselesaikan. Berikut pemberitahuan lengkapnya:',
    },
    final: {
      zh: '【最後提醒】這是「資料確認」的最後提醒，逾期恐影響入學通知寄送，請務必於期限前完成。',
      en: '[Final Reminder] This is the final reminder for "Data Confirmation." Missing the deadline may delay the delivery of your admission notice. Please complete it without delay.',
      vi: '[Nhắc nhở cuối cùng] Đây là lời nhắc cuối cùng cho bước "Xác nhận thông tin". Quá hạn có thể ảnh hưởng đến việc gửi giấy báo nhập học, vui lòng hoàn thành trước thời hạn.',
      id: '[Pengingat Terakhir] Ini pengingat terakhir untuk "Konfirmasi Data." Melewati batas waktu dapat menunda pengiriman surat pemberitahuan Anda. Mohon selesaikan sebelum batas waktu.',
    },
  },
  // 段落制：buildOnboardMail 依資料有無挑段、以空行串接。
  // confirmDeadline / confirmAsap 二擇一（deadline 有無）；{{dept_seg}}/{{result_seg}} 空值時為空字串。
  paras: {
    zh: {
      greeting: '親愛的 {{name}} 同學，您好：',
      congrats: '恭喜您錄取實踐大學國際專修部（1+4）{{dept_seg}}。{{result_seg}}',
      listNote: '若您收到本信，但目前尚未在放榜名單上看到自己的名字，請不用擔心：因作業程序的關係，您的榜單將於後續批次公告，預計於 7 月 24 日公布。',
      letter: '首先向您說明錄取通知單事宜：目前紙本錄取通知單仍在準備中、尚未寄發，敬請耐心等候；電子檔完成後將提供下載。紙本通知單將依您接下來在系統中填寫的地址寄出，因此請務必確認接下來填寫的個人資料與地址正確無誤，以免影響收件。',
      confirmDeadline: '為儘速為您寄出紙本入學通知，請於 {{deadline}} 前完成本次「資料確認」。請點選以下專屬連結登入，核對並確認您的個人資料：\n{{link}}',
      confirmAsap: '為儘速為您寄出紙本入學通知，請儘速完成本次「資料確認」。請點選以下專屬連結登入，核對並確認您的個人資料：\n{{link}}',
      contact: '如有任何問題，歡迎聯繫承辦人 {{contact_name}}（{{contact_email}}{{contact_phone}}）。',
      signoff: '實踐大學 國際事務處 敬啟',
    },
    en: {
      greeting: 'Dear {{name_english}},',
      congrats: 'Congratulations on your admission to the International Foundation Program (1+4) at Shih Chien University{{dept_seg}}.{{result_seg}}',
      listNote: 'If you have received this email but do not yet see your name on the admission list, please do not worry: due to administrative procedures, your result will be announced in a later batch, expected on July 24.',
      letter: 'First, regarding your admission letter: the printed admission letter is still being prepared and has not yet been sent — thank you for your patience. An electronic copy will be provided for download once ready. The printed letter will be mailed to the address you enter in the system in the next step, so please make sure the personal information and address you provide are correct to avoid any delivery problems.',
      confirmDeadline: 'To help us send your printed admission notice as soon as possible, please complete this "Data Confirmation" step before {{deadline}}. Please log in via your personal link below to review and confirm your information:\n{{link}}',
      confirmAsap: 'To help us send your printed admission notice as soon as possible, please complete this "Data Confirmation" step at your earliest convenience. Please log in via your personal link below to review and confirm your information:\n{{link}}',
      contact: 'If you have any questions, please contact {{contact_name}} ({{contact_email}}{{contact_phone}}).',
      signoff: 'Office of International Affairs, Shih Chien University',
    },
    vi: {
      greeting: '{{name_english}} thân mến,',
      congrats: 'Chúc mừng bạn đã trúng tuyển Chương trình Dự bị Quốc tế (1+4) của Đại học Thực Tiễn{{dept_seg}}.{{result_seg}}',
      listNote: 'Nếu bạn nhận được email này nhưng hiện chưa thấy tên mình trong danh sách trúng tuyển, xin đừng lo lắng: do quy trình xử lý, kết quả của bạn sẽ được công bố trong đợt sau, dự kiến vào ngày 24 tháng 7.',
      letter: 'Trước tiên, về giấy báo trúng tuyển: giấy báo bản giấy hiện vẫn đang được chuẩn bị và chưa được gửi đi, mong bạn kiên nhẫn chờ đợi. Bản điện tử sẽ được cung cấp để tải xuống khi hoàn tất. Giấy báo bản giấy sẽ được gửi theo địa chỉ bạn điền trong hệ thống ở bước tiếp theo, vì vậy vui lòng đảm bảo thông tin cá nhân và địa chỉ bạn nhập là chính xác để tránh ảnh hưởng đến việc nhận thư.',
      confirmDeadline: 'Để nhà trường gửi giấy báo nhập học bản giấy sớm nhất, vui lòng hoàn thành bước "Xác nhận thông tin" này trước ngày {{deadline}}. Vui lòng nhấp vào đường dẫn riêng bên dưới để đăng nhập, kiểm tra và xác nhận thông tin của bạn:\n{{link}}',
      confirmAsap: 'Để nhà trường gửi giấy báo nhập học bản giấy sớm nhất, vui lòng hoàn thành bước "Xác nhận thông tin" này trong thời gian sớm nhất. Vui lòng nhấp vào đường dẫn riêng bên dưới để đăng nhập, kiểm tra và xác nhận thông tin của bạn:\n{{link}}',
      contact: 'Nếu có thắc mắc, vui lòng liên hệ cán bộ phụ trách {{contact_name}} ({{contact_email}}{{contact_phone}}).',
      signoff: 'Phòng Sự vụ Quốc tế, Đại học Thực Tiễn',
    },
    id: {
      greeting: 'Yth. {{name_english}},',
      congrats: 'Selamat, Anda diterima di International Foundation Program (1+4) Universitas Shih Chien{{dept_seg}}.{{result_seg}}',
      listNote: 'Jika Anda menerima email ini tetapi nama Anda belum muncul dalam daftar kelulusan, jangan khawatir: karena prosedur administrasi, hasil Anda akan diumumkan pada gelombang berikutnya, diperkirakan pada 24 Juli.',
      letter: 'Pertama, mengenai surat kelulusan: surat kelulusan cetak masih dalam proses persiapan dan belum dikirim, mohon kesabarannya. Salinan elektronik akan tersedia untuk diunduh setelah siap. Surat cetak akan dikirim ke alamat yang Anda isi dalam sistem pada langkah berikutnya, jadi pastikan data pribadi dan alamat yang Anda masukkan sudah benar agar tidak mengganggu penerimaan surat.',
      confirmDeadline: 'Agar kami dapat mengirimkan surat pemberitahuan cetak secepatnya, mohon selesaikan langkah "Konfirmasi Data" ini sebelum {{deadline}}. Silakan masuk melalui tautan pribadi Anda di bawah ini untuk memeriksa dan mengonfirmasi data Anda:\n{{link}}',
      confirmAsap: 'Agar kami dapat mengirimkan surat pemberitahuan cetak secepatnya, mohon segera selesaikan langkah "Konfirmasi Data" ini. Silakan masuk melalui tautan pribadi Anda di bawah ini untuk memeriksa dan mengonfirmasi data Anda:\n{{link}}',
      contact: 'Jika ada pertanyaan, silakan hubungi petugas {{contact_name}} ({{contact_email}}{{contact_phone}}).',
      signoff: 'Kantor Urusan Internasional, Universitas Shih Chien',
    },
  },
}

// 步驟②「繳費」通知信（四語各自單語；雙語整封由 OnboardMailComposer 縫合＝外語在前、中文在後）。
// 段落順序：greeting → opened(含 {{link}}) → notice(注意事項1–4，第4條含承辦窗口) → deadlineLine|deadlineAsap → [custom] → signoff。
// 注意事項採「先寫死 constants」策略（同步驟①）；金額不在信中（在專屬繳費單上）。
export const ONBOARD_MAIL_S2 = {
  subject: {
    zh: '【實踐大學國際專修部】繳費通知',
    en: '[Shih Chien University IFP] Tuition Payment Notice',
    vi: '[Đại học Thực Tiễn - IFP] Thông báo nộp học phí',
    id: '[Universitas Shih Chien - IFP] Pemberitahuan Pembayaran',
  },
  subjectPrefix: { second: '【提醒 Reminder】', final: '【最後提醒 Final Reminder】' },
  tierIntro: {
    second: {
      zh: '【提醒】您尚未完成「繳費」，煩請儘快處理。以下為完整通知：',
      en: '[Reminder] You have not yet completed the "Payment" step. Please complete it as soon as possible. Full notice below:',
      vi: '[Nhắc nhở] Bạn chưa hoàn thành bước "Nộp học phí". Vui lòng hoàn thành sớm nhất có thể. Nội dung đầy đủ bên dưới:',
      id: '[Pengingat] Anda belum menyelesaikan langkah "Pembayaran". Mohon segera diselesaikan. Berikut pemberitahuan lengkapnya:',
    },
    final: {
      zh: '【最後提醒】這是「繳費」的最後提醒，逾期將暫停辦理簽證並恐影響入學，請務必於期限前完成。',
      en: '[Final Reminder] This is the final reminder for "Payment." Missing the deadline will suspend your visa processing and may affect your enrollment. Please complete it without delay.',
      vi: '[Nhắc nhở cuối cùng] Đây là lời nhắc cuối cùng cho bước "Nộp học phí". Quá hạn sẽ khiến việc xử lý thị thực bị tạm dừng và có thể ảnh hưởng đến việc nhập học, vui lòng hoàn thành trước thời hạn.',
      id: '[Pengingat Terakhir] Ini pengingat terakhir untuk "Pembayaran." Melewati batas waktu akan menghentikan proses visa Anda dan dapat memengaruhi pendaftaran. Mohon selesaikan sebelum batas waktu.',
    },
  },
  paras: {
    zh: {
      greeting: '親愛的 {{name}} 同學，您好：',
      opened: '您的入學繳費作業已開通。請點選以下專屬連結登入，於「繳費」步驟下載您的專屬繳費單，並依單上金額與方式完成繳費；繳費後請回到頁面上傳繳費證明。\n{{link}}',
      notice: '繳費注意事項：\n1. 請依繳費單上的金額與方式完成繳費，繳費後回到本頁上傳繳費證明。\n2. 請務必留意繳費期限；若未如期完成繳費，將暫停辦理您的簽證作業，恐影響入學。\n3. 若已完成繳費，但於開學前選擇退學，或因簽證等不可抗力因素無法如期來校就讀，學校將依規定辦理退費至您指定之帳戶。\n4. 如有任何問題，歡迎聯繫承辦人 {{contact_name}}（{{contact_email}}{{contact_phone}}）。',
      deadlineLine: '請於 {{deadline}} 前完成繳費。',
      deadlineAsap: '請儘速完成繳費。',
      signoff: '實踐大學 國際事務處 敬啟',
    },
    en: {
      greeting: 'Dear {{name_english}},',
      opened: 'Your enrollment payment process is now open. Please log in via your personal link below, download your payment slip under the "Payment" step, and complete the payment according to the amount and method shown on the slip. After paying, please return to the page to upload your proof of payment.\n{{link}}',
      notice: 'Payment notes:\n1. Please pay according to the amount and method shown on your payment slip, then return to this page to upload your proof of payment.\n2. Please be mindful of the payment deadline. If payment is not completed on time, your visa processing will be suspended, which may affect your enrollment.\n3. If you complete the payment but choose to withdraw before the semester begins, or cannot arrive on time due to force majeure such as visa issues, the university will process a refund to your designated account in accordance with the regulations.\n4. If you have any questions, please contact {{contact_name}} ({{contact_email}}{{contact_phone}}).',
      deadlineLine: 'Please complete your payment before {{deadline}}.',
      deadlineAsap: 'Please complete your payment as soon as possible.',
      signoff: 'Office of International Affairs, Shih Chien University',
    },
    vi: {
      greeting: '{{name_english}} thân mến,',
      opened: 'Quy trình nộp học phí nhập học của bạn đã được mở. Vui lòng nhấp vào đường dẫn riêng bên dưới để đăng nhập, tải phiếu nộp học phí riêng của bạn ở bước "Nộp học phí", và hoàn thành việc nộp theo số tiền và phương thức ghi trên phiếu. Sau khi nộp, vui lòng quay lại trang để tải lên chứng từ đã nộp.\n{{link}}',
      notice: 'Lưu ý khi nộp học phí:\n1. Vui lòng nộp theo số tiền và phương thức ghi trên phiếu nộp học phí, sau đó quay lại trang này để tải lên chứng từ đã nộp.\n2. Vui lòng lưu ý thời hạn nộp. Nếu không nộp đúng hạn, việc xử lý thị thực của bạn sẽ bị tạm dừng, có thể ảnh hưởng đến việc nhập học.\n3. Nếu bạn đã nộp học phí nhưng chọn thôi học trước khi bắt đầu học kỳ, hoặc không thể đến trường đúng hạn vì lý do bất khả kháng như vấn đề thị thực, nhà trường sẽ hoàn phí về tài khoản bạn chỉ định theo quy định.\n4. Nếu có thắc mắc, vui lòng liên hệ cán bộ phụ trách {{contact_name}} ({{contact_email}}{{contact_phone}}).',
      deadlineLine: 'Vui lòng hoàn thành việc nộp học phí trước ngày {{deadline}}.',
      deadlineAsap: 'Vui lòng hoàn thành việc nộp học phí trong thời gian sớm nhất.',
      signoff: 'Phòng Sự vụ Quốc tế, Đại học Thực Tiễn',
    },
    id: {
      greeting: 'Yth. {{name_english}},',
      opened: 'Proses pembayaran pendaftaran Anda kini telah dibuka. Silakan masuk melalui tautan pribadi Anda di bawah ini, unduh slip pembayaran Anda pada langkah "Pembayaran", dan selesaikan pembayaran sesuai jumlah dan metode yang tertera pada slip. Setelah membayar, kembalilah ke halaman untuk mengunggah bukti pembayaran Anda.\n{{link}}',
      notice: 'Catatan pembayaran:\n1. Silakan bayar sesuai jumlah dan metode yang tertera pada slip pembayaran Anda, lalu kembali ke halaman ini untuk mengunggah bukti pembayaran.\n2. Mohon perhatikan batas waktu pembayaran. Jika pembayaran tidak diselesaikan tepat waktu, proses visa Anda akan dihentikan, yang dapat memengaruhi pendaftaran Anda.\n3. Jika Anda telah membayar tetapi memutuskan mengundurkan diri sebelum semester dimulai, atau tidak dapat tiba tepat waktu karena keadaan kahar seperti masalah visa, universitas akan memproses pengembalian dana ke rekening yang Anda tentukan sesuai peraturan.\n4. Jika ada pertanyaan, silakan hubungi petugas {{contact_name}} ({{contact_email}}{{contact_phone}}).',
      deadlineLine: 'Mohon selesaikan pembayaran Anda sebelum {{deadline}}.',
      deadlineAsap: 'Mohon selesaikan pembayaran Anda sesegera mungkin.',
      signoff: 'Kantor Urusan Internasional, Universitas Shih Chien',
    },
  },
}

// 步驟①信件的放榜名單網址（全校區共用、固定，不走 enroll_config）
export const ONBOARD_RESULT_LINK = 'https://recruit.usc.edu.tw/?p=8042'

// 信件內文的校區名稱四語對照（與 OnboardApp / AdmitMailComposer 的 CAMPUS_I18N 同定稿；
// 此處為句中片語，vi/id 用小寫開頭）
const ONBOARD_CAMPUS_I18N = {
  台北: { en: 'Taipei Campus', vi: 'cơ sở Đài Bắc', id: 'kampus Taipei' },
  高雄: { en: 'Kaohsiung Campus', vi: 'cơ sở Cao Hùng', id: 'kampus Kaohsiung' },
}

// 組出步驟①②通知信 { subject, body }；查無模板（step 非 1/2）回 null。
// data.department / data.campus 傳原始值即可：系所名依語言解析（zh→deptZhFull、外語→DEPT_I18N 定稿，
// 查無對照退回原字串）；校區依 ONBOARD_CAMPUS_I18N 翻譯。
// 空值省略規則：
//   department 空 → 整個「錄取學系為…」句段省略（campus 附屬其中）；campus 空 → 只略「（…校區）」；
//   result_link 空 → 榜單句省略；deadline 空 → 改用 confirmAsap（請儘速完成）；
//   contact_phone 空 → 電話句段省略；name_english 空 → fallback 中文姓名。
// data.custom（自訂段落 hook，日後要加回時用）有值時插在簽名檔前一段。
export function buildOnboardMail({ step = 1, tier = 'first', lang = 'zh', data = {} }) {
  const stepN = Number(step)
  const t = stepN === 1 ? ONBOARD_MAIL_S1 : stepN === 2 ? ONBOARD_MAIL_S2 : null
  if (!t) return null
  const L = ['zh', 'en', 'vi', 'id'].includes(lang) ? lang : 'en'
  const p = t.paras[L]
  const hasDeadline = !!String(data.deadline || '').trim()
  const hasContact = !!(String(data.contact_name || '').trim() || String(data.contact_email || '').trim())

  const deptRaw = String(data.department || '').trim()
  const dept = deptRaw ? (L === 'zh' ? deptZhFull(deptRaw) : deptI18n(deptRaw, L)) : ''
  const campus = String(data.campus || '').trim()
  const rl = String(data.result_link || '').trim()
  const campusName = campus ? (ONBOARD_CAMPUS_I18N[campus]?.[L] || campus) : ''
  const campusSeg = campus
    ? (L === 'zh' ? `（${campus}校區）` : ` (${campusName})`)
    : ''
  const deptSeg = dept
    ? { zh: `，錄取學系為 ${dept}${campusSeg}`, en: `, in the ${dept}${campusSeg}`,
        vi: `, ngành ${dept}${campusSeg}`, id: `, pada ${dept}${campusSeg}` }[L]
    : ''
  const resultSeg = rl
    ? { zh: `完整放榜名單請見：${rl}`, en: ` The full admission list is available here: ${rl}`,
        vi: ` Danh sách trúng tuyển đầy đủ có tại đây: ${rl}`, id: ` Daftar kelulusan lengkap dapat dilihat di sini: ${rl}` }[L]
    : ''

  const parts = []
  const intro = t.tierIntro[tier]?.[L]
  if (intro) parts.push(intro)
  if (stepN === 1) {
    parts.push(p.greeting, p.congrats, p.listNote, p.letter)
    parts.push(hasDeadline ? p.confirmDeadline : p.confirmAsap)
    if (hasContact) parts.push(p.contact)
  } else {
    parts.push(p.greeting, p.opened, p.notice)
    parts.push(hasDeadline ? p.deadlineLine : p.deadlineAsap)
  }
  if (String(data.custom || '').trim()) parts.push(String(data.custom).trim())
  parts.push(p.signoff)

  const phone = String(data.contact_phone || '').trim()
  const d = {
    ...data,
    name_english: String(data.name_english || data.name || '').trim(),
    dept_seg: deptSeg, result_seg: resultSeg,
    contact_phone: phone ? (L === 'zh' ? `、電話 ${phone}` : L === 'vi' ? `, ĐT: ${phone}` : `, Tel: ${phone}`) : '',
  }
  const fill = (txt) => Object.entries(d).reduce(
    (out, [k, v]) => out.split(`{{${k}}}`).join(v == null ? '' : String(v)), String(txt))
  return {
    subject: fill((t.subjectPrefix[tier] || '') + (t.subject[L] || t.subject.zh)),
    body: fill(parts.join('\n\n')),
  }
}

// ── 入學準備 · 步驟4「來台時間」表單欄位 ──────────────────────────────────────
// type: 'date' / 'time' 走 <input type>；'bool' 用是/否選項；其餘純文字。req 為必填。
export const ONBOARD_STEP4_FIELDS = [
  { key: 'flight_no',    zh: '航班編號',       en: 'Flight No.',           vi: 'Số hiệu chuyến bay',    id: 'Nomor Penerbangan',        req: true },
  { key: 'arrival_date', zh: '抵台日期',       en: 'Arrival Date',         vi: 'Ngày đến Đài Loan',     id: 'Tanggal Tiba',   type: 'date', req: true },
  { key: 'arrival_time', zh: '抵台時間',       en: 'Arrival Time',         vi: 'Giờ đến',               id: 'Waktu Tiba',     type: 'time', req: true },
  { key: 'need_pickup',  zh: '是否需要接機',   en: 'Need airport pickup?', vi: 'Cần đón tại sân bay?',  id: 'Perlu penjemputan?', type: 'bool', req: true },
  { key: 'note',         zh: '備註（選填）',   en: 'Notes (optional)',     vi: 'Ghi chú (tùy chọn)',    id: 'Catatan (opsional)' },
]
