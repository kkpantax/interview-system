// 老師登入狀態存在 localStorage（key: teacher），由 TeacherLogin 寫入。
// 註：用 localStorage（非 sessionStorage），登入狀態跨瀏覽器重開仍保留，方便現場老師輪流評分。
export function getTeacher() {
  try { return JSON.parse(localStorage.getItem('teacher')) }
  catch { return null }
}

export function logoutTeacher() {
  localStorage.removeItem('teacher')
  window.location.hash = '#/'
}
