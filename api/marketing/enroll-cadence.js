/**
 * SmartSwing AI — Enroll Contact in Marketing Cadence
 * POST /api/marketing/enroll-cadence
 *
 * Enrolls a contact in a cadence and schedules all email + SMS steps
 * as individual rows in cadence_step_executions.
 *
 * Request body:
 *   { contact_id, cadence_id, supabase_url, supabase_key }
 */

'use strict';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * GET from a Supabase REST endpoint.
 * @param {string} url      Full URL including query string
 * @param {string} key      Supabase anon/service key
 * @returns {Promise<Array>}
 */
async function supabaseGet(url, key) {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => response.statusText);
    throw new Error(`Supabase GET failed (${response.status}): ${errText}`);
  }

  return response.json();
}

/**
 * POST (insert) a single row into a Supabase table.
 * @returns {Promise<object>} inserted row
 */
async function supabaseInsert(supabaseUrl, key, table, row) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: JSON.stringify(row)
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => response.statusText);
    throw new Error(`Supabase insert into ${table} failed (${response.status}): ${errText}`);
  }

  const result = await response.json();
  return Array.isArray(result) ? result[0] : result;
}

/**
 * Bulk-insert an array of rows into a Supabase table.
 * @returns {Promise<Array>} inserted rows
 */
async function supabaseBulkInsert(supabaseUrl, key, table, rows) {
  if (!rows || rows.length === 0) return [];

  const response = await fetch(`${supabaseUrl}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: JSON.stringify(rows)
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => response.statusText);
    throw new Error(`Supabase bulk insert into ${table} failed (${response.status}): ${errText}`);
  }

  const result = await response.json();
  return Array.isArray(result) ? result : [result];
}

/**
 * Add `delay_days` calendar days to a base date and return ISO string.
 */
function addDays(baseDate, delayDays) {
  const d = new Date(baseDate);
  d.setDate(d.getDate() + (delayDays || 0));
  return d.toISOString();
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { contact_id, cadence_id, supabase_url, supabase_key } = req.body || {};

  // Validation
  if (!contact_id) {
    return res.status(400).json({ error: 'contact_id is required' });
  }
  if (!cadence_id) {
    return res.status(400).json({ error: 'cadence_id is required' });
  }
  if (!supabase_url || !supabase_key) {
    return res.status(400).json({ error: 'supabase_url and supabase_key are required' });
  }

  const now = new Date().toISOString();

  try {
    // -----------------------------------------------------------------------
    // 1. Fetch cadence metadata (name, etc.) — optional, best-effort
    // -----------------------------------------------------------------------
    let cadenceName = cadence_id; // fallback to ID if lookup fails
    try {
      const cadences = await supabaseGet(
        `${supabase_url}/rest/v1/cadences?id=eq.${cadence_id}&select=id,name&limit=1`,
        supabase_key
      );
      if (cadences && cadences.length > 0) {
        cadenceName = cadences[0].name || cadence_id;
      }
    } catch (err) {
      console.warn('Cadence metadata lookup failed (non-fatal):', err.message);
    }

    // -----------------------------------------------------------------------
    // 2. Fetch email steps ordered by sequence_num
    // -----------------------------------------------------------------------
    const emailSteps = await supabaseGet(
      `${supabase_url}/rest/v1/cadence_emails?cadence_id=eq.${cadence_id}&order=sequence_num`,
      supabase_key
    );

    // -----------------------------------------------------------------------
    // 3. Fetch SMS steps ordered by sequence_num
    // -----------------------------------------------------------------------
    const smsSteps = await supabaseGet(
      `${supabase_url}/rest/v1/cadence_sms?cadence_id=eq.${cadence_id}&order=sequence_num`,
      supabase_key
    );

    // -----------------------------------------------------------------------
    // 4. Create enrollment record
    // -----------------------------------------------------------------------
    const enrollmentId = generateUUID();
    const enrollment = await supabaseInsert(supabase_url, supabase_key, 'contact_cadence_enrollments', {
      id: enrollmentId,
      contact_id,
      cadence_id,
      status: 'active',
      current_step: 1,
      next_step_at: now,
      enrolled_at: now,
      created_at: now
    });

    // -----------------------------------------------------------------------
    // 5. Build all execution rows (emails + SMS)
    // -----------------------------------------------------------------------
    const executions = [];

    for (const step of (emailSteps || [])) {
      executions.push({
        id: generateUUID(),
        enrollment_id: enrollmentId,
        contact_id,
        cadence_id,
        step_id: step.id || null,
        sequence_num: step.sequence_num,
        type: 'email',
        subject: step.subject || null,
        body: step.body || step.html_body || null,
        status: 'pending',
        scheduled_at: addDays(now, step.delay_days || 0),
        created_at: now
      });
    }

    for (const step of (smsSteps || [])) {
      executions.push({
        id: generateUUID(),
        enrollment_id: enrollmentId,
        contact_id,
        cadence_id,
        step_id: step.id || null,
        sequence_num: step.sequence_num,
        type: 'sms',
        subject: null,
        body: step.message || step.body || null,
        status: 'pending',
        scheduled_at: addDays(now, step.delay_days || 0),
        created_at: now
      });
    }

    // Sort by scheduled_at ascending so sequence is deterministic
    executions.sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));

    // -----------------------------------------------------------------------
    // 6. Bulk insert executions
    // -----------------------------------------------------------------------
    let insertedExecutions = [];
    if (executions.length > 0) {
      insertedExecutions = await supabaseBulkInsert(
        supabase_url,
        supabase_key,
        'cadence_step_executions',
        executions
      );
    }

    // -----------------------------------------------------------------------
    // 7. Determine next_step_at = soonest pending step
    // -----------------------------------------------------------------------
    const nextStepAt = executions.length > 0 ? executions[0].scheduled_at : now;

    // -----------------------------------------------------------------------
    // 8. Build human-readable schedule summary
    // -----------------------------------------------------------------------
    const schedule = executions.map((exec, idx) => ({
      step: idx + 1,
      type: exec.type,
      subject: exec.subject || null,
      body_preview: exec.body ? exec.body.substring(0, 100) : null,
      scheduled_at: exec.scheduled_at
    }));

    return res.status(200).json({
      success: true,
      enrollment_id: enrollment?.id || enrollmentId,
      contact_id,
      cadence_id,
      cadence_name: cadenceName,
      steps_scheduled: executions.length,
      next_step_at: nextStepAt,
      schedule
    });
  } catch (err) {
    console.error('Enroll-cadence handler error:', err);
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
};
