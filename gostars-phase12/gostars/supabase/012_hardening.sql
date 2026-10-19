-- =====================================================================
-- المرحلة 12: تصليب الأمان
--   1) حد معدّل لنموذج «تواصل معنا» (الزائر يُدخل بلا حساب، فيلزم منع الإغراق)
--   2) دالة فحص ذاتي security_audit() للمدير: تكشف أي جدول بلا RLS أو صلاحية زائرة غير متوقعة
-- آمنة للتكرار. شغّلها بعد 011.
-- =====================================================================

-- ---------- 1) حد معدّل رسائل التواصل ----------
-- الحدود: رسالتان لكل رقم هاتف خلال 10 دقائق، و10 رسائل كل دقيقة لكل الموقع، و100 كل ساعة.
create or replace function public.contact_rate_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.contact_messages where phone = new.phone and created_at > now() - interval '10 minutes') >= 2
     or (select count(*) from public.contact_messages where created_at > now() - interval '1 minute') >= 10
     or (select count(*) from public.contact_messages where created_at > now() - interval '1 hour') >= 100 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function public.contact_rate_limit() from public, anon, authenticated;
drop trigger if exists trg_contact_rate on public.contact_messages;
create trigger trg_contact_rate before insert on public.contact_messages for each row execute function public.contact_rate_limit();
create index if not exists contact_messages_created_idx on public.contact_messages (created_at desc);

-- ---------- 1ب) سحب صلاحيات خطرة لا يحتاجها التطبيق ----------
-- TRUNCATE يتجاوز RLS كلياً؛ REFERENCES/TRIGGER لا حاجة لهما من واجهة الموقع.
do $$
declare t text;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r','p') loop
    execute format('revoke truncate, references, trigger on public.%I from anon, authenticated', t);
  end loop;
end $$;
-- أي جدول جديد مستقبلاً: لا تُمنح هذه الصلاحيات تلقائياً
alter default privileges in schema public revoke truncate, references, trigger on tables from anon, authenticated;

-- ---------- 2) فحص ذاتي (للمدير فقط) ----------
-- يرجع صفوفاً بكل ما يحتاج مراجعة؛ لا صفوف = سليم.
create or replace function public.security_audit() returns table (problem text, object text)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'غير مصرح'; end if;
  return query
  select 'جدول بلا RLS'::text, c.relname::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  return query
  select 'صلاحية للزائر غير متوقعة'::text, (g.table_name || ' : ' || g.privilege_type)::text
    from information_schema.role_table_grants g
   where g.table_schema = 'public' and g.grantee = 'anon'
     and not (g.privilege_type = 'SELECT' and g.table_name in ('announcements', 'public_content'));
  return query
  select 'صلاحية أعمدة للزائر غير متوقعة'::text, (g.table_name || '.' || g.column_name || ' : ' || g.privilege_type)::text
    from information_schema.column_privileges g
   where g.table_schema = 'public' and g.grantee = 'anon'
     and not (g.table_name = 'contact_messages' and g.privilege_type = 'INSERT' and g.column_name in ('name', 'phone', 'role', 'message'))
     and not (g.privilege_type = 'SELECT' and g.table_name in ('announcements', 'public_content'));
  return query
  select 'دالة SECURITY DEFINER بلا search_path'::text, p.proname::text
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef and not coalesce(p.proconfig::text ilike '%search_path%', false);
  return query
  select 'مفتاح مفقود في bot_settings'::text, 'bot_settings'::text where not exists (select 1 from public.bot_settings);
end $$;
revoke all on function public.security_audit() from public, anon;
grant execute on function public.security_audit() to authenticated;
