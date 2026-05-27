// ── 共用 UI 元件 ──────────────────────────────────────────────────────────────

export const s = {
  btn: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '7px 14px', borderRadius: 7, fontSize: 13,
    cursor: 'pointer', border: '1px solid #ddd',
    background: 'white', color: '#1a1a18', transition: 'all .15s',
    whiteSpace: 'nowrap', fontFamily: 'inherit',
  },
  btnSm: { padding: '4px 10px', fontSize: 12 },
  pill:  { display: 'inline-block', padding: '2px 8px', borderRadius: 99, fontSize: 11 },
  card:  { background: 'white', borderRadius: 10, border: '1px solid #e8e7e3', overflow: 'hidden' },
  cardHead: {
    padding: '14px 18px', borderBottom: '1px solid #f0efeb',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    fontSize: 14, fontWeight: 600,
  },
  ta: {
    width: '100%', border: '1px solid #e8e7e3', borderRadius: 7,
    padding: '10px 12px', fontSize: 13, resize: 'vertical',
    minHeight: 70, color: '#1a1a18', fontFamily: 'inherit', outline: 'none',
  },
  input: {
    width: '100%', border: '1px solid #e8e7e3', borderRadius: 7,
    padding: '8px 10px', fontSize: 13, color: '#1a1a18',
    fontFamily: 'inherit', outline: 'none', marginBottom: 6,
  },
  sel: {
    border: '1px solid #ddd', background: 'white',
    padding: '7px 10px', borderRadius: 7, fontSize: 13,
    fontFamily: 'inherit', cursor: 'pointer', outline: 'none',
  },
  secLabel: {
    fontSize: 11, fontWeight: 700, color: '#aaa',
    letterSpacing: '.06em', textTransform: 'uppercase',
    marginBottom: 8, marginTop: 4, display: 'block',
  },
}

export function Btn({ children, onClick, style, disabled, variant }) {
  const variants = {
    primary: { background: '#1a1a18', color: '#f5f4f0', borderColor: '#1a1a18' },
    green:   { background: '#dcfce7', color: '#15803d', borderColor: '#86efac' },
    amber:   { background: '#fef3c7', color: '#92400e', borderColor: '#fcd34d' },
    red:     { background: '#fee2e2', color: '#991b1b', borderColor: '#fca5a5' },
    blue:    { background: '#dbeafe', color: '#1e40af', borderColor: '#93c5fd' },
  }
  return (
    <button
      style={{ ...s.btn, ...(variants[variant] || {}), ...style }}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  )
}

export function Card({ children, style }) {
  return <div style={{ ...s.card, ...style }}>{children}</div>
}

export function CardHead({ left, right }) {
  return (
    <div style={s.cardHead}>
      <span>{left}</span>
      {right && <span style={{ fontSize: 13, fontWeight: 400, color: '#888' }}>{right}</span>}
    </div>
  )
}

export function Pill({ children, color, bg }) {
  return (
    <span style={{ ...s.pill, background: bg || '#f3f4f6', color: color || '#6b7280' }}>
      {children}
    </span>
  )
}

export function Modal({ title, onClose, children, width = 560 }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)',
      zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'white', borderRadius: 12, padding: 24,
        width, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>{title}</h2>
          <button
            style={{ background: 'none', border: 'none', fontSize: 20, color: '#888', cursor: 'pointer' }}
            onClick={onClose}
          >✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Toast({ msg, type }) {
  if (!msg) return null
  const bg = type === 'error' ? '#dc2626' : type === 'warn' ? '#d97706' : '#1a1a18'
  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, background: bg,
      color: 'white', padding: '12px 18px', borderRadius: 8,
      fontSize: 13, zIndex: 999,
    }}>
      {msg}
    </div>
  )
}

export function BackBtn({ onClick }) {
  return (
    <button
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        background: 'none', border: 'none', fontSize: 13,
        color: '#777', cursor: 'pointer', fontFamily: 'inherit',
        padding: 0, marginBottom: 14,
      }}
      onClick={onClick}
    >
      ← 返回名單
    </button>
  )
}
