import { Modal } from './UI'

// 第二階段評分操作說明（選系頁可開啟，給評分老師先看）
// 純展示元件，inline style，配色與系統一致（綠 #15803d / #14532d）。

const C = {
  green: '#15803d', greenD: '#14532d', greenSoft: '#dcfce7', greenEmp: '#047857', greenEmpBg: '#ecfdf5',
  amber: '#d97706', amberBg: '#fef3c7', red: '#dc2626', redBg: '#fee2e2',
  blue: '#1e40af', blueBg: '#eff6ff', grey: '#6b7280', greyBg: '#f3f4f6',
  line: '#e8e7e3', muted: '#6b6b66',
}

function StepHead({ n, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '22px 0 8px', paddingBottom: 7, borderBottom: `2px solid ${C.greenD}` }}>
      <span style={{ flex: '0 0 auto', width: 28, height: 28, borderRadius: 8, background: C.greenD, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 15 }}>{n}</span>
      <span style={{ fontSize: 16, fontWeight: 700 }}>{children}</span>
    </div>
  )
}

function Callout({ tag, children }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: '#fff', border: `1px solid ${C.line}`, borderLeft: `4px solid ${C.green}`, borderRadius: 8, padding: '9px 12px', margin: '7px 0', fontSize: 13 }}>
      <span style={{ flex: '0 0 auto', background: C.greenSoft, color: C.green, fontWeight: 800, fontSize: 11.5, borderRadius: 6, padding: '2px 8px', marginTop: 1 }}>{tag}</span>
      <span style={{ lineHeight: 1.6 }}>{children}</span>
    </div>
  )
}

const p = { fontSize: 13.5, lineHeight: 1.75, margin: '0 0 10px', color: '#333' }

export default function Stage2GuideModal({ onClose }) {
  return (
    <Modal title="第二階段評分 · 操作說明" onClose={onClose} width={680}>
      <div style={{ fontSize: 13, color: C.muted, marginBottom: 6, lineHeight: 1.7 }}>
        給各系評分老師的操作教學。不用記帳號密碼，跟著下面的步驟做就完成。
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, margin: '12px 0 4px' }}>
        {[
          ['1', '選你的科系', '在校區分區點自己的系'],
          ['2', '填評分人資料', '輸入老師姓名＋日期'],
          ['3', '找待評分學生', '在名單點「評分 →」'],
          ['4', '打分數送出', '給星星、選建議、確認'],
          ['5', '可重複/查看', '已評分可再評或查看'],
          ['6', '完成今日評分', '下載查核表交行政'],
        ].map(([n, t, d]) => (
          <div key={n} style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 10, padding: '10px 11px' }}>
            <span style={{ width: 22, height: 22, borderRadius: 6, background: C.greenSoft, color: C.green, fontWeight: 800, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{n}</span>
            <div style={{ fontSize: 13, fontWeight: 600, margin: '6px 0 2px' }}>{t}</div>
            <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.5 }}>{d}</div>
          </div>
        ))}
      </div>

      <StepHead n="1">選擇你負責的科系</StepHead>
      <p style={p}>系所依<b>台北校區 / 高雄校區</b>分區排列。找到自己的系，<b>直接點那張卡片</b>進入。卡片上的數字代表：</p>
      <Callout tag="預計錄取">這個系預計收幾人（由行政人員設定，作為錄取人數參考）。</Callout>
      <Callout tag="等待評分">還沒有人評過分的學生人數。</Callout>
      <Callout tag="已評選">已經評過分的學生人數。</Callout>
      <Callout tag="建議錄取">目前被勾選「建議錄取」的人數。</Callout>

      <StepHead n="2">填寫評分人員資料</StepHead>
      <p style={p}>進入科系前，請填<b>評分老師姓名</b>與<b>評分日期</b>（預設今天，通常不用改），按<b>「開始評分」</b>。此資料會記在你打的每一筆評分上，方便行政人員查核。</p>
      <Callout tag="小提醒">同一台電腦會記住你的姓名；同一天再進來不用重填。隔天、或按了「完成今日評分」後才需重填。</Callout>

      <StepHead n="3">在「待評分」名單找到學生</StepHead>
      <p style={p}>進來後上方是統計卡，下方分成<b>「待評分」</b>與<b>「已評分」</b>兩張名單。先在「待評分」找到學生，點右邊的<b>「評分 →」</b>。學生很多時可用右上角搜尋框（帳號 / 姓名）。</p>
      <Callout tag="志願">顯示學生把你的系填為第幾志願；<b>第 1 志願以綠色標示</b>，可作參考。</Callout>

      <StepHead n="4">打分數並送出</StepHead>
      <p style={p}>評分表左邊打分數、右邊是面試題目參考。每個項目點星星（1～5 顆），系統自動加總。</p>
      <Callout tag="打星星">點 1～5 顆星；<b>點錯再點同一顆星即清除歸零</b>，重新點即可。</Callout>
      <Callout tag="總分">八個項目自動加總，<b>滿分 40 分</b>，不用自己算。</Callout>
      <Callout tag="錄取建議">三選一：<b>建議錄取 / 備取 / 不建議錄取</b>，<b>務必選一個</b>（放榜會議的關鍵依據）。</Callout>
      <Callout tag="自訂題目">最下方可現場新增想追問的題目並記錄重點，會跟評分一起存（非必填）。</Callout>
      <p style={{ ...p, marginTop: 10 }}>按<b>「儲存評分」</b>會跳出<b>確認視窗</b>，核對分數與建議後按<b>「確認送出」</b>。<b>送出當下即存檔</b>，不用另外按全部儲存，也不怕關頁面遺失；該生會自動移到「已評分」。</p>

      <StepHead n="5">重複評分 / 查看紀錄</StepHead>
      <p style={p}>在「已評分」名單：點<b>「查看」</b>可看該生所有評分（含其他老師的，不會被蓋掉）；分數打錯或要重評，點<b>「再次評分 →」</b>重打一份即可。</p>

      <StepHead n="6">當天評完，按「完成今日評分」</StepHead>
      <p style={p}>今天的學生都評完後，點右上角<b>「完成今日評分」</b>，系統會列出今天共評幾位與各建議人數。建議按<b>「下載查核表並離開」</b>，把當日 Excel 交給行政人員存查（下載不影響系統資料）。</p>

      <StepHead n="★">八個評分項目（每項 1～5 分，滿分 40）</StepHead>
      <div style={{ border: `1px solid ${C.line}`, borderRadius: 10, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead><tr style={{ background: '#faf9f6' }}>
            <th style={{ textAlign: 'left', padding: '7px 10px', color: '#666', fontWeight: 500, width: 130 }}>項目</th>
            <th style={{ textAlign: 'left', padding: '7px 10px', color: '#666', fontWeight: 500 }}>觀察重點（參考）</th>
          </tr></thead>
          <tbody>
            {[
              ['中文表達能力', '能否用中文清楚表達、聽懂問題'],
              ['溝通能力', '回答是否切題、互動是否順暢'],
              ['學習動機', '來台與選系動機是否明確、積極'],
              ['態度禮貌', '面試應對的禮貌與誠懇度'],
              ['穩定度', '規劃是否務實、情緒是否穩定'],
              ['抗壓能力', '面對課業／生活困難的調適能力'],
              ['家庭支持度', '家人是否支持其來台就學'],
              ['整體印象', '綜合上述的整體評價'],
            ].map(([k, v]) => (
              <tr key={k}><td style={{ padding: '7px 10px', borderTop: `1px solid #f5f4f0`, fontWeight: 600 }}>{k}</td><td style={{ padding: '7px 10px', borderTop: `1px solid #f5f4f0`, color: '#444' }}>{v}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        {[
          ['建議錄取', '表現符合期待，建議收', C.green, C.greenSoft],
          ['備取', '尚可，視名額遞補考慮', C.amber, C.amberBg],
          ['不建議錄取', '未達標準，不建議收', C.red, C.redBg],
        ].map(([t, d, color, bg]) => (
          <div key={t} style={{ flex: '1 1 150px', background: bg, borderRadius: 10, padding: '10px 12px' }}>
            <b style={{ color }}>{t}</b>
            <div style={{ fontSize: 12, color: '#444', marginTop: 2 }}>{d}</div>
          </div>
        ))}
      </div>

      <StepHead n="?">常見問題</StepHead>
      {[
        ['送出後分數打錯怎麼辦？', '到「已評分」點「再次評分 →」重打一份即可；系統允許重複評分，放榜以最新一筆為主要參考。'],
        ['別的老師也評過會被蓋掉嗎？', '不會。每位老師的評分各自獨立一筆，點「查看」可看到全部。'],
        ['名單裡找不到某位學生？', '第二階段只會出現「通過第一階段（實體面試）」的學生；若還沒通過一階就不會出現，請洽行政人員。'],
        ['關掉頁面或重新整理會不見嗎？', '不會，每筆評分一送出就存到系統了；當天的姓名與日期也會自動沿用。'],
      ].map(([q, a]) => (
        <div key={q} style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 8, padding: '10px 13px', marginBottom: 8 }}>
          <div style={{ fontWeight: 600, fontSize: 13.5 }}><span style={{ color: C.green, fontWeight: 800, marginRight: 6 }}>Q</span>{q}</div>
          <div style={{ fontSize: 13, color: '#444', marginTop: 5, lineHeight: 1.65 }}>{a}</div>
        </div>
      ))}

      <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '13px 16px', marginTop: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: C.amber, marginBottom: 6 }}>⚠ 三個最重要的提醒</div>
        <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13.5, lineHeight: 1.7 }}>
          <li><b>一定要選「錄取建議」</b>——放榜會議的關鍵依據。</li>
          <li><b>送出前看一下確認視窗</b>，核對分數與建議再按「確認送出」。</li>
          <li><b>當天評完按「完成今日評分」並下載查核表</b>交給行政人員。</li>
        </ul>
      </div>
    </Modal>
  )
}
