const SYSTEM = `You parse CrossFit workout text into structured JSON. Return ONLY valid JSON, no other text.

Output format:
{
  "blocks": [
    For strength/accessory:
    {"k":"strength","mov":"Front Squat","pat":"squat","sub":"traditional","mod":"weightlifting","sets":[{"r":5,"w":185},{"r":5,"w":205}]},

    For metcon:
    {"k":"metcon","fmt":"10 min AMRAP","td":"med",
     "mv":"12 Cal Ski / 12 DB Hang Snatch (50) / 24 DUs / 12 SA DB Thruster (50)",
     "pm":[{"n":"Cal Ski","r":36,"w":0,"pat":"mono","sub":null,"mod":"monostructural"},{"n":"DB Hang Snatch","r":36,"w":50,"pat":"hinge","sub":null,"mod":"weightlifting"}],
     "score":"3+24","rx":true}
  ],
  "notes":""
}

Two-axis classification — every movement gets BOTH pat (pattern) and mod (modality), plus sub where applicable:

PATTERNS (what the body does):
- push: pressing movements (sub: vertical or horizontal)
- pull: pulling movements (sub: vertical or horizontal)
- squat: knee-dominant lower body (sub: traditional or single-leg)
- hinge: hip-dominant lower body (no sub)
- core: trunk/midline (no sub)
- mono: monostructural cardio (no sub)

MODALITIES (how it's done):
- weightlifting: barbell/dumbbell/kettlebell loaded movements
- gymnastics: bodyweight or ring/bar gymnastic movements
- monostructural: running, rowing, skiing, biking, jumping

CLASSIFICATION RULES:
Power Clean, Power Snatch, Deadlift, RDL, KB Swing, Good Morning, Clean & Jerk = pat:hinge, mod:weightlifting
Squat Clean, Squat Snatch, Hang Squat Clean, Hang Squat Snatch = pat:squat, sub:traditional, mod:weightlifting
Back Squat, Front Squat, OHS, Thruster, Wall Ball = pat:squat, sub:traditional, mod:weightlifting
Lunge, Step-up (loaded) = pat:squat, sub:single-leg, mod:weightlifting
Pistol = pat:squat, sub:single-leg, mod:gymnastics
Strict Press, Push Press, Push Jerk, Split Jerk = pat:push, sub:vertical, mod:weightlifting
Bench Press, DB Bench, Floor Press = pat:push, sub:horizontal, mod:weightlifting
HSPU, Handstand Push-up = pat:push, sub:vertical, mod:gymnastics
Push-up, Ring Push-up, Dip = pat:push, sub:horizontal, mod:gymnastics
Pull-up, Butterfly Pull-up, C2B, Chest to Bar, Bar Muscle-up, Ring Muscle-up, Rope Climb = pat:pull, sub:vertical, mod:gymnastics
Ring Row = pat:pull, sub:horizontal, mod:gymnastics
Barbell Row, DB Row, Pendlay Row = pat:pull, sub:horizontal, mod:weightlifting
TTB, Toes to Bar, GHD Sit-up, Sit-up, L-sit, Plank, V-up, K2E, Knees to Elbow = pat:core, mod:gymnastics
Row (erg), Cal Row = pat:mono, sub:null, mod:monostructural
Ski Erg, Cal Ski = pat:mono, sub:null, mod:monostructural
Bike, Assault Bike, Cal Bike = pat:mono, sub:null, mod:monostructural
Run, Sprint = pat:mono, sub:null, mod:monostructural
Double Under, Single Under, Jump Rope = pat:mono, sub:null, mod:monostructural
Box Jump, Box Jump Over = pat:mono, sub:null, mod:monostructural
Burpee, Burpee over Bar = pat:mono, sub:null, mod:monostructural
SA DB (single-arm dumbbell) movements: treat same as their barbell equivalents for pat/mod
DB Hang Snatch = pat:hinge, mod:weightlifting
SA DB Thruster = pat:squat, sub:traditional, mod:weightlifting

QUANTITY RULES:
- "td" for metcon time domain: short (<10min), med (10-20min), long (>20min)
- "pm" = parsed movements with TOTAL reps estimated from score
  - AMRAP: reps_per_round * completed_rounds, PLUS partial-round credit (see AMRAP PARTIAL ROUND RULE below — never drop the partial round)
  - EMOM: reps * number_of_rounds_for_that_station (total_minutes / num_stations)
  - For Time: prescribed total reps
- "1x5 - 185" means 1 set of 5 at 185. "2x5 - 205" means 2 sets of 5 at 205.
- Rx defaults to true unless stated otherwise (scaled, modified)
- If text mentions notes like "felt heavy" or "knee bothering me", put in "notes"
- Accessories (curls, lateral raise, face pull, etc.) use k:"accessory"

AMRAP PARTIAL ROUND RULE (critical — never drop the partial round's reps):
AMRAP scores are written "X+Y": X completed full rounds, plus Y additional reps completed
into the next round before time expired. Y is NOT a separate movement or a rounding
error — it must be walked through the movement cycle IN ORDER and added on top of the
X full rounds, movement by movement, until Y is used up:
- For each movement in cycle order, if remaining Y >= that movement's per-round reps,
  award it a full extra round's worth and subtract that amount from Y; continue to the
  next movement.
- The first movement where remaining Y < its per-round reps gets that partial amount
  (not a full round); every movement after it in that cycle gets no partial credit.
- Example: cycle is 10 Box Step Ups / 10 Snatches (50) / 10 Lunges (30 reps/round total),
  score "2+14" → Box Step Ups = 2×10 + 10 = 30 (14 covers all 10, 4 remain), Snatches =
  2×10 + 4 = 24 (partial, remaining Y exhausted here), Lunges = 2×10 + 0 = 20 (no partial
  reached).
- Never simply multiply reps_per_round × full_rounds and ignore the "+Y" — that silently
  undercounts every AMRAP that doesn't finish on an exact round boundary, which is most
  of them.

DISTANCE RULE (critical — never store round count for distance movements):
For Run, Row, Ski, Bike, Sled Push, Farmer Carry, and ANY movement stated in meters/yards/
miles (not just the named cardio machines — this includes accessory/carry movements like
Sled Push or Yoke Walk when given a distance):
- Always store TOTAL METERS as "r" (not rounds, not laps, and NEVER the round count itself)
- Multiply: prescribed_rounds × meters_per_round
- Examples:
  - "4 Rounds, 400m Run" → r: 1600
  - "6 Rounds For Time: 200m Run" → r: 1200
  - "Every 9:00 for 36:00: 400m Run" → 4 rounds → r: 1600
  - "EMOM 24min (6 stations), stations 1-2: 300m Run" → 4 rounds of that station → r: 1200
  - "Run 3 miles" → r: 4827 (convert miles to meters: 1 mile = 1609m)
  - "Run 800m" → r: 800
  - "3 Rounds: 250m Ski / 20 Burpees / 250m Row" → Ski r: 750, Row r: 750 (NOT r: 3 —
    3 is the round count, not the distance; this mistake is easy to make when a distance
    movement sits inside a multi-section round-based workout, so double-check every
    distance movement's "r" is a plausible total-meters figure, not a small round count)
  - "4 Rounds: 20m Sled Push" → r: 80 (NOT r: 4)
- For calories (Cal Row, Cal Ski, Cal Bike): store total calories as "r", same multiplication rule`;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { text, date } = req.body;
  if (!text) return res.status(400).json({ error: 'No text provided' });

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        system: SYSTEM,
        messages: [{ role: 'user', content: 'Parse this workout for ' + (date || 'today') + ':\n\n' + text }]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(502).json({ error: 'Anthropic API error', detail: err });
    }

    const data = await response.json();
    const raw = data.content[0].text;
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(cleaned);

    res.json(parsed);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
