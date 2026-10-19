// فحص الإنتاج بعد النشر: node scripts/smoke.mjs https://موقعك.pages.dev https://xxxx.supabase.co مفتاح_anon
// يتحقق من: الصفحات، ترويسات الأمان، إغلاق التسجيل الحر، أن الزائر لا يقرأ جداول حساسة، أن دوال الخادم ترفض بلا تصريح.
// لا يُنشئ ولا يعدّل أي بيانات (قراءة/محاولات مرفوضة فقط).
const TABLES = ['profiles', 'permissions', 'students', 'student_contacts', 'group_whatsapp', 'groups', 'lessons', 'attendance', 'homework', 'reports',
  'payments', 'exams', 'monthly_evaluations', 'certificates', 'student_packages', 'enrollments', 'teachers', 'supervisors', 'audit_log',
  'contact_messages', 'bot_settings', 'bot_heartbeat', 'report_feed', 'student_balances', 'teacher_earnings', 'parent_balance']
const PAGES = ['/', '/about', '/programs', '/news', '/contact', '/login', '/admin', '/activate']

export async function smoke({ site, supa, anon, fetchImpl = fetch, log = () => {} }) {
  const results = []
  const t = (name, pass, info) => { results.push({ name, pass: !!pass, info }); log(`${pass ? 'PASS' : 'FAIL'} ${name}${!pass && info ? '  [' + info + ']' : ''}`) }
  const get = (u, init) => fetchImpl(u, { redirect: 'manual', ...init }).catch(e => ({ status: 0, ok: false, headers: new Map(), text: async () => String(e) }))
  site = site.replace(/\/$/, ''); supa = supa.replace(/\/$/, '')

  for (const p of PAGES) { const r = await get(site + p); t(`الصفحة ${p} تفتح (200)`, r.status === 200, r.status) }
  const home = await get(site + '/'); const h = k => home.headers.get?.(k) || ''
  t('ترويسة CSP', /default-src 'self'/.test(h('content-security-policy')) && /frame-ancestors 'none'/.test(h('content-security-policy')))
  t('X-Frame-Options=DENY', h('x-frame-options') === 'DENY')
  t('X-Content-Type-Options=nosniff', h('x-content-type-options') === 'nosniff')
  t('HSTS', /max-age=\d{7,}/.test(h('strict-transport-security')))
  t('الموقع على HTTPS', site.startsWith('https://'))
  const nf = await get(site + '/this-page-does-not-exist-xyz'); t('رابط غير موجود لا يكشف مساراً (200 SPA أو 404)', [200, 404].includes(nf.status), nf.status)

  const H = { apikey: anon, authorization: `Bearer ${anon}` }
  const st = await get(`${supa}/auth/v1/settings`, { headers: H })
  let s = {}; try { s = await st.json() } catch { /* */ }
  t('التسجيل الحر مغلق (disable_signup)', s.disable_signup === true, JSON.stringify({ disable_signup: s.disable_signup }))

  for (const tb of TABLES) {
    const r = await get(`${supa}/rest/v1/${tb}?select=*&limit=1`, { headers: H })
    let body = null; try { body = await r.json() } catch { /* */ }
    const leaked = r.status === 200 && Array.isArray(body) && body.length > 0
    t(`الزائر لا يقرأ ${tb}`, !leaked, leaked ? 'أُرجعت بيانات!' : '')
  }
  const rc = await get(`${supa}/rest/v1/rpc/security_audit`, { method: 'POST', headers: { ...H, 'content-type': 'application/json' }, body: '{}' })
  t('الزائر لا يشغّل security_audit()', rc.status >= 400, rc.status)
  const pc = await get(`${supa}/rest/v1/public_content?select=key_element&limit=1`, { headers: H })
  t('المحتوى العام يُقرأ (الموقع يعمل)', pc.status === 200, pc.status)
  const ls = await get(`${supa}/storage/v1/object/list/report-files`, { method: 'POST', headers: { ...H, 'content-type': 'application/json' }, body: JSON.stringify({ prefix: '', limit: 5 }) })
  let lb = null; try { lb = await ls.json() } catch { /* */ }
  t('الزائر لا يعدّد مرفقات التقارير', !(ls.status === 200 && Array.isArray(lb) && lb.length > 0), ls.status)
  const pub = await get(`${supa}/storage/v1/object/public/report-files/x/y/z/a.png`, { headers: H })
  t('مرفقات التقارير ليست عامة', pub.status >= 400, pub.status)

  for (const [path, init] of [['/api/bot', { method: 'POST', body: '{"action":"claim"}' }], ['/api/admin-users', { method: 'POST', body: '{}' }], ['/api/ai-report', { method: 'POST', body: '{}' }]]) {
    const r = await get(site + path, { ...init, headers: { 'content-type': 'application/json' } })
    t(`${path} يرفض بلا تصريح`, [401, 403].includes(r.status), r.status)
    const g = await get(site + path)
    t(`${path} لا يقبل GET`, [404, 405].includes(g.status), g.status)
  }
  return results
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [site, supa, anon] = process.argv.slice(2)
  if (!site || !supa || !anon) { console.error('الاستخدام: node scripts/smoke.mjs <رابط الموقع> <رابط Supabase> <مفتاح anon>'); process.exit(1) }
  const res = await smoke({ site, supa, anon, log: console.log })
  const bad = res.filter(r => !r.pass)
  console.log(bad.length ? `\nفشل ${bad.length} من ${res.length}` : `\nنجحت كل الفحوص (${res.length})`)
  process.exit(bad.length ? 1 : 0)
}
