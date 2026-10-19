// الأدوار والصلاحيات (حسب وثيقة المشروع)

export const homeFor = role =>
  ({ admin: '/admin', supervisor: '/admin', teacher: '/teacher', parent: '/parent' }[role] || '/login')

export const roleLabel = role =>
  ({ admin: 'مدير', supervisor: 'مشرف', teacher: 'معلم', parent: 'ولي أمر' }[role] || role)

// مفاتيح صلاحيات المشرف التي يمنحها المدير
export const SUPERVISOR_PERMISSIONS = [
  { key: 'manage_users', label: 'إدارة المعلمين وأولياء الأمور' },
  { key: 'manage_students', label: 'إدارة الطلاب' },
  { key: 'manage_groups', label: 'إدارة المجموعات' },
  { key: 'follow_teachers', label: 'متابعة المعلمين' },
  { key: 'follow_reports', label: 'متابعة التقارير' },
  { key: 'manage_finance', label: 'إدارة المالية والمدفوعات' },
  { key: 'manage_content', label: 'إدارة محتوى الموقع' },
  { key: 'add_announcements', label: 'إضافة الإعلانات' },
]

// بريد داخلي لأولياء الأمور الذين يدخلون باسم مستخدم بدل البريد
export const PARENT_DOMAIN = 'parent.gostars.local'
export const toEmail = identifier => {
  const v = identifier.trim()
  return v.includes('@') ? v : `${v.toLowerCase()}@${PARENT_DOMAIN}`
}
