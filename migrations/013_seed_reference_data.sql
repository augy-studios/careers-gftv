-- 013_seed_reference_data.sql
--
-- Creates: nothing. Inserts starting departments and tags.
-- Spec:    section 6 (migration ordering ends with seed reference data).
-- Run after: 004, and after 009 so the usage_count trigger exists.
--
-- Reference data only. No job postings, no accounts, and nothing invented
-- about a real person. The sample postings and test accounts asked for in
-- section 17 come from a separate seed script in phase 10, since those are
-- for local testing and do not belong in production.
--
-- Everything here is idempotent on the slug, so re-running this file changes
-- nothing. Renaming or removing any of it afterwards is ordinary admin work
-- in sections 8.6 and 8.7, not a migration.

begin;

insert into gftvjobs_departments (name, slug, description, sort_order) values
  ('Production',
   'production',
   'Planning and running shoots, studio sessions, and live broadcasts.',
   10),
  ('Post Production',
   'post-production',
   'Editing, colour, motion graphics, subtitling, and everything after the shoot.',
   20),
  ('Broadcast Engineering',
   'broadcast-engineering',
   'Streaming infrastructure, encoders, playout, and the tooling that keeps a channel on air.',
   30),
  ('Creative and Design',
   'creative-and-design',
   'Branding, channel identity, thumbnails, print, and design for events.',
   40),
  ('Programming',
   'programming',
   'Scheduling, commissioning, and deciding what goes out and when.',
   50),
  ('Community',
   'community',
   'Social channels, chat moderation, and looking after the people watching.',
   60),
  ('Events',
   'events',
   'Convention coverage, panels, and anything filmed away from the studio.',
   70),
  ('Operations',
   'operations',
   'Volunteer coordination, scheduling, documentation, and keeping the lights on.',
   80)
on conflict (slug) do nothing;

insert into gftvjobs_tags (name, slug, description) values
  ('Video Editing',     'video-editing',     'Cutting, assembly, and delivery of finished video.'),
  ('Motion Graphics',   'motion-graphics',   'Animated titles, lower thirds, and channel idents.'),
  ('Camera',            'camera',            'Operating a camera on a shoot or in studio.'),
  ('Audio',             'audio',             'Recording, mixing, and mastering sound.'),
  ('Lighting',          'lighting',          'Lighting design and rigging for studio and location.'),
  ('Live Streaming',    'live-streaming',    'Running a live broadcast end to end.'),
  ('OBS',               'obs',               'Scene building and configuration in OBS Studio.'),
  ('Presenting',        'presenting',        'On camera hosting and presenting.'),
  ('Scriptwriting',     'scriptwriting',     'Writing scripts, segments, and running orders.'),
  ('Subtitling',        'subtitling',        'Captions, subtitles, and transcript work.'),
  ('Graphic Design',    'graphic-design',    'Static design for screen and print.'),
  ('Social Media',      'social-media',      'Posting, scheduling, and growing the channels.'),
  ('Moderation',        'moderation',        'Chat and community moderation.'),
  ('Project Management','project-management','Coordinating people, schedules, and deliverables.'),
  ('Fursuiting',        'fursuiting',        'Performing in suit on camera.'),
  ('Remote Friendly',   'remote-friendly',   'Can be done entirely from home.'),
  ('Beginner Welcome',  'beginner-welcome',  'No prior experience needed, training provided.'),
  ('Event Based',       'event-based',       'Tied to a specific convention or event rather than ongoing.')
on conflict (slug) do nothing;

insert into gftvjobs_migrations (filename)
values ('013_seed_reference_data.sql')
on conflict (filename) do update set applied_at = now();

commit;

-- Rollback
--
-- Only safe while nothing references these rows. Deleting a tag or a
-- department that a posting points at is admin work with its own warnings,
-- per sections 8.6 and 8.7, not a migration rollback.
--
-- begin;
-- delete from gftvjobs_tags where slug in (
--   'video-editing','motion-graphics','camera','audio','lighting',
--   'live-streaming','obs','presenting','scriptwriting','subtitling',
--   'graphic-design','social-media','moderation','project-management',
--   'fursuiting','remote-friendly','beginner-welcome','event-based')
--   and usage_count = 0;
-- delete from gftvjobs_departments where slug in (
--   'production','post-production','broadcast-engineering','creative-and-design',
--   'programming','community','events','operations')
--   and not exists (select 1 from gftvjobs_jobs j where j.department_id = gftvjobs_departments.id);
-- delete from gftvjobs_migrations where filename = '013_seed_reference_data.sql';
-- commit;
