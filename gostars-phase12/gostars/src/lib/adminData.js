import { supabase } from './supabase.js'

// عدّ صفوف بلا جلب بياناتها (تحترم RLS)
export async function countOf(table, apply) {
  let q = supabase.from(table).select('*', { count: 'exact', head: true })
  if (apply) q = apply(q)
  const { count, error } = await q
  return error ? null : count
}

// أرقام الهواتف: أرقام فقط مع + اختيارية في البداية (8 إلى 15 رقماً)
export const cleanPhone = v => String(v || '').replace(/[\s\-()]/g, '')
export const phoneOk = v => v === '' || /^\+?[0-9]{8,15}$/.test(v)
export const StudyType = { group: 'مجموعة', private: 'فردي' }
