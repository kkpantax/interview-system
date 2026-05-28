import { useState, useEffect } from 'react'
import Landing from './pages/Landing'
import AdminApp from './pages/AdminApp'
import Stage1App from './pages/Stage1App'
import Stage2App from './pages/Stage2App'

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
  if (path === '/stage1') return <Stage1App />
  if (path === '/stage2') return <Stage2App dept={query.dept || ''} />
  return <Landing />
}
