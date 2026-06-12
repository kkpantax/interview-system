import { useState } from 'react'
import { Modal, Btn } from './UI'

// ℹ 面試資訊：集中顯示老師時段表、各系 Meet 連結與其他資訊連結（資料來自 info_links）。
export default function InfoLinksModal({ links = [], onClose }) {
  const [copiedId, setCopiedId] = useState(null)

  const copy = async (row) => {
    try {
      await navigator.clipboard.writeText(row.url)
      setCopiedId(row.id)
      setTimeout(() => setCopiedId(null), 1800)
    } catch {
      window.prompt('請手動複製連結：', row.url)
    }
  }

  const groups = [
    { kind: 'schedule', title: '📑 老師面試時段安排表', hint: '各系主任填寫的每日時段／老師／線上或實體' },
    { kind: 'meet',     title: '📹 各系視訊面試連結',   hint: '點「複製」可貼給老師或協助翻譯的學生' },
    { kind: 'link',     title: '🔗 其他連結',           hint: null },
  ]

  const row = (r) => (
    <div key={r.id} style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
      border: '1px solid #e8e7e3', borderRadius: 10, marginBottom: 8,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{r.label}</div>
        <div style={{ fontSize: 11, color: '#999', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {r.kind === 'meet' && r.departments ? `對應：${r.departments} · ` : ''}{r.url}
        </div>
      </div>
      <Btn onClick={() => copy(r)} style={copiedId === r.id ? { background: '#dcfce7', borderColor: '#86efac', color: '#15803d' } : undefined}>
        {copiedId === r.id ? '✓ 已複製' : '複製'}
      </Btn>
      <Btn variant="primary" onClick={() => window.open(r.url, '_blank', 'noopener')}>開啟</Btn>
    </div>
  )

  return (
    <Modal title="ℹ 面試資訊" onClose={onClose} width={640}>
      {!links.length && (
        <div style={{ fontSize: 13, color: '#888', padding: '8px 0 16px' }}>
          尚未設定任何連結。請至行政後台「連結管理」分頁新增。
        </div>
      )}
      {groups.map((g) => {
        const items = links.filter((l) => l.kind === g.kind)
        if (!items.length) return null
        return (
          <div key={g.kind} style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{g.title}</div>
            {g.hint && <div style={{ fontSize: 11, color: '#999', marginBottom: 8 }}>{g.hint}</div>}
            {items.map(row)}
          </div>
        )
      })}
      <div style={{ fontSize: 11, color: '#aaa', borderTop: '1px solid #f0efeb', paddingTop: 10 }}>
        連結內容可由行政後台「連結管理」分頁編輯（每年更換 Meet 連結時直接修改即可）。
      </div>
    </Modal>
  )
}
