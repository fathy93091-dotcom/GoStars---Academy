// Cloudflare Pages Function — POST /api/bot
// نقطة الاتصال الوحيدة لبوت واتساب (Termux). البوت لا يحمل مفتاح service_role؛ يحمل «سرّ البوت» فقط.
// المتغيرات المطلوبة في Cloudflare: SUPABASE_URL ، SUPABASE_SERVICE_ROLE_KEY ، BOT_SECRET (32 حرفاً فأكثر)
//
//   { action: 'claim',  max: 5, info: 'termux' }          → يسحب تقارير جاهزة للإرسال (مع روابط مرفقات مؤقتة)
//   { action: 'result', report_id, ok, error?, permanent? } → يسجّل نتيجة الإرسال

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// مقارنة بزمن ثابت لتفادي تسريب السرّ بالتوقيت
function safeEqual(a, b) {
  const x = new TextEncoder().encode(String(a)), y = new TextEncoder().encode(String(b))
  let d = x.length ^ y.length
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] || 0) ^ (y[i] || 0)
  return d === 0
}

export async function onRequestPost({ request, env }) {
  const base = env.SUPABASE_URL, key = env.SUPABASE_SERVICE_ROLE_KEY, secret = env.BOT_SECRET
  if (!base || !key || !secret || secret.length < 32) return json({ error: 'server_not_configured' }, 500)
  if (!safeEqual(request.headers.get('x-bot-secret') || '', secret)) return json({ error: 'unauthorized' }, 401)

  let body
  try { body = await request.json() } catch { return json({ error: 'bad_request' }, 400) }

  const hdr = { apikey: key, ...(key.startsWith('sb_') ? {} : { authorization: `Bearer ${key}` }), 'content-type': 'application/json' }
  const rpc = (fn, args) => fetch(`${base}/rest/v1/rpc/${fn}`, { method: 'POST', headers: hdr, body: JSON.stringify(args) })

  if (body.action === 'claim') {
    const max = Math.min(Math.max(parseInt(body.max, 10) || 5, 1), 10)
    const res = await rpc('bot_claim_reports', { max_n: max, bot_info: String(body.info || '').slice(0, 200) })
    if (!res.ok) return json({ error: 'claim_failed' }, 502)
    const rows = await res.json()
    const reports = []
    for (const r of rows) {
      const files = []
      for (const a of Array.isArray(r.attachments) ? r.attachments : []) {
        if (typeof a?.path !== 'string') continue
        const s = await fetch(`${base}/storage/v1/object/sign/report-files/${a.path.split('/').map(encodeURIComponent).join('/')}`, {
          method: 'POST', headers: hdr, body: JSON.stringify({ expiresIn: 900 }),
        })
        if (!s.ok) continue
        const { signedURL } = await s.json()
        if (signedURL) files.push({ name: a.name || 'file', type: a.type || '', url: `${base}/storage/v1${signedURL}` })
      }
      reports.push({ ...r, attachments: files })
    }
    // إعدادات المدير (إيقاف/فواصل/محتوى الرسالة) تُرسل مع كل سحب فتسري بلا لمس الهاتف
    let settings = {}
    const sr = await rpc('bot_get_settings', {})
    if (sr.ok) settings = (await sr.json()) || {}
    return json({ reports, settings })
  }

  if (body.action === 'result') {
    if (!UUID.test(body.report_id || '') || typeof body.ok !== 'boolean') return json({ error: 'bad_request' }, 400)
    const res = await rpc('bot_complete_report', {
      rid: body.report_id, ok: body.ok, err: body.ok ? null : String(body.error || 'فشل الإرسال').slice(0, 300), permanent: body.permanent === true,
    })
    if (!res.ok) return json({ error: 'result_failed' }, 502)
    return json({ status: await res.json() })
  }

  return json({ error: 'bad_request' }, 400)
}

export const onRequest = () => json({ error: 'method_not_allowed' }, 405)
