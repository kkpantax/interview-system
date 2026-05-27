import { useState } from 'react'
import { Modal, Btn } from './UI'
import { getScriptUrl, setScriptUrl } from '../api'

export default function SetupModal({ onClose, onSaved }) {
  const [url, setUrl] = useState(getScriptUrl)

  const handleSave = () => {
    setScriptUrl(url.trim())
    onSaved?.()
    onClose()
  }

  const steps = [
    '開啟 Google Sheets，建立新試算表，命名「實踐大學面試資料」',
    '點「擴充功能」→「Apps Script」，把 Apps_Script_後端.js 的內容貼進去並儲存（Ctrl+S）',
    '點上方「部署」→「新增部署」→ 類型選「網頁應用程式」',
    '執行身分選「我」，存取權選「任何人」，點「部署」，第一次會要求授權請允許',
    '複製部署完成後出現的 URL，貼到下方欄位，點儲存',
  ]

  return (
    <Modal title="Google Sheets 同步設定" onClose={onClose}>
      <label style={{ fontSize: 13, color: '#555', display: 'block', marginBottom: 6 }}>
        Apps Script Web App URL
      </label>
      <input
        type="text"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://script.google.com/macros/s/.../exec"
        style={{
          width: '100%', border: '1px solid #ddd', borderRadius: 7,
          padding: '9px 12px', fontSize: 13, fontFamily: 'inherit',
          outline: 'none', marginBottom: 20,
        }}
      />

      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>設定步驟</div>
      {steps.map((step, i) => (
        <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 10, fontSize: 13, color: '#444', lineHeight: 1.6, alignItems: 'flex-start' }}>
          <div style={{
            minWidth: 20, height: 20, background: '#1a1a18', color: 'white',
            borderRadius: '50%', fontSize: 11, display: 'flex',
            alignItems: 'center', justifyContent: 'center', marginTop: 2, flexShrink: 0,
          }}>{i + 1}</div>
          <span>{step}</span>
        </div>
      ))}

      <div style={{ background: '#fef9c3', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#92400e', marginTop: 8 }}>
        ⚠ 設定只需做一次。之後所有老師開啟網站，資料都會自動同步到同一個 Google Sheets。
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
        <Btn onClick={onClose}>取消</Btn>
        <Btn variant="primary" onClick={handleSave}>儲存</Btn>
      </div>
    </Modal>
  )
}
