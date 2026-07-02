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
// prefill 組：從 applications 帶入（學生可編修）；fill 組：庫裡沒有、由學生填寫。
// req: true 為必填（前端標 * 並擋送出）。四語標籤比照 DEPT_I18N 風格。
export const ONBOARD_STEP1_FIELDS = {
  prefill: [
    { key: 'name',            zh: '中文姓名',   en: 'Chinese Name',              vi: 'Họ tên (chữ Hán)',            id: 'Nama Mandarin',              req: true },
    { key: 'gender',          zh: '性別',       en: 'Gender',                    vi: 'Giới tính',                   id: 'Jenis Kelamin',              req: true },
    { key: 'birth_date',      zh: '出生日期',   en: 'Date of Birth',             vi: 'Ngày sinh',                   id: 'Tanggal Lahir',              req: true },
    { key: 'passport_number', zh: '護照號碼',   en: 'Passport No.',              vi: 'Số hộ chiếu',                 id: 'Nomor Paspor',               req: true },
    { key: 'nationality',     zh: '國籍',       en: 'Nationality',               vi: 'Quốc tịch',                   id: 'Kewarganegaraan',            req: true },
  ],
  fill: [
    { key: 'name_en',         zh: '英文姓名（同護照）', en: 'English Name (as in passport)', vi: 'Họ tên tiếng Anh (theo hộ chiếu)', id: 'Nama (sesuai paspor)', req: true },
    { key: 'arc_no',          zh: '居留證號',   en: 'ARC No.',                   vi: 'Số thẻ cư trú (ARC)',         id: 'Nomor ARC' },
    { key: 'phone',           zh: '學生手機',   en: 'Mobile Phone',              vi: 'Số điện thoại di động',       id: 'Nomor HP',                   req: true },
    { key: 'email',           zh: 'E-mail',     en: 'E-mail',                    vi: 'E-mail',                      id: 'E-mail',                     req: true },
    { key: 'email2',          zh: 'E-mail（備用）', en: 'E-mail (secondary)',    vi: 'E-mail (dự phòng)',           id: 'E-mail (cadangan)' },
    { key: 'zip_mail',        zh: '通訊郵遞區號', en: 'Mailing Zip Code',        vi: 'Mã bưu điện (liên lạc)',      id: 'Kode Pos (surat)' },
    { key: 'addr_mail',       zh: '通訊地址',   en: 'Mailing Address',           vi: 'Địa chỉ liên lạc',            id: 'Alamat Surat-menyurat',      req: true },
    { key: 'zip_reg',         zh: '戶籍郵遞區號', en: 'Registered Zip Code',     vi: 'Mã bưu điện (hộ khẩu)',       id: 'Kode Pos (domisili)' },
    { key: 'addr_reg',        zh: '戶籍地址',   en: 'Registered Address',        vi: 'Địa chỉ hộ khẩu',             id: 'Alamat Domisili' },
    { key: 'tel',             zh: '市話',       en: 'Telephone',                 vi: 'Điện thoại bàn',              id: 'Telepon Rumah' },
    { key: 'guardian_name',   zh: '監護人姓名', en: 'Guardian Name',             vi: 'Họ tên người giám hộ',        id: 'Nama Wali',                  req: true },
    { key: 'guardian_phone',  zh: '家長手機',   en: "Guardian's Phone",          vi: 'SĐT phụ huynh',               id: 'Nomor HP Orang Tua',         req: true },
    { key: 'school',          zh: '畢業學校',   en: 'School Graduated',          vi: 'Trường tốt nghiệp',           id: 'Sekolah Asal',               req: true },
    { key: 'grad_year',       zh: '畢業年度',   en: 'Year of Graduation',        vi: 'Năm tốt nghiệp',              id: 'Tahun Lulus',                req: true },
  ],
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
