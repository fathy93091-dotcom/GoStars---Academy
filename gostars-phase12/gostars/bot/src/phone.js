// تطبيع رقم ولي الأمر إلى صيغة واتساب الدولية (أرقام فقط بلا + ولا أصفار بادئة).
// مصر: 01XXXXXXXXX → 201XXXXXXXXX. غير ذلك يجب أن يُحفظ الرقم بمفتاح الدولة (+966… ،+971…).
// يرجع null إذا تعذّر الجزم بالرقم (فلا نخمّن ونرسل لشخص خطأ).
export function normalizePhone(raw) {
  if (raw == null) return null
  let d = String(raw).replace(/[\s\-().+‎‏]/g, '')
  d = d.replace(/[٠-٩]/g, c => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c)))
  if (!/^\d+$/.test(d)) return null
  if (d.startsWith('00')) d = d.slice(2)
  else if (/^01[0125]\d{8}$/.test(d)) d = '20' + d.slice(1)        // موبايل مصري بصفر
  else if (/^1[0125]\d{8}$/.test(d)) d = '20' + d                  // موبايل مصري بلا صفر
  else if (d.startsWith('0')) return null                          // رقم محلي بلا مفتاح دولة: غامض
  return /^[1-9]\d{7,14}$/.test(d) ? d : null
}
