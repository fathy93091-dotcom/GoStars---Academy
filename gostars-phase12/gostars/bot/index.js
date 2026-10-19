import fs from 'node:fs'
import { createApi } from './src/api.js'
import { createWhatsApp } from './src/whatsapp.js'
import { fileJournal } from './src/journal.js'
import { processOnce } from './src/worker.js'

// تحميل .env بسيط (بلا مكتبات)
try {
  for (const line of fs.readFileSync(new URL('./.env', import.meta.url), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
} catch { /* لا ملف .env: نعتمد متغيرات البيئة */ }

const { API_URL, BOT_SECRET, PAIR_PHONE } = process.env
if (!API_URL || !BOT_SECRET) { console.error('اضبط API_URL و BOT_SECRET في ملف .env'); process.exit(1) }

const log = m => console.log(`[${new Date().toLocaleString('en-GB', { timeZone: 'Africa/Cairo' })}] ${m}`)
const wa = await createWhatsApp({ authDir: new URL('./auth', import.meta.url).pathname, pairPhone: PAIR_PHONE?.replace(/\D/g, ''), log })
const api = createApi({ url: API_URL, secret: BOT_SECRET })
const journal = fileJournal(new URL('./sent.json', import.meta.url).pathname)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const POLL = Math.max(10, Number(process.env.POLL_SECONDS) || 20) * 1000

let stop = false
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => { stop = true; wa.stop(); log('إيقاف…'); setTimeout(() => process.exit(0), 500) })

log('بوت GoStars يعمل')
while (!stop) {
  try {
    await processOnce({ api, sender: wa, journal, sleep, log, info: 'termux' })
  } catch (e) {
    log('خطأ: ' + e.message)
    if (e.fatal) process.exit(1)
  }
  await sleep(POLL)
}
