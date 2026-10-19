import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import usePageTitle from '../../hooks/usePageTitle.js'
import { formatReport } from '../../../bot/src/format.js'   // نفس دالة الصيغة التي يستخدمها البوت: المعاينة مطابقة للمرسَل

const SAMPLE = { student_name: 'أحمد علي', subject_name: 'رياضيات', group_name: 'مجموعة 1', lesson_no: 4, lesson_date: '2026-10-12', teacher_name: 'أ. منى',
  att_status: 'present', hw_status: 'partial', hw_score: 7.5, hw_note: 'ناقص السؤال 3', teacher_notes: 'أداء جيد اليوم وتفاعل مع الشرح.', ai_guidance: 'راجع جدول الضرب 10 دقائق يومياً.' }
const HOURS = Array.from({ length: 24 }, (_, i) => i)
const hourLabel = h => `${String(h).padStart(2, '0')}:00`

// إعدادات البوت: المدير فقط. تسري خلال دقائق على البوت بلا لمس الهاتف.
export default function BotSettings() {
  usePageTitle('إعدادات البوت')
  const [s, setS] = useState(null)
  const [orig, setOrig] = useState(null)
  const [msg, setMsg] = useState({ type: '', text: '' })
  const [busy, setBusy] = useState(false)
  useEffect(() => { supabase.from('bot_settings').select('*').eq('id', 1).maybeSingle().then(r => { if (r.error || !r.data) return setMsg({ type: 'err', text: 'تعذّر تحميل الإعدادات. تأكد من تشغيل 011_bot_settings.sql.' }); setS(r.data); setOrig(r.data) }) }, [])
  const set = (k, v) => setS(x => ({ ...x, [k]: v }))
  const num = k => e => set(k, e.target.value === '' ? '' : Number(e.target.value))
  const preview = useMemo(() => (s ? formatReport(SAMPLE, s) : ''), [s])
  const dirty = s && orig && JSON.stringify(s) !== JSON.stringify(orig)

  async function save(e) {
    e.preventDefault(); if (busy) return
    const quiet = s.quiet_from !== null && s.quiet_from !== ''
    const p = {
      enabled: !!s.enabled, hold_seconds: +s.hold_seconds, max_per_cycle: +s.max_per_cycle, delay_min: +s.delay_min, delay_max: +s.delay_max, max_attempts: +s.max_attempts,
      send_to_absent: !!s.send_to_absent, send_attachments: !!s.send_attachments,
      quiet_from: quiet ? +s.quiet_from : null, quiet_to: quiet ? +s.quiet_to : null,
      show_teacher: !!s.show_teacher, show_homework: !!s.show_homework, show_notes: !!s.show_notes, show_guidance: !!s.show_guidance,
      header_text: s.header_text.trim(), footer_text: s.footer_text.trim(),
    }
    if (p.delay_min > p.delay_max) return setMsg({ type: 'err', text: 'الحد الأدنى للفاصل أكبر من الأعلى.' })
    if (!p.header_text) return setMsg({ type: 'err', text: 'اكتب عنواناً للرسالة.' })
    if (quiet && s.quiet_to === '') return setMsg({ type: 'err', text: 'حدّد نهاية ساعات الصمت.' })
    setBusy(true); const { error } = await supabase.from('bot_settings').update(p).eq('id', 1); setBusy(false)
    if (error) return setMsg({ type: 'err', text: 'تعذّر الحفظ. راجع القيم (الحدود مذكورة بجانب كل خيار).' })
    setOrig({ ...s, ...p }); setS(x => ({ ...x, ...p })); setMsg({ type: 'ok', text: 'تم الحفظ. تسري الإعدادات على البوت خلال دقائق.' })
  }

  if (!s) return <section className="section"><div className="container"><p className={msg.type === 'err' ? 'error' : ''}>{msg.text || 'جارٍ التحميل…'}</p></div></section>
  const quietOn = s.quiet_from !== null && s.quiet_from !== ''
  const Check = ({ k, label, hint }) => (<label className="check" style={{ display: 'block', margin: '6px 0' }}><input type="checkbox" checked={!!s[k]} onChange={e => set(k, e.target.checked)} /> {label}{hint && <span className="muted"> — {hint}</span>}</label>)

  return (
    <section className="section"><div className="container stack">
      <form className="card card--accent" onSubmit={save} aria-label="إعدادات البوت">
        <h1 style={{ fontSize: '1.5rem' }}>إعدادات البوت</h1>
        <p className="muted">تتحكم هنا فيما يفعله بوت واتساب. تسري التعديلات خلال دقائق دون لمس الهاتف.</p>
        <h2>التشغيل</h2>
        <Check k="enabled" label="تشغيل الإرسال التلقائي" hint="أوقفه مؤقتاً فتبقى التقارير في الانتظار ولا تضيع" />
        <div className="form-row"><label htmlFor="b-q1">ساعات الصمت (بتوقيت القاهرة) — لا يرسل البوت خلالها</label>
          <div className="actions">
            <label><input type="checkbox" checked={quietOn} onChange={e => { set('quiet_from', e.target.checked ? 22 : null); set('quiet_to', e.target.checked ? 7 : null) }} /> تفعيل</label>
            {quietOn && (<><span>من</span><select id="b-q1" className="field" style={{ width: 'auto' }} value={s.quiet_from} onChange={e => set('quiet_from', Number(e.target.value))}>{HOURS.map(h => <option key={h} value={h}>{hourLabel(h)}</option>)}</select>
              <span>إلى</span><select aria-label="نهاية الصمت" className="field" style={{ width: 'auto' }} value={s.quiet_to} onChange={e => set('quiet_to', Number(e.target.value))}>{HOURS.map(h => <option key={h} value={h}>{hourLabel(h)}</option>)}</select></>)}
          </div></div>
        <h2>من يُرسل له وماذا</h2>
        <Check k="send_to_absent" label="إرسال تقرير الطالب الغائب" />
        <Check k="send_attachments" label="إرسال المرفقات (صور وPDF) مع التقرير" />
        <h2>السرعة والأمان من الحظر</h2>
        <div className="form-grid">
          <div className="form-row"><label htmlFor="b-hold">المهلة بعد حفظ التقرير (ثوانٍ)</label><input id="b-hold" type="number" min="0" max="3600" className="field" value={s.hold_seconds} onChange={num('hold_seconds')} /><span className="muted">0–3600. تتيح للمعلم تعديل تقريره قبل الإرسال.</span></div>
          <div className="form-row"><label htmlFor="b-dmin">أقل فاصل بين رسالتين (ثوانٍ)</label><input id="b-dmin" type="number" min="2" max="120" className="field" value={s.delay_min} onChange={num('delay_min')} /></div>
          <div className="form-row"><label htmlFor="b-dmax">أكبر فاصل بين رسالتين (ثوانٍ)</label><input id="b-dmax" type="number" min="2" max="300" className="field" value={s.delay_max} onChange={num('delay_max')} /><span className="muted">فاصل أطول = أقل خطراً للحظر.</span></div>
          <div className="form-row"><label htmlFor="b-max">أكبر عدد رسائل في الدورة الواحدة</label><input id="b-max" type="number" min="1" max="10" className="field" value={s.max_per_cycle} onChange={num('max_per_cycle')} /></div>
          <div className="form-row"><label htmlFor="b-att">عدد محاولات الإرسال قبل «فشل»</label><input id="b-att" type="number" min="1" max="5" className="field" value={s.max_attempts} onChange={num('max_attempts')} /></div>
        </div>
        <h2>محتوى الرسالة</h2>
        <div className="form-row"><label htmlFor="b-h">عنوان الرسالة</label><input id="b-h" className="field" maxLength={100} value={s.header_text} onChange={e => set('header_text', e.target.value)} /></div>
        <Check k="show_teacher" label="اسم المعلم" />
        <Check k="show_homework" label="حالة الواجب ودرجته" />
        <Check k="show_notes" label="ملاحظات المعلم" />
        <Check k="show_guidance" label="توجيهات الذكاء الاصطناعي" />
        <div className="form-row"><label htmlFor="b-f">ختام الرسالة (اتركه فارغاً لحذفه)</label><textarea id="b-f" className="field" rows={2} maxLength={300} value={s.footer_text} onChange={e => set('footer_text', e.target.value)} /></div>
        {msg.text && <p className={msg.type === 'ok' ? 'notice--ok-inline' : 'error'} role="alert">{msg.text}</p>}
        <div className="actions"><button className="btn" disabled={busy || !dirty}>حفظ الإعدادات</button></div>
      </form>
      <div className="card" id="bot-preview">
        <h2>معاينة الرسالة</h2>
        <p className="muted">هكذا ستصل لولي الأمر (بيانات تجريبية). تتحدث المعاينة فور تغيير أي خيار.</p>
        <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', background: '#f4f6fb', padding: 14, borderRadius: 10, margin: 0 }}>{preview}</pre>
      </div>
    </div></section>
  )
}
