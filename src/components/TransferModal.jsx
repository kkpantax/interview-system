import { useState } from 'react'
import { Modal, Btn, s } from './UI'

// 轉報彈窗：把目前正取/備取生轉去原本未報考的新系，回到第二階段重新評分。
export default function TransferModal({ row, depts, busy, onConfirm, onClose }) {
  const [dept, setDept] = useState('')
  const [note, setNote] = useState('')
  const fromLabel = row.stage3_status === 'admitted' ? '正取' : `備取${row.standby_rank ?? ''}`
  return (
    <Modal title="轉報其他學系" onClose={onClose} width={520}>
      <div style={{ fontSize: 13, lineHeight: 1.8, marginBottom: 12 }}>
        <div><b>{row.appInfo?.name || row.account}</b>　{row.appInfo?.name_english || ''}</div>
        <div style={{ color: '#666' }}>帳號 {row.account}　·　目前：{row.department} · {fromLabel}</div>
      </div>
      <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '9px 12px', fontSize: 12, color: '#9a3412', marginBottom: 14, lineHeight: 1.7 }}>
        確認轉報後：此志願會標記為「已轉報」並<b>開出備取缺額</b>；學生原有志願<b>退出放榜比對</b>；
        系統會在新系建立一筆申請，學生<b>回到該系第二階段重新評分</b>，再經三階放榜回到四階。
      </div>
      <label style={{ fontSize: 12, color: '#666' }}>轉報目標學系（僅列出原本未報考的系）</label>
      <select style={{ ...s.input }} value={dept} onChange={(e) => setDept(e.target.value)}>
        <option value="">— 請選擇 —</option>
        {depts.map((d) => <option key={d} value={d}>{d}</option>)}
      </select>
      <label style={{ fontSize: 12, color: '#666' }}>備注（選填）</label>
      <textarea style={{ ...s.input, minHeight: 60 }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="轉報原因 / 備注" />
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
        <Btn onClick={onClose}>取消</Btn>
        <Btn variant="primary" disabled={!dept || busy} onClick={() => onConfirm(dept, note)}>
          {busy ? '處理中…' : '確認轉報'}
        </Btn>
      </div>
    </Modal>
  )
}
