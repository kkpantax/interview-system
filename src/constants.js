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

export const QUESTIONS = [
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

// 第一階段面試中心選項
export const CENTERS = ['台北中心', '台中中心', '高雄中心', '其他']

// 申請狀態流轉
export const STATUS = {
  pending:        '待面試',
  stage1_passed:  '通過一階',
  rejected:       '未通過',
}
