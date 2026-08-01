// Regression test for the movement classifier in public/index.html (cls/clsAll/normMov) and the
// unclassified-movement detector used by the Create Session flow (findUnclassified).
//
// Run with: node test/classifier.test.js  (or: npm test)
//
// This app has no build step and no test framework — this file extracts the relevant functions
// directly out of the single-file frontend and exercises them with plain Node `assert`. Every case
// here is either a bug this project has actually shipped and fixed, or a movement whose correct
// classification was confirmed by hand. If an edit to the classifier breaks one of these, this file
// fails loudly instead of the breakage sitting unnoticed in the Movement Detail table for months.

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const scriptMatch = html.match(/<script type="module">([\s\S]*?)<\/script>/);
if (!scriptMatch) throw new Error('Could not find <script type="module"> block in public/index.html');
const src = scriptMatch[1].replace(/^import.*$/gm, '');

// Minimal stubs so the extracted script (which expects a browser + Preact) can be evaluated headlessly.
// Only cls/clsAll/normMov/clsAllCached/findUnclassified are actually exercised below.
const stub = `
const document = { getElementById: () => ({}) };
const h = () => {}; const render = () => {}; const htm = { bind: () => () => {} };
const useState = (x) => [x, () => {}]; const useEffect = () => {}; const useMemo = (f) => f();
`;
new Function(stub + src + `;globalThis.__classifierTest = { cls, clsAll, normMov, clsAllCached, findUnclassified, MOVEMENT_CATEGORIES };`)();
const { clsAll, normMov, findUnclassified, MOVEMENT_CATEGORIES } = globalThis.__classifierTest;

let pass = 0, fail = 0;
function check(label, fn) {
  try { fn(); pass++; }
  catch (e) { fail++; console.log(`FAIL  ${label}\n      ${e.message}`); }
}

// ── Single-pattern movements: name -> expected primary {pat, sub, mod} ──
const SINGLE = [
  // Bugs fixed this session
  ['Ring Dip', { pat: 'push', sub: 'horizontal', mod: 'gymnastics' }],
  ['Ring Dips', { pat: 'push', sub: 'horizontal', mod: 'gymnastics' }],
  ['Dip', { pat: 'push', sub: 'vertical', mod: 'gymnastics' }], // plain dip unchanged
  ['Split Squat', { pat: 'squat', sub: 'single_leg', mod: 'weightlifting' }],
  ['Bulgarian Split Squat', { pat: 'squat', sub: 'single_leg', mod: 'weightlifting' }],
  ['Pistol', { pat: 'squat', sub: 'single_leg', mod: 'gymnastics' }],
  ['Alternating Pistols', { pat: 'squat', sub: 'single_leg', mod: 'gymnastics' }],
  ['Air Squat', { pat: 'squat', sub: 'traditional', mod: 'gymnastics' }],
  ['Air Squats', { pat: 'squat', sub: 'traditional', mod: 'gymnastics' }],
  ['Leg Raises', { pat: 'core', sub: null, mod: 'gymnastics' }],
  ['Strict Leg Raises', { pat: 'core', sub: null, mod: 'gymnastics' }],
  ['Front Plank Hold', { pat: 'core', sub: null, mod: 'gymnastics' }],
  ['Plank', { pat: 'core', sub: null, mod: 'gymnastics' }],
  ['Side Plank', { pat: 'core', sub: null, mod: 'gymnastics' }],
  ['DBL DB Farmers Reverse Lunge', { pat: 'squat', sub: 'single_leg', mod: 'weightlifting' }],
  ['Tricep Extensions', { pat: 'push', sub: 'vertical', mod: 'weightlifting' }],
  ['Bicep Curl', { pat: 'pull', sub: 'vertical', mod: 'weightlifting' }],
  ['DB Bicep Curls', { pat: 'pull', sub: 'vertical', mod: 'weightlifting' }],
  ['Back Extensions', { pat: 'hinge', sub: null, mod: 'weightlifting' }],
  ["Farmer's Carry", { pat: 'pull', sub: null, mod: 'carries' }],
  // Sled push is a horizontal press against the sled, not a pull — a drag/pull/tow stays a pull.
  ['Sled Push', { pat: 'push', sub: 'horizontal', mod: 'carries' }],
  ['Sled Drag', { pat: 'pull', sub: 'horizontal', mod: 'carries' }],
  ['Sled Pull', { pat: 'pull', sub: 'horizontal', mod: 'carries' }],
  ['Dead Hang', { pat: 'pull', sub: null, mod: 'carries' }],
  ['Kipping T2B', { pat: 'core', sub: null, mod: 'gymnastics' }],
  ['T2B', { pat: 'core', sub: null, mod: 'gymnastics' }],
  ['Toes to Bar', { pat: 'core', sub: null, mod: 'gymnastics' }],
  ['SA DB Plank Row', { pat: 'pull', sub: 'horizontal', mod: 'weightlifting' }],
  ['DB Side Raises', { pat: 'push', sub: null, mod: 'weightlifting' }],
  ['Lateral Raise', { pat: 'push', sub: null, mod: 'weightlifting' }],
  ['DB Bent Over Row', { pat: 'pull', sub: 'horizontal', mod: 'weightlifting' }],
  ['DB Bent Over Rows', { pat: 'pull', sub: 'horizontal', mod: 'weightlifting' }],

  // Baseline regression coverage — unrelated movements that must not be disturbed by future edits
  ['Back Squat', { pat: 'squat', sub: 'traditional', mod: 'weightlifting' }],
  ['Front Squat', { pat: 'squat', sub: 'traditional', mod: 'weightlifting' }],
  ['OHS', { pat: 'squat', sub: 'traditional', mod: 'weightlifting' }],
  ['Wall Ball', { pat: 'squat', sub: 'traditional', mod: 'weightlifting' }],
  ['Walking Lunge', { pat: 'squat', sub: 'single_leg', mod: 'weightlifting' }],
  ['Box Step Up', { pat: 'squat', sub: 'single_leg', mod: 'gymnastics' }],
  ['Deadlift', { pat: 'hinge', sub: null, mod: 'weightlifting' }],
  ['RDL', { pat: 'hinge', sub: null, mod: 'weightlifting' }],
  ['Ring Row', { pat: 'pull', sub: 'horizontal', mod: 'gymnastics' }],
  ['DB Row', { pat: 'pull', sub: 'horizontal', mod: 'weightlifting' }],
  ['Barbell Row', { pat: 'pull', sub: 'horizontal', mod: 'weightlifting' }],
  ['Row', { pat: null, sub: 'machines', mod: 'monostructural' }],
  ['Push Press', { pat: 'push', sub: 'vertical', mod: 'weightlifting' }],
  ['Bench Press', { pat: 'push', sub: 'horizontal', mod: 'weightlifting' }],
  ['Pull-Up', { pat: 'pull', sub: 'vertical', mod: 'gymnastics' }],
  ['Box Jump Over', { pat: null, sub: 'bounding', mod: 'monostructural' }],
  ['Burpee', { pat: 'push', sub: 'horizontal', mod: 'gymnastics' }],
  ['Burpees over the bar', { pat: 'push', sub: 'horizontal', mod: 'gymnastics' }],
  ['SB Walk', { pat: 'pull', sub: 'horizontal', mod: 'carries' }],
  ['Sandbag Carry', { pat: 'pull', sub: 'horizontal', mod: 'carries' }],
  // Held object must not override the actual movement (same rationale as farmer-position lunges)
  ['Reverse Lunge Wall Ball', { pat: 'squat', sub: 'single_leg', mod: 'weightlifting' }],
];

for (const [name, expected] of SINGLE) {
  check(`clsAll("${name}")`, () => {
    const got = clsAll(name)[0];
    assert.strictEqual(got.pat, expected.pat, `pat: got ${got.pat}, want ${expected.pat}`);
    assert.strictEqual(got.sub, expected.sub, `sub: got ${got.sub}, want ${expected.sub}`);
    assert.strictEqual(got.mod, expected.mod, `mod: got ${got.mod}, want ${expected.mod}`);
  });
}

// ── Compound movements: full multi-pattern array, order matters ──
const COMPOUND = [
  ['Thruster', [
    { pat: 'squat', sub: 'traditional', mod: 'weightlifting' },
    { pat: 'push', sub: 'vertical', mod: 'weightlifting', dualTon: true },
  ]],
  ['Power Clean', [
    { pat: 'hinge', sub: null, mod: 'weightlifting' },
    { pat: 'pull', sub: 'vertical', mod: 'weightlifting', dualTon: true },
  ]],
  ['Clean & Jerk', [
    { pat: 'hinge', sub: null, mod: 'weightlifting' },
    { pat: 'pull', sub: 'vertical', mod: 'weightlifting', dualTon: true },
    { pat: 'push', sub: 'vertical', mod: 'weightlifting', dualTon: true },
  ]],
  ['Double KB C&J', [
    { pat: 'hinge', sub: null, mod: 'weightlifting' },
    { pat: 'pull', sub: 'horizontal', mod: 'weightlifting', dualTon: true },
    { pat: 'push', sub: 'vertical', mod: 'weightlifting', dualTon: true },
  ]],
  ["Devil's Press", [
    { pat: 'hinge', sub: null, mod: 'weightlifting' },
    { pat: 'pull', sub: 'vertical', mod: 'weightlifting', dualTon: true },
    { pat: 'push', sub: 'horizontal', mod: 'gymnastics' },
  ]],
  // "+"-joined complexes: each named lift classified separately and combined, so a complex neither
  // over-credits (whichever lift matches first stealing the whole thing) nor under-credits (a lift
  // later in the string never getting checked at all) its component patterns.
  ['Low Hang Power Clean + Hang Squat Clean + Push Press', [
    { pat: 'hinge', sub: null, mod: 'weightlifting', dualTon: true },
    { pat: 'pull', sub: 'vertical', mod: 'weightlifting', dualTon: true },
    { pat: 'hinge', sub: null, mod: 'weightlifting', dualTon: true },
    { pat: 'pull', sub: 'vertical', mod: 'weightlifting', dualTon: true },
    { pat: 'squat', sub: 'traditional', mod: 'weightlifting', dualTon: true },
    { pat: 'push', sub: 'vertical', mod: 'weightlifting', dualTon: true },
  ]],
  ['Power Snatch + Power Snatch + OHS', [
    { pat: 'hinge', sub: null, mod: 'weightlifting', dualTon: true },
    { pat: 'pull', sub: 'vertical', mod: 'weightlifting', dualTon: true },
    { pat: 'hinge', sub: null, mod: 'weightlifting', dualTon: true },
    { pat: 'pull', sub: 'vertical', mod: 'weightlifting', dualTon: true },
    { pat: 'squat', sub: 'traditional', mod: 'weightlifting', dualTon: true },
  ]],
];

for (const [name, expected] of COMPOUND) {
  check(`clsAll("${name}") (compound)`, () => {
    assert.deepStrictEqual(clsAll(name), expected);
  });
}

// ── Distance-logged loaded carries (sled, sandbag, farmer's carry...) get r stored as total
// meters (see api/parse.js DISTANCE RULE) — tonnage must scale by distanceDiv (rep-equivalent),
// not raw meters x load, or a single 80m set inflates tonnage far beyond any real rep-based lift.
const DISTANCE_DIV = [
  ['Sled Push', 10],
  ['Sled Drag', 10],
  ['Sandbag Carry', 10],
];
for (const [name, expected] of DISTANCE_DIV) {
  check(`clsAll("${name}") distanceDiv`, () => {
    assert.strictEqual(clsAll(name)[0].distanceDiv, expected, `distanceDiv: got ${clsAll(name)[0].distanceDiv}, want ${expected}`);
  });
}

// ── normMov: name -> expected canonical display name ──
const NORM = [
  ['Strict HSPU', 'Strict HSPU'],
  ['HSPU', 'HSPU'],
  ['HSPU (0-5min)', 'HSPU'],
  ['Sandbag Cleans', 'Sandbag Clean'],
  ['SB Cleans', 'Sandbag Clean'],
  ['Front Plank Hold', 'Plank'],
  ['Plank', 'Plank'],
  ['Side Plank', 'Side Plank'], // must NOT merge into Plank
  ['DBL DB Farmers Reverse Lunge', 'Double DB Reverse Lunge'],
  ['Reverse Lunge Wall Ball', 'Reverse Lunge WB'],
  ['Reverse Lunge WB', 'Reverse Lunge WB'],
  ['Reverse Lunge', 'Reverse Lunge'],
  ['Reverse Lunges', 'Reverse Lunge'],
  ['SA OH Reverse Lunge', 'SA OH Reverse Lunge'], // must NOT merge into Reverse Lunge
  ['Reverse Lunge WB', 'Reverse Lunge WB'],       // must NOT merge into Reverse Lunge
  ['Burpees OTB', 'Burpee Over Bar'],
  ['Burpee over Bar', 'Burpee Over Bar'],
  ['Burpees over the bar', 'Burpee Over Bar'],
  ['Burpee to Target', 'Burpee to Target'],
  ['Burpees to a target', 'Burpee to Target'],
  ['Burpee', 'Burpee'],
  ['DB Bicep Curls', 'Bicep Curl'],
  ['Bicep Curl', 'Bicep Curl'],
  ['Double KB C&J', 'Double KB C&J'], // must NOT merge into generic Clean & Jerk
  ['Clean & Jerk', 'Clean & Jerk'],
  ['DB Bent Over Row', 'DB Bent Over Row'],
  ['DB Bent Over Rows', 'DB Bent Over Row'],
];

for (const [name, expected] of NORM) {
  check(`normMov("${name}")`, () => {
    assert.strictEqual(normMov(name), expected);
  });
}

// ── findUnclassified: the Create Session logging-time warning ──
check('findUnclassified flags unrecognized movements and dedupes', () => {
  const blocks = [
    { k: 'strength', mov: 'Front Squat', sets: [{ r: 5, w: 185 }] },
    { k: 'strength', mov: 'Unicorn Curls', sets: [{ r: 10, w: 20 }] },
    { k: 'metcon', pm: [
      { n: 'Deadlift', r: 10, w: 225 },
      { n: 'Zorb Ball Slam', r: 10, w: 0 },
      { n: 'Zorb Ball Slam', r: 10, w: 0 },
      { n: 'Pull-Up', r: 10, w: 0 },
    ]},
  ];
  const result = findUnclassified(blocks);
  assert.strictEqual(result.length, 2);
  assert.ok(result.includes('Unicorn Curls'));
  assert.ok(result.includes('Zorb Ball Slam'));
});

check('findUnclassified returns empty for a fully-recognized workout', () => {
  const blocks = [
    { k: 'strength', mov: 'Back Squat', sets: [{ r: 5, w: 225 }] },
    { k: 'metcon', pm: [{ n: 'Pull-Up', r: 10, w: 0 }, { n: 'Push-Up', r: 10, w: 0 }] },
  ];
  assert.strictEqual(findUnclassified(blocks).length, 0);
});

// ── MOVEMENT_CATEGORIES: the Home-tab Movement Totals card ──
// match() returns a COUNT, not a boolean — verifying this matters specifically for "+"-joined
// complexes that contain the same category twice (two separate squat catches, two separate cleans
// in one logged entry), which must credit twice, not once.
const MT_CASES = [
  ['Back Squat', 'squats', 1],
  ['Split Squat', 'squats', 0], // single-leg, must not count as a traditional squat
  ['Floating Hang Squat Clean + Squat Clean + Jerk', 'squats', 2],
  ['Floating Hang Squat Clean + Squat Clean + Jerk', 'cleans', 2],
  ['Low Hang Power Clean + Hang Squat Clean + Push Press', 'cleans', 2],
  ['Low Hang Power Clean + Hang Squat Clean + Push Press', 'squats', 1],
  ['Low Hang Power Clean + Hang Squat Clean + Push Press', 'shoulder_to_oh', 1],
  ['Power Snatch + Power Snatch + OHS', 'snatches', 2],
  ['Power Snatch + Power Snatch + OHS', 'squats', 1],
  ['Rope Climbs', 'pullups', 0], // shares pull/vertical/gymnastics with pull-ups but is not one
  ['Pull-Up', 'pullups', 1],
  ['Burpee Pull Ups', 'burpees', 1],
  ['Burpee Pull Ups', 'pullups', 1], // counts toward both, by design
  ['Cal Row', 'machine_cals', 1],
  ['Cal Row', 'machine_dist', 0],
  ['500m Row', 'machine_dist', 1],
  ['500m Row', 'machine_cals', 0],
  ['Thruster', 'shoulder_to_oh', 1], // the overhead-press portion of a compound lift counts
  ['Wall Walk', 'hspu', 0], // shares push/vertical/gymnastics with HSPU but is not one
  ['Strict HSPU', 'hspu', 1],
  ['Snatch Deadlift to Hip', 'deadlifts', 0], // contains "deadlift" but is a snatch-pull drill, not a deadlift
  ['Snatch Deadlift to Hip', 'snatches', 1],
  ['DBL DB DL', 'deadlifts', 1], // DL abbreviation
];
for (const [name, key, expected] of MT_CASES) {
  check(`MOVEMENT_CATEGORIES.${key}("${name}")`, () => {
    const got = MOVEMENT_CATEGORIES[key].match(name, clsAll(name)) || 0;
    assert.strictEqual(got, expected, `got ${got}, want ${expected}`);
  });
}

console.log(`\n${pass}/${pass + fail} passed`);
if (fail > 0) process.exit(1);
