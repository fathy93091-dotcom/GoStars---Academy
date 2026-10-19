// نص رسالة التقرير المرسلة لولي الأمر. دالة نقية (قابلة للاختبار).
const ATT = { present: 'حاضر', late: 'حاضر (متأخر)', absent: 'غائب' }
const HW = { done: 'أنجزه', partial: 'أنجز بعضه', not_done: 'لم ينجزه' }
const MAX = 3500

const day = s => { const [y, m, d] = String(s || '').slice(0, 10).split('-'); return y && m && d ? `${d}/${m}/${y}` : '' }
const clip = (t, n) => (t.length > n ? t.slice(0, n - 1) + '…' : t)

export const DEFAULTS = {
  header_text: 'أكاديمية GoStars ⭐', footer_text: 'يمكنك متابعة كل التفاصيل من بوابة ولي الأمر على موقع الأكاديمية. 🌟',
  show_teacher: true, show_homework: true, show_notes: true, show_guidance: true,
}

// s: إعدادات المدير (bot_settings). أي حقل ناقص يأخذ الافتراضي.
export function formatReport(r, s = {}) {
  const o = { ...DEFAULTS, ...Object.fromEntries(Object.entries(s || {}).filter(([, v]) => v !== undefined && v !== null)) }
  const lines = [`*${o.header_text}*`, `تقرير حصة: *${r.student_name}*`]
  const meta = [r.subject_name, r.group_name, r.lesson_no ? `الحصة رقم ${r.lesson_no}` : '', day(r.lesson_date)].filter(Boolean)
  if (meta.length) lines.push(meta.join(' · '))
  if (r.lesson_title) lines.push(`الدرس: ${r.lesson_title}`)
  if (o.show_teacher && r.teacher_name) lines.push(`المعلم: ${r.teacher_name}`)
  lines.push('')
  if (r.att_status) lines.push(`الحضور: ${ATT[r.att_status] || r.att_status}`)
  if (o.show_homework && r.hw_status) {
    let h = `الواجب: ${HW[r.hw_status] || r.hw_status}`
    if (r.hw_score != null && r.hw_score !== '') h += ` (الدرجة ${Number(r.hw_score)})`
    lines.push(h)
    if (r.hw_note) lines.push(`ملاحظة الواجب: ${r.hw_note}`)
  }
  if (o.show_notes && r.teacher_notes?.trim()) lines.push('', '*ملاحظات المعلم:*', r.teacher_notes.trim())
  if (o.show_guidance && r.ai_guidance?.trim()) lines.push('', '*توجيهات للمتابعة في البيت:*', r.ai_guidance.trim())
  if (o.footer_text?.trim()) lines.push('', o.footer_text.trim())
  return clip(lines.join('\n'), MAX)
}
