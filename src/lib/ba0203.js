import * as XLSX from 'xlsx'

// BA0203「外生」新生資料匯入：49 欄（A–AW）版面，只填學生自填的 20 欄，其餘留空。
// 校務系統以「欄位位置」匯入，故必須保留完整 49 欄定位；header 用範本 Row6 欄位定義，資料自第 2 列起。
// 學號 / 系所代碼 / 統一證號(居留證) / 國籍代碼等（註冊後才有、或需代碼表）一律留空，承辦後補。
// 三個判斷（與 Andy 確認）：O 身份證號＝母國 national_id、Q 統一證號留空、學生 email 填入 T E-mail(2)。

// 49 欄 header（index 0=A … 48=AW）。空字串＝範本該欄無定義（AJ）。
const HEADERS = [
  '流水號', '學制代碼', '學號', '學系', '入學系所代碼', '入學系所組別', '大考心系系組代碼', '班級', '班級代碼', '入學年級',
  '學生姓名', '英文姓名', '性別', '出生日期', '身份證號', '護照號碼', '統一證號(居留證)', '學生手機', 'E-mail', 'E-mail(2)',
  '入學身份', '入學類別', '入學名額別', '學生身分', '特殊身分', '畢業學歷', '畢業學校代號', '畢業學校名稱', '監護人姓名', '家長手機',
  '通訊地郵遞區號', '通訊地址', '電話', '戶籍地郵遞區號', '戶籍地址', '', '聯招會身份別', '畢業年度', '新生入學年度', '新生入學學期',
  '新生入學日期', '國籍', '國(族)籍群組', '轉學生', '陸生身份證號', '校際學校學號', '大考中心畢業學歷', 'cvt_errflag', 'cvt_errrsn',
]

const s = (v) => (v == null ? '' : String(v).trim())
const rocYmd = (v) => {
  const m = s(v).match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/)
  if (!m) return ''
  const roc = Number(m[1]) - 1911
  if (roc <= 0) return ''
  return `${String(roc).padStart(3, '0')}${m[2].padStart(2, '0')}${m[3].padStart(2, '0')}`
}
const rocYear = (v) => {
  const n = s(v).match(/\d{3,4}/)
  if (!n) return ''
  const y = Number(n[0])
  return String(y > 1911 ? y - 1911 : y)
}
const genderCode = (v) => (s(v) === '男' ? '1' : s(v) === '女' ? '2' : '')

function rowFor(r) {
  const d = r.step1 || {}
  const nat = s(d.nationality) === '其他' ? s(d.nationality_other) : s(d.nationality)
  const a = new Array(49).fill('')
  a[3]  = s(r.department)             // D  學系
  a[10] = s(d.name)                   // K  學生姓名
  a[11] = s(d.name_english)           // L  英文姓名
  a[12] = genderCode(d.gender)        // M  性別（男1/女2）
  a[13] = rocYmd(d.birth_date)        // N  出生日期（民國 YYYMMDD）
  a[14] = s(d.national_id)            // O  身份證號（母國）
  a[15] = s(d.passport_number)        // P  護照號碼
  a[17] = s(d.phone)                  // R  學生手機
  a[19] = s(d.email)                  // T  E-mail(2)
  a[27] = s(d.high_school)            // AB 畢業學校名稱
  a[28] = s(d.guardian_name)          // AC 監護人姓名
  a[29] = s(d.guardian_phone)         // AD 家長手機
  a[30] = s(d.zip_mail)               // AE 通訊地郵遞區號
  a[31] = s(d.addr_mail)              // AF 通訊地址
  a[32] = s(d.tel)                    // AG 電話（市話，缺則空）
  a[33] = s(d.zip_reg)                // AH 戶籍地郵遞區號
  a[34] = s(d.addr_reg)               // AI 戶籍地址
  a[37] = rocYear(d.graduation_year)  // AL 畢業年度（民國年）
  a[41] = nat                         // AP 國籍（其他→nationality_other）
  return a
}

export function exportBA0203(step1Rows, filename) {
  const aoa = [HEADERS, ...step1Rows.map(rowFor)]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '外生')
  XLSX.writeFile(wb, filename)
}
