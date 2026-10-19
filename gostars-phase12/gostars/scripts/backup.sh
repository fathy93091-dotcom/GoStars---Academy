#!/usr/bin/env bash
# نسخة احتياطية كاملة لقاعدة بيانات GoStars (Supabase PostgreSQL).
#   DB_URL='postgresql://postgres.xxxx:كلمة_السر@aws-0-....pooler.supabase.com:5432/postgres' ./scripts/backup.sh [مجلد_الحفظ]
# يحفظ ثلاثة ملفات: public (الجداول والبيانات والسياسات والدوال والصلاحيات) + المستخدمون (auth) + بيانات التخزين الوصفية.
# ملفات الصور والمرفقات نفسها تُنسخ بـ node scripts/backup-storage.mjs
# مع BACKUP_PASSPHRASE تُشفَّر الملفات (gpg) قبل أن تغادر الجهاز. لا تحفظ النسخ في مستودع GitHub عام أبداً.
set -euo pipefail
: "${DB_URL:?ضع DB_URL (رابط الاتصال المباشر أو Session pooler من Supabase ← Connect)}"
out="${1:-backups}"; ts="$(date +%Y%m%d-%H%M%S)"; mkdir -p "$out"
d() { pg_dump "$DB_URL" --no-owner -Fc "$@"; }

d -n public                                                   -f "$out/gostars-public-$ts.dump"
d --data-only -t auth.users -t auth.identities                -f "$out/gostars-auth-$ts.dump"
d --data-only -t storage.buckets -t storage.objects           -f "$out/gostars-storage-meta-$ts.dump"

( cd "$out" && sha256sum gostars-*-"$ts".dump > "gostars-$ts.sha256" )
if [ -n "${BACKUP_PASSPHRASE:-}" ]; then
  for f in "$out"/gostars-*-"$ts".dump; do
    gpg --batch --yes --pinentry-mode loopback --passphrase "$BACKUP_PASSPHRASE" -c -o "$f.gpg" "$f" && rm "$f"
  done
  echo "شُفّرت الملفات (.gpg)."
fi
echo "تمت النسخة الاحتياطية: $out ($ts)"
