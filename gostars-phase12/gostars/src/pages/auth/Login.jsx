import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext.jsx'
import { homeFor } from '../../auth/permissions.js'
import { supabase } from '../../lib/supabase.js'
import usePageTitle from '../../hooks/usePageTitle.js'

export default function Login() {
  usePageTitle('تسجيل الدخول')
  const { configured, profile, notice, signIn, clearNotice } = useAuth()
  const nav = useNavigate()
  const loc = useLocation()
  const [id, setId] = useState('')
  const [pw, setPw] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [resetMsg, setResetMsg] = useState('')

  // بعد نجاح الدخول: إلى الصفحة المطلوبة سابقاً أو لوحة الدور
  useEffect(() => {
    // الإدارة لا تدخل من هنا (لا نكشف وجود لوحة أخرى): نخرجها برسالة عامة
    if (profile && ['admin', 'supervisor'].includes(profile.role)) { supabase.auth.signOut(); setError('بيانات الدخول غير صحيحة.'); return }
    if (profile) nav(loc.state?.from || homeFor(profile.role), { replace: true })
  }, [profile, nav, loc.state])

  async function onSubmit(e) {
    e.preventDefault()
    clearNotice(); setResetMsg('')
    if (!id.trim() || !pw) { setError('اكتب بيانات الدخول كاملة.'); return }
    setBusy(true); setError('')
    const err = await signIn(id, pw)
    if (err) setError(err)
    setBusy(false)
  }

  async function onForgot() {
    setError(''); setResetMsg('')
    if (!id.includes('@')) { setError('اكتب بريدك الإلكتروني أولاً. وإن كنت ولي أمر فتواصل مع الإدارة لإعادة كلمة المرور.'); return }
    const { error: e } = await supabase.auth.resetPasswordForEmail(id.trim(), { redirectTo: `${location.origin}/activate` })
    setResetMsg(e ? 'تعذّر إرسال الرابط الآن.' : 'إن كان البريد مسجلاً لدينا فسيصلك رابط إعادة التعيين.')
  }

  if (!configured) {
    return (
      <section className="section"><div className="container narrow"><div className="card">
        <h2>الإعداد غير مكتمل</h2>
        <p>لم يتم ربط الموقع بـ Supabase بعد. راجع الملف <code>supabase/README-phase3.md</code>.</p>
      </div></div></section>
    )
  }

  return (
    <section className="section">
      <div className="container narrow">
        <form className="card" onSubmit={onSubmit} noValidate>
          <h1 style={{ fontSize: '1.7rem' }}>تسجيل الدخول</h1>
          {notice && <p className="notice notice--warn" role="alert">{notice}</p>}

          <div className="form-row">
            <label htmlFor="id">البريد الإلكتروني أو اسم المستخدم</label>
            <input id="id" className="field" dir="ltr" autoComplete="username" value={id} onChange={e => setId(e.target.value)} />
          </div>
          <div className="form-row">
            <label htmlFor="pw">كلمة المرور</label>
            <input id="pw" className="field" type="password" dir="ltr" autoComplete="current-password" value={pw} onChange={e => setPw(e.target.value)} />
          </div>

          {error && <p className="error" role="alert">{error}</p>}
          {resetMsg && <p className="notice notice--ok-inline" role="status">{resetMsg}</p>}

          <button className="btn" type="submit" disabled={busy} style={{ width: '100%' }}>
            {busy ? 'جارٍ الدخول…' : 'دخول'}
          </button>
          <p style={{ textAlign: 'center', marginTop: 14, marginBottom: 0 }}>
            <button type="button" className="link-btn" onClick={onForgot}>نسيت كلمة المرور؟</button>
          </p>
        </form>
        <p className="hint">الحسابات تُنشأ من إدارة الأكاديمية فقط. لا يوجد تسجيل حر.</p>
      </div>
    </section>
  )
}
