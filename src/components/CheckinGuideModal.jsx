import { Modal } from './UI'

// 二階面試報到 · 操作說明（給來幫忙報到的行政／工讀人員）
// 純展示元件，inline style，含 JSX 擬真畫面圖解；配色與報到頁一致（綠 #15803d）。

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
  return (
    <Modal title="二階面試報到 · 操作說明" onClose={onClose} width={700}>
      <div style={{ fontSize: 13, color: C.muted, marginBottom: 6, lineHeight: 1.7 }}>
        給協助二階面試報到的工作人員。整頁只有三件事：<b>幫到場的學生報到</b>、<b>把學生派送到各系面試並追蹤進度</b>、<b>處理沒來或漏掉的學生</b>。每一步都附畫面圖解，照著做即可。
      </div>

      {/* 三分頁總覽 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, margin: '12px 0 4px' }}>
        {[
          { t: '📋 報到追蹤', d: '當日主畫面：報到、派送各系、看全場進度' },
          { t: '⚠ 漏網之魚', d: '面試日已過但沒完成的學生，改期或移回未排程' },
          { t: '📅 未排程', d: '還沒排面試日的學生，勾選後指派日期' },
        ].map((x) => (
          <div key={x.t} style={{ ...miniCard, padding: '10px 12px' }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 3 }}>{x.t}</div>
            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.55 }}>{x.d}</div>
          </div>
        ))}
      </div>

      <StepHead n={0}>面試前一天的準備（4 件事）</StepHead>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, margin: '8px 0 4px' }}>
        {[
          ['① 核對名單', '長條圖點明天的日期，確認應到人數與名單；缺人到「📅 未排程」勾選後指派。'],
          ['② 清漏網之魚', '看「⚠ 漏網之魚」紅色徽章，把之前缺席／未完成的學生改期或移回未排程。'],
          ['③ 檢查連結', '右上「ℹ 面試資訊」：老師時段表已填、各系 Meet 連結都打得開。有誤請通知系統管理員。'],
          ['④ 下載名單備援', '按「⬇ 下載當日名單」存一份 Excel（總表＋各系分頁），可列印當紙本備援。'],
        ].map(([t, d]) => (
          <div key={t} style={{ ...miniCard, padding: '9px 12px' }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 2 }}>{t}</div>
            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.55 }}>{d}</div>
          </div>
        ))}
      </div>

      <StepHead n={1}>確認日期是今天</StepHead>
      <p style={p}>進入「📋 報到追蹤」分頁，系統預設顯示今天。上方綠色長條圖是各日面試人數，<b>點任一天可切換</b>到該日名單；也可直接改「面試日期」欄位。名單<b>每 30 秒自動更新</b>（系所老師標記的狀態會自己出現），需要立刻刷新按「🔄 重新整理」。</p>
      <Callout tag="注意">日期不對的話，整份名單都會是別天的學生。開始前先看一眼日期。</Callout>

      <StepHead n={2}>學生到場 → 按「✅ 報到」</StepHead>
      <p style={p}>學生進入主會議室後，在名單找到他（人多時用搜尋框打姓名／英文名／帳號），按該列綠色「✅ 報到」按鈕。</p>
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
      <ShotCap>上：尚未報到（膠囊是半透明、按不動）；下：已報到，顯示報到時間，膠囊解鎖可點</ShotCap>
      <Callout tag="按錯了">點「已報到」下方的小字「取消」即可收回，再重按一次就好。</Callout>

      <StepHead n={3}>派送各系面試 → 點膠囊切換進度</StepHead>
      <p style={p}>每位學生最多 3 個志願系所，各是一顆膠囊。<b>報到後膠囊才能點</b>，點一下切換一個狀態，循環如下：</p>
      <div style={{ ...miniCard, padding: '12px 14px', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4, margin: '8px 0' }}>
        <DeptPill st="waiting" dept="餐飲管理學系(專)" pref={1} />{arrow}
        <DeptPill st="going" dept="餐飲管理學系(專)" pref={1} />{arrow}
        <DeptPill st="sent" dept="餐飲管理學系(專)" pref={1} />{arrow}
        <DeptPill st="done" dept="餐飲管理學系(專)" pref={1} />
        <span style={{ fontSize: 11.5, color: C.muted, marginLeft: 6 }}>（再點一下會回到 ⚪ 待面試，點錯時可用）</span>
      </div>
      <p style={p}>
        實際操作節奏：請學生前往該系面試會議室時標成 <Tag bg={C.amberBg} color={C.amber}>🟡 前往中</Tag>；
        <b>系所老師確認學生進場、按下「🎤 開始面試」後會自動變成</b> <Tag bg={C.blueBg} color={C.blue}>🔵 面試中</Tag>（老師沒按時也可由你手動點一下）；
        面試結束、學生回到主會議室時點成 <Tag bg={C.greenSoft} color={C.green}>✅ 已完成</Tag>，再送往下一個志願系所。
      </p>
      <Callout tag="一人一系" color={C.amber} bg={C.amberBg}>同一位學生同一時間只能前往／面試一個系。若他已在某系 🟡 前往中或 🔵 面試中，又要派往別的系，系統會先跳出確認視窗，避免按錯。</Callout>
      <Callout tag="一系一位" color={C.red} bg={C.redBg}>反過來，<b>一個系同一時間也只服務一位學生</b>。該系已有人 🟡 前往中或 🔵 面試中時，系統會直接擋下派遣並顯示佔用者姓名——等他完成再派下一位，這不是故障。</Callout>
      <Callout tag="自動鎖定">系所老師一送出評分，該膠囊會自動變成「✅ 已完成（已評分）」並鎖定，<b>不用手動點、也點不動</b>，這是正常的。</Callout>
      <Callout tag="完成判斷">一位學生的所有膠囊都變 ✅ 後，該列底色變淡綠，代表他今天的面試全部結束、可以離場。</Callout>

      <StepHead n={4}>派遣統一在看板 → 按「派出」</StepHead>
      <p style={p}>派遣一律在「<b>各系即時狀態（派遣看板）</b>」操作（學生名單列上沒有派出鈕）。系統會依照「<b>非越南籍優先 → 志願數少的學生優先 → 報考人數少的系優先收尾</b>」（再比志願序、報到時間）即時計算，每張系卡直接顯示建議的下一位：</p>
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
      <ShotCap>派遣看板的系卡：綠框＝空閒可接收、💡 下一位＝這個系現在最該收的學生；該系佔用中時「派出」會反灰</ShotCap>
      <p style={p}>按「派出」等於把該系膠囊標成 🟡 前往中，而且系統會<b>同時自動複製一段給該生的通知訊息</b>（依國籍自動選越南文／印尼文／英文，連系所名稱都會翻成該語言，內含稱呼與 Meet 連結）——切到通訊軟體直接貼上送出即可，不必自己打字。名單同時會<b>自動輪值排序</b>：可派遣的學生排最上面、前往中／面試中其次、未報到再次、全部完成的沉到最底——<b>名單最上面那幾位就是下一批該處理的人</b>，不必一直捲動找人。</p>

      <StepHead n={5}>連結都在「ℹ 面試資訊」</StepHead>
      <p style={p}>右上角「ℹ 面試資訊」集中放當天會用到的連結，分三類：<b>📑 老師面試時段安排表</b>（各系主任填的時段／老師／線上或實體）、<b>📹 各系視訊面試連結</b>、<b>🔗 其他連結</b>。每條都有「複製」「開啟」兩個鈕。</p>
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
      <ShotCap>上：連結列（複製／開啟）；下：「派出」或系卡「📋 複製」自動產生的通知訊息範例（越南籍學生→越南文）</ShotCap>
      <Callout tag="貼給誰">貼到與學生（或協助翻譯的學伴）的通訊軟體對話即可。系卡上的「📹 Meet」是行政自己要旁聽／確認時用的。</Callout>
      <Callout tag="連結錯了" color={C.amber} bg={C.amberBg}>連結內容由系統管理員在行政後台「連結管理」維護，發現錯誤口頭通知即可，改完此頁自動更新。</Callout>

      <StepHead n={6}>看全場進度</StepHead>
      <p style={p}>畫面上方有兩排即時統計，隨每一次點擊自動更新：</p>
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
      <ShotCap>統計卡＋派遣看板：系卡依「報考人數少→多」排列、最該收尾的小系在前面；哪個系塞車、誰還沒報到，一眼看出</ShotCap>
      <p style={p}>名單太長時，勾「只看未報到」或「只看未完成」就只剩需要處理的人。</p>

      <StepHead n={7}>學生沒來或要換天 → 「改期」</StepHead>
      <p style={p}>該列最右邊有「改期」按鈕，輸入新日期（YYYY-MM-DD）即可把他移到別天；輸入留空則取消排程、回到「📅 未排程」名單。</p>

      <StepHead n={8}>學生沒來？隔天看「⚠ 漏網之魚」</StepHead>
      <p style={p}>面試日已經過了、但當天沒報到或沒做完的學生，會自動列在這個分頁，分兩種：</p>
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
      <ShotCap>紅＝整天沒出現；黃＝有報到但還有系所沒面完。選新日期按「改期」，或「移回未排程」之後再安排</ShotCap>

      <StepHead n={9}>排新日期 → 「📅 未排程」</StepHead>
      <p style={p}>還沒有面試日的學生都在這裡。勾選學生（可全選）→ 上方選日期 → 按「指派面試日」。指派完成後他們就會出現在該日的報到追蹤名單。</p>

      <StepHead n={10}>收場三步驟</StepHead>
      <p style={p}>① 確認統計卡「<b>全部完成」＝「已報到</b>」；② 沒到或沒跑完的不用處理，隔天會自動進「⚠ 漏網之魚」；③ 再按一次「<b>⬇ 下載當日名單</b>」存檔，作為當日紀錄。</p>
      <Callout tag="名單內容">下載的 Excel 含「總表」（依中心→帳號排序）與<b>各系分頁</b>（台北校區在前、系內依志願序排），附一階出席／平均分／建議，可直接轉交各系或留存。</Callout>

      <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '12px 16px', margin: '20px 0 6px' }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: C.amber, marginBottom: 6 }}>⚠ 三條鐵則（系統會強制執行）</div>
        <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, lineHeight: 1.75 }}>
          <li><b>先總報到，才能派遣</b>——膠囊點不動，先看他報到了沒。</li>
          <li><b>一個系同時只服務一位</b>——被擋下就等該系完成再派。</li>
          <li><b>一位學生同時只去一個系</b>——跳確認視窗時，原則上選取消、等他面完再派。</li>
        </ul>
      </div>

      <div style={{ background: C.greenSoft, border: `1px solid #bbf7d0`, borderRadius: 10, padding: '12px 16px', margin: '14px 0 6px', fontSize: 13, lineHeight: 1.8 }}>
        <b style={{ color: C.greenD }}>常見問題</b><br />
        <b>「派出」和點膠囊差在哪？</b>一樣的，派出＝直接把該系標成 🟡 前往中（等於點膠囊第一下），只是系統先幫你算好派去哪。<br />
        <b>膠囊點不動？</b>先確認該生已按「✅ 報到」；若顯示「已評分」則是系統自動鎖定，不需處理。<br />
        <b>會不會沒存到？</b>每一次點擊都即時寫入資料庫，重新整理或換電腦資料都在。<br />
        <b>多人同時操作？</b>可以，多台電腦同開此頁不衝突；名單每 30 秒自動同步別人的更新。<br />
        <b>通知訊息的語言怎麼決定？</b>依學生國籍自動選：越南籍→越南文、印尼籍→印尼文、其他→英文。<br />
        <b>面完了膠囊還停在 🔵？</b>老師可能還沒送出評分，可先手動點成 ✅，或提醒老師送出（送出後自動鎖定）。
      </div>
    </Modal>
  )
}
