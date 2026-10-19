// نسخ/استعادة ملفات التخزين (مرفقات التقارير report-files وصور الموقع site-media) عبر واجهة Storage.
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/backup-storage.mjs [مجلد]            ← نسخ
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/backup-storage.mjs --restore [مجلد]  ← رفع
// المفتاح يوضع في متغير بيئة على جهازك فقط (لا في ملف داخل المستودع).
import fs from 'node:fs'
import path from 'node:path'

const BUCKETS = ['report-files', 'site-media']
export async function run({ url, key, dir, restore = false, fetchImpl = fetch }) {
  const h = { apikey: key, authorization: `Bearer ${key}` }
  const enc = p => p.split('/').map(encodeURIComponent).join('/')
  let count = 0
  async function list(bucket, prefix = '') {
    const res = await fetchImpl(`${url}/storage/v1/object/list/${bucket}`, { method: 'POST', headers: { ...h, 'content-type': 'application/json' }, body: JSON.stringify({ prefix, limit: 1000, offset: 0 }) })
    if (!res.ok) throw new Error(`list ${bucket}/${prefix}: ${res.status}`)
    const items = await res.json(); const files = []
    for (const it of items) { const p = prefix ? `${prefix}/${it.name}` : it.name; if (it.id === null || it.metadata == null) files.push(...await list(bucket, p)); else files.push(p) }
    return files
  }
  for (const b of BUCKETS) {
    if (!restore) {
      for (const p of await list(b)) {
        const r = await fetchImpl(`${url}/storage/v1/object/${b}/${enc(p)}`, { headers: h }); if (!r.ok) throw new Error(`download ${b}/${p}: ${r.status}`)
        const dest = path.join(dir, b, p); fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer())); count++
      }
    } else {
      const root = path.join(dir, b); if (!fs.existsSync(root)) continue
      const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)])
      for (const f of walk(root)) {
        const rel = path.relative(root, f).split(path.sep).join('/')
        const r = await fetchImpl(`${url}/storage/v1/object/${b}/${enc(rel)}`, { method: 'POST', headers: { ...h, 'x-upsert': 'true' }, body: fs.readFileSync(f) })
        if (!r.ok) throw new Error(`upload ${b}/${rel}: ${r.status}`); count++
      }
    }
  }
  return count
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key } = process.env
  if (!url || !key) { console.error('ضع SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY في متغيرات البيئة'); process.exit(1) }
  const args = process.argv.slice(2); const restore = args.includes('--restore')
  const dir = args.find(a => !a.startsWith('--')) || `backups/storage-${new Date().toISOString().slice(0, 10)}`
  run({ url, key, dir, restore }).then(n => console.log(`${restore ? 'رُفع' : 'نُسخ'} ${n} ملفاً — ${dir}`)).catch(e => { console.error(e.message); process.exit(1) })
}
