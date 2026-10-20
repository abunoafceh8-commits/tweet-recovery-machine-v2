export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const { username, mode, limit } = body;
  const u = (username || '').replace('@', '').trim();
  if (!u) return res.status(400).json({ error: 'Username required' });

  try {
    const r = await fetch('https://tweet-recovery-machine-cl-6mca.arcada.app/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: u, mode: mode || 'full_scan', limit: limit || 100 }),
      signal: AbortSignal.timeout(30000)
    });
    const data = await r.json();
    return res.json(data);
  } catch (e) {
    return res.json({ error: e.message, tweets: [], summary: { total: 0, tweets: 0, pages: 0, high_confidence: 0 } });
  }
}
