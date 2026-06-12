import { useState } from 'react'
import { Modal, Btn } from './UI'

// 🌐 翻譯工讀生須知：第二階段評分頁供翻譯工讀生查看的 SOP。
// - 中文／越南文切換（多數工讀生為越南籍），語言選擇記在 localStorage。
// - 「本系視訊連結」「影片上傳資料夾」從 info_links 動態帶入（後台「連結管理」維護），
//   Meet 連結比對規則與 CheckinApp.meetUrlOf 相同（departments 逗號分隔關鍵字 includes 比對）。
//   Google 帳號（oia0X@g2.usc.edu.tw）請直接寫在該 Meet 連結的 label 內即可一併顯示。

const LANG_KEY = 'translator_sop_lang'
const readLang = () => {
  try { return localStorage.getItem(LANG_KEY) === 'vi' ? 'vi' : 'zh' } catch { return 'zh' }
}

// SOP 內容（zh / vi 成對維護）
const SECTIONS = [
  {
    title: { zh: '一、面試開始前', vi: 'I. Trước khi phỏng vấn' },
    steps: [
      { zh: '確認 Google 帳號已登入，可以允許學生進入 Google Meet。',
        vi: 'Xác nhận đã đăng nhập tài khoản Google, có thể cho sinh viên vào Google Meet.' },
      { zh: '把面試帳號開好：老師一台電腦、工讀生一台電腦。',
        vi: 'Mở sẵn tài khoản phỏng vấn: giáo viên một máy tính, sinh viên hỗ trợ một máy tính.' },
      { zh: '在群組回報老師是否已經到了。',
        vi: 'Báo trong nhóm xem giáo viên đã đến chưa.' },
      { zh: '詢問老師有沒有問題、系統是否會操作、有沒有需要協助的部分；老師準備好了就在群組回報。',
        vi: 'Hỏi giáo viên có vấn đề gì không, có biết thao tác hệ thống không, có cần hỗ trợ gì không; khi giáo viên đã sẵn sàng thì báo trong nhóm.' },
    ],
  },
  {
    title: { zh: '二、學生進場', vi: 'II. Khi sinh viên vào phòng' },
    steps: [
      { zh: '學生進來後，先和學生確認身分（報名科系是否正確），並預告面試過程會錄影。',
        vi: 'Khi sinh viên vào, xác nhận danh tính trước (khoa đăng ký có đúng không) và thông báo rằng quá trình phỏng vấn sẽ được ghi hình.' },
      { zh: '在 Google Meet 按下「錄影」。',
        vi: 'Bấm 「Ghi hình (Record)」 trong Google Meet.' },
      { zh: '開始翻譯面試內容。',
        vi: 'Bắt đầu phiên dịch nội dung phỏng vấn.' },
    ],
  },
  {
    title: { zh: '三、面試結束', vi: 'III. Sau khi phỏng vấn xong' },
    steps: [
      { zh: '面試完按「停止錄影」（要等 Google 處理一下）。',
        vi: 'Phỏng vấn xong bấm 「Dừng ghi hình」 (cần chờ Google xử lý một lúc).' },
      { zh: '檔案 OK 之後，到工讀生群組通報：「XX 系已面試完，請派下一個人」。',
        vi: 'Khi file đã OK, báo trong nhóm: 「Khoa XX đã phỏng vấn xong, vui lòng cử người tiếp theo」.' },
      { zh: '一個系每次只能面試一個人；其他人想加入 Google Meet 時先不要按「允許」，讓他在外面等。',
        vi: 'Mỗi khoa mỗi lần chỉ phỏng vấn một người; nếu có người khác xin vào Google Meet thì đừng bấm 「Cho phép」 vội, để họ chờ bên ngoài.' },
    ],
  },
  {
    title: { zh: '四、影片命名與上傳', vi: 'IV. Đặt tên và tải video lên' },
    steps: [
      { zh: '當日面試影片命名為：學生姓名＋報名帳號（例：NGUYEN THU TRANG 11510241）。',
        vi: 'Video phỏng vấn trong ngày đặt tên: Họ tên sinh viên + số tài khoản đăng ký (ví dụ: NGUYEN THU TRANG 11510241).' },
      { zh: '上傳到當天的 Google 雲端資料夾（連結見下方）。',
        vi: 'Tải lên thư mục Google Drive của ngày hôm đó (link ở phía dưới).' },
    ],
  },
  {
    title: { zh: '五、其他狀況', vi: 'V. Các tình huống khác' },
    steps: [
      { zh: '中途斷線、學生沒來、老師要休息……等任何狀況，都在群組說一聲。',
        vi: 'Bị mất kết nối giữa chừng, sinh viên không đến, giáo viên cần nghỉ… bất kỳ tình huống nào cũng báo trong nhóm.' },
    ],
  },
]

const T = {
  meetTitle:  { zh: '📹 本系視訊面試連結', vi: '📹 Link Google Meet của khoa này' },
  meetEmpty:  { zh: '尚未設定本系的 Meet 連結，請洽行政人員（後台「連結管理」可新增）。',
                vi: 'Chưa thiết lập link Meet cho khoa này, vui lòng liên hệ nhân viên hành chính.' },
  driveTitle: { zh: '☁️ 面試影片上傳資料夾', vi: '☁️ Thư mục tải video phỏng vấn lên' },
  driveEmpty: { zh: '尚未設定上傳資料夾連結，請洽行政人員（後台「連結管理」新增，名稱包含「上傳」或「雲端」即可自動顯示）。',
                vi: 'Chưa thiết lập link thư mục tải lên, vui lòng liên hệ nhân viên hành chính.' },
  copy:       { zh: '複製', vi: 'Sao chép' },
  copied:     { zh: '✓ 已複製', vi: '✓ Đã sao chép' },
  open:       { zh: '開啟', vi: 'Mở' },
  footer:     { zh: '連結內容由行政後台「連結管理」分頁維護；每年更換 Meet／雲端連結時直接修改即可。',
                vi: 'Nội dung link do trang quản trị duy trì; nếu có thay đổi vui lòng liên hệ nhân viên hành chính.' },
}

export default function TranslatorSOPModal({ dept = '', links = null, onClose }) {
  const [lang, setLang] = useState(readLang)
  const [copiedId, setCopiedId] = useState(null)

  const pick = (l) => { setLang(l); try { localStorage.setItem(LANG_KEY, l) } catch { /* ignore */ } }

  const copy = async (row) => {
    try {
      await navigator.clipboard.writeText(row.url)
      setCopiedId(row.id)
      setTimeout(() => setCopiedId(null), 1800)
    } catch {
      window.prompt('請手動複製連結：', row.url)
    }
  }

  // 本系 Meet 連結：departments 逗號分隔關鍵字，dept.includes(關鍵字) 即符合（同 CheckinApp）
  const meetRows = (links || []).filter((l) => {
    if (l.kind !== 'meet' || !l.url) return false
    const keys = String(l.departments || '').split(/[,，]/).map((k) => k.trim()).filter(Boolean)
    return keys.some((k) => dept.includes(k))
  })

  // 上傳資料夾：kind='link' 且名稱含「上傳／雲端／影片／drive」者；都沒有就顯示全部 link 列
  const allLinkRows = (links || []).filter((l) => l.kind === 'link' && l.url)
  const driveRows0 = allLinkRows.filter((l) => /上傳|雲端|影片|drive/i.test(l.label || ''))
  const driveRows = driveRows0.length ? driveRows0 : allLinkRows

  const linkRow = (r) => (
    <div key={r.id} style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
      border: '1px solid #e8e7e3', borderRadius: 10, marginBottom: 8, background: '#fff',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{r.label}</div>
        <div style={{ fontSize: 11, color: '#999', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.url}</div>
      </div>
      <Btn onClick={() => copy(r)} style={copiedId === r.id ? { background: '#dcfce7', borderColor: '#86efac', color: '#15803d' } : undefined}>
        {copiedId === r.id ? T.copied[lang] : T.copy[lang]}
      </Btn>
      <Btn variant="primary" onClick={() => window.open(r.url, '_blank', 'noopener')}>{T.open[lang]}</Btn>
    </div>
  )

  const langBtn = (l, label) => (
    <button onClick={() => pick(l)} style={{
      flex: 1, padding: '7px 0', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
      fontSize: 13, fontWeight: lang === l ? 700 : 500,
      border: lang === l ? '2px solid #14532d' : '1px solid #ddd',
      background: lang === l ? '#ecfdf5' : '#fff',
      color: lang === l ? '#14532d' : '#666',
    }}>{label}</button>
  )

  return (
    <Modal title={`🌐 翻譯工讀生須知 · ${dept}`} onClose={onClose} width={680}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {langBtn('zh', '中文')}
        {langBtn('vi', 'Tiếng Việt（越南文）')}
      </div>

      <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '10px 12px', marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{T.meetTitle[lang]}</div>
        {links === null
          ? <div style={{ fontSize: 12, color: '#888' }}>…</div>
          : meetRows.length
            ? meetRows.map(linkRow)
            : <div style={{ fontSize: 12, color: '#b45309' }}>{T.meetEmpty[lang]}</div>}
      </div>

      {SECTIONS.map((sec) => (
        <div key={sec.title.zh} style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#14532d', marginBottom: 6 }}>{sec.title[lang]}</div>
          <ol style={{ margin: 0, paddingLeft: 22 }}>
            {sec.steps.map((st, i) => (
              <li key={i} style={{ fontSize: 13, lineHeight: 1.7, color: '#444', marginBottom: 4 }}>{st[lang]}</li>
            ))}
          </ol>
        </div>
      ))}

      <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '10px 12px', marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{T.driveTitle[lang]}</div>
        {links === null
          ? <div style={{ fontSize: 12, color: '#888' }}>…</div>
          : driveRows.length
            ? driveRows.map(linkRow)
            : <div style={{ fontSize: 12, color: '#b45309' }}>{T.driveEmpty[lang]}</div>}
      </div>

      <div style={{ fontSize: 11, color: '#aaa', borderTop: '1px solid #f0efeb', paddingTop: 10 }}>
        {T.footer[lang]}
      </div>
    </Modal>
  )
}
