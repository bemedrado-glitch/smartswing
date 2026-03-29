module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, name, phone, persona, source, utm_source, utm_medium, utm_campaign, page_url, notes } = req.body || {};
  if (!email) return res.status(400).json({ error: 'email required' });

  const supabase_url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabase_key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabase_url || !supabase_key) return res.status(500).json({ error: 'Supabase not configured' });

  try {
    const r = await fetch(`${supabase_url}/rest/v1/lead_captures`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabase_key,
        'Authorization': `Bearer ${supabase_key}`,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({ email, name, phone, persona: persona || 'player', source: source || 'website', utm_source, utm_medium, utm_campaign, page_url, notes })
    });
    const data = await r.json();
    return res.status(200).json({ success: true, lead_id: Array.isArray(data) ? data[0]?.id : data?.id });
  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
};
