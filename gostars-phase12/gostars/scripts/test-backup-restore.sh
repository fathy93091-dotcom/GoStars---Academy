#!/usr/bin/env bash
# اختبار «استعادة النسخة الاحتياطية بنجاح» على Postgres حقيقي محلي (للمطور؛ يحتاج PostgreSQL مثبتاً).
# يبني قاعدة المصدر (001–012 + بيانات)، ينسخها بـ backup.sh، يستعيدها في قاعدة فارغة بـ restore.sh،
# ثم يقارن بصمة كل جدول، والسياسات والصلاحيات، ويجرّب العزل بالأدوار على القاعدة المستعادة.
set -euo pipefail
PGBIN=$(ls -d /usr/lib/postgresql/*/bin | tail -1); export PATH="$PGBIN:$PATH"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; W=$(mktemp -d); chmod 755 "$W"; PORT=54329
AS=""; [ "$(id -u)" = 0 ] && AS="su postgres -c"
run() { if [ -n "$AS" ]; then su postgres -c "export PATH=$PATH PGHOST=$W; $*"; else bash -c "$*"; fi; }
chown postgres "$W" 2>/dev/null || true
run "initdb -D $W/data -A trust >/dev/null && pg_ctl -D $W/data -o '-p $PORT -k $W' -l $W/log -w start >/dev/null"
trap 'run "pg_ctl -D $W/data -m immediate stop >/dev/null 2>&1" || true' EXIT
P="psql -h $W -p $PORT -U postgres -v ON_ERROR_STOP=1 -q"
U="postgresql://postgres@localhost:$PORT"; export PGHOST=$W
sql() { run "$P -d $1 -c \"${2//\"/\\\"}\"" ; }
run "$P -d postgres -c 'create database src' -c 'create database dst'"

# الأدوار عامة على مستوى العنقود: ننشئها في src فقط (الستَب ينشئها) ثم نتجاوز الخطأ في dst
run "$P -d src -f $ROOT/supabase/tests/supabase_stub.sql"
for f in 001_auth_rbac 002_core_schema 003_rls_policies 004_teacher_features 005_report_files 006_finance 007_admin_panel 008_cms 009_parent_portal 010_bot 011_bot_settings 012_hardening; do run "$P -d src -f $ROOT/supabase/$f.sql"; done

# ---- بيانات ----
cat > $W/seed.sql <<'SQL'
insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-000000000001','admin@x.com'),('00000000-0000-0000-0000-000000000007','p1@parent.gostars.local'),('00000000-0000-0000-0000-000000000008','p2@parent.gostars.local');
insert into profiles(id,role,full_name,status) values ('00000000-0000-0000-0000-000000000001','admin','المدير','active'),
 ('00000000-0000-0000-0000-000000000007','parent','ولي 1','active'),('00000000-0000-0000-0000-000000000008','parent','ولي 2','active')
 on conflict (id) do update set role=excluded.role, full_name=excluded.full_name, status='active';
insert into subjects(name) values ('رياضيات'),('علوم');
insert into students(full_name,study_type,lesson_price,parent_user_id) values ('طالب 1','group',100,'00000000-0000-0000-0000-000000000007'),('طالب 2','private',50,'00000000-0000-0000-0000-000000000008');
insert into student_contacts(student_id,parent_phone) select id,'01000000001' from students where full_name='طالب 1';
insert into payments(student_id,amount) select id,500 from students where full_name='طالب 1';
insert into content_site(key_element,text_value) values ('site.name','أكاديمية النجوم');
insert into announcements(title,body) values ('إعلان','نص');
insert into storage.buckets(id,name,public) values ('report-files','report-files',false) on conflict do nothing;
SQL
run "$P -d src -f $W/seed.sql"

fp() { # بصمة كل جدول في public (محتواه مرتباً)
  run "$P -d $1 -At -c \"select string_agg(format('select %L, md5(coalesce(string_agg(t::text, ''|'' order by t::text), '''')) from public.%I t', relname, relname), ' union all ' order by relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and relkind='r'\"" > $W/q.sql
  run "$P -d $1 -At -F ' ' -f $W/q.sql" | sort
}
fp src > $W/fp_src.txt

# ---- نسخة ----
BK=$W/bk; DB_URL="$U/src" "$ROOT/scripts/backup.sh" "$BK" >/dev/null
ls $BK | grep -q "gostars-public-" || { echo "FAIL لم تُنشأ نسخة public"; exit 1; }
( cd $BK && sha256sum -c gostars-*.sha256 >/dev/null ) && echo "PASS بصمات ملفات النسخة سليمة"

# ---- استعادة في قاعدة فارغة (فيها ستَب auth/storage فقط، كمشروع Supabase جديد) ----
grep -v "^create role" $ROOT/supabase/tests/supabase_stub.sql > $W/stub_dst.sql; run "$P -d dst -f $W/stub_dst.sql"
PUB=$(ls $BK/gostars-public-*.dump); AUTH=$(ls $BK/gostars-auth-*.dump); META=$(ls $BK/gostars-storage-meta-*.dump)
DB_URL="$U/dst" "$ROOT/scripts/restore.sh" --yes "$PUB" "$AUTH" "$META" >/dev/null
fp dst > $W/fp_dst.txt
if diff -q $W/fp_src.txt $W/fp_dst.txt >/dev/null; then echo "PASS كل جداول public مطابقة بعد الاستعادة ($(wc -l < $W/fp_src.txt) جدولاً)"; else echo "FAIL اختلاف بعد الاستعادة"; diff $W/fp_src.txt $W/fp_dst.txt; exit 1; fi
q() { run "$P -d $1 -At -c \"$2\""; }
[ "$(q src 'select count(*) from auth.users')" = "$(q dst 'select count(*) from auth.users')" ] && echo "PASS المستخدمون (auth) استُعيدوا" || { echo "FAIL المستخدمون"; exit 1; }
[ "$(q src "select count(*) from pg_policies where schemaname='public'")" = "$(q dst "select count(*) from pg_policies where schemaname='public'")" ] && echo "PASS سياسات RLS مطابقة" || { echo "FAIL السياسات"; exit 1; }
[ "$(q src "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and relkind='r' and relrowsecurity")" = "$(q dst "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and relkind='r' and relrowsecurity")" ] && echo "PASS تفعيل RLS على كل الجداول بعد الاستعادة" || { echo "FAIL RLS"; exit 1; }
GQ="select grantee||' '||table_name||' '||privilege_type from information_schema.role_table_grants where table_schema='public' and grantee in ('anon','authenticated','service_role') order by 1"
q src "$GQ" > $W/g_src.txt; q dst "$GQ" > $W/g_dst.txt
if diff -q $W/g_src.txt $W/g_dst.txt >/dev/null; then echo "PASS الصلاحيات (GRANT) مطابقة ($(wc -l < $W/g_src.txt) صلاحية)"; else echo "FAIL الصلاحيات"; diff $W/g_src.txt $W/g_dst.txt | head -20; exit 1; fi
[ "$(q src "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'")" = "$(q dst "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'")" ] && echo "PASS الدوال مطابقة" || { echo "FAIL الدوال"; exit 1; }

# ---- العزل يعمل على القاعدة المستعادة ----
iso() { run "$P -d dst -At -c \"set role $1; select set_config('request.jwt.claim.sub','$2',false); $3\"" | tail -1; }
[ "$(iso authenticated 00000000-0000-0000-0000-000000000007 'select count(*) from students')" = "1" ] && echo "PASS المستعاد: ولي الأمر يرى ابنه فقط" || { echo "FAIL عزل ولي الأمر"; exit 1; }
[ "$(iso anon '' 'select count(*) from announcements')" = "1" ] && echo "PASS المستعاد: الزائر يرى الإعلان العام" || { echo "FAIL إعلانات"; exit 1; }
run "$P -d dst -c \"set role anon; select * from students\"" >/dev/null 2>&1 && { echo "FAIL الزائر يقرأ الطلاب بعد الاستعادة"; exit 1; } || echo "PASS المستعاد: الزائر لا يقرأ الطلاب"
[ "$(iso authenticated 00000000-0000-0000-0000-000000000001 'select count(*) from security_audit()')" = "0" ] && echo "PASS المستعاد: الفحص الذاتي بلا مشاكل" || { echo "FAIL security_audit"; exit 1; }

# ---- استعادة فوق قاعدة مأهولة (--clean) ----
sql dst "delete from payments" 2>/dev/null || run "$P -d dst -c 'delete from payments'"
DB_URL="$U/dst" "$ROOT/scripts/restore.sh" --yes "$PUB" >/dev/null
[ "$(q dst 'select count(*) from payments')" = "1" ] && echo "PASS الاستعادة فوق قاعدة معدّلة تُرجع البيانات" || { echo "FAIL استعادة فوق قائمة"; exit 1; }
# بدون --yes لا تعمل
DB_URL="$U/dst" "$ROOT/scripts/restore.sh" "$PUB" >/dev/null 2>&1 && { echo "FAIL تعمل بلا --yes"; exit 1; } || echo "PASS الاستعادة تتطلب --yes"
echo "ALL PASSED"
