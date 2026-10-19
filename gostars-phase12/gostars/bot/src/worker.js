import { normalizePhone } from './phone.js'
import { formatReport } from './format.js'

// دورة معالجة واحدة: تسحب التقارير الجاهزة وترسلها وتسجّل النتائج.
// كل الاعتماديات تُحقن (api, sender, journal) ليُختبر المنطق بلا واتساب ولا شبكة.
//   sender: { ready(), exists(phone), sendText(phone,text), sendFile(phone,{name,type,url}) }
//   journal: { has(id), add(id) }  سجل محلي بما أُرسل فعلاً، يمنع تكرار الإرسال لو فشل تأكيد النتيجة
export async function processOnce({ api, sender, journal, sleep, log = () => {}, max = 5, info = 'termux', gap }) {
  if (!sender.ready()) { log('واتساب غير متصل بعد — تخطّي الدورة'); return { skipped: true, sent: 0, failed: 0 } }
  const { reports, settings } = await api.claim(max, info)
  const pause = typeof gap === 'function' ? gap : () => 1000 * (settings.delay_min ?? 5) + Math.random() * 1000 * Math.max(0, (settings.delay_max ?? 12) - (settings.delay_min ?? 5))
  let sent = 0, failed = 0
  for (const r of reports) {
    const id = r.report_id
    try {
      if (journal.has(id)) { await api.result(id, true); sent++; log(`(مسجّل مسبقاً) ${id}`); continue }
      const phone = normalizePhone(r.phone)
      if (!phone) { await api.result(id, false, r.phone ? 'رقم ولي الأمر بلا مفتاح الدولة أو غير صالح' : 'لا يوجد رقم لولي الأمر', true); failed++; continue }
      if (!(await sender.exists(phone))) { await api.result(id, false, 'الرقم غير مسجّل في واتساب', true); failed++; continue }
      await sender.sendText(phone, formatReport(r, settings))
      journal.add(id)                                   // أُرسلت الرسالة فعلاً: لا تتكرر مهما حدث بعدها
      for (const f of settings.send_attachments === false ? [] : r.attachments || []) {
        try { await sender.sendFile(phone, f) } catch (e) { log(`تعذّر إرسال مرفق ${f.name}: ${e.message}`) }
      }
      await api.result(id, true); sent++; log(`أُرسل تقرير ${r.student_name}`)
    } catch (e) {
      if (e.fatal) throw e
      failed++; log(`فشل ${id}: ${e.message}`)
      try { await api.result(id, false, String(e.message || 'فشل الإرسال')) } catch { /* ستُعاد عند انتهاء مهلة السحب */ }
    }
    await sleep(pause())                                  // فاصل عشوائي بين الرسائل يقلّل خطر الحظر
  }
  return { skipped: false, sent, failed, paused: Boolean(settings.paused_now) }
}
