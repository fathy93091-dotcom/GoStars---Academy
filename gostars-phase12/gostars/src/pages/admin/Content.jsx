import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { useContent } from '../../content/ContentContext.jsx'
import usePageTitle from '../../hooks/usePageTitle.js'
import { TABS, PAGES, IMAGES, labelOf, isBlockTitle, textKeys, longText, defaults } from '../../lib/cmsRegistry.js'

const MAX_IMG = 5 * 1024 * 1024
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

// إدارة الموقع بلا كود: النصوص، الصور، إخفاء الكتل والصفحات. كل تعديل يظهر للزوار فوراً ويُسجَّل في سجل العمليات.
export default function Content() {
  usePageTitle('إدارة الموقع')
  const site = useContent()
  const [rows, setRows] = useState(null)
  const [tab, setTab] = useState('general')
  const [draft, setDraft] = useState({})
  const [msg, setMsg] = useState({ type: '', text: '' })
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('content_site').select('key_element,text_value,image_url,size,visible')
    if (error) return setMsg({ type: 'err', text: 'تعذّر تحميل المحتوى.' })
    setRows(Object.fromEntries((data || []).map(r => [r.key_element, r])))
  }, [])
  useEffect(() => { load() }, [load])

  const cur = k => rows?.[k]?.text_value ?? defaults[k] ?? ''
  const val = k => (k in draft ? draft[k] : cur(k))
  const done = text => { setMsg({ type: 'ok', text }); site.refresh() }
  const fail = (e, fallback = 'تعذّر الحفظ.') => setMsg({ type: 'err', text: /too long|check|violates/i.test(e?.message || '') ? 'القيمة غير مقبولة (طول النص أو الرابط).' : fallback })

  async function upsert(key, patch) {
    const base = rows[key] || {}
    const row = { key_element: key, text_value: base.text_value ?? null, image_url: base.image_url ?? null, size: base.size ?? null, visible: base.visible ?? true, ...patch }
    // صف بلا أي تخصيص لا حاجة له: نحذفه فيعود الموقع للأصل
    if (row.text_value == null && row.image_url == null && row.size == null && row.visible) {
      return supabase.from('content_site').delete().eq('key_element', key)
    }
    return supabase.from('content_site').upsert(row, { onConflict: 'key_element' })
  }

  async function saveTab() {
    const keys = textKeys.filter(k => TABS.find(t => t.id === tab).match(k) && k in draft && draft[k] !== cur(k))
    if (!keys.length) return setMsg({ type: 'ok', text: 'لا توجد تعديلات للحفظ.' })
    setBusy(true)
    for (const k of keys) {
      const v = draft[k].trim()
      const { error } = await upsert(k, { text_value: v === defaults[k] ? null : v })
      if (error) { setBusy(false); return fail(error) }
    }
    setBusy(false)
    setDraft(d => { const n = { ...d }; keys.forEach(k => delete n[k]); return n })
    await load(); done(`تم حفظ ${keys.length.toLocaleString('ar-EG')} تعديل. ظهرت للزوار الآن.`)
  }
  async function resetKey(k) {
    const { error } = await upsert(k, { text_value: null })
    if (error) return fail(error)
    setDraft(d => { const n = { ...d }; delete n[k]; return n })
    await load(); done('أُعيد النص الأصلي.')
  }
  async function setVisible(k, visible) {
    const { error } = await upsert(k, { visible })
    if (error) return fail(error, 'تعذّر تغيير الظهور.')
    await load(); done(visible ? 'تم إظهار العنصر.' : 'تم إخفاء العنصر عن الزوار.')
  }
  async function setSize(k, size) {
    const { error } = await upsert(k, { size })
    if (error) return fail(error); await load(); done('تم تغيير حجم الصورة.')
  }
  async function removeImage(k) {
    const { error } = await upsert(k, { image_url: null })
    if (error) return fail(error); await load(); done('أُعيدت الصورة الأصلية.')
  }
  async function uploadImage(k, file) {
    if (!file) return
    if (!EXT[file.type]) return setMsg({ type: 'err', text: 'الصيغ المسموحة: JPG أو PNG أو WebP.' })
    if (file.size > MAX_IMG) return setMsg({ type: 'err', text: 'الحد الأقصى لحجم الصورة 5 ميجا.' })
    setBusy(true)
    const name = `${crypto.randomUUID()}.${EXT[file.type]}`
    const up = await supabase.storage.from('site-media').upload(name, file, { contentType: file.type, upsert: false })
    if (up.error) { setBusy(false); return setMsg({ type: 'err', text: 'تعذّر رفع الصورة.' }) }
    const url = supabase.storage.from('site-media').getPublicUrl(name).data.publicUrl
    const { error } = await upsert(k, { image_url: url, size: rows[k]?.size ?? 'md' })
    setBusy(false)
    if (error) return fail(error)
    await load(); done('تم رفع الصورة وظهرت للزوار.')
  }

  const keys = useMemo(() => textKeys.filter(k => TABS.find(t => t.id === tab).match(k)), [tab])
  const dirty = keys.filter(k => k in draft && draft[k] !== cur(k)).length

  if (rows === null) return <section className="section"><div className="container"><p>{msg.text || 'جارٍ التحميل…'}</p></div></section>

  return (
    <section className="section"><div className="container stack">
      <div className="card card--accent">
        <h1 style={{ fontSize: '1.6rem' }}>إدارة الموقع</h1>
        <p className="muted" style={{ marginBottom: 0 }}>عدّل أي نص أو صورة أو أخفِ صفحة، بلا كتابة كود. تظهر التعديلات للزوار فور الحفظ، وتُسجَّل في سجل العمليات.</p>
        {msg.text && <p className={msg.type === 'ok' ? 'notice--ok-inline' : 'error'} role="alert">{msg.text}</p>}
      </div>

      <div className="card" id="cms-pages">
        <h2>صفحات الموقع</h2>
        <p className="muted">الصفحة المخفية تختفي من القائمة ويرى من يفتح رابطها «غير موجودة». الرئيسية لا تُخفى.</p>
        {PAGES.map(([slug, label]) => {
          const on = rows[`page.${slug}`]?.visible ?? true
          return (
            <div className="cms-row__head" key={slug} data-page={slug}>
              <span>{label} <span className={`chip ${on ? '' : 'chip--cancelled'}`}>{on ? 'ظاهرة' : 'مخفية'}</span></span>
              <button type="button" className="btn btn--light btn--sm" onClick={() => setVisible(`page.${slug}`, !on)}>{on ? 'إخفاء' : 'إظهار'}</button>
            </div>
          )
        })}
      </div>

      <div className="card" id="cms-images">
        <h2>الصور</h2>
        {IMAGES.map(([k, label, hint]) => {
          const r = rows[k] || {}
          return (
            <div className="cms-row" key={k} data-image={k}>
              <div className="cms-row__head"><strong>{label}</strong>{r.image_url && <span className="chip">مخصّصة</span>}</div>
              {r.image_url && <img className="cms-thumb" src={r.image_url} alt="" />}
              {hint && <span className="muted">{hint}</span>}
              <div className="actions">
                <label className="btn btn--light btn--sm" style={{ cursor: 'pointer' }}>
                  {r.image_url ? 'استبدال الصورة' : 'رفع صورة'}
                  <input type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={busy} aria-label={`رفع ${label}`} onChange={e => { uploadImage(k, e.target.files?.[0]); e.target.value = '' }} />
                </label>
                {k !== 'site.logo' && (
                  <select aria-label={`حجم ${label}`} className="field" style={{ width: 'auto' }} value={r.size || 'md'} onChange={e => setSize(k, e.target.value)}>
                    <option value="sm">صغيرة</option><option value="md">متوسطة</option><option value="lg">كبيرة</option>
                  </select>
                )}
                {r.image_url && <button type="button" className="btn btn--light btn--sm" onClick={() => removeImage(k)}>إرجاع الأصلية</button>}
              </div>
            </div>
          )
        })}
        <p className="muted" style={{ marginBottom: 0 }}>JPG أو PNG أو WebP، حتى 5 ميجا. لا تُرفع صور فيها بيانات طلاب.</p>
      </div>

      <div className="card" id="cms-texts">
        <h2>النصوص</h2>
        <div className="cms-tabs" role="group" aria-label="أقسام النصوص">
          {TABS.map(t => <button type="button" key={t.id} aria-pressed={tab === t.id} onClick={() => setTab(t.id)}>{t.label}</button>)}
        </div>
        {keys.map(k => {
          const changed = rows[k]?.text_value != null
          const hidden = rows[k]?.visible === false
          return (
            <div className={`cms-row ${k in draft && draft[k] !== cur(k) ? 'cms-changed' : ''}`} key={k} data-key={k}>
              <div className="cms-row__head">
                <label htmlFor={`f-${k}`}><strong>{labelOf(k)}</strong></label>
                <span className="actions">
                  {changed && <span className="chip">معدّل</span>}
                  {hidden && <span className="chip chip--cancelled">مخفي</span>}
                  {isBlockTitle(k) && <button type="button" className="btn btn--light btn--sm" onClick={() => setVisible(k, hidden)}>{hidden ? 'إظهار الكتلة' : 'إخفاء الكتلة'}</button>}
                  {changed && <button type="button" className="btn btn--light btn--sm" onClick={() => resetKey(k)}>إرجاع الأصل</button>}
                </span>
              </div>
              {longText(k)
                ? <textarea id={`f-${k}`} className="field" rows={3} maxLength={5000} value={val(k)} onChange={e => setDraft(d => ({ ...d, [k]: e.target.value }))} />
                : <input id={`f-${k}`} className="field" maxLength={5000} value={val(k)} onChange={e => setDraft(d => ({ ...d, [k]: e.target.value }))} />}
            </div>
          )
        })}
        <div className="actions">
          <button type="button" className="btn" disabled={busy || !dirty} onClick={saveTab}>حفظ تعديلات هذا القسم{dirty ? ` (${dirty.toLocaleString('ar-EG')})` : ''}</button>
        </div>
      </div>
    </div></section>
  )
}
