// 各日人數長條圖（共用）：學生總覽（一階）、二階報到、進度總覽皆使用。
// data: { dates: [iso...], m: { iso: count }, unscheduled }
// 傳入 onPick 時柱子可點選（activeDate 高亮）；不傳則為唯讀統計。
const mdOf = (iso) => { const [, mo, d] = iso.split('-'); return `${+mo}/${+d}` }

const THEMES = {
  blue:  { dark: '#1e40af', light: '#bfdbfe', bg: '#f8faff', border: '#dbeafe' },
  green: { dark: '#15803d', light: '#bbf7d0', bg: '#f6fdf8', border: '#dcfce7' },
}

export default function DayBarChart({ title, data, activeDate, onPick, theme = 'blue', hint, style }) {
  const t = THEMES[theme] || THEMES.blue
  if (!data || (data.dates.length === 0 && !data.unscheduled)) return null
  const maxC = Math.max(1, ...data.dates.map((d) => data.m[d]))

  return (
    <div style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: 8, padding: '10px 12px 8px', ...style }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, marginBottom: 4, gap: 8, flexWrap: 'wrap' }}>
        <span style={{ color: t.dark, fontWeight: 600 }}>{title}</span>
        <span style={{ color: '#94a3b8' }}>
          {hint}
          {data.unscheduled > 0 && `${hint ? ' · ' : ''}未排 ${data.unscheduled} 人`}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, overflowX: 'auto', paddingTop: 4 }}>
        {data.dates.map((iso) => {
          const c = data.m[iso]
          const active = activeDate === iso
          const h = 6 + Math.round(36 * (c / maxC))
          return (
            <button key={iso}
              onClick={() => { if (onPick) onPick(iso) }}
              title={onPick ? `${iso} · ${c} 人（點擊選取此日）` : `${iso} · ${c} 人`}
              style={{
                flex: '1 1 0', minWidth: 44, maxWidth: 76,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                background: 'none', border: 'none', padding: 0,
                cursor: onPick ? 'pointer' : 'default', fontFamily: 'inherit',
              }}>
              <span style={{ fontSize: 11, fontWeight: active ? 700 : 500, color: active ? t.dark : '#64748b' }}>{c}</span>
              <div style={{
                width: '100%', height: h, borderRadius: '4px 4px 0 0',
                background: active ? t.dark : t.light,
                transition: 'background .12s',
              }} />
              <span style={{ fontSize: 11, fontWeight: active ? 700 : 400, color: active ? t.dark : '#94a3b8', whiteSpace: 'nowrap' }}>
                {mdOf(iso)}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
