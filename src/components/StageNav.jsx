import { getTeacher } from '../auth'

// 行政人員專用的「階段切換列」：只在 localStorage 登入身分為 admin / superadmin 時顯示。
// 由 PageShell 透過 stageKey prop 自動渲染在 header 下方，各頁不需自行處理。
const ITEMS = [
  { key: 'admin',    label: '書審後台',   hash: '#/admin' },
  { key: 'stage1',   label: '① 面試評分', hash: '#/stage1' },
  { key: 'confirm1', label: '① 實體確認', hash: '#/confirm1' },
  { key: 'checkin2', label: '② 系所報到', hash: '#/checkin2' },
  { key: 'stage2',   label: '② 系所評分', hash: '#/stage2' },
  { key: 'stage3',   label: '③ 放榜',     hash: '#/stage3' },
  { key: 'stage4',   label: '④ 就學確認', hash: '#/stage4' },
  { key: 'stats',    label: '📊 統計',    hash: '#/stats' },
]

export function StageNav({ current, accent = '#1a1a18' }) {
  const t = getTeacher()
  if (!t || (t.role !== 'admin' && t.role !== 'superadmin')) return null

  return (
    <div
      style={{
        background: accent, padding: '6px 24px',
        display: 'flex', alignItems: 'center', gap: 6,
        borderTop: '1px solid #ffffff1f',
        position: 'sticky', top: 52, zIndex: 99,
        overflowX: 'auto',
      }}
    >
      <span style={{ fontSize: 11, color: '#ffffff88', marginRight: 4, whiteSpace: 'nowrap' }}>
        階段切換
      </span>
      {ITEMS.map((it) => {
        const active = it.key === current
        return (
          <button
            key={it.key}
            onClick={() => { if (!active) window.location.hash = it.hash }}
            style={{
              background: active ? '#f5f4f0' : 'none',
              border: active ? '1px solid #f5f4f0' : '1px solid #ffffff33',
              color: active ? '#1a1a18' : '#f5f4f0',
              fontWeight: active ? 700 : 400,
              borderRadius: 999, padding: '3px 12px', fontSize: 12,
              cursor: active ? 'default' : 'pointer', fontFamily: 'inherit',
              whiteSpace: 'nowrap',
            }}
          >
            {it.label}
          </button>
        )
      })}
    </div>
  )
}
