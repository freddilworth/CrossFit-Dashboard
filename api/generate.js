export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { components, context, messages, athleteData } = req.body;
  if (!messages || !athleteData) return res.status(400).json({ error: 'Missing required fields' });

  const compList = Object.entries(components || {})
    .filter(([, v]) => v)
    .map(([k]) => k.charAt(0).toUpperCase() + k.slice(1))
    .join(', ');

  const system = `You are an experienced CrossFit coach generating personalized workout recommendations for a specific athlete. You have access to their complete training history.

ATHLETE TRAINING PROFILE

Recent Sessions (Last 14 Days):
${athleteData.recentSessions}

Pattern Balance (All Time):
${athleteData.patternBalance}

Time Domain Distribution (Last 90 Days):
${athleteData.timeDomain}

Top Movements by Frequency:
${athleteData.topMovements}

Key PRs:
${athleteData.prs || 'None logged'}

Recent Training Satisfaction: ${athleteData.moodSatisfied}% | Fun: ${athleteData.moodFun}%

---

WORKOUT REQUEST
Components: ${compList || 'Full workout'}
${context ? `Athlete notes: ${context}` : ''}

PROGRAMMING GUIDELINES
- Strength: prescribe sets/reps/percentage (e.g. "4x5 @ 75%"), never specific weights. Base percentages on sound periodization principles and the athlete's training history and implied 1RMs.
- Metcon: choose format, time domain, and movements based on what complements recent training. State the intended stimulus (e.g. "aerobic capacity", "lactate threshold", "muscular endurance"). Let the data guide the time domain.
- Accessory: 2-3 exercises targeting underworked patterns, supporting muscle groups, or movement quality. Keep it purposeful and brief.
- You may suggest movements not in the athlete's history if they fit the stimulus and skill level.
- Format clearly with a header for each component.
- After the workout, add a brief "Reasoning" section (3-5 sentences) explaining the programming choices in plain language.
- Be concise. A real athlete will read this and go do it.`;

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
