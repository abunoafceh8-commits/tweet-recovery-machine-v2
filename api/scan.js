const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const { username, mode = 'full_scan', limit = 100 } = body;
  const cleanUser = (username || '').replace('@', '').trim();
  if (!cleanUser) return res.status(400).json({ error: 'Username required' });

  const tweets = [];

  // Method 1: Syndication API (live tweets)
  try {
    const r = await fetch(`https://syndication.twitter.com/srv/timeline-profile/screen-name/${cleanUser}`, {
      headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000)
    });
    const html = await r.text();
    const ids = [...html.matchAll(/data-tweet-id="(\d+)"/g)];
    const texts = [...html.matchAll(/<p[^>]*dir="ltr"[^>]*>([\s\S]*?)<\/p>/g)];
    ids.forEach((m, i) => {
      const text = texts[i]?.[2]?.replace(/<[^>]+>/g, '').trim() || '';
      const tid = m[1];
      const date = new Date(parseInt(tid) / 4194304 + 1288834974657);
      tweets.push({
        tweet_id: tid, original_url: `https://twitter.com/${cleanUser}/status/${tid}`,
        archived_url: null, formatted_date: date.toISOString().split('T')[0],
        source_label: 'Live Tweet', confidence: 1.0,
        data: { text, author: cleanUser, source: 'syndication', captured_at: new Date().toISOString(), confidence: 1, media: [], title: text.slice(0, 50) }
      });
    });
  } catch {}

  // Method 2: Wayback Machine CDX (archived tweets)
  for (const domain of ['twitter.com', 'x.com']) {
    try {
      const r = await fetch(`https://web.archive.org/cdx/search/cdx?url=${domain}/${cleanUser}/status/*&output=json&limit=${Math.min(limit, 200)}&fl=timestamp,original,statuscode&collapse=urlkey&statuscode=200`, {
        signal: AbortSignal.timeout(10000)
      });
      const data = await r.json();
      const [, ...rows] = data;
      rows.forEach(row => {
        const tid = row[1]?.match(/\/status\/(\d+)/)?.[1];
        if (tid && !tweets.find(t => t.tweet_id === tid)) {
          const fd = `${row[0].slice(0,4)}-${row[0].slice(4,6)}-${row[0].slice(6,8)}`;
          tweets.push({
            tweet_id: tid, original_url: row[1],
            archived_url: `https://web.archive.org/web/${row[0]}/${row[1]}`,
            formatted_date: fd, source_label: `Wayback (${domain})`, confidence: 0.85,
            data: { text: '', author: cleanUser, source: 'wayback', captured_at: row[0], confidence: 0.85, media: [], title: `Archived ${fd}` }
          });
        }
      });
    } catch {}
  }

  tweets.sort((a, b) => (b.formatted_date || '').localeCompare(a.formatted_date || ''));

  res.json({
    tweets, summary: { total: tweets.length, tweets: tweets.length, pages: 1, high_confidence: tweets.filter(t => t.confidence >= 0.9).length },
    username: cleanUser, mode
  });
}
