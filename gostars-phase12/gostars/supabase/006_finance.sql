-- =====================================================================
-- GoStars — المرحلة 7: النظام المالي (شاشات المدفوعات والحصص المستهلكة والرصيد)
-- يُنفَّذ بعد 005. قابل لإعادة التشغيل. لا DROP TABLE.
-- ⚠ خذ نسخة احتياطية قبل التنفيذ على قاعدة تحتوي بيانات.
-- الجداول والعرض student_balances والصلاحيات موجودة من 002/003؛ هذا الملف يضيف:
--   1) عرض الحصص المستهلكة لكل طالب (بسعرها وقت الحضور)
--   2) تحديد سعر حصة الطالب (يؤثر على الحصص القادمة)
--   3) تسعير الحصص السابقة غير المسعّرة (سعرها 0) — للمدير أو للمعلم المالك لطالبه الشخصي
-- المعادلات: المستهلك = مجموع أسعار الحصص الحاضر/المتأخر. الغائب لا يُحتسب.
--   الرصيد = المدفوع − المستهلك: موجب = رصيد للطالب (Credit)، سالب = مديونية (Debt).
-- =====================================================================

-- ---------- 1) الحصص المستهلكة ----------
drop view if exists public.student_consumed_lessons;
create view public.student_consumed_lessons as
select
  a.id as attendance_id, a.student_id, a.lesson_id, a.status, a.price_at_time as price,
  l.lesson_date, l.lesson_no, l.title, g.name as group_name
from public.attendance a
join public.lessons l on l.id = a.lesson_id
left join public.groups g on g.id = l.group_id
where a.status in ('present','late') and public.can_see_finance(a.student_id);
revoke all on public.student_consumed_lessons from anon, authenticated;
grant select on public.student_consumed_lessons to authenticated;

-- ---------- 2) الحصص تُسعَّر السعر الجديد فقط عند السماح الصريح ----------
-- المشغّل يمنع تعديل price_at_time، إلا داخل دالة التسعير أدناه (علامة جلسة محلية).
create or replace function public.attendance_price() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    select lesson_price into new.price_at_time from public.students where id = new.student_id;
  else
    if coalesce(current_setting('gostars.reprice', true), '') = 'on' then
      null;                                   -- تسعير مقصود من دالة موثوقة
    else
      new.price_at_time := old.price_at_time;
    end if;
    new.lesson_id := old.lesson_id;
    new.student_id := old.student_id;
  end if;
  return new;
end $$;

-- ---------- 3) تحديد سعر الحصة ----------
-- fix_unpriced = true: تُسعَّر أيضًا الحصص السابقة المسجَّلة بسعر 0 (لا تمس الحصص المسعّرة).
create or replace function public.set_student_price(sid uuid, price numeric, fix_unpriced boolean default false)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer := 0;
begin
  if not public.can_see_finance(sid) then raise exception 'غير مصرح'; end if;
  if price is null or price < 0 or price > 100000 then raise exception 'سعر غير صالح'; end if;
  update public.students set lesson_price = price where id = sid;
  if fix_unpriced then
    if not (public.is_admin() or public.owns_personal_student(sid)) then raise exception 'تصحيح الحصص السابقة للمدير فقط'; end if;
    perform set_config('gostars.reprice', 'on', true);
    update public.attendance set price_at_time = price
     where student_id = sid and status in ('present','late') and price_at_time = 0;
    get diagnostics n = row_count;
    perform set_config('gostars.reprice', 'off', true);
  end if;
  return n;
end $$;
revoke all on function public.set_student_price(uuid, numeric, boolean) from public, anon;
grant execute on function public.set_student_price(uuid, numeric, boolean) to authenticated;
