-- CrossFit Dashboard: Schema + Seed Data
-- Run this in Supabase SQL Editor

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  date date NOT NULL,
  blocks jsonb NOT NULL DEFAULT '[]',
  raw_text text DEFAULT '',
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS sessions_date_idx ON sessions(date);

-- PRs table
CREATE TABLE IF NOT EXISTS prs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  category text NOT NULL,
  name text NOT NULL,
  pr_value numeric NOT NULL,
  pr_display text DEFAULT '',
  date date NOT NULL,
  history jsonb NOT NULL DEFAULT '[]',
  UNIQUE(category, name)
);

-- Benchmarks table
CREATE TABLE IF NOT EXISTS benchmarks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  scores jsonb NOT NULL DEFAULT '[]',
  notes text DEFAULT ''
);

-- Disable RLS for simplicity (personal app)
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE prs ENABLE ROW LEVEL SECURITY;
ALTER TABLE benchmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on sessions" ON sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on prs" ON prs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on benchmarks" ON benchmarks FOR ALL USING (true) WITH CHECK (true);

-- Seed: Lifting PRs
INSERT INTO prs (category, name, pr_value, date, history) VALUES
('lift','Deadlift',415,'2021-01-05','[{"d":"2021-01-05","v":415}]'),
('lift','Back Squat',325,'2025-11-17','[{"d":"2025-11-17","v":325}]'),
('lift','Front Squat',285,'2025-08-11','[{"d":"2025-08-11","v":285}]'),
('lift','Power Snatch',185,'2017-11-14','[{"d":"2017-11-14","v":185}]'),
('lift','Squat Snatch',205,'2019-04-19','[{"d":"2019-04-19","v":205}]'),
('lift','3RM OHS',225,'2018-03-16','[{"d":"2018-03-16","v":225}]'),
('lift','1RM OHS',235,'2023-07-17','[{"d":"2023-07-17","v":235}]'),
('lift','Squat Clean',275,'2018-05-14','[{"d":"2018-05-14","v":275}]'),
('lift','Power Clean',275,'2018-09-03','[{"d":"2018-09-03","v":275}]'),
('lift','Clean & Jerk',265,'2018-07-25','[{"d":"2018-07-25","v":265}]'),
('lift','Split Jerk',275,'2019-04-16','[{"d":"2019-04-16","v":275}]'),
('lift','2RM Strict Press',150,'2019-03-05','[{"d":"2019-03-05","v":150}]'),
('lift','Thruster',225,'2021-01-09','[{"d":"2021-01-09","v":225}]'),
('lift','Hang Squat Clean',275,'2020-03-04','[{"d":"2020-03-04","v":275}]'),
('lift','2RM Hang Squat Snatch',185,'2021-02-23','[{"d":"2021-02-23","v":185}]')
ON CONFLICT (category, name) DO NOTHING;

-- Seed: Gymnastics PRs
INSERT INTO prs (category, name, pr_value, pr_display, date, history) VALUES
('gymnastics','Ring Muscle Ups',17,'17 reps','2018-10-11','[{"d":"2018-10-11","v":17}]'),
('gymnastics','Bar Muscle Ups',20,'20 reps','2019-04-18','[{"d":"2019-04-18","v":20}]'),
('gymnastics','Butterfly Pull-ups',60,'60 reps','2020-01-17','[{"d":"2020-01-17","v":60}]'),
('gymnastics','Strict Pull-ups',24,'24 reps','2021-03-11','[{"d":"2021-03-11","v":24}]'),
('gymnastics','Butterfly C2B',34,'34 reps','2025-11-29','[{"d":"2025-11-29","v":34}]'),
('gymnastics','Toes to Bar',33,'33 reps','2025-11-11','[{"d":"2025-11-11","v":33}]')
ON CONFLICT (category, name) DO NOTHING;

-- Seed: Cardio PRs
INSERT INTO prs (category, name, pr_value, pr_display, date, history) VALUES
('cardio','Mile Run',336,'5:36','2021-03-19','[{"d":"2021-03-19","s":336}]'),
('cardio','2000m Row',417,'6:57','2016-03-20','[{"d":"2016-03-20","s":417}]'),
('cardio','1000m Row',192,'3:12','2021-01-07','[{"d":"2021-01-07","s":192}]'),
('cardio','500m Row',86,'1:26','2022-12-30','[{"d":"2022-12-30","s":86}]')
ON CONFLICT (category, name) DO NOTHING;

-- Seed: Benchmarks (with per-score notes)
INSERT INTO benchmarks (name, scores, notes) VALUES
('Murph','[{"d":"2018-05-28","v":"44:14","note":"Partitioned 20x 5-10-15. 7:40 first mile, 34:30 start last mile. 4/3/3 on push-ups. Went too fast first 5 rounds. Had Richie''s bachelor party before."},{"d":"2019-05-26","v":"58:39","note":"Unpartitioned. 7:50 first mile, 7:30 last mile. 5s pull-ups, 2s push-ups, 10s squats. Paced too much, should have pushed harder."},{"d":"2020-05-25","v":"41:12","note":"Partitioned. 7:00 first mile (too fast, 1:30 first 400m). Held 1:05/round through 15, fell off last 5. Got dizzy and chills. Left at 32:00, 9:12 last mile. Lex''s wedding weekend before, bad food/sleep."},{"d":"2021-05-23","v":"39:25","note":"Partitioned 20x 15sq-10pu-5pu. 7:40 first mile. 1:05 first 9 rounds, 1:10 next 6, 1:15 last 5. Left gym at 31:06. 8:19 last mile."},{"d":"2022-05-30","v":"51:30","note":"Strict pull-ups due to shoulder issues. No motivation. 7:30 first mile. Tried 5/10/20 round splits, 20-round splits were easiest. Left at 43:00."},{"d":"2023-05-27","v":"52:30","note":"Unpartitioned. 7:25 first mile. 5s pull-ups (~5 min). 3s push-ups (~17-18 min). Squats in sets of 10 then 50+ continuous. 7:58 last mile. Felt really good."},{"d":"2025-05-24","v":"49:59","note":"Partitioned. 7:20 first mile. 5s pull-ups (started ~13:00, biceps blown up). 3s push-ups (finished ~30:00). 50s squats with pauses. Left gym 42:10. 7:49 last mile."}]',''),
('Annual Mile Run','[{"d":"2021-03-19","v":"5:36","note":"2:45/2:51 splits. Windy, perfect temp. Quads sore from wall balls day before."},{"d":"2022-11-01","v":"5:49","note":""},{"d":"2023-10-26","v":"5:55","note":""},{"d":"2024-10-26","v":"5:44","note":"400m splits: 1:20/1:35/1:25/1:23. Went out too fast. Squatting/running workout day prior. 4 long runs + 5 assault bike workouts with Becca to prepare."},{"d":"2025-11-02","v":"5:57","note":"Railroad tracks in Huntersville. 2:56/3:01 800m splits. 10 min max cal assault bike 2 days prior. Several runs over prior 6 weeks."}]','')
ON CONFLICT (name) DO NOTHING;

-- Seed: Sessions (two-axis format)
INSERT INTO sessions (date, blocks, raw_text) VALUES
('2026-06-02','[{"k":"metcon","fmt":"28 min EMOM (6 stations)","td":"long","mv":"16 TTB / 8 Power Clean (135) / 12 Cal Row / 8 Burpees over Bar / 16 Pull-ups / Max C&J (135)","pm":[{"n":"TTB","r":80,"w":0,"pat":"core","sub":null,"mod":"gymnastics"},{"n":"Power Clean","r":40,"w":135,"pat":"hinge","sub":null,"mod":"weightlifting"},{"n":"Cal Row","r":60,"w":0,"pat":null,"sub":null,"mod":"monostructural"},{"n":"Burpees over Bar","r":40,"w":0,"pat":null,"sub":null,"mod":"monostructural"},{"n":"Pull-ups","r":64,"w":0,"pat":"pull","sub":"vertical","mod":"gymnastics"},{"n":"C&J","r":28,"w":135,"pat":"hinge","sub":null,"mod":"weightlifting"}],"score":"28 C&Js","rx":true}]','28 min EMOM: 16 TTB, 8 Power Clean 135, 12 Cal Row, 8 Burpees, 16 Pull-ups, Max C&J 135. Score: 28 C&Js'),
('2026-06-01','[{"k":"strength","mov":"Front Squat","pat":"squat","sub":"traditional","mod":"weightlifting","sets":[{"r":5,"w":185},{"r":5,"w":205},{"r":5,"w":205}]},{"k":"metcon","fmt":"10 min AMRAP","td":"med","mv":"12 Cal Ski / 12 DB Hang Snatch (50) / 24 DUs / 12 SA DB Thruster (50)","pm":[{"n":"Cal Ski","r":36,"w":0,"pat":null,"sub":null,"mod":"monostructural"},{"n":"DB Hang Snatch","r":36,"w":50,"pat":"hinge","sub":null,"mod":"weightlifting"},{"n":"Double Unders","r":72,"w":0,"pat":null,"sub":null,"mod":"monostructural"},{"n":"SA DB Thruster","r":36,"w":50,"pat":"squat","sub":"traditional","mod":"weightlifting"}],"score":"3+24","rx":true}]','Front squat 1x5-185, 2x5-205. 10 min AMRAP: 12 Cal Ski, 12 DB Hang Snatch 50, 24 DUs, 12 SA DB Thruster 50. Score 3+24 Rx')
ON CONFLICT (date) DO NOTHING;
