const GROUPS = [
  {
    label: '國際事務處入口',
    desc: '行政作業與錄取流程管理',
    entries: [
      { key: 'admin',  hash: '#/login?stage=admin', icon: '⚙', title: '行政人員',     desc: '上傳名單、查看總覽、帳號管理、匯出最終名單', bg: '#f5f4f0', fg: '#1a1a18' },
      { key: 'stage1', hash: '#/login?stage=1',      icon: '①', title: '第一階段老師', desc: '每日簽到確認、填中心、產出當日名單',          bg: '#eff6ff', fg: '#1e40af' },
      { key: 'stage3', hash: '#/stage3',             icon: '③', title: '第三階段錄取', desc: '彙整兩階段結果、確認正備取（管理員）',        bg: '#faf5ff', fg: '#7e22ce' },
      { key: 'stage4', hash: '#/login?stage=stage4', icon: '④', title: '第四階段確認', desc: '繳費就讀確認、候補遞補管理（管理員）',        bg: '#fff7ed', fg: '#c2410c' },
    ],
  },
  {
    label: '各系評分入口',
    desc: '各科系面試評分作業',
    entries: [
      { key: 'stage2', hash: '#/login?stage=2', icon: '②', title: '第二階段老師', desc: '依科系評分、給予錄取建議', bg: '#f0fdf4', fg: '#15803d' },
    ],
  },
]

export default function Landing() {
  const go = (hash) => { window.location.hash = hash }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f4f0', padding: 24 }}>
      <div style={{ width: 760, maxWidth: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 30, fontWeight: 700 }}>實踐大學</div>
          <div style={{ fontSize: 16, color: '#555' }}>國際生面試管理系統</div>
          <div style={{ fontSize: 13, color: '#aaa', marginTop: 4 }}>請選擇入口</div>
        </div>

        {GROUPS.map((group) => (
          <div key={group.label} style={{ marginBottom: 28 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid #e8e7e3' }}>
              <div style={{ fontSize: 17, fontWeight: 700 }}>{group.label}</div>
              <div style={{ fontSize: 12, color: '#aaa' }}>{group.desc}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 14 }}>
              {group.entries.map((e) => (
                <button
                  key={e.key}
                  onClick={() => go(e.hash)}
                  style={{
                    display: 'flex', flexDirection: 'column', gap: 8, padding: '24px 18px',
                    border: '1px solid #e8e7e3', borderRadius: 14, background: 'white',
                    cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                    transition: 'all .15s', minHeight: 150,
                  }}
                  onMouseEnter={(ev) => { ev.currentTarget.style.borderColor = '#bbb'; ev.currentTarget.style.transform = 'translateY(-2px)' }}
                  onMouseLeave={(ev) => { ev.currentTarget.style.borderColor = '#e8e7e3'; ev.currentTarget.style.transform = 'none' }}
                >
                  <div style={{ width: 44, height: 44, borderRadius: 10, background: e.bg, color: e.fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 700 }}>
                    {e.icon}
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>{e.title}</div>
                  <div style={{ fontSize: 12, color: '#888', lineHeight: 1.5 }}>{e.desc}</div>
                </button>
              ))}
            </div>
          </div>
        ))}

        <div style={{ marginTop: 4, fontSize: 12, color: '#aaa', textAlign: 'center' }}>
          各入口皆需登入；老師帳號由行政人員建立
        </div>
      </div>
    </div>
  )
}
