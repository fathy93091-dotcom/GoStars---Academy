// يفحص مجلد المشروع بحثاً عن أسرار مسرّبة قبل أي رفع إلى GitHub: node scripts/secret-scan.mjs
import fs from 'node:fs'
import path from 'node:path'

const RULES = [
  ['مفتاح Supabase السري (sb_secret_)', /sb_secret_[A-Za-z0-9_-]{10,}/],
  ['JWT (قد يكون service_role)', /eyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}/],
  ['مفتاح Google/Gemini', /AIza[0-9A-Za-z_-]{35}/],
  ['مفتاح خاص', /-----BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY-----/],
  ['رابط اتصال قاعدة بيانات بكلمة سر', /postgres(ql)?:\/\/[^\s:@/]+:(?![^\s@/]*(\[|\]|YOUR|PASSWORD|xxxx|[\u0600-\u06FF]))[^\s@/]{4,}@[^\s]+/i],
  ['سطر سرّ مُسنَد في ملف', /(SERVICE_ROLE_KEY|BOT_SECRET|GEMINI_API_KEY|BACKUP_PASSPHRASE)\s*[=:]\s*["']?[A-Za-z0-9_\-./+]{16,}/],
]
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'auth'])
const SKIP_FILES = new Set(['package-lock.json', 'secret-scan.mjs', 'secret-scan.test.mjs'])
const TEXT = /\.(js|jsx|mjs|cjs|json|md|sql|sh|yml|yaml|html|css|env|example|txt|toml|py)$|^\.env/

export function scan(root) {
  const hits = []
  const walk = d => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(path.join(d, e.name)); continue }
      if (SKIP_FILES.has(e.name) || !TEXT.test(e.name)) continue
      const f = path.join(d, e.name)
      if (/^\.env($|\.)/.test(e.name) && e.name !== '.env.example') hits.push({ file: path.relative(root, f), rule: 'ملف بيئة حقيقي داخل المشروع (يجب ألا يُرفع)', line: 0 })
      fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => { for (const [name, re] of RULES) if (re.test(line)) hits.push({ file: path.relative(root, f), rule: name, line: i + 1 }) })
    }
  }
  walk(root); return hits
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = path.resolve(process.argv[2] || path.join(path.dirname(new URL(import.meta.url).pathname), '..'))
  const hits = scan(root)
  for (const h of hits) console.log(`⚠️  ${h.file}${h.line ? ':' + h.line : ''} — ${h.rule}`)
  console.log(hits.length ? `\nوُجد ${hits.length} تحذير. لا ترفع المشروع قبل معالجتها.` : 'لا أسرار ظاهرة في المشروع ✅')
  process.exit(hits.length ? 1 : 0)
}
