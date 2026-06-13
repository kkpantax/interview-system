import { useState } from 'react'
import { Modal } from './UI'

// 二階面試報到 · 操作說明（給來幫忙報到的行政／工讀人員）
// 純展示元件，inline style，含 JSX 擬真畫面圖解；配色與報到頁一致（綠 #15803d）。
// 🌐 中文／越南文切換（多為越南籍工讀生）：說明文字雙語，語言記在 localStorage。
//    擬真畫面（Shot 內的膠囊／按鈕／表頭）一律維持中文，因為要對應實際系統的中文介面。

const LANG_KEY = 'checkin_guide_lang'
const readLang = () => {
  try { return localStorage.getItem(LANG_KEY) === 'vi' ? 'vi' : 'zh' } catch { return 'zh' }
}

const C = {
  green: '#15803d', greenD: '#14532d', greenSoft: '#dcfce7',
  amber: '#b45309', amberBg: '#fef3c7', red: '#dc2626', redBg: '#fee2e2',
  blue: '#1e40af', blueBg: '#dbeafe', grey: '#9ca3af', greyBg: '#f3f4f6',
  line: '#e8e7e3', muted: '#6b6b66',
}

function StepHead({ n, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '24px 0 8px', paddingBottom: 7, borderBottom: `2px solid ${C.greenD}` }}>
      <span style={{ flex: '0 0 auto', width: 28, height: 28, borderRadius: 8, background: C.greenD, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 15 }}>{n}</span>
      <span style={{ fontSize: 16, fontWeight: 700 }}>{children}</span>
    </div>
  )
}

function Callout({ tag, children, color = C.green, bg = C.greenSoft }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: '#fff', border: `1px solid ${C.line}`, borderLeft: `4px solid ${color}`, borderRadius: 8, padding: '9px 12px', margin: '7px 0', fontSize: 13 }}>
      <span style={{ flex: '0 0 auto', background: bg, color, fontWeight: 800, fontSize: 11.5, borderRadius: 6, padding: '2px 8px', marginTop: 1 }}>{tag}</span>
      <span style={{ lineHeight: 1.6 }}>{children}</span>
    </div>
  )
}

// 畫面縮圖外框（重現系統的綠色頂列）
function Shot({ sub, right, children }) {
  return (
    <div style={{ background: '#f5f4f0', border: `1px solid ${C.line}`, borderRadius: 12, overflow: 'hidden', margin: '10px 0 4px', boxShadow: '0 8px 22px -18px rgba(0,0,0,.4)' }}>
      <div style={{ background: C.green, color: '#fff', padding: '8px 12px', display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 12 }}>
        <b style={{ fontSize: 13 }}>實踐大學</b><span style={{ opacity: .9 }}>{sub}</span>
        {right && <span style={{ marginLeft: 'auto', opacity: .8, fontSize: 11 }}>{right}</span>}
      </div>
      <div style={{ padding: 14 }}>{children}</div>
    </div>
  )
}
function ShotCap({ children }) {
  return <div style={{ fontSize: 12, color: C.muted, textAlign: 'center', margin: '0 0 12px' }}>▲ {children}</div>
}

// 志願膠囊（重現主表格的三態樣式）
function DeptPill({ st, dept, pref, locked }) {
  const m = {
    waiting: { bg: C.greyBg, color: C.grey, border: '#e5e7eb', icon: '⚪', label: '待面試' },
    going:   { bg: C.amberBg, color: C.amber, border: '#fde68a', icon: '🟡', label: '前往中' },
    sent:    { bg: C.blueBg, color: C.blue, border: '#93c5fd', icon: '🔵', label: '面試中' },
    done:    { bg: C.greenSoft, color: C.green, border: '#86efac', icon: '✅', label: '已完成' },
  }[st]
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', border: `1px solid ${m.border}`, borderRadius: 8, padding: '4px 9px', background: m.bg, color: m.color }}>
      <span style={{ fontSize: 12.5, fontWeight: 600 }}>{m.icon} {dept}{locked ? '（已評分）' : ''}</span>
      <span style={{ fontSize: 10, opacity: 0.8 }}>第{pref}志願 · {m.label}</span>
    </span>
  )
}

function Tag({ bg, color, children }) {
  return <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: 6, fontSize: 11.5, fontWeight: 600, background: bg, color }}>{children}</span>
}
const fakeBtn = (bg, color, brd) => ({ display: 'inline-block', borderRadius: 7, padding: '4px 11px', fontSize: 12, fontWeight: 600, background: bg, color, border: `1px solid ${brd || bg}` })
const miniCard = { background: '#fff', border: `1px solid ${C.line}`, borderRadius: 10 }
const p = { fontSize: 13.5, lineHeight: 1.75, margin: '0 0 6px', color: '#333' }
const arrow = <span style={{ color: '#bbb', fontSize: 16, margin: '0 4px' }}>→</span>

export default function CheckinGuideModal({ onClose }) {
  const [lang, setLang] = useState(readLang)
  const t = (zh, vi) => (lang === 'vi' ? vi : zh)
  const vi = lang === 'vi'
  const pick = (l) => { setLang(l); try { localStorage.setItem(LANG_KEY, l) } catch { /* ignore */ } }

  const langBtn = (l, label) => (
    <button onClick={() => pick(l)} style={{
      flex: 1, padding: '7px 0', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
      fontSize: 13, fontWeight: lang === l ? 700 : 500,
      border: lang === l ? '2px solid #14532d' : '1px solid #ddd',
      background: lang === l ? '#ecfdf5' : '#fff',
      color: lang === l ? '#14532d' : '#666',
    }}>{label}</button>
  )

  const overview = [
    { t: '📋 報到追蹤', tv: '📋 Theo dõi điểm danh', d: '當日主畫面：報到、派送各系、看全場進度', dv: 'Màn hình chính trong ngày: điểm danh, cử đến các khoa, xem tiến độ toàn buổi' },
    { t: '⚠ 漏網之魚', tv: '⚠ Cá lọt lưới', d: '面試日已過但沒完成的學生，改期或移回未排程', dv: 'SV đã qua ngày phỏng vấn nhưng chưa hoàn thành — đổi ngày hoặc chuyển về chưa xếp lịch' },
    { t: '📅 未排程', tv: '📅 Chưa xếp lịch', d: '還沒排面試日的學生，勾選後指派日期', dv: 'SV chưa có ngày phỏng vấn — chọn rồi gán ngày' },
  ]

  const prep = [
    { t: '① 核對名單', tv: '① Đối chiếu danh sách', d: '長條圖點明天的日期，確認應到人數與名單；缺人到「📅 未排程」勾選後指派。', dv: 'Bấm ngày mai trên biểu đồ cột, xác nhận số người cần đến và danh sách; thiếu ai thì vào 「📅 未排程 (Chưa xếp lịch)」 chọn rồi gán.' },
    { t: '② 清漏網之魚', tv: '② Dọn cá lọt lưới', d: '看「⚠ 漏網之魚」紅色徽章，把之前缺席／未完成的學生改期或移回未排程。', dv: 'Xem huy hiệu đỏ 「⚠ 漏網之魚 (Cá lọt lưới)」, đổi ngày hoặc chuyển về chưa xếp lịch cho SV trước đó vắng / chưa xong.' },
    { t: '③ 檢查連結', tv: '③ Kiểm tra link', d: '右上「ℹ 面試資訊」：老師時段表已填、各系 Meet 連結都打得開。有誤請通知系統管理員。', dv: 'Góc trên phải 「ℹ 面試資訊 (Thông tin phỏng vấn)」: bảng giờ giáo viên đã điền, link Meet các khoa đều mở được. Có sai báo quản trị viên.' },
    { t: '④ 下載名單備援', tv: '④ Tải danh sách dự phòng', d: '按「⬇ 下載當日名單」存一份 Excel（總表＋各系分頁），可列印當紙本備援。', dv: 'Bấm 「⬇ 下載當日名單 (Tải danh sách hôm nay)」 lưu một bản Excel (bảng tổng + sheet từng khoa), có thể in làm bản giấy dự phòng.' },
  ]

  return (
    <Modal title={t('二階面試報到 · 操作說明', 'Điểm danh phỏng vấn vòng 2 · Hướng dẫn thao tác')} onClose={onClose} width={700}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {langBtn('zh', '中文')}
        {langBtn('vi', 'Tiếng Việt（越南文）')}
      </div>
      {vi && (
        <div style={{ fontSize: 11.5, color: C.muted, background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 8, padding: '7px 10px', marginBottom: 12, lineHeight: 1.6 }}>
          ℹ️ Ảnh minh họa bên dưới giữ nguyên giao diện tiếng Trung để khớp với màn hình thật bạn sẽ thao tác (các nút bấm trên hệ thống đều là tiếng Trung).
        </div>
      )}

      <div style={{ fontSize: 13, color: C.muted, marginBottom: 6, lineHeight: 1.7 }}>
        {vi
          ? (<>Dành cho nhân viên hỗ trợ điểm danh phỏng vấn vòng 2. Cả trang chỉ có ba việc: <b>điểm danh cho SV đã đến</b>, <b>cử SV đến các khoa phỏng vấn và theo dõi tiến độ</b>, <b>xử lý SV vắng mặt hoặc bị bỏ sót</b>. Mỗi bước đều có hình minh họa, làm theo là được.</>)
          : (<>給協助二階面試報到的工作人員。整頁只有三件事：<b>幫到場的學生報到</b>、<b>把學生派送到各系面試並追蹤進度</b>、<b>處理沒來或漏掉的學生</b>。每一步都附畫面圖解，照著做即可。</>)}
      </div>

      {/* 三分頁總覽 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, margin: '12px 0 4px' }}>
        {overview.map((x) => (
          <div key={x.t} style={{ ...miniCard, padding: '10px 12px' }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 3 }}>{vi ? x.tv : x.t}</div>
            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.55 }}>{vi ? x.dv : x.d}</div>
          </div>
        ))}
      </div>

      <StepHead n={0}>{t('面試前一天的準備（4 件事）', 'Chuẩn bị một ngày trước phỏng vấn (4 việc)')}</StepHead>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, margin: '8px 0 4px' }}>
        {prep.map((x) => (
          <div key={x.t} style={{ ...miniCard, padding: '9px 12px' }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 2 }}>{vi ? x.tv : x.t}</div>
            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.55 }}>{vi ? x.dv : x.d}</div>
          </div>
        ))}
      </div>

      <StepHead n={1}>{t('確認日期是今天', 'Xác nhận ngày là hôm nay')}</StepHead>
      {vi
        ? <p style={p}>Vào tab 「📋 報到追蹤 (Theo dõi điểm danh)」, hệ thống mặc định hiển thị hôm nay. Biểu đồ cột màu xanh phía trên là số người phỏng vấn mỗi ngày, <b>bấm vào ngày nào sẽ chuyển sang danh sách ngày đó</b>; cũng có thể sửa trực tiếp ô 「面試日期 (Ngày phỏng vấn)」. Danh sách <b>tự cập nhật mỗi 30 giây</b> (trạng thái do giáo viên các khoa đánh dấu sẽ tự hiện ra), cần làm mới ngay thì bấm 「🔄 重新整理 (Làm mới)」.</p>
        : <p style={p}>進入「📋 報到追蹤」分頁，系統預設顯示今天。上方綠色長條圖是各日面試人數，<b>點任一天可切換</b>到該日名單；也可直接改「面試日期」欄位。名單<b>每 30 秒自動更新</b>（系所老師標記的狀態會自己出現），需要立刻刷新按「🔄 重新整理」。</p>}
      <Callout tag={t('注意', 'Lưu ý')}>{t('日期不對的話，整份名單都會是別天的學生。開始前先看一眼日期。', 'Nếu ngày sai, cả danh sách sẽ là SV của ngày khác. Trước khi bắt đầu hãy liếc qua ngày một cái.')}</Callout>

      <StepHead n={2}>{t('學生到場 → 按「✅ 報到」', 'SV đến → bấm 「✅ 報到 (Điểm danh)」')}</StepHead>
      <p style={p}>{t('學生進入主會議室後，在名單找到他（人多時用搜尋框打姓名／英文名／帳號），按該列綠色「✅ 報到」按鈕。', 'Sau khi SV vào phòng họp chính, tìm họ trong danh sách (đông người thì dùng ô tìm kiếm gõ họ tên / tên tiếng Anh / số tài khoản), bấm nút xanh 「✅ 報到」 ở dòng đó.')}</p>
      <Shot sub="二階面試報到管理" right="報到追蹤">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, background: '#fff', borderRadius: 8, overflow: 'hidden' }}>
          <thead>
            <tr style={{ background: '#faf9f6', color: '#666' }}>
              {['姓名', '報到', '系所進度'].map((h) => <th key={h} style={{ textAlign: 'left', padding: '7px 10px', fontWeight: 500 }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ padding: '8px 10px', borderTop: `1px solid ${C.line}` }}>
                <div style={{ fontWeight: 600 }}>阮文安</div>
                <div style={{ fontSize: 10.5, color: '#999' }}>NGUYEN VAN AN · 11510001</div>
              </td>
              <td style={{ padding: '8px 10px', borderTop: `1px solid ${C.line}` }}>
                <span style={fakeBtn(C.green, '#fff')}>✅ 報到</span>
              </td>
              <td style={{ padding: '8px 10px', borderTop: `1px solid ${C.line}` }}>
                <span style={{ opacity: .45 }}><DeptPill st="waiting" dept="餐飲管理學系(專)" pref={1} /></span>
              </td>
            </tr>
            <tr>
              <td style={{ padding: '8px 10px', borderTop: `1px solid ${C.line}` }}>
                <div style={{ fontWeight: 600 }}>陳氏紅</div>
                <div style={{ fontSize: 10.5, color: '#999' }}>TRAN THI HONG · 11510002</div>
              </td>
              <td style={{ padding: '8px 10px', borderTop: `1px solid ${C.line}` }}>
                <Tag bg={C.greenSoft} color={C.green}>已報到 09:42</Tag>
                <div style={{ fontSize: 10.5, color: '#aaa', textDecoration: 'underline', marginTop: 2 }}>取消</div>
              </td>
              <td style={{ padding: '8px 10px', borderTop: `1px solid ${C.line}` }}>
                <DeptPill st="waiting" dept="資訊管理學系(專)" pref={1} />
              </td>
            </tr>
          </tbody>
        </table>
      </Shot>
      <ShotCap>{t('上：尚未報到（膠囊是半透明、按不動）；下：已報到，顯示報到時間，膠囊解鎖可點', 'Trên: chưa điểm danh (thẻ trạng thái mờ, không bấm được); Dưới: đã điểm danh, hiện giờ điểm danh, thẻ mở khóa bấm được')}</ShotCap>
      <Callout tag={t('按錯了', 'Bấm nhầm')}>{t('點「已報到」下方的小字「取消」即可收回，再重按一次就好。', 'Bấm dòng chữ nhỏ 「取消 (Hủy)」 dưới 「已報到」 là thu lại được, bấm lại một lần nữa là xong.')}</Callout>

      <StepHead n={3}>{t('派送各系面試 → 點膠囊切換進度', 'Cử đến các khoa phỏng vấn → bấm thẻ để đổi tiến độ')}</StepHead>
      {vi
        ? <p style={p}>Mỗi SV có tối đa 3 khoa nguyện vọng, mỗi khoa là một thẻ trạng thái. <b>Sau khi điểm danh thẻ mới bấm được</b>, bấm một lần đổi một trạng thái, vòng lặp như sau:</p>
        : <p style={p}>每位學生最多 3 個志願系所，各是一顆膠囊。<b>報到後膠囊才能點</b>，點一下切換一個狀態，循環如下：</p>}
      <div style={{ ...miniCard, padding: '12px 14px', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4, margin: '8px 0' }}>
        <DeptPill st="waiting" dept="餐飲管理學系(專)" pref={1} />{arrow}
        <DeptPill st="going" dept="餐飲管理學系(專)" pref={1} />{arrow}
        <DeptPill st="sent" dept="餐飲管理學系(專)" pref={1} />{arrow}
        <DeptPill st="done" dept="餐飲管理學系(專)" pref={1} />
        <span style={{ fontSize: 11.5, color: C.muted, marginLeft: 6 }}>{t('（再點一下會回到 ⚪ 待面試，點錯時可用）', '(bấm thêm một lần nữa sẽ quay về ⚪ 待面試, dùng khi bấm nhầm)')}</span>
      </div>
      {vi && (
        <div style={{ fontSize: 11.5, color: '#475569', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 11px', margin: '6px 0', lineHeight: 1.7 }}>
          <b>Bảng đối chiếu trạng thái:</b><br />
          ⚪ 待面試 = Chờ phỏng vấn · 🟡 前往中 = Đang đến · 🔵 面試中 = Đang phỏng vấn · ✅ 已完成 = Đã xong
        </div>
      )}
      {vi
        ? <p style={p}>Nhịp thao tác thực tế: khi mời SV đến phòng họp phỏng vấn của khoa thì đánh dấu thành <Tag bg={C.amberBg} color={C.amber}>🟡 前往中</Tag>；<b>sau khi giáo viên khoa xác nhận SV vào và bấm 「🎤 開始面試」 sẽ tự đổi thành</b> <Tag bg={C.blueBg} color={C.blue}>🔵 面試中</Tag>（giáo viên chưa bấm thì bạn cũng có thể tự bấm）；phỏng vấn xong, khi SV về phòng họp chính thì bấm thành <Tag bg={C.greenSoft} color={C.green}>✅ 已完成</Tag>, rồi cử sang khoa nguyện vọng tiếp theo.</p>
        : <p style={p}>實際操作節奏：請學生前往該系面試會議室時標成 <Tag bg={C.amberBg} color={C.amber}>🟡 前往中</Tag>；<b>系所老師確認學生進場、按下「🎤 開始面試」後會自動變成</b> <Tag bg={C.blueBg} color={C.blue}>🔵 面試中</Tag>（老師沒按時也可由你手動點一下）；面試結束、學生回到主會議室時點成 <Tag bg={C.greenSoft} color={C.green}>✅ 已完成</Tag>，再送往下一個志願系所。</p>}
      <Callout tag={t('一人一系', '1 SV–1 khoa')} color={C.amber} bg={C.amberBg}>{t('同一位學生同一時間只能前往／面試一個系。若他已在某系 🟡 前往中或 🔵 面試中，又要派往別的系，系統會先跳出確認視窗，避免按錯。', 'Cùng một SV tại cùng một thời điểm chỉ có thể đến / phỏng vấn ở một khoa. Nếu họ đang 🟡 前往中 hoặc 🔵 面試中 ở một khoa mà lại muốn cử sang khoa khác, hệ thống sẽ bật hộp xác nhận trước để tránh bấm nhầm.')}</Callout>
      <Callout tag={t('一系一位', '1 khoa–1 SV')} color={C.red} bg={C.redBg}>{vi
        ? (<>Ngược lại, <b>một khoa tại cùng một thời điểm cũng chỉ phục vụ một SV</b>. Khi khoa đó đã có người 🟡 前往中 hoặc 🔵 面試中, hệ thống sẽ chặn việc cử đi và hiện tên người đang chiếm chỗ — chờ họ xong rồi cử người tiếp theo, đây không phải lỗi.</>)
        : (<>反過來，<b>一個系同一時間也只服務一位學生</b>。該系已有人 🟡 前往中或 🔵 面試中時，系統會直接擋下派遣並顯示佔用者姓名——等他完成再派下一位，這不是故障。</>)}</Callout>
      <Callout tag={t('自動鎖定', 'Tự khóa')}>{vi
        ? (<>Khi giáo viên khoa gửi điểm, thẻ đó sẽ tự đổi thành 「✅ 已完成（已評分）」 và bị khóa, <b>không cần bấm tay, cũng không bấm được</b> — đây là bình thường.</>)
        : (<>系所老師一送出評分，該膠囊會自動變成「✅ 已完成（已評分）」並鎖定，<b>不用手動點、也點不動</b>，這是正常的。</>)}</Callout>
      <Callout tag={t('完成判斷', 'Đã xong')}>{t('一位學生的所有膠囊都變 ✅ 後，該列底色變淡綠，代表他今天的面試全部結束、可以離場。', 'Khi tất cả các thẻ của một SV đều thành ✅, nền dòng đó chuyển xanh nhạt, nghĩa là hôm nay họ đã phỏng vấn xong hết và có thể ra về.')}</Callout>

      <StepHead n={4}>{t('派遣統一在看板 → 按「派出」', 'Việc cử đi tập trung ở bảng điều phối → bấm 「派出 (Cử đi)」')}</StepHead>
      {vi
        ? <p style={p}>Việc cử đi đều thao tác tại 「<b>各系即時狀態（派遣看板）</b>」 (trên dòng danh sách SV không có nút cử đi). Hệ thống tính theo thời gian thực theo thứ tự 「<b>ưu tiên SV không phải quốc tịch Việt Nam → SV có ít nguyện vọng → khoa ít người dự thi xếp cuối</b>」 (rồi so thứ tự nguyện vọng, giờ điểm danh), mỗi thẻ khoa hiển thị trực tiếp người tiếp theo nên cử:</p>
        : <p style={p}>派遣一律在「<b>各系即時狀態（派遣看板）</b>」操作（學生名單列上沒有派出鈕）。系統會依照「<b>非越南籍優先 → 志願數少的學生優先 → 報考人數少的系優先收尾</b>」（再比志願序、報到時間）即時計算，每張系卡直接顯示建議的下一位：</p>}
      <Shot sub="二階面試報到管理" right="報到追蹤 · 派遣看板">
        <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10, padding: '8px 12px', display: 'inline-block' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600 }}>社會工作學系(專)</span>
            <Tag bg={C.greenSoft} color={C.green}>✳ 空閒</Tag>
            <span style={fakeBtn('#eff6ff', '#1d4ed8', '#bfdbfe')}>📹 Meet</span>
            <span style={fakeBtn('#faf5ff', '#7e22ce', '#d8b4fe')}>📋 複製</span>
          </div>
          <div style={{ display: 'flex', gap: 10, fontSize: 11.5 }}>
            <span style={{ color: C.amber }}>🟡 0</span>
            <span style={{ color: C.blue }}>🔵 0</span>
            <span style={{ color: C.green }}>✅ 1</span>
            <span style={{ color: C.grey }}>⚪ 1</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, paddingTop: 6, borderTop: '1px dashed #e8e7e3', fontSize: 11.5, color: C.amber }}>
            <span>💡 下一位：<b>陳氏紅</b></span>
            <span style={fakeBtn(C.amberBg, C.amber, '#fbbf24')}>派出</span>
          </div>
        </div>
      </Shot>
      <ShotCap>{t('派遣看板的系卡：綠框＝空閒可接收、💡 下一位＝這個系現在最該收的學生；該系佔用中時「派出」會反灰', 'Thẻ khoa trên bảng điều phối: viền xanh = đang rảnh có thể nhận, 💡 下一位 (người tiếp theo) = SV khoa này nên nhận bây giờ; khi khoa đang bận, nút 「派出」 sẽ mờ đi.')}</ShotCap>
      {vi
        ? <p style={p}>Bấm 「派出」 tương đương đánh dấu thẻ khoa đó thành 🟡 前往中, đồng thời hệ thống <b>tự sao chép sẵn một đoạn tin nhắn thông báo cho SV đó</b> (tự chọn tiếng Việt / Indonesia / Anh theo quốc tịch, cả tên khoa cũng được dịch sang ngôn ngữ đó, kèm lời chào và link Meet) — chuyển sang phần mềm nhắn tin dán vào gửi luôn là được, không cần tự gõ. Danh sách đồng thời <b>tự sắp xếp luân phiên</b>: SV có thể cử đi xếp trên cùng, đang đi / đang phỏng vấn kế đó, chưa điểm danh tiếp theo, đã xong hết chìm xuống đáy — <b>mấy người trên cùng danh sách chính là nhóm cần xử lý tiếp theo</b>, không cần cuộn tìm mãi.</p>
        : <p style={p}>按「派出」等於把該系膠囊標成 🟡 前往中，而且系統會<b>同時自動複製一段給該生的通知訊息</b>（依國籍自動選越南文／印尼文／英文，連系所名稱都會翻成該語言，內含稱呼與 Meet 連結）——切到通訊軟體直接貼上送出即可，不必自己打字。名單同時會<b>自動輪值排序</b>：可派遣的學生排最上面、前往中／面試中其次、未報到再次、全部完成的沉到最底——<b>名單最上面那幾位就是下一批該處理的人</b>，不必一直捲動找人。</p>}

      <StepHead n={5}>{t('連結都在「ℹ 面試資訊」', 'Mọi link đều ở 「ℹ 面試資訊 (Thông tin phỏng vấn)」')}</StepHead>
      <p style={p}>{t('右上角「ℹ 面試資訊」集中放當天會用到的連結，分三類：📑 老師面試時段安排表（各系主任填的時段／老師／線上或實體）、📹 各系視訊面試連結、🔗 其他連結。每條都有「複製」「開啟」兩個鈕。', 'Góc trên phải 「ℹ 面試資訊」 tập trung các link dùng trong ngày, chia ba loại: 📑 Bảng sắp xếp giờ phỏng vấn của giáo viên (giờ / giáo viên / online hay trực tiếp do trưởng khoa điền), 📹 Link phỏng vấn video các khoa, 🔗 Link khác. Mỗi dòng đều có hai nút 「複製 (Sao chép)」「開啟 (Mở)」.')}</p>
      <Shot sub="二階面試報到管理" right="ℹ 面試資訊">
        <div style={{ ...miniCard, padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600 }}>A 組 Meet（餐飲管理）</div>
            <div style={{ fontSize: 10.5, color: '#999' }}>對應：餐飲 · https://meet.google.com/xxx-xxxx-xxx</div>
          </div>
          <span style={fakeBtn('#fff', '#333', '#ddd')}>複製</span>
          <span style={fakeBtn(C.green, '#fff')}>開啟</span>
        </div>
        <div style={{ background: '#f8fafc', border: `1px dashed #cbd5e1`, borderRadius: 8, padding: '8px 11px', fontSize: 11.5, color: '#475569', lineHeight: 1.6 }}>
          Chào bạn NGUYEN VAN AN, tiếp theo vui lòng vào đường link Google Meet dưới đây để tham gia phỏng vấn vòng 2 của khoa「餐飲管理學系(專)」:<br />https://meet.google.com/xxx-xxxx-xxx
        </div>
      </Shot>
      <ShotCap>{t('上：連結列（複製／開啟）；下：「派出」或系卡「📋 複製」自動產生的通知訊息範例（越南籍學生→越南文）', 'Trên: dòng link (sao chép / mở); Dưới: ví dụ tin nhắn thông báo do 「派出」 hoặc nút 「📋 複製」 trên thẻ khoa tự tạo ra (SV Việt Nam → tiếng Việt)')}</ShotCap>
      <Callout tag={t('貼給誰', 'Dán cho ai')}>{t('貼到與學生（或協助翻譯的學伴）的通訊軟體對話即可。系卡上的「📹 Meet」是行政自己要旁聽／確認時用的。', 'Dán vào cuộc trò chuyện với SV (hoặc bạn học hỗ trợ phiên dịch) là được. Nút 「📹 Meet」 trên thẻ khoa là để nhân viên hành chính tự vào nghe / kiểm tra.')}</Callout>
      <Callout tag={t('連結錯了', 'Link sai')} color={C.amber} bg={C.amberBg}>{t('連結內容由系統管理員在行政後台「連結管理」維護，發現錯誤口頭通知即可，改完此頁自動更新。', 'Nội dung link do quản trị viên duy trì ở trang quản trị; phát hiện sai thì báo miệng là được, sửa xong trang này tự cập nhật.')}</Callout>

      <StepHead n={6}>{t('看全場進度', 'Xem tiến độ toàn buổi')}</StepHead>
      <p style={p}>{t('畫面上方有兩排即時統計，隨每一次點擊自動更新：', 'Phía trên màn hình có hai hàng thống kê thời gian thực, tự cập nhật theo mỗi lần bấm:')}</p>
      <Shot sub="二階面試報到管理" right="報到追蹤">
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          {[
            { label: '應到人數', n: 15, bg: '#f1f5f9', color: '#475569' },
            { label: '已報到', n: 9, bg: C.greenSoft, color: C.green },
            { label: '未報到', n: 6, bg: C.redBg, color: C.red },
            { label: '全部完成', n: 4, bg: '#ecfdf5', color: '#047857' },
          ].map((c) => (
            <div key={c.label} style={{ flex: 1, background: c.bg, color: c.color, borderRadius: 8, padding: '8px 12px' }}>
              <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.1 }}>{c.n}</div>
              <div style={{ fontSize: 11, marginTop: 2 }}>{c.label}</div>
            </div>
          ))}
        </div>
        <div style={{ ...miniCard, padding: '8px 12px', display: 'inline-block' }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 3 }}>餐飲管理學系(專)</div>
          <div style={{ display: 'flex', gap: 10, fontSize: 11.5 }}>
            <span style={{ color: C.amber }}>🟡 1</span>
            <span style={{ color: C.blue }}>🔵 2</span>
            <span style={{ color: C.green }}>✅ 5</span>
            <span style={{ color: C.grey }}>⚪ 3</span>
          </div>
        </div>
      </Shot>
      <ShotCap>{t('統計卡＋派遣看板：系卡依「報考人數少→多」排列、最該收尾的小系在前面；哪個系塞車、誰還沒報到，一眼看出', 'Thẻ thống kê + bảng điều phối: thẻ khoa xếp theo 「ít → nhiều người dự thi」, khoa nhỏ cần xử lý dứt điểm xếp trước; khoa nào kẹt, ai chưa điểm danh, nhìn là thấy ngay.')}</ShotCap>
      <p style={p}>{t('名單太長時，勾「只看未報到」或「只看未完成」就只剩需要處理的人。', 'Danh sách quá dài thì tick 「只看未報到 (Chỉ xem chưa điểm danh)」 hoặc 「只看未完成 (Chỉ xem chưa hoàn thành)」 để chỉ còn những người cần xử lý.')}</p>

      <StepHead n={7}>{t('學生沒來或要換天 → 「改期」', 'SV không đến hoặc cần đổi ngày → 「改期 (Đổi ngày)」')}</StepHead>
      <p style={p}>{t('該列最右邊有「改期」按鈕，輸入新日期（YYYY-MM-DD）即可把他移到別天；輸入留空則取消排程、回到「📅 未排程」名單。', 'Cuối dòng bên phải có nút 「改期 (Đổi ngày)」, nhập ngày mới (YYYY-MM-DD) là chuyển họ sang ngày khác; để trống thì hủy xếp lịch, quay về danh sách 「📅 未排程 (Chưa xếp lịch)」.')}</p>

      <StepHead n={8}>{t('學生沒來？隔天看「⚠ 漏網之魚」', 'SV không đến? Hôm sau xem 「⚠ 漏網之魚 (Cá lọt lưới)」')}</StepHead>
      <p style={p}>{t('面試日已經過了、但當天沒報到或沒做完的學生，會自動列在這個分頁，分兩種：', 'SV đã qua ngày phỏng vấn nhưng hôm đó không điểm danh hoặc chưa làm xong sẽ tự liệt kê ở tab này, chia hai loại:')}</p>
      <Shot sub="二階面試報到管理" right="漏網之魚">
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 12.5 }}>
          <span style={{ fontWeight: 600 }}>黎文明</span>
          <span style={{ color: C.red, fontWeight: 600 }}>6/10</span>
          <Tag bg={C.redBg} color={C.red}>缺席未報到</Tag>
          <span style={fakeBtn('#fff', '#333', '#ddd')}>📅 2026-06-19</span>
          <span style={fakeBtn(C.green, '#fff')}>改期</span>
          <span style={fakeBtn('#fff', '#333', '#ddd')}>移回未排程</span>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 12.5, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.line}` }}>
          <span style={{ fontWeight: 600 }}>武氏玉</span>
          <span style={{ color: C.red, fontWeight: 600 }}>6/11</span>
          <Tag bg={C.amberBg} color={C.amber}>報到但未完成</Tag>
          <DeptPill st="done" dept="社會工作學系(專)" pref={1} locked />
          <DeptPill st="waiting" dept="食品營養與保健生技學系(專)" pref={2} />
        </div>
      </Shot>
      <ShotCap>{t('紅＝整天沒出現；黃＝有報到但還有系所沒面完。選新日期按「改期」，或「移回未排程」之後再安排', 'Đỏ = cả ngày không xuất hiện; Vàng = có điểm danh nhưng còn khoa chưa phỏng vấn xong. Chọn ngày mới bấm 「改期」, hoặc 「移回未排程」 rồi sắp xếp lại sau.')}</ShotCap>

      <StepHead n={9}>{t('排新日期 → 「📅 未排程」', 'Xếp ngày mới → 「📅 未排程 (Chưa xếp lịch)」')}</StepHead>
      <p style={p}>{t('還沒有面試日的學生都在這裡。勾選學生（可全選）→ 上方選日期 → 按「指派面試日」。指派完成後他們就會出現在該日的報到追蹤名單。', 'SV chưa có ngày phỏng vấn đều ở đây. Tick chọn SV (có thể chọn tất cả) → chọn ngày ở trên → bấm 「指派面試日 (Gán ngày phỏng vấn)」. Gán xong họ sẽ xuất hiện trong danh sách theo dõi điểm danh của ngày đó.')}</p>

      <StepHead n={10}>{t('收場三步驟', 'Ba bước kết thúc')}</StepHead>
      {vi
        ? <p style={p}>① Xác nhận thẻ thống kê 「<b>全部完成」＝「已報到</b>」 (Tất cả xong = Đã điểm danh); ② Người không đến hoặc chưa chạy xong không cần xử lý, hôm sau sẽ tự vào 「⚠ 漏網之魚」; ③ Bấm lại một lần 「<b>⬇ 下載當日名單</b>」 lưu lại, làm bản ghi của ngày.</p>
        : <p style={p}>① 確認統計卡「<b>全部完成」＝「已報到</b>」；② 沒到或沒跑完的不用處理，隔天會自動進「⚠ 漏網之魚」；③ 再按一次「<b>⬇ 下載當日名單</b>」存檔，作為當日紀錄。</p>}
      <Callout tag={t('名單內容', 'Nội dung danh sách')}>{vi
        ? (<>File Excel tải về gồm 「總表 (bảng tổng)」 (xếp theo trung tâm → tài khoản) và <b>sheet từng khoa</b> (校區 Đài Bắc xếp trước, trong khoa xếp theo thứ tự nguyện vọng), kèm điểm danh vòng 1 / điểm trung bình / đề xuất, có thể chuyển thẳng cho các khoa hoặc lưu trữ.</>)
        : (<>下載的 Excel 含「總表」（依中心→帳號排序）與<b>各系分頁</b>（台北校區在前、系內依志願序排），附一階出席／平均分／建議，可直接轉交各系或留存。</>)}</Callout>

      <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '12px 16px', margin: '20px 0 6px' }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: C.amber, marginBottom: 6 }}>{t('⚠ 三條鐵則（系統會強制執行）', '⚠ Ba quy tắc cứng (hệ thống bắt buộc)')}</div>
        {vi
          ? (<ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, lineHeight: 1.75 }}>
              <li><b>Phải điểm danh chung trước mới cử đi được</b> — thẻ không bấm được thì xem họ đã điểm danh chưa.</li>
              <li><b>Một khoa cùng lúc chỉ phục vụ một người</b> — bị chặn thì chờ khoa đó xong rồi cử.</li>
              <li><b>Một SV cùng lúc chỉ đến một khoa</b> — khi hộp xác nhận bật lên, về nguyên tắc chọn hủy, chờ họ phỏng vấn xong rồi cử.</li>
            </ul>)
          : (<ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, lineHeight: 1.75 }}>
              <li><b>先總報到，才能派遣</b>——膠囊點不動，先看他報到了沒。</li>
              <li><b>一個系同時只服務一位</b>——被擋下就等該系完成再派。</li>
              <li><b>一位學生同時只去一個系</b>——跳確認視窗時，原則上選取消、等他面完再派。</li>
            </ul>)}
      </div>

      <div style={{ background: C.greenSoft, border: `1px solid #bbf7d0`, borderRadius: 10, padding: '12px 16px', margin: '14px 0 6px', fontSize: 13, lineHeight: 1.8 }}>
        {vi
          ? (<><b style={{ color: C.greenD }}>Câu hỏi thường gặp</b><br />
              <b>「派出」 và bấm thẻ khác nhau ở đâu?</b> Giống nhau, 派出 = đánh dấu khoa đó thành 🟡 前往中 luôn (tương đương bấm thẻ lần đầu), chỉ là hệ thống tính sẵn nên cử đi đâu.<br />
              <b>Thẻ không bấm được?</b> Trước hết xác nhận SV đã bấm 「✅ 報到」; nếu hiện 「已評分」 thì là hệ thống tự khóa, không cần xử lý.<br />
              <b>Có bị mất dữ liệu không?</b> Mỗi lần bấm đều ghi ngay vào cơ sở dữ liệu, làm mới hay đổi máy dữ liệu vẫn còn.<br />
              <b>Nhiều người thao tác cùng lúc?</b> Được, nhiều máy cùng mở trang này không xung đột; danh sách tự đồng bộ cập nhật của người khác mỗi 30 giây.<br />
              <b>Ngôn ngữ tin nhắn thông báo quyết định thế nào?</b> Tự chọn theo quốc tịch SV: Việt Nam → tiếng Việt, Indonesia → tiếng Indonesia, khác → tiếng Anh.<br />
              <b>Phỏng vấn xong thẻ vẫn ở 🔵?</b> Có thể giáo viên chưa gửi điểm, bạn có thể tự bấm thành ✅ trước, hoặc nhắc giáo viên gửi (gửi xong tự khóa).</>)
          : (<><b style={{ color: C.greenD }}>常見問題</b><br />
              <b>「派出」和點膠囊差在哪？</b>一樣的，派出＝直接把該系標成 🟡 前往中（等於點膠囊第一下），只是系統先幫你算好派去哪。<br />
              <b>膠囊點不動？</b>先確認該生已按「✅ 報到」；若顯示「已評分」則是系統自動鎖定，不需處理。<br />
              <b>會不會沒存到？</b>每一次點擊都即時寫入資料庫，重新整理或換電腦資料都在。<br />
              <b>多人同時操作？</b>可以，多台電腦同開此頁不衝突；名單每 30 秒自動同步別人的更新。<br />
              <b>通知訊息的語言怎麼決定？</b>依學生國籍自動選：越南籍→越南文、印尼籍→印尼文、其他→英文。<br />
              <b>面完了膠囊還停在 🔵？</b>老師可能還沒送出評分，可先手動點成 ✅，或提醒老師送出（送出後自動鎖定）。</>)}
      </div>
    </Modal>
  )
}
