import { useState } from 'react'
import { useContent } from '../content/ContentContext.jsx'
import usePageTitle from '../hooks/usePageTitle.js'
import SectionHead from '../components/SectionHead.jsx'
import Icon from '../components/Icon.jsx'
import { sendContactMessage, validateContact } from '../lib/contact.js'

const empty = { name: '', phone: '', role: 'ولي أمر', message: '', website: '' } // website = حقل فخ للروبوتات

export default function Contact() {
  const { c } = useContent()
  usePageTitle(c('contact.title'))
  const [form, setForm] = useState(empty)
  const [errors, setErrors] = useState({})
  const [status, setStatus] = useState('idle') // idle | sending | done | failed

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  async function onSubmit(e) {
    e.preventDefault()
    if (form.website) return // روبوت: نتجاهل بصمت
    const errs = validateContact(form)
    setErrors(errs)
    if (Object.keys(errs).length) return
    setStatus('sending')
    try {
      await sendContactMessage({ name: form.name.trim(), phone: form.phone.trim(), role: form.role, message: form.message.trim() })
      setStatus('done')
      setForm(empty)
    } catch (e) {
      setStatus(e?.message === 'rate_limited' ? 'limited' : 'failed')
    }
  }

  const info = [
    { icon: 'phone', label: 'contact.info.phone.label', value: 'contact.info.phone', ltr: true },
    { icon: 'mail', label: 'contact.info.email.label', value: 'contact.info.email', ltr: true },
    { icon: 'clock', label: 'contact.info.hours.label', value: 'contact.info.hours' },
  ]

  return (
    <>
      <section className="page-hero">
        <div className="container">
          <SectionHead as="h1" title={c('contact.title')} lead={c('contact.lead')} />
        </div>
      </section>

      <section className="section">
        <div className="container contact">
          <form className="card" onSubmit={onSubmit} noValidate>
            {status === 'done' ? (
              <div className="notice notice--ok" role="status">
                <h3>وصلتنا رسالتك</h3>
                <p>سنتواصل معك في أقرب وقت. شكراً لثقتك بأكاديمية GoStars.</p>
                <button type="button" className="btn btn--light" onClick={() => setStatus('idle')}>إرسال رسالة أخرى</button>
              </div>
            ) : (
              <>
                <div className="form-row">
                  <label htmlFor="name">الاسم</label>
                  <input id="name" className="field" value={form.name} onChange={set('name')} autoComplete="name" aria-invalid={!!errors.name} />
                  {errors.name && <small className="error">{errors.name}</small>}
                </div>
                <div className="form-row">
                  <label htmlFor="phone">رقم الهاتف</label>
                  <input id="phone" className="field" dir="ltr" inputMode="tel" value={form.phone} onChange={set('phone')} autoComplete="tel" aria-invalid={!!errors.phone} />
                  {errors.phone && <small className="error">{errors.phone}</small>}
                </div>
                <div className="form-row">
                  <label htmlFor="role">أنا</label>
                  <select id="role" className="field" value={form.role} onChange={set('role')}>
                    <option>ولي أمر</option>
                    <option>طالب</option>
                    <option>معلم</option>
                    <option>أخرى</option>
                  </select>
                </div>
                <div className="form-row">
                  <label htmlFor="message">الرسالة</label>
                  <textarea id="message" className="field" rows={5} value={form.message} onChange={set('message')} aria-invalid={!!errors.message} />
                  {errors.message && <small className="error">{errors.message}</small>}
                </div>

                {/* حقل فخ: مخفي عن البشر */}
                <div className="hp" aria-hidden="true">
                  <label>لا تملأ هذا الحقل<input tabIndex={-1} autoComplete="off" value={form.website} onChange={set('website')} /></label>
                </div>

                {status === 'limited' && <p className="error" role="alert">أرسلت عدة رسائل مؤخراً. انتظر قليلاً ثم حاول مرة أخرى، أو تواصل معنا هاتفياً.</p>}
                {status === 'failed' && <p className="error" role="alert">تعذّر الإرسال. حاول مرة أخرى بعد قليل.</p>}
                <button className="btn" type="submit" disabled={status === 'sending'}>
                  {status === 'sending' ? 'جارٍ الإرسال…' : 'إرسال'}
                </button>
              </>
            )}
          </form>

          <aside className="stack">
            {info.map(i => (
              <div className="card info" key={i.value}>
                <span className="icon-bubble"><Icon name={i.icon} /></span>
                <div>
                  <strong>{c(i.label)}</strong>
                  <div dir={i.ltr ? 'ltr' : undefined} style={i.ltr ? { textAlign: 'start' } : undefined}>{c(i.value)}</div>
                </div>
              </div>
            ))}
          </aside>
        </div>
      </section>
    </>
  )
}
