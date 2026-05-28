// 老師登入狀態存在 sessionStorage（key: teacher），由 TeacherLogin 寫入。
export function getTeacher() {
  try { return JSON.parse(sessionStorage.getItem('teacher')) }
  catch { return null }
}

export function logoutTeacher() {
  sessionStorage.removeItem('teacher')
  window.location.hash = '#/'
}
