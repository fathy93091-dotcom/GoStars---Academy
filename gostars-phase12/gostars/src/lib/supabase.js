import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY

// الموقع العام يعمل حتى بدون إعداد Supabase؛ صفحات الدخول واللوحات فقط تحتاجه.
export const isConfigured = Boolean(url && anon)

export const supabase = isConfigured
  ? createClient(url, anon, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null
