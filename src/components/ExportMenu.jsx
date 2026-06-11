import { useState, useRef, useEffect } from 'react'

// header 用的「⬇ 匯出 ▾」下拉選單：把多顆匯出按鈕收成一顆。
// items: [{ label, onClick, disabled? }]
export function ExportMenu({ items, label = '⬇ 匯出', btnStyle = {} }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          background: open ? '#ffffff22' : 'none',
          border: '1px solid #ffffff44', color: '#f5f4f0',
          borderRadius: 6, padding: '4px 10px', fontSize: 12,
          cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
          ...btnStyle,
        }}
      >
        {label} ▾
      </button>
      {open && (
        <div
          style={{
            position: 'absolute', right: 0, top: 'calc(100% + 6px)',
            background: 'white', border: '1px solid #e8e7e3', borderRadius: 10,
            boxShadow: '0 8px 24px rgba(0,0,0,.14)', padding: 6,
            minWidth: 200, zIndex: 200,
          }}
        >
          {items.map((it, i) => (
            <button
              key={i}
              disabled={it.disabled}
              onClick={() => { setOpen(false); it.onClick() }}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                background: 'none', border: 'none', borderRadius: 6,
                padding: '8px 10px', fontSize: 13, color: it.disabled ? '#bbb' : '#1a1a18',
                cursor: it.disabled ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
              }}
              onMouseEnter={(e) => { if (!it.disabled) e.currentTarget.style.background = '#f5f4f0' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
