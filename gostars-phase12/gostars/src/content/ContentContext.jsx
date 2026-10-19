import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { defaults, defaultImages } from './defaults.js'
import { supabase } from '../lib/supabase.js'

const ContentCtx = createContext(null)
const CACHE = 'gostars.content.v1'

const readCache = () => { try { return JSON.parse(localStorage.getItem(CACHE)) || {} } catch { return {} } }
const writeCache = v => { try { localStorage.setItem(CACHE, JSON.stringify(v)) } catch { /* لا بأس */ } }

// يحوّل صفوف العرض public_content إلى خريطة: { key: { text, image, size, visible } }
export function toOverrides(rows) {
  const o = {}
  for (const r of rows || []) {
    o[r.key_element] = {
      text: r.text_value ?? undefined,
      image: r.image_url ?? undefined,
      size: r.size ?? undefined,
      visible: r.visible !== false,
    }
  }
  return o
}

/**
 * المحتوى: القيم الافتراضية في defaults.js، وما يعدّله المدير (public_content) يتغلب عليها.
 * تُعرض النسخة المخزّنة فوراً ثم تُحدَّث من الخادم (stale-while-revalidate).
 * أي فشل في الشبكة لا يكسر الموقع: تبقى القيم الأخيرة أو الافتراضية.
 */
export function ContentProvider({ children, overrides: fixed }) {
  const [remote, setRemote] = useState(() => fixed || readCache())
  const [ready, setReady] = useState(Boolean(fixed) || !supabase)

  const refresh = useCallback(async () => {
    if (!supabase) return
    try {
      const { data, error } = await supabase.from('public_content').select('key_element,text_value,image_url,size,visible')
      if (!error && data) { const o = toOverrides(data); setRemote(o); writeCache(o) }
    } catch { /* نبقي ما لدينا */ }
    setReady(true)
  }, [])
  useEffect(() => { if (!fixed) refresh() }, [fixed, refresh])

  const value = useMemo(() => ({
    c: key => remote[key]?.text ?? defaults[key] ?? '',
    img: key => remote[key]?.image ?? defaultImages[key] ?? '',
    size: key => remote[key]?.size ?? 'md',
    show: key => remote[key]?.visible ?? true,
    pageOn: slug => remote[`page.${slug}`]?.visible ?? true,
    ready,
    refresh,
  }), [remote, ready, refresh])
  return <ContentCtx.Provider value={value}>{children}</ContentCtx.Provider>
}

export function useContent() {
  const v = useContext(ContentCtx)
  if (!v) throw new Error('useContent يجب أن يُستخدم داخل ContentProvider')
  return v
}
