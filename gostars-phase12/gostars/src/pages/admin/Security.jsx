import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import usePageTitle from '../../hooks/usePageTitle.js'

// أمان الحساب: المصادقة الثنائية (TOTP) وتغيير كلمة المرور. متاحة للمدير والمشرف.
export default function Security() {
  usePageTitle('أمان الحساب')
  const [verified, setVerified] = useState(null)   // العامل المفعّل إن وُجد
  const [setup, setSetup] = useState(null)         // { factorId, qr, secret }
  const [code, setCode] = useState('')
  const [pw, setPw] = useState({ a: '', b: '' })
  const [msg, setMsg] = useState({ type: '', text: '' }); const [busy, setBusy] = useState(false)
  const ok = text => setMsg({ type: 'ok', text }); const bad = text => setMsg({ type: 'err', text })

  const load = useCallback(async () => {
    const { data } = await supabase.auth.mfa.listFactors()
    setVerified(data?.totp?.[0] || null)
  }, [])
  useEffect(() => { load() }, [load])

  async function start() {
    setBusy(true); setMsg({ type: '', text: '' })
    // تنظيف محاولات سابقة لم تكتمل
    const all = await supabase.auth.mfa.listFactors()
    for (const x of all.data?.all || []) if (x.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: x.id })
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `GoStars ${Date.now()}` })
    setBusy(false)
    if (error || !data) return bad('تعذّر بدء التفعيل. حاول مرة أخرى.')
    setSetup({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret }); setCode('')
  }
  async function confirm(e) {
    e.preventDefault()
    if (!/^\d{6}$/.test(code)) return bad('الرمز 6 أرقام.')
    setBusy(true)
    const ch = await supabase.auth.mfa.challenge({ factorId: setup.factorId })
    const v = ch.error ? ch : await supabase.auth.mfa.verify({ factorId: setup.factorId, challengeId: ch.data.id, code })
    setBusy(false)
    if (v.error) return bad('الرمز غير صحيح. تأكد من الوقت في هاتفك وحاول مرة أخرى.')
    setSetup(null); ok('تم تفعيل التحقق بخطوتين. سيُطلب الرمز في كل دخول جديد.'); load()
  }
  async function disable() {
    if (!window.confirm('إيقاف التحقق بخطوتين؟ سيقل أمان حسابك.')) return
    setBusy(true); const { error } = await supabase.auth.mfa.unenroll({ factorId: verified.id }); setBusy(false)
    if (error) return bad('تعذّر الإيقاف.'); ok('تم إيقاف التحقق بخطوتين.'); load()
  }
  async function changePw(e) {
    e.preventDefault()
    if (pw.a.length < 10) return bad('كلمة المرور 10 أحرف على الأقل.')
    if (pw.a !== pw.b) return bad('كلمتا المرور غير متطابقتين.')
    setBusy(true); const { error } = await supabase.auth.updateUser({ password: pw.a }); setBusy(false)
    if (error) return bad('تعذّر تغيير كلمة المرور.'); setPw({ a: '', b: '' }); ok('تم تغيير كلمة المرور.')
  }

  return (
    <section className="section"><div className="container narrow stack" style={{ maxWidth: 640 }}>
      {msg.text && <p className={msg.type === 'ok' ? 'notice--ok-inline' : 'error'} role="alert">{msg.text}</p>}
      <div className="card" id="mfa">
        <h1 style={{ fontSize: '1.5rem' }}>التحقق بخطوتين</h1>
        {verified === null && !setup && (<>
          <p className="muted">حالياً: <b>غير مفعّل</b>. عند التفعيل يُطلب رمز من تطبيق المصادقة (Google Authenticator أو ما يماثله) بعد كلمة المرور، وتفرضه قاعدة البيانات نفسها.</p>
          <button className="btn" disabled={busy} onClick={start}>تفعيل التحقق بخطوتين</button>
        </>)}
        {setup && (
          <form onSubmit={confirm}>
            <p>1) افتح تطبيق المصادقة وامسح الرمز، أو أدخل المفتاح يدوياً:</p>
            <div style={{ textAlign: 'center' }}><img src={setup.qr} alt="رمز QR للتفعيل" width="200" height="200" /></div>
            <p dir="ltr" style={{ textAlign: 'center', userSelect: 'all', overflowWrap: 'anywhere' }}><code data-k="secret">{setup.secret}</code></p>
            <p>2) اكتب الرمز المكوّن من 6 أرقام الظاهر في التطبيق:</p>
            <div className="form-row"><label htmlFor="m-code">رمز التحقق</label>
              <input id="m-code" className="field" dir="ltr" inputMode="numeric" maxLength={6} autoComplete="one-time-code" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} /></div>
            <button className="btn" disabled={busy}>تأكيد وتفعيل</button>{' '}
            <button type="button" className="btn btn--light" onClick={() => setSetup(null)}>إلغاء</button>
          </form>)}
        {verified && (<>
          <p>حالياً: <b className="chip chip--credit">مفعّل</b></p>
          <p className="muted">إن فقدت هاتفك فيمكن لصاحب مشروع Supabase حذف عامل التحقق من لوحة Authentication ← Users ← حسابك. احتفظ بالمفتاح السري في مكان آمن.</p>
          <button className="btn btn--light" disabled={busy} onClick={disable}>إيقاف التحقق بخطوتين</button>
        </>)}
      </div>
      <form className="card" onSubmit={changePw} aria-label="تغيير كلمة المرور">
        <h2>تغيير كلمة المرور</h2>
        <div className="form-row"><label htmlFor="pw1">كلمة المرور الجديدة</label><input id="pw1" type="password" dir="ltr" autoComplete="new-password" className="field" value={pw.a} onChange={e => setPw({ ...pw, a: e.target.value })} /></div>
        <div className="form-row"><label htmlFor="pw2">تأكيد كلمة المرور</label><input id="pw2" type="password" dir="ltr" autoComplete="new-password" className="field" value={pw.b} onChange={e => setPw({ ...pw, b: e.target.value })} /></div>
        <button className="btn btn--light" disabled={busy}>تغيير</button>
      </form>
    </div></section>
  )
}
