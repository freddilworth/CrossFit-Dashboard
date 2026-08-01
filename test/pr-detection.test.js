// Regression test for the Phase 1 PR candidate detection logic in public/index.html
// (rawPrSets / extractPrCandidates / scanPrHistory / prCandidateName / isPrEligibleBlock).
//
// Run with: node test/pr-detection.test.js  (or: npm test)
//
// Same extraction approach as test/classifier.test.js — this app has no build step, so the
// relevant pure functions are pulled straight out of the single-file frontend and exercised with
// plain Node `assert`. Eligibility is derived from the movement NAME via the app's own classifier
// (clsAllCached/normMov), not from pat/sub/mod fields on the block — those come from the parsing
// LLM at log time and are deliberately NOT trusted here — so these tests pass real movement name
// strings rather than fabricated pat/mod pairs, exactly as production session data would.

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const scriptMatch = html.match(/<script type="module">([\s\S]*?)<\/script>/);
if (!scriptMatch) throw new Error('Could not find <script type="module"> block in public/index.html');
const src = scriptMatch[1].replace(/^import.*$/gm, '');

const stub = `
const document = { getElementById: () => ({}) };
const h = () => {}; const render = () => {}; const htm = { bind: () => () => {} };
const useState = (x) => [x, () => {}]; const useEffect = () => {}; const useMemo = (f) => f();
`;
new Function(stub + src + `;globalThis.__prTest = { rawPrSets, extractPrCandidates, scanPrHistory, prCandidateName, isPrEligibleBlock, rawGymnasticsReps, extractGymnasticsPrCandidates, scanGymnasticsPrHistory };`)();
const { rawPrSets, extractPrCandidates, scanPrHistory, prCandidateName, isPrEligibleBlock, rawGymnasticsReps, extractGymnasticsPrCandidates, scanGymnasticsPrHistory } = globalThis.__prTest;

let pass = 0, fail = 0;
function check(label, fn) {
  try { fn(); pass++; }
  catch (e) { fail++; console.log(`FAIL  ${label}\n      ${e.message}`); }
}

function strengthSession(mov, sets, extra = {}) {
  return { id: 's1', date: '2026-01-15', blocks: [{ k: 'strength', mov, sets, ...extra }] };
}

// ── Naming convention: 1RM has no prefix, everything else is "{N}RM " ──
check('1RM has no prefix', () => {
  assert.strictEqual(prCandidateName('Back Squat', 1), 'Back Squat');
});
check('5RM is prefixed', () => {
  assert.strictEqual(prCandidateName('Back Squat', 5), '5RM Back Squat');
});

// ── Core bug fix: a rep-scheme's first-ever sighting is never auto-flagged, no baseline to
// compare against yet — regardless of how heavy or light the set is ──
check('first-time rep-scheme with no existing PR is NOT a candidate', () => {
  const sess = strengthSession('Back Squat', [{ r: 1, w: 315 }]);
  assert.strictEqual(extractPrCandidates(sess, []).length, 0);
});
check('rawPrSets still reports the raw set even with nothing to compare against', () => {
  const sess = strengthSession('Back Squat', [{ r: 1, w: 315 }]);
  const raw = rawPrSets(sess);
  assert.strictEqual(raw.length, 1);
  assert.strictEqual(raw[0].name, 'Back Squat');
});

// ── Rep scheme distinction: 5RM and 1RM never compete against each other ──
check('5RM set does not compare against a 1RM PR', () => {
  const sess = strengthSession('Back Squat', [{ r: 5, w: 250 }]);
  const currentPrs = [
    { category: 'lift', name: 'Back Squat', pr_value: 315 }, // 1RM PR, unrelated
    { category: 'lift', name: '5RM Back Squat', pr_value: 200 },
  ];
  const cands = extractPrCandidates(sess, currentPrs);
  assert.strictEqual(cands.length, 1);
  assert.strictEqual(cands[0].name, '5RM Back Squat');
  assert.strictEqual(cands[0].weight, 250);
});

// ── Improvement gating: only flagged when it beats the matching rep-scheme PR ──
check('lighter set than existing PR of same rep scheme is not flagged', () => {
  const sess = strengthSession('Back Squat', [{ r: 1, w: 300 }]);
  const currentPrs = [{ category: 'lift', name: 'Back Squat', pr_value: 315 }];
  assert.strictEqual(extractPrCandidates(sess, currentPrs).length, 0);
});
check('heavier set than existing PR of same rep scheme is flagged', () => {
  const sess = strengthSession('Back Squat', [{ r: 1, w: 325 }]);
  const currentPrs = [{ category: 'lift', name: 'Back Squat', pr_value: 315 }];
  const cands = extractPrCandidates(sess, currentPrs);
  assert.strictEqual(cands.length, 1);
  assert.strictEqual(cands[0].weight, 325);
});

// ── Rep-count whitelist: only 1/3/5 count as tested maxes — 2RM and 10RM are uncommon enough in
// practice to be more noise than signal, and are still trackable via manual +Add PR ──
check('a 7-rep set is never a candidate, however heavy', () => {
  const sess = strengthSession('Back Squat', [{ r: 7, w: 500 }]);
  const currentPrs = [{ category: 'lift', name: 'Back Squat', pr_value: 100 }];
  assert.strictEqual(extractPrCandidates(sess, currentPrs).length, 0);
});
check('a 2-rep set is never a candidate', () => {
  const sess = strengthSession('Back Squat', [{ r: 2, w: 500 }]);
  assert.strictEqual(rawPrSets(sess).length, 0);
});
check('a 10-rep set is never a candidate', () => {
  const sess = strengthSession('Back Squat', [{ r: 10, w: 500 }]);
  assert.strictEqual(rawPrSets(sess).length, 0);
});

// ── Scope: only strength/accessory blocks with explicit sets qualify ──
check('metcon movements are excluded even at heavy load', () => {
  const sess = { id: 's1', date: '2026-01-15', blocks: [{ k: 'metcon', fmt: 'For Time', pm: [{ n: 'Deadlift', r: 5, w: 405 }] }] };
  assert.strictEqual(rawPrSets(sess).length, 0);
});
check('gymnastics movements are excluded (not a loaded lift), even without sub/mod stored on the block', () => {
  const sess = strengthSession('Weighted Pull-up', [{ r: 1, w: 90 }]);
  assert.strictEqual(rawPrSets(sess).length, 0);
});

// ── Category exclusions: complexes, DB/KB/sandbag implements, isolation work, single-leg —
// derived from the classifier off the movement name, not from possibly-stale pat/sub/mod fields
// the parsing LLM stored on the block at log time ──
check('multi-movement complexes are excluded', () => {
  assert.strictEqual(isPrEligibleBlock({ k: 'strength', mov: 'Power Snatch + OHS', sets: [{ r: 1, w: 65 }] }), false);
  assert.strictEqual(isPrEligibleBlock({ k: 'strength', mov: 'Clean Complex', sets: [{ r: 1, w: 65 }] }), false);
});
check('dumbbell/kettlebell/sandbag implements are excluded, including abbreviations', () => {
  assert.strictEqual(isPrEligibleBlock({ k: 'accessory', mov: 'DB Bent Over Row', sets: [{ r: 10, w: 70 }] }), false);
  assert.strictEqual(isPrEligibleBlock({ k: 'accessory', mov: 'Double KB Push Jerk', sets: [{ r: 10, w: 53 }] }), false);
  assert.strictEqual(isPrEligibleBlock({ k: 'accessory', mov: 'Sandbag Clean', sets: [{ r: 3, w: 150 }] }), false);
  // "SB Clean" is the same movement as "Sandbag Clean" by abbreviation — must normalize to the
  // same canonical name and get excluded the same way, not slip through by spelling.
  assert.strictEqual(isPrEligibleBlock({ k: 'accessory', mov: 'SB Clean', sets: [{ r: 3, w: 150 }] }), false);
});
check('isolation/accessory movements are excluded', () => {
  assert.strictEqual(isPrEligibleBlock({ k: 'accessory', mov: 'Bicep Curl', sets: [{ r: 10, w: 30 }] }), false);
});
check('single-leg variants are excluded even when the block has no sub field at all', () => {
  // Deliberately omitting pat/sub/mod here — this is the exact shape of an older session logged
  // before/without the LLM setting sub:"single_leg" on the block; eligibility must still exclude it
  // by re-deriving from the movement name via the classifier.
  assert.strictEqual(isPrEligibleBlock({ k: 'accessory', mov: 'Reverse Lunge', sets: [{ r: 10, w: 165 }] }), false);
});
check('specific uncommon-to-PR lifts are excluded by exact name', () => {
  ['Goblet Squat', 'Wall Ball', 'Box Squat', 'Pause Squat', 'Zercher Squat', 'RDL', 'Romanian Deadlift',
   'Good Morning', 'SDHP', 'Sumo Deadlift High Pull', 'Snatch Grip Deadlift', 'Muscle Snatch',
   'Snatch Pull', 'Clean Pull', 'Push Jerk Behind Neck', 'Overhead Press', 'Bent Over Row', 'Pendlay Row']
    .forEach(mov => assert.strictEqual(isPrEligibleBlock({ k: 'strength', mov, sets: [{ r: 5, w: 200 }] }), false, mov));
});
check('the exact-name exclusion list does not accidentally exclude related lifts that should stay eligible', () => {
  // "Overhead Press" is excluded, but "Strict Press"/"Push Press" (distinct canonical names) must
  // not be swept up with it. "RDL" is excluded, but plain "Deadlift" must not be.
  assert.strictEqual(isPrEligibleBlock({ k: 'strength', mov: 'Strict Press', sets: [{ r: 5, w: 145 }] }), true);
  assert.strictEqual(isPrEligibleBlock({ k: 'strength', mov: 'Push Press', sets: [{ r: 5, w: 165 }] }), true);
  assert.strictEqual(isPrEligibleBlock({ k: 'strength', mov: 'Deadlift', sets: [{ r: 5, w: 315 }] }), true);
});
check('a plain barbell lift remains eligible with no pat/sub/mod stored on the block', () => {
  assert.strictEqual(isPrEligibleBlock({ k: 'strength', mov: 'Back Squat', sets: [{ r: 5, w: 225 }] }), true);
});

// ── Within one session, only the heaviest set per movement+rep-scheme survives ──
check('dedupes to the heaviest set per movement+rep-scheme in a session', () => {
  const sess = strengthSession('Front Squat', [{ r: 5, w: 205 }, { r: 5, w: 225 }, { r: 5, w: 215 }]);
  const raw = rawPrSets(sess);
  assert.strictEqual(raw.length, 1);
  assert.strictEqual(raw[0].weight, 225);
  const cands = extractPrCandidates(sess, [{ category: 'lift', name: '5RM Front Squat', pr_value: 200 }]);
  assert.strictEqual(cands.length, 1);
  assert.strictEqual(cands[0].weight, 225);
});

// ── scanPrHistory: collapses to ONE candidate per movement+rep-scheme (the all-time best),
// never a staircase of every intermediate step-up ──
check('scanPrHistory collapses multiple improving sightings to a single candidate — the all-time best', () => {
  const sessions = [
    strengthSession('Deadlift', [{ r: 1, w: 405 }]),
    { ...strengthSession('Deadlift', [{ r: 1, w: 425 }]), id: 's2', date: '2026-02-01' },
    { ...strengthSession('Deadlift', [{ r: 1, w: 415 }]), id: 's3', date: '2026-03-01' },
  ];
  const found = scanPrHistory(sessions, [{ category: 'lift', name: 'Deadlift', pr_value: 315 }]);
  assert.strictEqual(found.length, 1);
  assert.strictEqual(found[0].weight, 425);
  assert.strictEqual(found[0].session_id, 's2');
});
check('scanPrHistory with no seed PR at all still surfaces just the single all-time best (a first-time discovery)', () => {
  const sessions = [
    { ...strengthSession('Clean', [{ r: 1, w: 245 }]), id: 'earlier', date: '2026-01-01' },
    { ...strengthSession('Clean', [{ r: 1, w: 275 }]), id: 'later', date: '2026-05-01' },
  ];
  const found = scanPrHistory(sessions, []); // no seed PR at all for "Clean"
  assert.strictEqual(found.length, 1);
  assert.strictEqual(found[0].session_id, 'later');
  assert.strictEqual(found[0].weight, 275);
});
check('scanPrHistory does not surface anything when the all-time best does not beat the seed PR', () => {
  const sessions = [strengthSession('Clean', [{ r: 1, w: 245 }])];
  const found = scanPrHistory(sessions, [{ category: 'lift', name: 'Clean', pr_value: 275 }]);
  assert.strictEqual(found.length, 0);
});
check('scanPrHistory processes out-of-order input chronologically by date (earliest occurrence of the max wins the date)', () => {
  const sessions = [
    { ...strengthSession('Clean', [{ r: 1, w: 275 }]), id: 'later', date: '2026-05-01' },
    { ...strengthSession('Clean', [{ r: 1, w: 245 }]), id: 'earlier', date: '2026-01-01' },
  ];
  const found = scanPrHistory(sessions, [{ category: 'lift', name: 'Clean', pr_value: 200 }]);
  assert.strictEqual(found.length, 1);
  assert.strictEqual(found[0].session_id, 'later');
  assert.strictEqual(found[0].weight, 275);
});
check('scanPrHistory excludes single-leg/implement/isolation movements from history too', () => {
  const sessions = [strengthSession('Reverse Lunge', [{ r: 10, w: 500 }])];
  assert.strictEqual(scanPrHistory(sessions, []).length, 0);
});

// ══════ GYMNASTICS PR DETECTION (total reps in a single session) ══════
function metconSession(movements, extra = {}) {
  return { id: 's1', date: '2026-01-15', blocks: [{ k: 'metcon', pm: movements.map(([n, r]) => ({ n, r })), ...extra }] };
}

check('rawGymnasticsReps sums metcon reps for a gymnastics movement', () => {
  const sess = metconSession([['Pull-ups', 30]]);
  const raw = rawGymnasticsReps(sess);
  assert.strictEqual(raw.length, 1);
  // Suffixed — a total-reps-in-a-workout PR must never share a name with a manually-tracked,
  // max-unbroken-set PR for the same movement (see gymCandidateName).
  assert.strictEqual(raw[0].name, 'Pull-Up (Most in a Workout)');
  assert.strictEqual(raw[0].movement, 'Pull-Up');
  assert.strictEqual(raw[0].reps, 30);
});
check('rawGymnasticsReps sums across strength/accessory sets AND metcon reps in the same session, unified by normalized name', () => {
  const sess = {
    id: 's1', date: '2026-01-15',
    blocks: [
      { k: 'accessory', mov: 'Strict Pull-ups', sets: [{ r: 5, w: 0 }, { r: 5, w: 0 }] }, // 10 total
      { k: 'metcon', pm: [{ n: 'Pull-ups', r: 20 }] }, // 20 total — same movement, different raw name
    ],
  };
  const raw = rawGymnasticsReps(sess);
  assert.strictEqual(raw.length, 1);
  assert.strictEqual(raw[0].name, 'Pull-Up (Most in a Workout)');
  assert.strictEqual(raw[0].reps, 30);
});
check('rawGymnasticsReps excludes non-gymnastics movements (e.g. a barbell lift in the same session)', () => {
  const sess = {
    id: 's1', date: '2026-01-15',
    blocks: [
      { k: 'strength', mov: 'Back Squat', sets: [{ r: 5, w: 225 }] },
      { k: 'metcon', pm: [{ n: 'Toes to Bar', r: 15 }] },
    ],
  };
  const raw = rawGymnasticsReps(sess);
  assert.strictEqual(raw.length, 1);
  assert.strictEqual(raw[0].name, 'Toes to Bar (Most in a Workout)');
});
check('rawGymnasticsReps excludes multi-movement complexes', () => {
  const sess = { id: 's1', date: '2026-01-15', blocks: [{ k: 'accessory', mov: 'Pull-up + Push-up', sets: [{ r: 10, w: 0 }] }] };
  assert.strictEqual(rawGymnasticsReps(sess).length, 0);
});

check('extractGymnasticsPrCandidates requires an existing baseline, same as weightlifting', () => {
  const sess = metconSession([['Pull-ups', 30]]);
  assert.strictEqual(extractGymnasticsPrCandidates(sess, []).length, 0);
  const cands = extractGymnasticsPrCandidates(sess, [{ category: 'gymnastics', name: 'Pull-Up (Most in a Workout)', pr_value: 25 }]);
  assert.strictEqual(cands.length, 1);
  assert.strictEqual(cands[0].reps, 30);
});
check('extractGymnasticsPrCandidates does not flag a session that does not beat the baseline', () => {
  const sess = metconSession([['Pull-ups', 20]]);
  const cands = extractGymnasticsPrCandidates(sess, [{ category: 'gymnastics', name: 'Pull-Up (Most in a Workout)', pr_value: 25 }]);
  assert.strictEqual(cands.length, 0);
});
check('extractGymnasticsPrCandidates never matches against a manually-tracked PR of the plain (unsuffixed) name', () => {
  // A manual "max unbroken" PR named plain "Pull-Up" must NOT be treated as a baseline for the
  // total-reps-in-a-workout metric — the two measurements are not comparable.
  const sess = metconSession([['Pull-ups', 30]]);
  const cands = extractGymnasticsPrCandidates(sess, [{ category: 'gymnastics', name: 'Pull-Up', pr_value: 25 }]);
  assert.strictEqual(cands.length, 0);
});

check('scanGymnasticsPrHistory collapses to a single all-time-best candidate per movement', () => {
  const sessions = [
    metconSession([['Pull-ups', 30]]),
    { ...metconSession([['Pull-ups', 45]]), id: 's2', date: '2026-02-01' },
    { ...metconSession([['Pull-ups', 38]]), id: 's3', date: '2026-03-01' },
  ];
  const found = scanGymnasticsPrHistory(sessions, []);
  assert.strictEqual(found.length, 1);
  assert.strictEqual(found[0].reps, 45);
  assert.strictEqual(found[0].session_id, 's2');
});
check('scanGymnasticsPrHistory surfaces the all-time best even with no existing baseline', () => {
  const sessions = [metconSession([['Toes to Bar', 60]])];
  const found = scanGymnasticsPrHistory(sessions, []);
  assert.strictEqual(found.length, 1);
  assert.strictEqual(found[0].name, 'Toes to Bar (Most in a Workout)');
  assert.strictEqual(found[0].reps, 60);
});
check('scanGymnasticsPrHistory does not surface anything when the all-time best does not beat the seed PR', () => {
  const sessions = [metconSession([['Pull-ups', 20]])];
  const found = scanGymnasticsPrHistory(sessions, [{ category: 'gymnastics', name: 'Pull-Up (Most in a Workout)', pr_value: 25 }]);
  assert.strictEqual(found.length, 0);
});

// ── Every burpee variation pools into one unified "Burpees" total (matches the Home page's
// Burpees movement group) instead of each variant being tracked as its own separate PR ──
check('rawGymnasticsReps unifies every burpee variation into one "Burpees" total', () => {
  const sess = metconSession([['Burpees', 50], ['Burpee Over Bar', 30], ['Burpee Pull-up', 20]]);
  const raw = rawGymnasticsReps(sess);
  assert.strictEqual(raw.length, 1);
  assert.strictEqual(raw[0].name, 'Burpees (Most in a Workout)');
  assert.strictEqual(raw[0].reps, 100);
});
check('Burpee Box Step Over joins Burpees too, even though its name-normalizer strips "burpee" entirely', () => {
  const sess = metconSession([['Burpees', 50], ['Burpee Box Step Over', 20]]);
  const raw = rawGymnasticsReps(sess);
  assert.strictEqual(raw.length, 1);
  assert.strictEqual(raw[0].name, 'Burpees (Most in a Workout)');
  assert.strictEqual(raw[0].reps, 70);
});

// ── Specific exclusions: too basic/ubiquitous to be a meaningful PR, or an assisted/added-load
// pull-up variant that shouldn't pool with a plain bodyweight Pull-Up. Regex-based (not an exact-
// name Set), so singular/plural and casing variants are all caught — not just whichever exact
// phrasing happened to be listed. ──
check('specific uncommon-to-PR gymnastics movements are excluded, singular and plural', () => {
  ['Air Squat', 'Air Squats', 'V-up', 'V-ups', 'Ring Dip', 'Ring Dips', 'Sit-up', 'Sit-ups',
   'Banded Strict Pull-up', 'Banded Strict Pull-ups', 'Side Plank', 'Side Planks', 'Leg Raise', 'Leg Raises',
   'Hollow Body Rock', 'Hollow Body Rocks', 'Weighted Strict Pull-up', 'Weighted Strict Pull-ups',
   'Plank', 'Planks', 'Box Step Up', 'Box Step Ups', 'Alternating Pistol', 'Alternating Pistols',
   'Banded Pull-up', 'Banded Pull-ups', 'Weighted Pull-up', 'Weighted Pull-ups',
   'GHD Back Extension', 'GHD Back Extensions', 'Bar Dip', 'Bar Dips',
   'Hand Release Push-Up', 'Hand Release Push-Ups', 'HRPU', 'Ring Row', 'Ring Rows',
   'Weighted Dip', 'Weighted Dips']
    .forEach(mov => assert.strictEqual(rawGymnasticsReps(metconSession([[mov, 20]])).length, 0, mov));
});
check('excluding banded/weighted pull-up variants does not exclude a plain Pull-Up', () => {
  const raw = rawGymnasticsReps(metconSession([['Pull-ups', 20]]));
  assert.strictEqual(raw.length, 1);
  assert.strictEqual(raw[0].movement, 'Pull-Up');
});
check('excluding Weighted Dip does not exclude a plain Dip', () => {
  const raw = rawGymnasticsReps(metconSession([['Dip', 20]]));
  assert.strictEqual(raw.length, 1);
  assert.strictEqual(raw[0].movement, 'Dip');
});

// ── Rope Climb / Rope Climbs must normalize to the same movement, not track separately ──
check('Rope Climb and Rope Climbs are the same movement', () => {
  const sess = metconSession([['Rope Climb', 10], ['Rope Climbs', 5]]);
  const raw = rawGymnasticsReps(sess);
  assert.strictEqual(raw.length, 1);
  assert.strictEqual(raw[0].movement, 'Rope Climb');
  assert.strictEqual(raw[0].reps, 15);
});

// ── Regression: a manually-tracked max-unbroken-set PR must never be silently overwritten by a
// total-reps-in-a-workout auto-detection for the same movement (this actually happened in
// production — a hand-tracked "33 unbroken Toes to Bar" got overwritten by a "180 reps across one
// metcon" auto-confirm, because both used the same bare "Toes to Bar" prs.name) ──
check('a big-volume workout day cannot masquerade as an improvement to a manually-tracked unbroken PR', () => {
  const sess = metconSession([['Toes to Bar', 180]]);
  // The manual PR is stored under the plain name — extractGymnasticsPrCandidates must not see it
  // as a baseline at all, since rawGymnasticsReps only ever proposes the suffixed name.
  const manualOnly = [{ category: 'gymnastics', name: 'Toes to Bar', pr_value: 33, pr_display: '33', date: '2025-11-11' }];
  assert.strictEqual(extractGymnasticsPrCandidates(sess, manualOnly).length, 0);
});

console.log(`\n${pass}/${pass + fail} passed`);
if (fail) process.exit(1);
