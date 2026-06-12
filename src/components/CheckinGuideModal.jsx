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

      <StepHead n={1}>確認日期是今天</StepHead>
      <p style={p}>進入「📋 報到追蹤」分頁，系統預設顯示今天。上方綠色長條圖是各日面試人數，<b>點任一天可切換</b>到該日名單；也可直接改「面試日期」欄位。</p>
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
      <Callout tag="自動鎖定">系所老師一送出評分，該膠囊會自動變成「✅ 已完成（已評分）」並鎖定，<b>不用手動點、也點不動</b>，這是正常的。</Callout>
      <Callout tag="完成判斷">一位學生的所有膠囊都變 ✅ 後，該列底色變淡綠，代表他今天的面試全部結束、可以離場。</Callout>

      <StepHead n={4}>讓系統幫你排 → 智慧派遣與「派出」鈕</StepHead>
      <p style={p}>不確定下一個該派誰、派去哪？系統會依照「<b>非越南籍優先 → 志願數少的學生優先 → 報考人數少的系優先收尾</b>」（再比志願序、報到時間）即時計算建議，有兩個地方可以直接按「派出」：</p>
      <Shot sub="二階面試報到管理" right="報到追蹤">
        <div style={{ ...miniCard, padding: '10px 12px', marginBottom: 10 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
            <DeptPill st="waiting" dept="社會工作學系(專)" pref={1} />
            <DeptPill st="waiting" dept="餐飲管理學系(專)" pref={2} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: C.amber }}>
            <span>💡 建議先派 → <b>社會工作學系(專)</b>（今日 2 人・0 人面試中）</span>
            <span style={fakeBtn(C.amberBg, C.amber, '#fbbf24')}>派出</span>
          </div>
        </div>
        <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10, padding: '8px 12px', display: 'inline-block' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600 }}>社會工作學系(專)</span>
            <Tag bg={C.greenSoft} color={C.green}>✳ 空閒</Tag>
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
      <ShotCap>上：學生列下方的派遣建議；下：派遣看板的系卡，綠框＝空閒可接收、💡 下一位＝這個系現在最該收的學生</ShotCap>
      <p style={p}>按「派出」等於把該系膠囊標成 🟡 前往中。名單同時會<b>自動輪值排序</b>：可派遣的學生排最上面、前往中／面試中其次、未報到再次、全部完成的沉到最底——<b>名單最上面那幾位就是下一批該處理的人</b>，不必一直捲動找人。</p>

      <StepHead n={5}>看全場進度</StepHead>
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

      <StepHead n={6}>學生沒來或要換天 → 「改期」</StepHead>
      <p style={p}>該列最右邊有「改期」按鈕，輸入新日期（YYYY-MM-DD）即可把他移到別天；輸入留空則取消排程、回到「📅 未排程」名單。</p>

      <StepHead n={7}>每天收尾 → 看「⚠ 漏網之魚」</StepHead>
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

      <StepHead n={8}>排新日期 → 「📅 未排程」</StepHead>
      <p style={p}>還沒有面試日的學生都在這裡。勾選學生（可全選）→ 上方選日期 → 按「指派面試日」。指派完成後他們就會出現在該日的報到追蹤名單。</p>

      <div style={{ background: C.greenSoft, border: `1px solid #bbf7d0`, borderRadius: 10, padding: '12px 16px', margin: '22px 0 6px', fontSize: 13, lineHeight: 1.8 }}>
        <b style={{ color: C.greenD }}>常見問題</b><br />
        <b>「派出」和點膠囊差在哪？</b>一樣的，派出＝直接把該系標成 🟡 前往中（等於點膠囊第一下），只是系統先幫你算好派去哪。<br />
        <b>膠囊點不動？</b>先確認該生已按「✅ 報到」；若顯示「已評分」則是系統自動鎖定，不需處理。<br />
        <b>會不會沒存到？</b>每一次點擊都即時寫入資料庫，重新整理或換電腦資料都在。<br />
        <b>多人同時操作？</b>可以，多台電腦同開此頁不衝突；按「🔄 重新整理」可看到別人剛更新的狀態。
      </div>
    </Modal>
  )
}
