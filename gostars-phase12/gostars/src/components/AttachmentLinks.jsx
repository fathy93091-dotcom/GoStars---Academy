import { useState } from 'react'
import { openAttachment } from '../lib/teacherApi.js'

// عرض مرفقات التقرير: رابط موقّع قصير العمر عند الضغط فقط (لا روابط عامة)
export default function AttachmentLinks({ items }) {
  const [err, setErr] = useState('')
  if (!Array.isArray(items) || items.length === 0) return null
  return (
    <div className="attach-list">
      {items.map(a => (
        <button type="button" key={a.path} className="btn btn--light btn--sm" onClick={async () => setErr((await openAttachment(a.path)) ? '' : 'تعذّر فتح المرفق.')}>
          {a.type === 'application/pdf' ? '📄' : '🖼️'} {a.name}
        </button>
      ))}
      {err && <p className="error">{err}</p>}
    </div>
  )
}
