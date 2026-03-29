// api/marketing/auto-enroll.js
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, name, user_id, supabase_url, supabase_key } = req.body || {};
  if (!email || !supabase_url || !supabase_key) {
    return res.status(400).json({ error: 'email, supabase_url, supabase_key required' });
  }

  const headers = {
    'Content-Type': 'application/json',
    'apikey': supabase_key,
    'Authorization': `Bearer ${supabase_key}`,
    'Prefer': 'return=representation'
  };

  try {
    // 1. Upsert contact
    const contactRes = await fetch(`${supabase_url}/rest/v1/marketing_contacts`, {
      method: 'POST',
      headers: { ...headers, 'Prefer': 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({ email, name: name || email.split('@')[0], persona: 'player', stage: 'trial', source: 'signup' })
    });
    const contacts = await contactRes.json();
    const contact = Array.isArray(contacts) ? contacts[0] : contacts;
    if (!contact?.id) return res.status(500).json({ error: 'Failed to create contact', detail: contacts });

    // 2. Find "Trial to Paid" cadence
    const cadenceRes = await fetch(`${supabase_url}/rest/v1/email_cadences?name=ilike.*Trial*&limit=1`, {
      headers: { 'apikey': supabase_key, 'Authorization': `Bearer ${supabase_key}` }
    });
    const cadences = await cadenceRes.json();

    if (!cadences?.length) {
      // No cadence in DB yet — return success anyway, cadences are loaded from marketing-cadences.js
      return res.status(200).json({ success: true, contact_id: contact.id, message: 'Contact created. Cadence not yet seeded in DB — enroll manually from dashboard.' });
    }

    const cadence = cadences[0];

    // 3. Check not already enrolled
    const enrollCheck = await fetch(`${supabase_url}/rest/v1/contact_cadence_enrollments?contact_id=eq.${contact.id}&cadence_id=eq.${cadence.id}&limit=1`, {
      headers: { 'apikey': supabase_key, 'Authorization': `Bearer ${supabase_key}` }
    });
    const existing = await enrollCheck.json();
    if (existing?.length) {
      return res.status(200).json({ success: true, contact_id: contact.id, message: 'Already enrolled in cadence' });
    }

    // 4. Fetch cadence steps
    const emailsRes = await fetch(`${supabase_url}/rest/v1/cadence_emails?cadence_id=eq.${cadence.id}&order=sequence_num`, {
      headers: { 'apikey': supabase_key, 'Authorization': `Bearer ${supabase_key}` }
    });
    const smsRes = await fetch(`${supabase_url}/rest/v1/cadence_sms?cadence_id=eq.${cadence.id}&order=sequence_num`, {
      headers: { 'apikey': supabase_key, 'Authorization': `Bearer ${supabase_key}` }
    });
    const emails = await emailsRes.json();
    const smsItems = await smsRes.json();

    // 5. Create enrollment (start next day)
    const nextDay = new Date(); nextDay.setDate(nextDay.getDate() + 1);
    const enrollRes = await fetch(`${supabase_url}/rest/v1/contact_cadence_enrollments`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ contact_id: contact.id, cadence_id: cadence.id, status: 'active', current_step: 1, next_step_at: nextDay.toISOString() })
    });
    const enrollment = await enrollRes.json();
    const enrollId = Array.isArray(enrollment) ? enrollment[0]?.id : enrollment?.id;

    // 6. Schedule all steps
    const steps = [];
    (Array.isArray(emails) ? emails : []).forEach(e => {
      const d = new Date(); d.setDate(d.getDate() + 1 + (e.delay_days || 0));
      steps.push({ enrollment_id: enrollId, contact_id: contact.id, cadence_id: cadence.id, step_type: 'email', step_num: e.sequence_num, subject: e.subject, body: e.body_text || e.body_html, status: 'pending', scheduled_at: d.toISOString() });
    });
    (Array.isArray(smsItems) ? smsItems : []).forEach(s => {
      const d = new Date(); d.setDate(d.getDate() + 1 + (s.delay_days || 0));
      steps.push({ enrollment_id: enrollId, contact_id: contact.id, cadence_id: cadence.id, step_type: 'sms', step_num: s.sequence_num, message: s.message, status: 'pending', scheduled_at: d.toISOString() });
    });

    if (steps.length) {
      await fetch(`${supabase_url}/rest/v1/cadence_step_executions`, {
        method: 'POST',
        headers: { ...headers, 'Prefer': 'return=minimal' },
        body: JSON.stringify(steps)
      });
    }

    return res.status(200).json({ success: true, contact_id: contact.id, enrollment_id: enrollId, steps_scheduled: steps.length, starts_at: nextDay.toISOString() });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
