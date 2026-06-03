const SYSTEM = `You parse CrossFit workout text into structured JSON. Return ONLY valid JSON, no other text.

Output format:
{
  "blocks": [
    For strength/accessory:
    {"k":"strength","mov":"Front Squat","pat":"squat","sets":[{"r":5,"w":185},{"r":5,"w":205}]},

    For metcon:
    {"k":"metcon","fmt":"10 min AMRAP","td":"med",
     "mv":"12 Cal Ski / 12 DB Hang Snatch (50) / 24 DUs / 12 SA DB Thruster (50)",
     "pm":[{"n":"Cal Ski","r":36,"w":0,"p":"mono"},{"n":"DB Hang Snatch","r":36,"w":50,"p":"olympic"}],
     "score":"3+24","rx":true}
  ],
  "notes":""
}

Rules:
- "pat" for strength: push|pull|squat|hinge|core|mono|olympic
- "td" for metcon time domain: short (<7min), med (7-15min), long (>15min)
- "pm" = parsed movements with TOTAL reps estimated from score
  - AMRAP: reps_per_round * completed_rounds
  - EMOM: reps * number_of_rounds_for_that_station (calculate from total minutes / stations)
  - For Time: prescribed total reps
- "p" in pm = movement pattern: push|pull|squat|hinge|core|mono|olympic
- Pattern guide:
  press/jerk/HSPU/push-up/bench/dip = push
  pull-up/muscle-up/C2B/rope climb/row(barbell) = pull
  squat/thruster/wall ball/lunge/pistol = squat
  deadlift/RDL/KB swing/good morning = hinge
  TTB/GHD sit-up/sit-up/L-sit/plank = core
  run/row(erg)/ski/bike/burpee/DU/box jump = mono
  clean/snatch/C&J (any variant) = olympic
- Rx defaults to true unless stated otherwise (scaled, modified)
- "1x5 - 185" means 1 set of 5 at 185. "2x5 - 205" means 2 sets of 5 at 205.
- If text mentions notes like "felt heavy" or "knee bothering me", put in "notes"
- Accessories (curls, DB bench, lateral raise, etc.) use k:"accessory"`;

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

    // Extract JSON from response (handle markdown fences)
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(cleaned);

    res.json(parsed);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
