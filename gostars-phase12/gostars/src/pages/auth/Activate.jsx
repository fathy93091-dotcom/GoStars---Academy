import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import { homeFor } from '../../auth/permissions.js'
import usePageTitle from '../../hooks/usePageTitle.js'

// صفحة يفتحها المعلم/المشرف من رابط التفعيل (أو رابط إعادة التعيين) لتعيين كلمة المرور
export default function Activate() {
  usePageTitle('تفعيل الحساب')
  const { configured, loading, session, profile } = useAuth()
  const nav = useNavigate()
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [waited, setWaited] = useState(false)

  // نمنح المتصفح لحظات لقراءة الجلسة من الرابط قبل الحكم بأنه غير صالح
  useEffect(() => { const t = setTimeout(() => setWaited(true), 2500); return () => clearTimeout(t) }, [])

  async function onSubmit(e) {
    e.preventDefault()
    if (pw.length < 8) { setError('كلمة المرور 8 أحرف على الأقل.'); return }
    if (pw !== pw2) { setError('كلمتا المرور غير متطابقتين.'); return }
    setBusy(true); setError('')
    const { error: err } = await supabase.auth.updateUser({ password: pw })
    setBusy(false)
    if (err) { setError('تعذّر حفظ كلمة المرور. اطلب رابطاً جديداً من الإدارة.'); return }
    nav(homeFor(profile?.role), { replace: true })
  }

  if (!configured) return <section className="section"><div className="container narrow"><div className="card"><p>الإعداد غير مكتمل.</p></div></div></section>
  if (loading || (!session && !waited)) return <div className="center-note">جارٍ التحقق من الرابط…</div>

  if (!session || !profile) {
    return (
      <section className="section"><div className="container narrow"><div className="card">
        <h2>الرابط غير صالح</h2>
        <p>انتهت صلاحية رابط التفعيل أو استُخدم من قبل. اطلب رابطاً جديداً من إدارة الأكاديمية.</p>
      </div></div></section>
    )
  }

  return (
    <section className="section">
      <div className="container narrow">
        <form className="card" onSubmit={onSubmit} noValidate>
          <h1 style={{ fontSize: '1.7rem' }}>مرحباً {profile.full_name}</h1>
          <p>اختر كلمة مرور لحسابك لتفعيله.</p>
          <div className="form-row">
            <label htmlFor="pw">كلمة المرور الجديدة</label>
            <input id="pw" className="field" type="password" dir="ltr" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} />
          </div>
          <div className="form-row">
            <label htmlFor="pw2">تأكيد كلمة المرور</label>
            <input id="pw2" className="field" type="password" dir="ltr" autoComplete="new-password" value={pw2} onChange={e => setPw2(e.target.value)} />
          </div>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="btn" type="submit" disabled={busy} style={{ width: '100%' }}>
            {busy ? 'جارٍ الحفظ…' : 'حفظ وبدء الاستخدام'}
          </button>
        </form>
      </div>
    </section>
  )
}
