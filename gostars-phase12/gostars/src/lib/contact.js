import { supabase } from './supabase.js'

// إرسال رسالة التواصل: تُحفظ في جدول contact_messages (الزائر يُدخل فقط، والقراءة للمدير/المشرف).
// بدون إعداد Supabase (بيئة تطوير) لا تُحفظ.
export async function sendContactMessage(data) {
  if (!supabase) {
    if (import.meta.env.DEV) console.info('[contact] (Supabase غير مضبوط، لم تُحفظ)', data)
    return { ok: true }
  }
  const { error } = await supabase.from('contact_messages').insert({ name: data.name, phone: data.phone, role: data.role, message: data.message })
  if (error) throw new Error(/rate_limited/.test(error.message || '') ? 'rate_limited' : 'send_failed')
  return { ok: true }
}

export function validateContact({ name, phone, message }) {
  const errors = {}
  if (name.trim().length < 3) errors.name = 'اكتب اسمك (3 أحرف على الأقل)'
  const digits = phone.replace(/[\s\-+()]/g, '')
  if (!/^\d{8,15}$/.test(digits)) errors.phone = 'اكتب رقم هاتف صحيحاً (أرقام فقط، من 8 إلى 15 رقماً)'
  if (message.trim().length < 5) errors.message = 'اكتب رسالتك (5 أحرف على الأقل)'
  return errors
}
