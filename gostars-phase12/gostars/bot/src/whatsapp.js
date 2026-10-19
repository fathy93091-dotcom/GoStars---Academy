// محوّل واتساب (Baileys). طبقة رقيقة؛ المنطق كله في worker.js المختبَر.
import * as Baileys from '@whiskeysockets/baileys'
import pino from 'pino'
import qrcode from 'qrcode-terminal'

const makeWASocket = Baileys.default?.default ?? Baileys.default ?? Baileys.makeWASocket
const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = Baileys

export async function createWhatsApp({ authDir, pairPhone, log = console.log }) {
  let sock = null, connected = false, stopped = false

  async function connect() {
    const { state, saveCreds } = await useMultiFileAuthState(authDir)
    let version
    try { ({ version } = await fetchLatestBaileysVersion()) } catch { /* نستخدم الافتراضي */ }
    sock = makeWASocket({ auth: state, version, logger: pino({ level: 'silent' }), browser: ['GoStars Bot', 'Chrome', '1.0'], markOnlineOnConnect: false })
    sock.ev.on('creds.update', saveCreds)

    if (pairPhone && !state.creds.registered) {
      // الربط برمز من 8 خانات (مناسب عند تشغيل البوت على نفس الهاتف الذي لا يستطيع مسح QR من نفسه)
      setTimeout(async () => {
        try { log(`رمز الربط: ${await sock.requestPairingCode(pairPhone)}  (واتساب ← الأجهزة المرتبطة ← ربط برقم الهاتف)`) } catch (e) { log('تعذّر طلب رمز الربط: ' + e.message) }
      }, 3000)
    }

    sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
      if (qr && !pairPhone) { log('امسح هذا الرمز من واتساب ← الأجهزة المرتبطة:'); qrcode.generate(qr, { small: true }) }
      if (connection === 'open') { connected = true; log('✅ واتساب متصل') }
      if (connection === 'close') {
        connected = false
        const code = lastDisconnect?.error?.output?.statusCode
        if (code === DisconnectReason.loggedOut) { log('⛔ تم تسجيل الخروج من الجهاز. احذف مجلد auth وأعد الربط.'); process.exit(2) }
        if (!stopped) { log(`انقطع الاتصال (${code ?? '؟'}) — إعادة المحاولة بعد 5 ثوانٍ`); setTimeout(() => connect().catch(e => log('فشل إعادة الاتصال: ' + e.message)), 5000) }
      }
    })
  }
  await connect()

  const jid = phone => `${phone}@s.whatsapp.net`
  return {
    ready: () => connected,
    stop() { stopped = true; try { sock?.end?.() } catch { /* */ } },
    async exists(phone) { const r = await sock.onWhatsApp(jid(phone)); return Boolean(r?.[0]?.exists) },
    async sendText(phone, text) { await sock.sendMessage(jid(phone), { text }) },
    async sendFile(phone, f) {
      const res = await fetch(f.url); if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const buf = Buffer.from(await res.arrayBuffer())
      if ((f.type || '').startsWith('image/')) await sock.sendMessage(jid(phone), { image: buf })
      else await sock.sendMessage(jid(phone), { document: buf, mimetype: f.type || 'application/octet-stream', fileName: f.name })
    },
  }
}
