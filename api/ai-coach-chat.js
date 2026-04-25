/**
 * SmartSwing AI — AI Coach Chat Endpoint
 *
 * POST /api/ai-coach-chat
 * Body: { message, audience: 'coach'|'player', history?: [{role,content}], userId? }
 * Returns: { reply, source: 'faq'|'llm', matchedFaqId?, latencyMs, tokens? }
 *
 * Pipeline:
 *   1. Cheap keyword match against coach_faqs (zero token cost)
 *   2. If no FAQ match (or weak score), fall back to OpenAI gpt-4o-mini
 *   3. Log every Q/A to coach_chat_logs for QA + cost tracking
 *
 * Why server-side: keeps OPENAI_API_KEY out of the browser. The previous
 * gpt-integration-secure.js shipped the key to the client, which is unsafe
 * for an interactive chat (any user could exfiltrate the key).
 *
 * Required env vars:
 *   OPENAI_API_KEY              — for LLM fallback
 *   SUPABASE_URL                — for FAQ lookup + logging
 *   SUPABASE_SERVICE_ROLE_KEY   — for service-role inserts to coach_chat_logs
 */

const RESEND_BACKED_MAX_BYTES = 16 * 1024; // 16 KB — chat history can grow
const FAQ_MATCH_MIN_SCORE = 2;             // need 2+ keyword hits to skip LLM
const OPENAI_MODEL = 'gpt-4o-mini';        // cheap, fast, good enough for chat
const OPENAI_MAX_TOKENS = 400;
const HISTORY_MAX_TURNS = 8;               // last 8 turns kept in LLM context

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > RESEND_BACKED_MAX_BYTES) {
        reject(new Error('Request body too large'));
        return;
      }
      raw += chunk.toString('utf8');
    });
    req.on('end', () => {
      try { resolve(JSON.parse(raw || '{}')); }
      catch { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

// ── Lazy supabase client (service role) ──────────────────────────────────────
let _supabase = null;
function getSupabase() {
  if (_supabase) return _supabase;
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  try {
    const { createClient } = require('@supabase/supabase-js');
    _supabase = createClient(url, key, { auth: { persistSession: false } });
    return _supabase;
  } catch (e) {
    console.error('[ai-coach-chat] Supabase client init failed:', e.message);
    return null;
  }
}

// ── FAQ matcher ──────────────────────────────────────────────────────────────
/**
 * Score = number of FAQ keywords present in the question (case-insensitive,
 * substring match). Ties broken by lower priority value, then by longer
 * keyword match (more specific). Returns null if best score < threshold.
 */
async function findBestFaq(question, audience) {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('coach_faqs')
    .select('id,question,answer,keywords,priority,audience')
    .in('audience', [audience, 'both'])
    .eq('active', true);
  if (error || !Array.isArray(data) || !data.length) return null;

  const q = String(question || '').toLowerCase();
  let best = null;
  for (const faq of data) {
    const kws = Array.isArray(faq.keywords) ? faq.keywords : [];
    let score = 0;
    let totalLen = 0;
    for (const kw of kws) {
      const k = String(kw || '').toLowerCase().trim();
      if (k && q.includes(k)) {
        score += 1;
        totalLen += k.length;
      }
    }
    if (score < FAQ_MATCH_MIN_SCORE) continue;
    const candidate = { faq, score, totalLen, priority: faq.priority || 100 };
    if (
      !best ||
      candidate.score > best.score ||
      (candidate.score === best.score && candidate.priority < best.priority) ||
      (candidate.score === best.score && candidate.priority === best.priority && candidate.totalLen > best.totalLen)
    ) {
      best = candidate;
    }
  }
  return best ? best.faq : null;
}

// ── LLM fallback ─────────────────────────────────────────────────────────────
function getSystemPrompt(audience) {
  if (audience === 'coach') {
    return `You are an expert tennis & pickleball coaching assistant inside the SmartSwing AI app, talking to a tennis COACH. Be specific, practical, and concise — like a peer coach giving advice in the locker room. Give one drill or one tactical idea per response, not a wall of text. Reference body mechanics when relevant (hip-shoulder sequencing, contact point, kinetic chain). For injury questions, always recommend a sports physio referral. Never recommend specific brands. Keep replies under 120 words.`;
  }
  return `You are a friendly tennis & pickleball coach inside the SmartSwing AI app, talking to a PLAYER. Be encouraging but honest. Give ONE actionable tip per response. No jargon — use words a 12-year-old would understand. For injury questions, always advise stopping play and seeing a sports physio. Never recommend specific racquet brands. Keep replies under 100 words.`;
}

function trimHistory(history) {
  if (!Array.isArray(history)) return [];
  // Keep only last HISTORY_MAX_TURNS valid {role, content} entries
  return history
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-HISTORY_MAX_TURNS)
    .map(m => ({ role: m.role, content: String(m.content).slice(0, 1000) }));
}

async function askOpenAI(question, audience, history) {
  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) {
    return { error: 'OPENAI_API_KEY not configured' };
  }

  const messages = [
    { role: 'system', content: getSystemPrompt(audience) },
    ...trimHistory(history),
    { role: 'user', content: String(question).slice(0, 1500) }
  ];

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages,
        temperature: 0.6,
        max_tokens: OPENAI_MAX_TOKENS
      })
    });
    const data = await res.json();
    if (!res.ok) {
      return { error: data?.error?.message || `OpenAI HTTP ${res.status}` };
    }
    const reply = data?.choices?.[0]?.message?.content?.trim();
    if (!reply) return { error: 'OpenAI returned empty reply' };
    const inputTokens = data?.usage?.prompt_tokens || 0;
    const outputTokens = data?.usage?.completion_tokens || 0;
    const totalTokens = data?.usage?.total_tokens || (inputTokens + outputTokens);
    // gpt-4o-mini pricing: $0.15/M input, $0.60/M output (Apr-2026)
    const cost = (inputTokens / 1e6) * 0.15 + (outputTokens / 1e6) * 0.60;
    return { reply, tokens: totalTokens, cost };
  } catch (e) {
    return { error: e.message || 'OpenAI request failed' };
  }
}

// ── Logging ──────────────────────────────────────────────────────────────────
async function logChat({ userId, audience, question, answer, source, matchedFaqId, tokens, cost, latencyMs }) {
  const supabase = getSupabase();
  if (!supabase) return; // Best-effort logging only
  try {
    await supabase.from('coach_chat_logs').insert({
      user_id: userId || null,
      audience,
      question: String(question).slice(0, 4000),
      answer: String(answer).slice(0, 8000),
      source,
      matched_faq_id: matchedFaqId || null,
      tokens_used: tokens || null,
      cost_usd: cost || null,
      latency_ms: latencyMs || null
    });
  } catch (e) {
    console.warn('[ai-coach-chat] log insert failed:', e.message);
  }
}

// ── Handler ──────────────────────────────────────────────────────────────────
module.exports = async (req, res) => {
  const allowedOrigin = process.env.PUBLIC_APP_URL || 'https://www.smartswingai.com';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { error: 'Method not allowed' });
  }

  let body;
  try { body = await readBody(req); }
  catch (e) { return json(res, 400, { error: e.message || 'Invalid request body' }); }

  const message = String(body.message || '').trim();
  const audience = body.audience === 'coach' ? 'coach' : 'player';
  const history = body.history;
  const userId = body.userId || null;
  if (!message) return json(res, 400, { error: 'message is required' });
  if (message.length > 1500) return json(res, 400, { error: 'message too long (1500 char max)' });

  const t0 = Date.now();

  // 1) Try FAQ match
  let faq = null;
  try { faq = await findBestFaq(message, audience); }
  catch (e) { console.warn('[ai-coach-chat] FAQ lookup failed:', e.message); }

  if (faq) {
    const latencyMs = Date.now() - t0;
    logChat({
      userId, audience, question: message, answer: faq.answer,
      source: 'faq', matchedFaqId: faq.id, latencyMs
    });
    return json(res, 200, {
      reply: faq.answer,
      source: 'faq',
      matchedFaqId: faq.id,
      latencyMs
    });
  }

  // 2) Fall back to LLM
  const llm = await askOpenAI(message, audience, history);
  const latencyMs = Date.now() - t0;

  if (llm.error) {
    // Graceful degradation — return a polite stub so the UI never looks broken
    const fallback = audience === 'coach'
      ? "I don't have a specific answer for that yet. For tactical or technique questions, try rephrasing with the shot type (forehand/backhand/serve) or the player's level (e.g. 4.0). For injuries, always refer to a sports physio."
      : "I don't have a specific answer for that yet. Try asking about a specific shot (forehand, serve, volley), a tactical situation, or your SmartSwing report. For pain or injury, please stop and see a sports physio.";
    logChat({
      userId, audience, question: message, answer: fallback,
      source: 'error', latencyMs
    });
    return json(res, 200, {
      reply: fallback,
      source: 'error',
      latencyMs,
      error: llm.error
    });
  }

  logChat({
    userId, audience, question: message, answer: llm.reply,
    source: 'llm', tokens: llm.tokens, cost: llm.cost, latencyMs
  });

  return json(res, 200, {
    reply: llm.reply,
    source: 'llm',
    tokens: llm.tokens,
    cost: llm.cost,
    latencyMs
  });
};
