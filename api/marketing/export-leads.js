module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const supabase_url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabase_key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // Also accept from query param for dashboard use
  const url = supabase_url || req.query.supabase_url;
  const key = supabase_key || req.query.supabase_key;

  if (!url || !key) return res.status(500).json({ error: 'Supabase not configured' });

  const format = req.query.format || 'csv'; // 'csv' or 'json'
  const source = req.query.source; // optional filter
  const since = req.query.since; // optional date filter
  const table = req.query.table || 'lead_captures'; // 'lead_captures' or 'marketing_contacts'

  let endpoint = `${url}/rest/v1/${table}?order=created_at.desc&limit=10000`;
  if (source) endpoint += `&source=eq.${source}`;
  if (since) endpoint += `&created_at=gte.${since}`;

  try {
    const r = await fetch(endpoint, {
      headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Accept': 'application/json' }
    });
    const data = await r.json();
    if (!Array.isArray(data)) return res.status(500).json({ error: 'Failed to fetch data', detail: data });

    if (format === 'json') return res.status(200).json({ success: true, count: data.length, data });

    // Build CSV
    if (!data.length) {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${table}_export.csv"`);
      return res.status(200).send('No data found');
    }

    const cols = Object.keys(data[0]);
    const escape = v => {
      if (v === null || v === undefined) return '';
      const str = typeof v === 'object' ? JSON.stringify(v) : String(v);
      return str.includes(',') || str.includes('"') || str.includes('\n') ? `"${str.replace(/"/g, '""')}"` : str;
    };
    const csv = [cols.join(','), ...data.map(row => cols.map(c => escape(row[c])).join(','))].join('\r\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="smartswing_${table}_${new Date().toISOString().split('T')[0]}.csv"`);
    return res.status(200).send('\uFEFF' + csv); // BOM for Excel UTF-8
  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
};
