import { useState, useEffect } from 'react'
import { getDepartments } from '../api'

const ENTRIES = [
  { key: 'admin',  hash: '#/admin',  icon: '⚙', title: '行政人員',       desc: '上傳名單、查看總覽、匯出最終名單', bg: '#f5f4f0', fg: '#1a1a18' },
  { key: 'stage1', hash: '#/stage1', icon: '①', title: '第一階段老師',   desc: '每日簽到確認、填中心、產出當日名單', bg: '#eff6ff', fg: '#1e40af' },
  { key: 'stage2', hash: null,       icon: '②', title: '第二階段老師',   desc: '依科系評分、給予錄取建議',          bg: '#f0fdf4', fg: '#15803d' },
]

export default function Landing() {
  const [depts, setDepts] = useState([])
  const [pickDept, setPickDept] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    getDepartments().then(setDepts).catch((e) => setErr(e.message))
  }, [])

  const go = (hash) => { window.location.hash = hash }
  const goStage2 = (dept) => { window.location.hash = `#/stage2?dept=${encodeURIComponent(dept)}` }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f4f0', padding: 24 }}>
      <div style={{ width: 760, maxWidth: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 30, fontWeight: 700 }}>實踐大學</div>
          <div style={{ fontSize: 16, color: '#555' }}>國際生面試管理系統</div>
          <div style={{ fontSize: 13, color: '#aaa', marginTop: 4 }}>請選擇入口</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          {ENTRIES.map((e) => (
            <button
              key={e.key}
              onClick={() => (e.hash ? go(e.hash) : setPickDept((v) => !v))}
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

        {/* 第二階段：選科系 */}
        {pickDept && (
          <div style={{ marginTop: 16, background: 'white', border: '1px solid #e8e7e3', borderRadius: 14, padding: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: '#15803d' }}>第二階段老師 — 請選擇您的科系</div>
            {depts.length === 0 ? (
              <div style={{ fontSize: 13, color: '#aaa' }}>
                {err ? `載入科系失敗：${err}` : '尚無科系資料（請先由行政人員匯入名單）'}
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
                {depts.map((d) => (
                  <button
                    key={d}
                    onClick={() => goStage2(d)}
                    style={{
                      padding: '10px 12px', border: '1px solid #bbf7d0', borderRadius: 8,
                      background: '#f0fdf4', color: '#15803d', cursor: 'pointer',
                      fontSize: 13, fontFamily: 'inherit', textAlign: 'left',
                    }}
                  >
                    {d}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {err && !pickDept && (
          <div style={{ marginTop: 14, fontSize: 12, color: '#dc2626', textAlign: 'center' }}>
            ⚠ 資料載入失敗：{err}
          </div>
        )}
      </div>
    </div>
  )
}
