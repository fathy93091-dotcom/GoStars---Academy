-- =====================================================================
-- المرحلة 10: بوابة ولي الأمر (قراءة فقط)
-- عروض تُرجع لولي الأمر أبناءه فقط، وبأعمدة مختارة (لا هواتف ولا أجور معلمين ولا حالة واتساب).
-- تُعرَّف بصلاحيات مالكها وتُحرَس بـ parent_has_student داخل WHERE.
-- آمنة للتكرار. شغّلها بعد 001–008.
-- =====================================================================

-- ---------- الحصص المنتهية مع الحضور والواجب ----------
drop view if exists public.parent_lessons;
create view public.parent_lessons as
select
  a.student_id, l.id as lesson_id, l.lesson_date, l.lesson_no, l.title,
  a.status as att_status, a.note as att_note,
  h.status as hw_status, h.score as hw_score, h.note as hw_note,
  g.name as group_name, sub.name as subject_name, t.full_name as teacher_name
from public.attendance a
join public.lessons l on l.id = a.lesson_id
left join public.homework h on h.lesson_id = a.lesson_id and h.student_id = a.student_id
left join public.groups g on g.id = l.group_id
left join public.subjects sub on sub.id = l.subject_id
left join public.teachers t on t.id = l.teacher_id
where public.parent_has_student(a.student_id);

-- ---------- الحصص القادمة ----------
drop view if exists public.parent_upcoming;
create view public.parent_upcoming as
select
  s.id as student_id, l.id as lesson_id, l.lesson_date, l.start_time, l.title,
  g.name as group_name, sub.name as subject_name, t.full_name as teacher_name
from public.students s
join public.lessons l on l.status = 'scheduled' and l.lesson_date >= (now() at time zone 'Africa/Cairo')::date
  and (l.student_id = s.id
       or exists (select 1 from public.enrollments e where e.group_id = l.group_id and e.student_id = s.id and e.status = 'active'))
left join public.groups g on g.id = l.group_id
left join public.subjects sub on sub.id = l.subject_id
left join public.teachers t on t.id = l.teacher_id
where public.parent_has_student(s.id);

-- ---------- الرصيد (قراءة فقط) ----------
drop view if exists public.parent_balance;
create view public.parent_balance as
select
  s.id as student_id, s.lesson_price,
  coalesce(a.attended, 0)::int as attended_lessons,
  coalesce(a.consumed, 0) as consumed,
  coalesce(p.paid, 0) as total_paid,
  coalesce(p.paid, 0) - coalesce(a.consumed, 0) as balance
from public.students s
left join (select student_id, count(*) attended, sum(price_at_time) consumed
           from public.attendance where status in ('present','late') group by student_id) a on a.student_id = s.id
left join (select student_id, sum(amount) paid from public.payments group by student_id) p on p.student_id = s.id
where public.parent_has_student(s.id);

drop view if exists public.parent_payments;
create view public.parent_payments as
select p.id, p.student_id, p.amount, p.paid_at, p.method, p.ref_code
from public.payments p
where public.parent_has_student(p.student_id);

revoke all on public.parent_lessons, public.parent_upcoming, public.parent_balance, public.parent_payments from anon, authenticated;
grant select on public.parent_lessons, public.parent_upcoming, public.parent_balance, public.parent_payments to authenticated;
