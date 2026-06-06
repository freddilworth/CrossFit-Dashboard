export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { components, context, messages, athleteData } = req.body;
  if (!messages || !athleteData) return res.status(400).json({ error: 'Missing required fields' });

  const selected = Object.entries(components || {}).filter(([, v]) => v).map(([k]) => k);
  const compList = selected.map(k => k.charAt(0).toUpperCase() + k.slice(1)).join(', ');

  const system = `You are an experienced CrossFit coach generating personalized workout recommendations for a specific athlete.

━━━ AVOIDANCE WINDOW — LAST 3 DAYS (highest priority) ━━━
These sessions are RECENT. Do not repeat these movements or dominant patterns today. This is the most important constraint.

${athleteData.last3Days}

━━━ BROADER RECENT CONTEXT — DAYS 4–14 ━━━
${athleteData.recentSessions}

━━━ ALL-TIME PATTERN BALANCE ━━━
${athleteData.patternBalance}

━━━ TIME DOMAIN DISTRIBUTION (Last 90 Days) ━━━
${athleteData.timeDomain}

━━━ TOP MOVEMENTS BY FREQUENCY ━━━
${athleteData.topMovements}

━━━ KEY PRs ━━━
${athleteData.prs || 'None logged'}

━━━ RECENT MOOD ━━━
Satisfaction: ${athleteData.moodSatisfied} | Fun: ${athleteData.moodFun}

━━━ WORKOUT REQUEST ━━━
Generate ONLY these components — nothing else: ${compList || 'full workout'}
${context ? `Athlete notes: ${context}` : ''}

━━━ PROGRAMMING RULES ━━━
COMPONENTS: Generate strictly the components listed above. Do not add extra components not requested.

STRENGTH: Prescribe sets/reps/percentage only (e.g. "4x5 @ 75%"). Never specific weights. Base percentages on sound periodization and the athlete's implied 1RMs from their PR data.

METCON: Choose ONE format that is internally consistent:
  - For Time: fixed reps, athlete finishes as fast as possible. No time cap needed unless stated.
  - AMRAP: athlete repeats the same round for the full time window. Do NOT combine with descending reps — that is contradictory.
  - EMOM: fixed work per minute.
  - Intervals: fixed work/rest structure.
  Never mix "descending ladder" with "AMRAP." If you want a descending ladder, use "For Time." If you want an AMRAP, use a fixed round.
  State the intended stimulus (e.g. "aerobic capacity", "lactate threshold").

ACCESSORY: 2-3 exercises targeting underworked patterns, supporting muscle groups, or movement quality.

GENERAL: Format with a clear header per component. End with a brief "Reasoning" section (3-5 sentences) explaining the programming choices. Be concise — a real athlete will read this and go train.`;

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
        max_tokens: 1500,
        system,
        messages
      })
    });

    if (!response.ok) {
      const err = await response.text();
      if (response.status === 429 || err.includes('credit') || err.includes('billing')) {
        return res.status(429).json({ error: 'API credits exhausted. Add billing at console.anthropic.com' });
      }
      return res.status(502).json({ error: 'Anthropic API error: ' + response.status + ' — ' + err.slice(0, 200) });
    }

    const data = await response.json();
    res.json({ content: data.content[0].text });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
