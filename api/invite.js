export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'No email provided' });

  const authHeader = req.headers.authorization || '';
  const callerToken = authHeader.replace(/^Bearer\s+/i, '');
  if (!callerToken) return res.status(401).json({ error: 'Missing Authorization header' });

  try {
    const meRes = await fetch(process.env.SUPABASE_URL + '/auth/v1/user', {
      headers: {
        apikey: process.env.SUPABASE_ANON_KEY,
        Authorization: 'Bearer ' + callerToken
      }
    });
    if (!meRes.ok) return res.status(401).json({ error: 'Invalid session' });

    const me = await meRes.json();
    if (!me.email || me.email.toLowerCase() !== (process.env.ADMIN_EMAIL || '').toLowerCase()) {
      return res.status(403).json({ error: 'Not authorized to send invites' });
    }

    const inviteRes = await fetch(process.env.SUPABASE_URL + '/auth/v1/invite', {
      method: 'POST',
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email })
    });

    if (!inviteRes.ok) {
      const err = await inviteRes.text();
      return res.status(502).json({ error: 'Supabase invite error', detail: err });
    }

    const data = await inviteRes.json();
    res.json({ ok: true, user: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
