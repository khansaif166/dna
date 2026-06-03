-- Enable RLS on all tables
alter table profiles enable row level security;
alter table subjects enable row level security;
alter table topics enable row level security;
alter table topic_resources enable row level security;
alter table tests enable row level security;
alter table questions enable row level security;
alter table test_attempts enable row level security;
alter table attempt_answers enable row level security;

-- Profiles: each user reads only their own row
create policy "profiles_select_own" on profiles
  for select using (auth.uid() = id);

-- Public content: any authenticated user can read
create policy "subjects_select_auth" on subjects
  for select using (auth.role() = 'authenticated');

create policy "topics_select_auth" on topics
  for select using (auth.role() = 'authenticated');

create policy "resources_select_auth" on topic_resources
  for select using (auth.role() = 'authenticated');

-- Tests: students see only published tests
create policy "tests_select_published" on tests
  for select using (
    auth.role() = 'authenticated' and status = 'published'
  );

-- Questions: authenticated users can read
create policy "questions_select_auth" on questions
  for select using (auth.role() = 'authenticated');

-- Attempts: students see and insert only their own
create policy "attempts_select_own" on test_attempts
  for select using (auth.uid() = student_id);

create policy "attempts_insert_own" on test_attempts
  for insert with check (auth.uid() = student_id);

-- Attempt answers: students see only answers from their own attempts
create policy "answers_select_own" on attempt_answers
  for select using (
    attempt_id in (
      select id from test_attempts where student_id = auth.uid()
    )
  );

-- NOTE: All writes to attempt_answers and test_attempts updates go through 
-- the service role key in API routes, which bypasses RLS.
-- Students cannot directly update or delete any rows.
