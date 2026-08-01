// Regression test for the Phase 1 PR candidate detection logic in public/index.html
// (extractPrCandidates / scanPrHistory / prCandidateName).
//
// Run with: node test/pr-detection.test.js  (or: npm test)
//
// Same extraction approach as test/classifier.test.js — this app has no build step, so the
// relevant pure functions are pulled straight out of the single-file frontend and exercised with
// plain Node `assert`.

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
new Function(stub + src + `;globalThis.__prTest = { extractPrCandidates, scanPrHistory, prCandidateName };`)();
const { extractPrCandidates, scanPrHistory, prCandidateName } = globalThis.__prTest;

let pass = 0, fail = 0;
function check(label, fn) {
  try { fn(); pass++; }
  catch (e) { fail++; console.log(`FAIL  ${label}\n      ${e.message}`); }
}

function strengthSession(mov, pat, sets, extra = {}) {
  return { id: 's1', date: '2026-01-15', blocks: [{ k: 'strength', mov, pat, mod: 'weightlifting', sets, ...extra }] };
}

// ── Naming convention: 1RM has no prefix, everything else is "{N}RM " ──
check('1RM has no prefix', () => {
  assert.strictEqual(prCandidateName('Back Squat', 1), 'Back Squat');
});
check('5RM is prefixed', () => {
  assert.strictEqual(prCandidateName('Back Squat', 5), '5RM Back Squat');
});

// ── Basic detection: no existing PR at all → new candidate ──
check('first-time 1RM with no existing PR is a candidate', () => {
  const sess = strengthSession('Back Squat', 'squat', [{ r: 1, w: 315 }]);
  const cands = extractPrCandidates(sess, []);
  assert.strictEqual(cands.length, 1);
  assert.strictEqual(cands[0].name, 'Back Squat');
  assert.strictEqual(cands[0].weight, 315);
});

// ── Rep scheme distinction: 5RM and 1RM never compete against each other ──
check('5RM set does not compare against a 1RM PR', () => {
  const sess = strengthSession('Back Squat', 'squat', [{ r: 5, w: 250 }]);
  const currentPrs = [{ category: 'lift', name: 'Back Squat', pr_value: 315 }]; // 1RM PR, unrelated
  const cands = extractPrCandidates(sess, currentPrs);
  assert.strictEqual(cands.length, 1);
  assert.strictEqual(cands[0].name, '5RM Back Squat');
});

// ── Improvement gating: only flagged when it beats the matching rep-scheme PR ──
check('lighter set than existing PR of same rep scheme is not flagged', () => {
  const sess = strengthSession('Back Squat', 'squat', [{ r: 1, w: 300 }]);
  const currentPrs = [{ category: 'lift', name: 'Back Squat', pr_value: 315 }];
  assert.strictEqual(extractPrCandidates(sess, currentPrs).length, 0);
});
check('heavier set than existing PR of same rep scheme is flagged', () => {
  const sess = strengthSession('Back Squat', 'squat', [{ r: 1, w: 325 }]);
  const currentPrs = [{ category: 'lift', name: 'Back Squat', pr_value: 315 }];
  const cands = extractPrCandidates(sess, currentPrs);
  assert.strictEqual(cands.length, 1);
  assert.strictEqual(cands[0].weight, 325);
});

// ── Rep-count whitelist: only 1/2/3/5/10 count as tested maxes ──
check('a 7-rep set is never a candidate, however heavy', () => {
  const sess = strengthSession('Back Squat', 'squat', [{ r: 7, w: 500 }]);
  assert.strictEqual(extractPrCandidates(sess, []).length, 0);
});

// ── Scope: only strength/accessory blocks with explicit sets qualify ──
check('metcon movements are excluded even at heavy load', () => {
  const sess = { id: 's1', date: '2026-01-15', blocks: [{ k: 'metcon', fmt: 'For Time', pm: [{ n: 'Deadlift', r: 5, w: 405, pat: 'hinge', mod: 'weightlifting' }] }] };
  assert.strictEqual(extractPrCandidates(sess, []).length, 0);
});
check('gymnastics-modality strength blocks are excluded (not a loaded lift)', () => {
  const sess = strengthSession('Weighted Pull-up', 'pull', [{ r: 1, w: 90 }], { mod: 'gymnastics' });
  assert.strictEqual(extractPrCandidates(sess, []).length, 0);
});

// ── Within one session, only the heaviest set per movement+rep-scheme survives ──
check('dedupes to the heaviest set per movement+rep-scheme in a session', () => {
  const sess = strengthSession('Front Squat', 'squat', [{ r: 5, w: 205 }, { r: 5, w: 225 }, { r: 5, w: 215 }]);
  const cands = extractPrCandidates(sess, []);
  assert.strictEqual(cands.length, 1);
  assert.strictEqual(cands[0].weight, 225);
});

// ── scanPrHistory: chronological running-best, not "beats today's single PR" ──
check('scanPrHistory only flags true chronological progression, not every set above the seed PR', () => {
  const sessions = [
    strengthSession('Deadlift', 'hinge', [{ r: 1, w: 405 }]),
    { ...strengthSession('Deadlift', 'hinge', [{ r: 1, w: 425 }]), id: 's2', date: '2026-02-01' },
    { ...strengthSession('Deadlift', 'hinge', [{ r: 1, w: 415 }]), id: 's3', date: '2026-03-01' }, // below the running best of 425 — not a new PR
  ];
  const found = scanPrHistory(sessions, [{ category: 'lift', name: 'Deadlift', pr_value: 315 }]);
  assert.strictEqual(found.length, 2);
  assert.strictEqual(found[0].weight, 405);
  assert.strictEqual(found[1].weight, 425);
});
check('scanPrHistory processes out-of-order input chronologically by date', () => {
  const sessions = [
    { ...strengthSession('Clean', 'hinge', [{ r: 1, w: 275 }]), id: 'later', date: '2026-05-01' },
    { ...strengthSession('Clean', 'hinge', [{ r: 1, w: 245 }]), id: 'earlier', date: '2026-01-01' },
  ];
  const found = scanPrHistory(sessions, []);
  assert.strictEqual(found.length, 2);
  assert.strictEqual(found[0].session_id, 'earlier');
  assert.strictEqual(found[1].session_id, 'later');
});

console.log(`\n${pass}/${pass + fail} passed`);
if (fail) process.exit(1);
