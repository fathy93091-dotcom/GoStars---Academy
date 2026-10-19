#!/usr/bin/env bash
# استعادة نسخة احتياطية. عملية هدّامة: تستبدل جداول public الحالية. لا تعمل إلا بـ --yes.
#   DB_URL='postgresql://...' ./scripts/restore.sh --yes gostars-public-XXXX.dump [gostars-auth-XXXX.dump] [gostars-storage-meta-XXXX.dump]
# الترتيب مهم: المستخدمون (auth) أولاً لأن profiles يعتمد عليهم، ثم public.
# لاستعادة كارثة في مشروع Supabase جديد: أنشئ المشروع، فعّل MFA، ثم نفّذ هذا السكربت، ثم node scripts/backup-storage.mjs --restore
set -euo pipefail
[ "${1:-}" = "--yes" ] || { echo "أضف --yes للتأكيد: هذه العملية تستبدل بيانات public." >&2; exit 1; }
shift
: "${DB_URL:?ضع DB_URL}"
pub="${1:?ملف public.dump}"; auth="${2:-}"; meta="${3:-}"
for f in "$pub" ${auth:+"$auth"} ${meta:+"$meta"}; do
  case "$f" in *.gpg) echo "فكّ التشفير أولاً: gpg -d $f > ${f%.gpg}" >&2; exit 1;; esac
done
if [ -n "$auth" ]; then
  # المستخدمون الموجودون يُحدَّثون ولا يُكرَّرون
  pg_restore -d "$DB_URL" --data-only --no-owner --disable-triggers "$auth" || true
fi
# نُفرغ مخطط public بالكامل ثم نعيد بناءه (--clean وحده يفشل بسبب سياسات التخزين المعتمدة على دوال public)
psql "$DB_URL" -v ON_ERROR_STOP=1 -q <<'SQL'
drop schema if exists public cascade;
create schema public;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
SQL
pg_restore -d "$DB_URL" --no-owner -n public "$pub"
# تنبيه مهم: pg_dump لا يسجّل «سحب» الصلاحيات من anon/authenticated، وقاعدة Supabase الجديدة تمنحهما كل شيء تلقائياً
# على الجداول الجديدة. لذلك نعيد تطبيق ملفات SQL (آمنة للتكرار، لا تمسّ البيانات) فتُسحب الصلاحيات الزائدة.
SQLDIR="$(cd "$(dirname "$0")/.." && pwd)/supabase"
for f in "$SQLDIR"/00[1-9]_*.sql "$SQLDIR"/01[0-9]_*.sql; do
  psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$f" >/dev/null 2>&1 || { echo "فشل إعادة تطبيق $f" >&2; exit 1; }
done
[ -n "$meta" ] && pg_restore -d "$DB_URL" --data-only --no-owner --disable-triggers "$meta" || true
echo "تمت الاستعادة. شغّل: select * from security_audit();  بحساب المدير للتأكد."
