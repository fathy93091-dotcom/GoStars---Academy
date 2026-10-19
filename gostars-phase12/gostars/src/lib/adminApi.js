// استدعاء دالة الخادم /api/admin-users بتوكن المستخدم الحالي
export async function adminUsers(accessToken, payload) {
  let res
  try {
    res = await fetch('/api/admin-users', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(payload),
    })
  } catch {
    throw Object.assign(new Error('network'), { code: 'network' })
  }
  let data = {}
  try { data = await res.json() } catch { /* الاستجابة ليست JSON */ }
  if (!res.ok) throw Object.assign(new Error(data.error || 'failed'), { status: res.status, code: data.error })
  return data
}

export const errorMessage = e => {
  if (e.status === 404 || e.status === 405 || e.code === 'network')
    return 'خدمة الحسابات غير متاحة هنا. تعمل بعد النشر على Cloudflare Pages.'
  return ({
    server_not_configured: 'لم تُضبط متغيرات الخادم في Cloudflare بعد.',
    unauthorized: 'انتهت الجلسة، سجّل الدخول من جديد.',
    forbidden: 'لا تملك صلاحية تنفيذ هذا الإجراء.',
    forbidden_role: 'لا تملك صلاحية إدارة هذا النوع من الحسابات.',
    invalid_name: 'الاسم يجب أن يكون بين حرفين و80 حرفاً.',
    invalid_email: 'البريد الإلكتروني غير صحيح.',
    invalid_username: 'اسم المستخدم: 3 إلى 30 حرفاً إنجليزياً صغيراً أو أرقاماً أو (. _ -).',
    exists: 'يوجد حساب بهذا البريد/الاسم من قبل.',
    cannot_modify_self: 'لا يمكنك تعديل حسابك من هنا.',
  }[e.code] || 'حدث خطأ غير متوقع.')
}
