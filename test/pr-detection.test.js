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
new Function(stub + src + `;globalThis.__prTest = { rawPrSets, extractPrCandidates, scanPrHistory, prCandidateName, isPrEligibleBlock };`)();
const { rawPrSets, extractPrCandidates, scanPrHistory, prCandidateName, isPrEligibleBlock } = globalThis.__prTest;

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

console.log(`\n${pass}/${pass + fail} passed`);
if (fail) process.exit(1);
