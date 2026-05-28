import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// server.proxy 只在 `vite`（npm run dev）開發伺服器生效，不影響 build / production。
// 本地沒有 /api/submit（那是 Vercel Edge Function），開發時把 /api 轉到線上 Vercel，
// 即可在 localhost 用真實 Supabase 資料測試。
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'https://interview-system-fawn.vercel.app',
        changeOrigin: true,
        secure: true,
      },
    },
  },
})
