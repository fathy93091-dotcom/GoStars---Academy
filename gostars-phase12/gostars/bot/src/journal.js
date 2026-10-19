import fs from 'node:fs'
// سجل بسيط في ملف: آخر 2000 تقرير أُرسل
export function fileJournal(path) {
  let ids = []
  try { ids = JSON.parse(fs.readFileSync(path, 'utf8')) } catch { /* أول تشغيل */ }
  const set = new Set(ids)
  return {
    has: id => set.has(id),
    add(id) { set.add(id); const arr = [...set].slice(-2000); try { fs.writeFileSync(path, JSON.stringify(arr)) } catch { /* لا يوقف البوت */ } },
  }
}
