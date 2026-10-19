import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'
import { scan } from './secret-scan.mjs'
let failed = 0; const ok = (n, c) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) failed++ }
const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-'))
fs.writeFileSync(path.join(d, 'a.js'), 'const x = 1\n'); ok('مشروع نظيف بلا تحذيرات', scan(d).length === 0)
fs.writeFileSync(path.join(d, 'b.js'), "const k='sb_secret_" + 'abcdefghij1234567890' + "'"); ok('يكتشف sb_secret_', scan(d).some(h => h.rule.includes('sb_secret')))
fs.writeFileSync(path.join(d, 'c.md'), 'DB: postgresql://postgres:hunter2pw@db.x.supabase.co:5432/postgres'); ok('يكتشف رابط قاعدة بيانات بكلمة سر', scan(d).some(h => h.rule.includes('رابط اتصال')))
fs.writeFileSync(path.join(d, 'd.js'), 'x="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.abcdefghijklmnop"'); ok('يكتشف JWT', scan(d).some(h => h.rule.includes('JWT')))
fs.writeFileSync(path.join(d, '.env.local'), 'A=1'); ok('يكتشف ملف .env.local', scan(d).some(h => h.rule.includes('ملف بيئة')))
fs.writeFileSync(path.join(d, '.env.example'), 'VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co'); fs.rmSync(path.join(d, '.env.local'))
fs.rmSync(path.join(d, 'b.js')); fs.rmSync(path.join(d, 'c.md')); fs.rmSync(path.join(d, 'd.js')); ok('.env.example مسموح', scan(d).length === 0)
console.log(failed ? 'FAILED' : 'ALL PASSED'); process.exit(failed ? 1 : 0)
