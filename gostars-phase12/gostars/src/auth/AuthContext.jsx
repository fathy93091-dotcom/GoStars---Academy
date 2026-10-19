import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react'
import { supabase, isConfigured } from '../lib/supabase.js'
import { toEmail } from './permissions.js'

const AuthCtx = createContext(null)
const empty = { loading: false, session: null, profile: null, permissions: [] }

export function AuthProvider({ children }) {
  const [state, setState] = useState({ ...empty, loading: isConfigured })
  const [notice, setNotice] = useState('')

  const load = useCallback(async session => {
    if (!session) { setState(empty); return }

    const { data, error } = await supabase
      .from('profiles').select('id,role,full_name,status').eq('id', session.user.id)
    const profile = data?.[0]

    if (error || !profile) {
      setNotice('هذا الحساب غير مُفعَّل في النظام. تواصل مع إدارة الأكاديمية.')
      await supabase.auth.signOut()
      return
    }
    if (profile.status !== 'active') {
      setNotice('تم إيقاف هذا الحساب. تواصل مع إدارة الأكاديمية.')
      await supabase.auth.signOut()
      return
    }
    const { data: perms } = await supabase
      .from('permissions').select('permission_key,allowed').eq('user_id', session.user.id)

    setState({
      loading: false,
      session,
      profile,
      permissions: (perms || []).filter(p => p.allowed).map(p => p.permission_key),
    })
  }, [])

  useEffect(() => {
    if (!isConfigured) return
    // setTimeout لتجنّب التعليق المعروف عند استدعاء Supabase داخل callback الحالة
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setTimeout(() => load(session), 0)
    })
    return () => data.subscription.unsubscribe()
  }, [load])

  const value = useMemo(() => ({
    ...state,
    notice,
    configured: isConfigured,
    clearNotice: () => setNotice(''),
    // المدير يملك كل الصلاحيات؛ غيره حسب جدول permissions
    can: key => state.profile?.role === 'admin' || state.permissions.includes(key),
    async signIn(identifier, password) {
      setNotice('')
      const { error } = await supabase.auth.signInWithPassword({ email: toEmail(identifier), password })
      if (!error) return null
      return error.status === 400 ? 'بيانات الدخول غير صحيحة.' : 'تعذّر الاتصال بالخادم. حاول مرة أخرى.'
    },
    signOut: () => supabase.auth.signOut(),
  }), [state, notice])

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}

export function useAuth() {
  const v = useContext(AuthCtx)
  if (!v) throw new Error('useAuth يجب أن يُستخدم داخل AuthProvider')
  return v
}
