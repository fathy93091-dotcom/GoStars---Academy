// عميل واجهة البوت على Cloudflare (/api/bot). يحمل سرّ البوت فقط.
export function createApi({ url, secret, fetchImpl = fetch, retries = 3, wait = ms => new Promise(r => setTimeout(r, ms)) }) {
  async function call(payload) {
    let last
    for (let i = 0; i < retries; i++) {
      try {
        const res = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-bot-secret': secret }, body: JSON.stringify(payload) })
        if (res.status === 401) throw Object.assign(new Error('سرّ البوت غير صحيح (BOT_SECRET)'), { fatal: true })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return await res.json()
      } catch (e) {
        if (e.fatal) throw e
        last = e; if (i < retries - 1) await wait(1000 * 2 ** i)
      }
    }
    throw last
  }
  return {
    claim: (max, info) => call({ action: 'claim', max, info }).then(r => ({ reports: r.reports || [], settings: r.settings || {} })),
    result: (report_id, ok, error, permanent = false) => call({ action: 'result', report_id, ok, error, permanent }),
  }
}
