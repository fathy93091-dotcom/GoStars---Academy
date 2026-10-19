import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../auth/AuthContext.jsx'
import { supabase } from '../../lib/supabase.js'
import DashboardLayout from '../../layouts/DashboardLayout.jsx'
import Logo from '../../components/Logo.jsx'
import NotFound from '../NotFound.jsx'
import usePageTitle from '../../hooks/usePageTitle.js'

// بوابة لوحة الإدارة: لا يوجد أي رابط إليها في الموقع. تُفتح بكتابة /admin في العنوان فقط.
// - زائر/غير مسجّل: نموذج الدخول (لا شيء آخر يظهر)
// - حساب ليس مديراً ولا مشرفاً: صفحة 404 عادية (لا نكشف وجود اللوحة)
// - من فعّل المصادقة الثنائية: يُطلب رمز التطبيق قبل أي شاشة
// الحماية الحقيقية في قاعدة البيانات (RLS + AAL2)، وهذه البوابة للتجربة فقط.
export default function AdminArea() {
  const { configured, loading, profile } = useAuth()
  const staff = profile && ['admin', 'supervisor'].includes(profile.role)
  const [aal, setAal] = useState(null)

  const refreshAal = useCallback(async () => {
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    setAal({ current: data?.currentLevel, next: data?.nextLevel })
  }, [])
  useEffect(() => { if (staff) refreshAal(); else setAal(null) }, [staff, refreshAal])

  if (!configured) return <NotFound />
  if (loading) return <div className="center-note">جارٍ التحميل…</div>
  if (!profile) return <AdminLogin />
  if (!staff) return <NotFound />
  if (!aal) return <div className="center-note">جارٍ التحميل…</div>
  if (aal.next === 'aal2' && aal.current !== 'aal2') return <MfaChallenge onDone={refreshAal} />
  return <DashboardLayout />
}

function Shell({ title, children }) {
  usePageTitle(title)
  return (
    <section className="section">
      <div className="container narrow stack">
        <div style={{ display: 'flex', justifyContent: 'center' }}><Logo /></div>
        {children}
      </div>
    </section>
  )
}

function AdminLogin() {
  const { notice, signIn, clearNotice } = useAuth()
  const [id, setId] = useState(''); const [pw, setPw] = useState('')
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false)
  async function submit(e) {
    e.preventDefault(); clearNotice()
    if (!id.trim() || !pw) return setError('اكتب بيانات الدخول كاملة.')
    setBusy(true); setError('')
    const err = await signIn(id, pw)
    if (err) setError(err)
    setBusy(false)
  }
  return (
    <Shell title="دخول الإدارة">
      <form className="card" onSubmit={submit} noValidate>
        <h1 style={{ fontSize: '1.6rem' }}>دخول الإدارة</h1>
        {notice && <p className="notice notice--warn" role="alert">{notice}</p>}
        <div className="form-row"><label htmlFor="id">البريد الإلكتروني</label>
          <input id="id" className="field" dir="ltr" autoComplete="username" value={id} onChange={e => setId(e.target.value)} /></div>
        <div className="form-row"><label htmlFor="pw">كلمة المرور</label>
          <input id="pw" className="field" type="password" dir="ltr" autoComplete="current-password" value={pw} onChange={e => setPw(e.target.value)} /></div>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn" type="submit" disabled={busy} style={{ width: '100%' }}>{busy ? 'جارٍ الدخول…' : 'دخول'}</button>
      </form>
    </Shell>
  )
}

function MfaChallenge({ onDone }) {
  const { signOut } = useAuth()
  const [code, setCode] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false)
  async function submit(e) {
    e.preventDefault()
    if (!/^\d{6}$/.test(code)) return setError('الرمز 6 أرقام.')
    setBusy(true); setError('')
    const f = await supabase.auth.mfa.listFactors()
    const factor = f.data?.totp?.[0]
    if (!factor) { setBusy(false); return setError('تعذّر العثور على عامل التحقق.') }
    const ch = await supabase.auth.mfa.challenge({ factorId: factor.id })
    const v = ch.error ? ch : await supabase.auth.mfa.verify({ factorId: factor.id, challengeId: ch.data.id, code })
    setBusy(false)
    if (v.error) return setError('الرمز غير صحيح أو انتهت صلاحيته.')
    onDone()
  }
  return (
    <Shell title="التحقق بخطوتين">
      <form className="card" onSubmit={submit} noValidate>
        <h1 style={{ fontSize: '1.6rem' }}>التحقق بخطوتين</h1>
        <p className="muted">اكتب الرمز الظاهر الآن في تطبيق المصادقة (Google Authenticator أو ما يماثله).</p>
        <div className="form-row"><label htmlFor="otp">رمز التحقق</label>
          <input id="otp" className="field" dir="ltr" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} /></div>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn" type="submit" disabled={busy} style={{ width: '100%' }}>{busy ? 'جارٍ التحقق…' : 'تأكيد'}</button>
        <p style={{ textAlign: 'center', marginBottom: 0 }}><button type="button" className="link-btn" onClick={signOut}>تسجيل الخروج</button></p>
      </form>
    </Shell>
  )
}
