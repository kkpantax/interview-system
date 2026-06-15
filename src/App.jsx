import { useState, useEffect, lazy, Suspense } from 'react'
import Landing from './pages/Landing'
import AdminApp from './pages/AdminApp'
import Stage1App from './pages/Stage1App'
import Stage1ConfirmApp from './pages/Stage1ConfirmApp'
import Stage2App from './pages/Stage2App'
import CheckinApp from './pages/CheckinApp'
import Stage3App from './pages/Stage3App'
import Stage4App from './pages/Stage4App'
import ConfirmApp from './pages/ConfirmApp'
import TeacherLogin from './pages/TeacherLogin'

const StatsApp = lazy(() => import('./pages/StatsApp'))

// 解析 window.location.hash → { path, query }
// 例：#/stage2?dept=餐飲管理學系(專) → { path:'/stage2', query:{dept:'餐飲管理學系(專)'} }
function parseHash() {
  const raw = window.location.hash.replace(/^#/, '') || '/'
  const [path, queryStr = ''] = raw.split('?')
  const query = Object.fromEntries(new URLSearchParams(queryStr))
  return { path: path || '/', query }
}

export default function App() {
  const [route, setRoute] = useState(parseHash)

  useEffect(() => {
    const onChange = () => setRoute(parseHash())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  const { path, query } = route

  if (path === '/admin')  return <AdminApp />
  if (path === '/login')  return <TeacherLogin stage={query.stage || '1'} />
  if (path === '/stage1') return <Stage1App />
  if (path === '/confirm1') return <Stage1ConfirmApp />
  if (path === '/stage2') return <Stage2App dept={query.dept || ''} />
  if (path === '/checkin2') return <CheckinApp />
  if (path === '/stage3') return <Stage3App />
  if (path === '/stage4') return <Stage4App />
  if (path === '/confirm') return <ConfirmApp token={query.t || ''} />
  if (path === '/stats')  return (
    <Suspense fallback={<div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#f5f4f0', color:'#999', fontSize:14 }}>載入統計儀表板…</div>}>
      <StatsApp />
    </Suspense>
  )
  if (path === '/intl')   return <Landing initialView="intl" />
  return <Landing />
}
