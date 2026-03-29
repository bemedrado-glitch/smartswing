/**
 * SmartSwing AI — Content Publish Webhook
 * POST /api/marketing/publish-webhook   — called by Make.com to publish content
 * GET  /api/marketing/publish-webhook?action=pending — returns items ready to publish
 *
 * POST request body:
 *   {
 *     content_item_id,  // UUID in content_calendar
 *     platform,         // instagram | tiktok | youtube | facebook | linkedin
 *     action,           // "publish" | "schedule"
 *     scheduled_at,     // ISO date string (for "schedule" action)
 *     supabase_url,
 *     supabase_key
 *   }
 *
 * GET ?action=pending returns all content_calendar rows with status='scheduled'
 * whose scheduled_date <= today (Make.com polls this to find items to post).
 */

'use strict';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Perform a Supabase REST GET and return the parsed JSON array.
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
 * PATCH a Supabase REST row by id.
 * @param {string} supabaseUrl
 * @param {string} key
 * @param {string} table
 * @param {string} id         UUID of the row to update
 * @param {object} patch      Fields to update
 * @returns {Promise<object>} updated row
 */
async function supabasePatch(supabaseUrl, key, table, id, patch) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: JSON.stringify(patch)
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => response.statusText);
    throw new Error(`Supabase PATCH ${table}/${id} failed (${response.status}): ${errText}`);
  }

  const result = await response.json();
  return Array.isArray(result) ? result[0] : result;
}

/**
 * POST (insert) a row, returning the inserted record.
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
 * Return today's date in YYYY-MM-DD format (UTC).
 */
function todayUTC() {
  return new Date().toISOString().split('T')[0];
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

module.exports = async function handler(req, res) {
  // -------------------------------------------------------------------------
  // GET — polling endpoint for Make.com
  // -------------------------------------------------------------------------
  if (req.method === 'GET') {
    const { action, supabase_url, supabase_key } = req.query || {};

    if (action !== 'pending') {
      return res.status(400).json({
        error: 'Invalid action. Use ?action=pending to poll for publishable items.'
      });
    }

    if (!supabase_url || !supabase_key) {
      return res.status(400).json({ error: 'supabase_url and supabase_key query params are required' });
    }

    try {
      const today = todayUTC();

      // Fetch all scheduled items whose scheduled_date is today or in the past
      const items = await supabaseGet(
        `${supabase_url}/rest/v1/content_calendar?status=eq.scheduled&scheduled_date=lte.${today}&order=scheduled_date`,
        supabase_key
      );

      return res.status(200).json({
        success: true,
        count: (items || []).length,
        items: items || []
      });
    } catch (err) {
      console.error('Publish-webhook GET error:', err);
      return res.status(500).json({ error: 'Internal server error', message: err.message });
    }
  }

  // -------------------------------------------------------------------------
  // POST — Make.com triggers this when it's time to publish
  // -------------------------------------------------------------------------
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    content_item_id,
    platform,
    action,
    scheduled_at,
    supabase_url,
    supabase_key
  } = req.body || {};

  // Validation
  if (!content_item_id) {
    return res.status(400).json({ error: 'content_item_id is required' });
  }
  if (!platform) {
    return res.status(400).json({ error: 'platform is required' });
  }
  if (!action || !['publish', 'schedule'].includes(action)) {
    return res.status(400).json({ error: 'action must be "publish" or "schedule"' });
  }
  if (!supabase_url || !supabase_key) {
    return res.status(400).json({ error: 'supabase_url and supabase_key are required' });
  }

  const validPlatforms = ['instagram', 'tiktok', 'youtube', 'facebook', 'linkedin'];
  if (!validPlatforms.includes(platform)) {
    return res.status(400).json({
      error: `Invalid platform. Must be one of: ${validPlatforms.join(', ')}`
    });
  }

  const now = new Date().toISOString();

  try {
    // -----------------------------------------------------------------------
    // 1. Fetch the content item from content_calendar
    // -----------------------------------------------------------------------
    const items = await supabaseGet(
      `${supabase_url}/rest/v1/content_calendar?id=eq.${content_item_id}&limit=1`,
      supabase_key
    );

    if (!items || items.length === 0) {
      return res.status(404).json({
        error: 'Content item not found',
        content_item_id
      });
    }

    const contentItem = items[0];

    // -----------------------------------------------------------------------
    // 2. Update / insert social_publish_queue entry — mark as 'publishing'
    // -----------------------------------------------------------------------
    let queueEntry = null;
    try {
      // Try to find an existing queue entry for this item + platform
      const existingQueue = await supabaseGet(
        `${supabase_url}/rest/v1/social_publish_queue?content_item_id=eq.${content_item_id}&platform=eq.${platform}&limit=1`,
        supabase_key
      );

      if (existingQueue && existingQueue.length > 0) {
        queueEntry = await supabasePatch(
          supabase_url,
          supabase_key,
          'social_publish_queue',
          existingQueue[0].id,
          { status: 'publishing', updated_at: now }
        );
      } else {
        queueEntry = await supabaseInsert(supabase_url, supabase_key, 'social_publish_queue', {
          content_item_id,
          platform,
          status: 'publishing',
          action,
          scheduled_at: scheduled_at || now,
          created_at: now,
          updated_at: now
        });
      }
    } catch (queueErr) {
      // Non-fatal — queue table may not exist yet; log and continue
      console.warn('social_publish_queue update warning (non-fatal):', queueErr.message);
    }

    // -----------------------------------------------------------------------
    // 3. Platform-specific publishing intent logging
    //    (Real API calls to Instagram/TikTok/YouTube/etc. would go here.
    //     For now we log intent and mark the item ready for Make.com to post.)
    // -----------------------------------------------------------------------
    console.log(`[publish-webhook] Intent to ${action} on ${platform}:`, {
      content_item_id,
      title: contentItem.title,
      scheduled_at: scheduled_at || now
    });

    // -----------------------------------------------------------------------
    // 4. Update content_calendar status to 'scheduled' (or 'published')
    // -----------------------------------------------------------------------
    const newStatus = action === 'publish' ? 'published' : 'scheduled';
    const calendarPatch = {
      status: newStatus,
      platform,
      updated_at: now
    };
    if (action === 'schedule' && scheduled_at) {
      calendarPatch.scheduled_date = scheduled_at.split('T')[0];
    }

    let updatedItem = null;
    try {
      updatedItem = await supabasePatch(
        supabase_url,
        supabase_key,
        'content_calendar',
        content_item_id,
        calendarPatch
      );
    } catch (patchErr) {
      console.warn('content_calendar PATCH warning:', patchErr.message);
      // Return the original item if the patch fails
      updatedItem = contentItem;
    }

    // -----------------------------------------------------------------------
    // 5. Mark queue entry as 'ready' so Make.com knows to post
    // -----------------------------------------------------------------------
    if (queueEntry?.id) {
      try {
        await supabasePatch(
          supabase_url,
          supabase_key,
          'social_publish_queue',
          queueEntry.id,
          { status: 'ready', updated_at: now }
        );
      } catch (err) {
        console.warn('Queue entry ready update warning (non-fatal):', err.message);
      }
    }

    // -----------------------------------------------------------------------
    // 6. Return the full content item so Make.com can use it to post
    // -----------------------------------------------------------------------
    const finalItem = updatedItem || contentItem;

    return res.status(200).json({
      success: true,
      content_item: finalItem,
      platform,
      action,
      ready_to_post: true,
      copy_text: finalItem.copy_text || '',
      title: finalItem.title || ''
    });
  } catch (err) {
    console.error('Publish-webhook POST error:', err);
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
};
