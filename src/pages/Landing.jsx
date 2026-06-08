import { useState } from 'react'

const PORTALS = [
  { key: 'intl', icon: '🏛', title: '國際事務處入口', desc: '書審通過、實體面試、放榜會議、確認就學', bg: '#eef2ff', fg: '#3730a3' },
  { key: 'dept', icon: '✎',  title: '各系評分入口',  desc: '第二階段老師（各科系面試評分）',                 bg: '#f0fdf4', fg: '#15803d' },
]

const INTL_ENTRIES = [
  { key: 'admin',  hash: '#/login?stage=admin', icon: '⚙', title: '書審通過名單',     desc: '上傳名單、查看總覽、帳號管理、匯出最終名單', bg: '#f5f4f0', fg: '#1a1a18' },
  { key: 'stage1', hash: '#/login?stage=1',      icon: '①', title: '第一階段實體面試名單', desc: '每日簽到確認、填中心、產出當日名單',          bg: '#eff6ff', fg: '#1e40af' },
  { key: 'stage3', hash: '#/stage3',             icon: '③', title: '放榜會議名單', desc: '彙整兩階段結果、確認正備取（管理員）',        bg: '#faf5ff', fg: '#7e22ce' },
  { key: 'stage4', hash: '#/login?stage=stage4', icon: '④', title: '確認就學名單', desc: '繳費就讀確認、候補遞補管理（管理員）',        bg: '#fff7ed', fg: '#c2410c' },
]

export default function Landing() {
  const [view, setView] = useState('home')
  const go = (hash) => { window.location.hash = hash }

  const onCard = (e) => {
    if (e.portal) {
      if (e.key === 'dept') return go('#/stage2')
      if (e.key === 'intl') return setView('intl')
    }
    go(e.hash)
  }

  const cards = view === 'home' ? PORTALS.map((p) => ({ ...p, portal: true })) : INTL_ENTRIES
  const gridCols = view === 'home' ? 'repeat(2, 1fr)' : 'repeat(auto-fill, minmax(170px, 1fr))'

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f4f0', padding: 24 }}>
      <div style={{ width: 760, maxWidth: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 30, fontWeight: 700 }}>實踐大學</div>
          <div style={{ fontSize: 16, color: '#555' }}>國際專修部面試管理系統</div>
          <div style={{ fontSize: 13, color: '#aaa', marginTop: 4 }}>
            {view === 'home' ? '請選擇入口' : '國際事務處入口 — 請選擇作業'}
          </div>
        </div>

        {view === 'intl' && (
          <button
            onClick={() => setView('home')}
            style={{ marginBottom: 16, padding: '6px 14px', border: '1px solid #e8e7e3', borderRadius: 8, background: 'white', cursor: 'pointer', fontSize: 13, color: '#555', fontFamily: 'inherit' }}
          >
            ← 返回
          </button>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 14 }}>
          {cards.map((e) => (
            <button
              key={e.key}
              onClick={() => onCard(e)}
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

        <div style={{ marginTop: 18, fontSize: 12, color: '#aaa', textAlign: 'center' }}>
          各入口皆需登入；老師帳號由行政人員建立
        </div>
      </div>
    </div>
  )
}
