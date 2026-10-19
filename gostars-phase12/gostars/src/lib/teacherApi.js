import { supabase } from './supabase.js'

// أعمدة الحصة المسموح قراءتها (عمود أجر المعلم محجوب عمداً ويُقرأ عبر عروض الأرباح فقط)
export const LESSON_COLS = 'id,teacher_id,group_id,student_id,subject_id,lesson_no,lesson_date,start_time,title,status,general_note,scope'
export const LESSON_SELECT = `${LESSON_COLS},groups(name),students(full_name),subjects(name)`

// ---------- التاريخ (بتوقيت القاهرة، والأسبوع يبدأ السبت) ----------
export const todayStr = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date())
const toUTC = s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d) }
const fromUTC = ms => new Date(ms).toISOString().slice(0, 10)
export const addDays = (s, n) => fromUTC(toUTC(s) + n * 86400000)
export const weekStart = s => { const dow = new Date(toUTC(s)).getUTCDay(); return addDays(s, -((dow + 1) % 7)) }   // السبت=0
export const monthStart = s => s.slice(0, 8) + '01'
export const monthEnd = s => { const [y, m] = s.split('-').map(Number); return fromUTC(Date.UTC(y, m, 0)) }
export const addMonths = (s, n) => { const [y, m] = s.split('-').map(Number); return fromUTC(Date.UTC(y, m - 1 + n, 1)) }

const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
export const dayName = s => DAYS[new Date(toUTC(s)).getUTCDay()]
export const fmtDate = s => `${dayName(s)} ${s.slice(8)}/${s.slice(5, 7)}`
export const fmtTime = t => (t ? t.slice(0, 5) : '—')
export const monthLabel = s => new Intl.DateTimeFormat('ar-EG', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(toUTC(s)))
export const money = n => `${Number(n || 0).toLocaleString('ar-EG')} ج`

export const STATUS_LABEL = { scheduled: 'مجدولة', done: 'تمت', cancelled: 'ملغاة' }
export const ATT_LABEL = { present: 'حاضر', late: 'متأخر', absent: 'غائب' }
export const HW_LABEL = { done: 'منجز', partial: 'جزئي', not_done: 'غير منجز' }

export const lessonTarget = l => l.groups?.name || l.students?.full_name || '—'

// أرشفة الباقات المنتهية (آمنة ومتكررة)
export const refreshPackages = () => supabase.rpc('refresh_packages')

// حفظ صف بدون upsert (صلاحيات الأعمدة تمنع تحديث أعمدة المطابقة)
export async function saveRow(table, existingId, matchValues, values) {
  if (existingId) return supabase.from(table).update(values).eq('id', existingId).select('id').single()
  return supabase.from(table).insert({ ...matchValues, ...values }).select('id').single()
}

// استدعاء دالة الذكاء الاصطناعي على الخادم
export async function aiReport(accessToken, payload) {
  let res
  try {
    res = await fetch('/api/ai-report', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(payload),
    })
  } catch { throw Object.assign(new Error('network'), { code: 'network' }) }
  let data = {}
  try { data = await res.json() } catch { /* ليست JSON */ }
  if (!res.ok) throw Object.assign(new Error(data.error || 'failed'), { status: res.status, code: data.error })
  return data.text
}

export const aiErrorMessage = e => {
  if (e.status === 404 && !e.code) return 'خدمة الذكاء الاصطناعي تعمل بعد النشر على Cloudflare Pages.'
  if (e.code === 'network') return 'تعذّر الاتصال بخدمة الذكاء الاصطناعي. تعمل بعد النشر على Cloudflare Pages.'
  return ({
    server_not_configured: 'لم يُضبط مفتاح Gemini في Cloudflare بعد.',
    unauthorized: 'انتهت الجلسة، سجّل الدخول من جديد.',
    forbidden: 'غير مسموح.',
    not_found: 'لا تملك صلاحية على هذا الطالب أو الحصة.',
    rate_limited: 'وصلت للحد الأقصى هذه الساعة. حاول لاحقاً.',
    ai_rate_limited: 'خدمة Gemini مشغولة (الحد المجاني). حاول بعد دقيقة.',
    ai_failed: 'تعذّر توليد النص. حاول مرة أخرى.',
    ai_empty: 'لم يُنتج النموذج نصاً. أعد المحاولة.',
  }[e.code] || 'حدث خطأ غير متوقع.')
}

// إنهاء باقة الآن (يدوياً): تُقفل بتاريخ اليوم كحد أقصى حتى لا تتداخل مع التالية
export function endPackageNow(p) {
  const today = todayStr()
  let end = p.ends_on && p.ends_on < today ? p.ends_on : today
  if (end < p.starts_on) end = p.starts_on
  return supabase.from('student_packages').update({ status: 'archived', ends_on: end }).eq('id', p.package_id || p.id)
}

export const saveSummary = (packageId, text) => supabase.rpc('save_package_summary', { pid: packageId, txt: text })

// ---------- مرفقات التقارير (تخزين خاص، مسار: معلم/حصة/طالب/ملف) ----------
export const ATTACH_MAX = 5
export const ATTACH_BYTES = 20 * 1024 * 1024
export const ATTACH_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' }

export function checkAttachment(file, current) {
  if (current >= ATTACH_MAX) return `الحد الأقصى ${ATTACH_MAX} مرفقات للتقرير.`
  if (!ATTACH_TYPES.includes(file.type)) return 'المسموح: صور (JPG/PNG/WebP) أو PDF فقط.'
  if (file.size > ATTACH_BYTES) return 'حجم الملف أكبر من 20 ميجابايت.'
  return ''
}

// اسم الملف على التخزين عشوائي (آمن)؛ الاسم الأصلي يُحفظ في بيانات المرفق للعرض فقط
export async function uploadReportFile(teacherId, lessonId, studentId, file) {
  const path = `${teacherId}/${lessonId}/${studentId}/${crypto.randomUUID()}.${EXT[file.type]}`
  const { error } = await supabase.storage.from('report-files').upload(path, file, { contentType: file.type, upsert: false })
  if (error) throw error
  return { path, name: file.name.slice(0, 80), type: file.type, size: file.size }
}
export const removeReportFiles = paths => (paths.length ? supabase.storage.from('report-files').remove(paths) : Promise.resolve())
export async function openAttachment(path) {
  const { data, error } = await supabase.storage.from('report-files').createSignedUrl(path, 120)
  if (error || !data?.signedUrl) return false
  window.open(data.signedUrl, '_blank', 'noopener')
  return true
}
