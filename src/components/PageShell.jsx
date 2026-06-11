import { Toast } from './UI'
import { StageNav } from './StageNav'

// 三入口共用外框：頂部深色 header（含回首頁）+ 內容區 + toast
export function PageShell({ title, subtitle, accent = '#1a1a18', right, toast, children, intlBack = false, stageKey }) {
  return (
    <div style={{ minHeight: '100vh', background: '#f5f4f0' }}>
      <div
        style={{
          background: accent, padding: '0 24px', display: 'flex',
          alignItems: 'center', justifyContent: 'space-between',
          height: 52, position: 'sticky', top: 0, zIndex: 100,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => { window.location.hash = '#/' }}
            style={{
              background: 'none', border: '1px solid #ffffff33', color: '#f5f4f0',
              borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            ← 首頁
          </button>
          {intlBack && (
            <button
              onClick={() => { window.location.hash = '#/intl' }}
              style={{
                background: 'none', border: '1px solid #ffffff33', color: '#f5f4f0',
                borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              ← 國際事務處
            </button>
          )}
          <span style={{ fontSize: 15, fontWeight: 700, color: '#f5f4f0', letterSpacing: '.03em' }}>
            {title}
          </span>
          {subtitle && <span style={{ fontSize: 13, color: '#ffffffaa' }}>{subtitle}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{right}</div>
      </div>

      {stageKey && <StageNav current={stageKey} accent={accent} />}

      <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>{children}</div>

      <Toast msg={toast?.msg} type={toast?.type} />
    </div>
  )
}
