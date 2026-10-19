import { useEffect, useState } from 'react'
import { useContent } from '../content/ContentContext.jsx'
import usePageTitle from '../hooks/usePageTitle.js'
import SectionHead from '../components/SectionHead.jsx'
import { supabase } from '../lib/supabase.js'

function formatDate(iso) {
  const d = new Date(iso)
  if (isNaN(d)) return iso
  return d.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })
}

// الأخبار: الإعلانات العامة التي ينشرها المدير (audience = all) المرئية والمنشورة.
// إن لم توجد قاعدة بيانات أو لم تُنشر إعلانات بعد، تظهر الأخبار الافتراضية.
export default function News() {
  const { c, show } = useContent()
  usePageTitle(c('news.title'))
  const [items, setItems] = useState(null)

  useEffect(() => {
    if (!supabase) { setItems([]); return }
    supabase.from('announcements').select('id,title,body,published_at').eq('audience', 'all').eq('visible', true)
      .lte('published_at', new Date().toISOString()).order('published_at', { ascending: false }).limit(30)
      .then(({ data, error }) => setItems(error ? [] : data || []))
  }, [])

  const fallback = [1, 2, 3].filter(n => show(`news.${n}.title`)).map(n => ({
    id: `d${n}`, title: c(`news.${n}.title`), body: c(`news.${n}.text`), published_at: c(`news.${n}.date`),
  }))
  const list = items && items.length ? items : fallback

  return (
    <>
      <section className="page-hero">
        <div className="container">
          <SectionHead as="h1" title={c('news.title')} lead={c('news.lead')} />
        </div>
      </section>

      <section className="section">
        <div className="container stack">
          {items === null ? <p className="muted">جارٍ التحميل…</p> : list.map(n => (
            <article className="card card--accent" key={n.id} data-news={n.id}>
              <time className="news-date" dateTime={n.published_at}>{formatDate(n.published_at)}</time>
              <h3>{n.title}</h3>
              <p style={{ whiteSpace: 'pre-line' }}>{n.body}</p>
            </article>
          ))}
        </div>
      </section>
    </>
  )
}
