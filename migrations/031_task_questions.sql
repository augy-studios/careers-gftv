-- 031_task_questions.sql
--
-- Creates: gftvjobs_tasks.questions, gftvjobs_tasks.answers,
--          gftvjobs_jobs.task_questions, and the two validator functions
--          behind their check constraints.
-- Spec:    section 7g (question sets on tasks), 8.3 (the composer),
--          section 9 (api/tasks reply validation), section 10 item 1.
-- Run after: 008, which creates gftvjobs_tasks, and 005 for gftvjobs_jobs.
--
-- The first migration since 030, and it exists because the specification
-- changed on 21 August 2026, after phase 6 shipped. Section 10 item 1 used to
-- rule out the portal building any application form at all. It was reversed
-- knowingly and by half: a task may now carry a small set of questions, and a
-- posting may carry a template set that raises one automatically. What still
-- holds, and what this file is careful not to make possible, is the rest of
-- that decision: the application itself stays a Google Form, nothing here
-- accepts a file, nothing computes anything from an answer, and twenty is a
-- cap the database enforces rather than a number in a comment.
--
-- Why jsonb rather than a questions table and an answers table.
--
--   The set is frozen the moment a task is sent, per 7g, and a posting's set is
--   copied onto each task rather than referenced. Both rules exist because
--   editing a set that has already been answered orphans the answers. Rows in
--   a separate table would be editable by definition and the freeze would be a
--   convention enforced by whoever remembered it; a jsonb column copied at send
--   time is frozen by construction. Nothing joins on a question, nothing counts
--   them across tasks, and no query filters by one, so the relational shape
--   would buy nothing and cost the guarantee.
--
-- The shape, which api/_lib/questions.js is the other half of:
--
--   questions   [ { "id", "type", "required", "label": {locale: text},
--                   "help": {locale: text}, "options": [ { "value",
--                   "label": {locale: text} } ] } ]
--   answers     { "<question id>": "text" | "value" | ["value", ...] }
--
-- **An answer stores an option value, never a label.** The label is per
-- language and the value is not, so an answer given in 华文 has to remain
-- readable in English and matchable against the question's own options. The
-- check constraints below cannot enforce that on their own, which is why the
-- server validates every reply against the set stored on that task and never
-- against what the browser sent back.
--
-- Both new columns on gftvjobs_tasks are nullable or defaulted, so every row
-- migration 008 created stays valid and a plain reply box task with no
-- questions is still the ordinary case.

begin;

-- The per language text an every label carries: an object of locale code to a
-- non empty string. Not a plain text column, because a question is content and
-- translates with everything else, per 7g and section 3a.
--
-- An empty object is rejected. A label nobody wrote in any language is a
-- question that renders blank, which is worse than a save that fails.
create or replace function gftvjobs_locale_text_valid(p_value jsonb)
returns boolean
language sql
immutable
as $$
  select p_value is not null
     and jsonb_typeof(p_value) = 'object'
     and exists (select 1 from jsonb_object_keys(p_value))
     and not exists (
       select 1
       from jsonb_each(p_value) as e(key, value)
       where jsonb_typeof(e.value) <> 'string'
          or btrim(e.value #>> '{}') = ''
     );
$$;

comment on function gftvjobs_locale_text_valid(jsonb) is
  'True when a value is a non empty object of locale code to non empty string. The shape every question label and option label takes.';

-- One question set. Twenty is the cap from section 10 item 1, made
-- enforceable here rather than left to the composer.
--
-- The four types are fixed at the database, unlike gftvjobs_tasks.task_type
-- which migration 008 deliberately left open. A new task type is a label; a
-- new question type is a renderer, a validator, and an admin view of the
-- answer, so it cannot arrive without code and there is no value in letting a
-- row carry one that nothing can draw.
create or replace function gftvjobs_questions_valid(p_value jsonb)
returns boolean
language sql
immutable
as $$
  select p_value is null or (
    jsonb_typeof(p_value) = 'array'
    and jsonb_array_length(p_value) <= 20
    -- Ids are what an answer keys on, so a duplicate would make one answer
    -- unreachable and the other ambiguous.
    and (
      select count(distinct q ->> 'id') = count(*)
      from jsonb_array_elements(p_value) as q
    )
    and not exists (
      select 1
      from jsonb_array_elements(p_value) as q
      where jsonb_typeof(q) <> 'object'
         or coalesce(btrim(q ->> 'id'), '') = ''
         or coalesce(q ->> 'type', '') not in
              ('short_answer', 'long_answer', 'choice', 'checkbox')
         or jsonb_typeof(q -> 'required') <> 'boolean'
         or not gftvjobs_locale_text_valid(q -> 'label')
         -- help is optional, and is checked only when it is there.
         or (q ? 'help' and jsonb_typeof(q -> 'help') <> 'null'
             and not gftvjobs_locale_text_valid(q -> 'help'))
         -- The two list types need options; the two text types must not carry
         -- any, or an editor that changed a question's type would leave stale
         -- options behind for a validator to trip over later.
         or (
              q ->> 'type' in ('choice', 'checkbox')
              and (
                jsonb_typeof(q -> 'options') <> 'array'
                or jsonb_array_length(q -> 'options') < 1
                or jsonb_array_length(q -> 'options') > 40
                or (
                  select count(distinct o ->> 'value') <> count(*)
                  from jsonb_array_elements(q -> 'options') as o
                )
                or exists (
                  select 1
                  from jsonb_array_elements(q -> 'options') as o
                  where jsonb_typeof(o) <> 'object'
                     or coalesce(btrim(o ->> 'value'), '') = ''
                     or not gftvjobs_locale_text_valid(o -> 'label')
                )
              )
            )
         or (
              q ->> 'type' in ('short_answer', 'long_answer')
              and q ? 'options'
              and jsonb_typeof(q -> 'options') <> 'null'
            )
    )
  );
$$;

comment on function gftvjobs_questions_valid(jsonb) is
  'True when a question set is a well formed array of at most twenty questions with unique ids, one of the four types, a per language label, and options on exactly the two list types. See 7g.';

-- The answers half. Deliberately looser than the questions half, and the
-- reason is worth stating: what makes an answer valid is the set stored on
-- that task, which a check constraint cannot see. api/tasks/respond.js is
-- where every required question is confirmed answered and every choice value
-- checked against that question's own options. This constraint catches only
-- the shapes no set could ever make valid.
create or replace function gftvjobs_answers_valid(p_value jsonb)
returns boolean
language sql
immutable
as $$
  select p_value is null or (
    jsonb_typeof(p_value) = 'object'
    and not exists (
      select 1
      from jsonb_each(p_value) as a(key, value)
      where jsonb_typeof(a.value) not in ('string', 'array')
         or (
              jsonb_typeof(a.value) = 'array'
              and exists (
                select 1
                from jsonb_array_elements(a.value) as v
                where jsonb_typeof(v) <> 'string'
              )
            )
    )
  );
$$;

comment on function gftvjobs_answers_valid(jsonb) is
  'True when answers is an object of question id to a string or an array of strings. What makes an answer correct is the set on the task, which the server checks; this catches only what no set could accept.';

/* -------------------------------------------------------------------------
 * gftvjobs_tasks
 * ---------------------------------------------------------------------- */

alter table gftvjobs_tasks
  add column if not exists questions jsonb not null default '[]'::jsonb;

alter table gftvjobs_tasks
  add column if not exists answers jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'gftvjobs_tasks_questions_valid'
  ) then
    alter table gftvjobs_tasks add constraint gftvjobs_tasks_questions_valid
      check (gftvjobs_questions_valid(questions));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'gftvjobs_tasks_answers_valid'
  ) then
    alter table gftvjobs_tasks add constraint gftvjobs_tasks_answers_valid
      check (gftvjobs_answers_valid(answers));
  end if;

  -- Answers without questions is a row nothing can render: the admin view
  -- shows each answer beside the question it answers, per 8.3, and there would
  -- be nothing to put beside it.
  if not exists (
    select 1 from pg_constraint where conname = 'gftvjobs_tasks_answers_need_questions'
  ) then
    alter table gftvjobs_tasks add constraint gftvjobs_tasks_answers_need_questions
      check (
        answers is null
        or jsonb_array_length(coalesce(questions, '[]'::jsonb)) > 0
      );
  end if;
end $$;

comment on column gftvjobs_tasks.questions is
  'The question set this task was sent with, frozen at send time per 7g. A posting template is copied here rather than referenced, so editing the template never orphans an answer.';
comment on column gftvjobs_tasks.answers is
  'Question id to answer. An answer stores an option value, never a label. Null until the applicant replies, and the one round rule means it is written once.';

-- 8.3 shows any open task inline on the tracking row and wants the ones
-- carrying questions distinguishable. Partial, because a set is the exception
-- rather than the rule.
create index if not exists gftvjobs_tasks_with_questions_idx
  on gftvjobs_tasks (applicant_id, created_at desc)
  where jsonb_array_length(questions) > 0;

/* -------------------------------------------------------------------------
 * gftvjobs_jobs
 * ---------------------------------------------------------------------- */

-- The posting's template, per 7g and the second audience in 8.3. Null means
-- the posting asks nothing, which is every posting today and most of them
-- always. Distinct from an empty array on purpose: an empty array is a set an
-- admin emptied and has not deleted, and the two read differently in the
-- composer.
alter table gftvjobs_jobs
  add column if not exists task_questions jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'gftvjobs_jobs_task_questions_valid'
  ) then
    alter table gftvjobs_jobs add constraint gftvjobs_jobs_task_questions_valid
      check (gftvjobs_questions_valid(task_questions));
  end if;
end $$;

comment on column gftvjobs_jobs.task_questions is
  'Optional template asked of everybody who applies from now on, per 7g. Copied onto each task at raise time. Editing it changes only what the next applicant is asked.';

-- The postings list marks which roles carry a set, per 8.3, since it is a
-- thing an applicant is asked that is not visible on the posting itself.
create index if not exists gftvjobs_jobs_task_questions_idx
  on gftvjobs_jobs (id)
  where task_questions is not null;

insert into gftvjobs_migrations (filename)
values ('031_task_questions.sql')
on conflict (filename) do update set applied_at = now();

commit;

-- Rollback
--
-- begin;
-- drop index if exists gftvjobs_jobs_task_questions_idx;
-- drop index if exists gftvjobs_tasks_with_questions_idx;
-- alter table gftvjobs_jobs  drop constraint if exists gftvjobs_jobs_task_questions_valid;
-- alter table gftvjobs_jobs  drop column if exists task_questions;
-- alter table gftvjobs_tasks drop constraint if exists gftvjobs_tasks_answers_need_questions;
-- alter table gftvjobs_tasks drop constraint if exists gftvjobs_tasks_answers_valid;
-- alter table gftvjobs_tasks drop constraint if exists gftvjobs_tasks_questions_valid;
-- alter table gftvjobs_tasks drop column if exists answers;
-- alter table gftvjobs_tasks drop column if exists questions;
-- drop function if exists gftvjobs_answers_valid(jsonb);
-- drop function if exists gftvjobs_questions_valid(jsonb);
-- drop function if exists gftvjobs_locale_text_valid(jsonb);
-- delete from gftvjobs_migrations where filename = '031_task_questions.sql';
-- commit;
