# SMS Runbook — "sent but not received"

## TL;DR

AWS SNS returns a `MessageId` as soon as it **accepts** a Publish call. Acceptance is not delivery. The provider was happily telling us "sent" while AWS was silently dropping messages.

Code fixes (this session):
- `api/marketing.js` — `handleSendSms` and `handleSendBulkSms` now normalize phone to E.164 and default to `Transactional` (was `Promotional`)
- Response is now honest: `status: "accepted_by_sns"`, `delivery_guaranteed: false`
- New endpoint `GET /api/marketing/sms-diagnostics` checks the 4 silent-drop failure modes

## Run the diagnostic after deploy

```
curl -s "https://<your-vercel-domain>/api/marketing/sms-diagnostics" | jq
```

Returns a JSON report with `checks` (current AWS state) and `remediation` (exactly what to fix).

## The 4 silent killers, ranked by likelihood

### 1. SMS Sandbox (most common for new AWS accounts) — CRITICAL

**Symptom:** messages to any phone number not on the verified list drop silently, including your own.

**Fix:**
1. AWS Console → **SNS → Text messaging (SMS) → Sandbox destination phone numbers**
2. Add target phone number, click **Verify** → enter the 6-digit code AWS sends
3. For production: open Support case → service `SNS` → category `SMS` → "Request production SMS access". Usually approved in 24h.

### 2. Unverified toll-free origination number — HIGH

**Symptom:** AT&T and T-Mobile recipients never receive; Verizon may.

**Fix:**
1. AWS Console → **End User Messaging → Phone numbers** → click your TFN
2. If **Registration Status** ≠ `COMPLETE`: go to **Registrations** tab → start Toll-Free Verification → fill out use-case form. Takes 2–5 business days.
3. Set `AWS_SMS_ORIGINATION_NUMBER` env var in Vercel to your *verified* number (not the hardcoded fallback `+18885429135`).

### 3. Monthly SMS spend cap exhausted — HIGH

**Symptom:** first few sends work, then silent drops.

**Fix:**
1. AWS Console → **SNS → Text messaging → Preferences**
2. Set **Account spend limit** to a number that fits your volume. Default for new accounts: **$1/month** → exhausts fast.
3. Suggest $20 for testing, $100+ for production volume.

### 4. Promotional filtering — MEDIUM

**Symptom:** some carriers/recipients filter promo; code was sending everything as `Promotional`.

**Fix:** Already patched. New default is `Transactional`. Explicit opt-in with `{ sms_type: 'Promotional' }` in the request body for marketing blasts that include opt-out language.

## Enable delivery-status logging (do this once, then all future debug is easy)

1. AWS Console → **SNS → Text messaging → Preferences**
2. **Delivery status logging** → choose:
   - Success sample rate: `100%` (for debugging; reduce to `10%` in production)
   - Log group: `/aws/sns/{region}/{account-id}/DirectPublishToPhoneNumber`
3. After a failed send, open CloudWatch Logs for that group — the log line explains exactly why each message did or didn't deliver (e.g., `DELIVERED`, `UNKNOWN_CARRIER`, `CARRIER_BLOCKED`, `RATE_EXCEEDED`).

## Validation test

After completing steps 1–4 above:
```
curl -X POST "https://<your-vercel-domain>/api/marketing/send-sms" \
  -H "Content-Type: application/json" \
  -d '{"phone":"+1XXXXXXXXXX","message":"SmartSwing SMS test — cadence pipeline"}'
```

Then check CloudWatch Logs within 30s. Look for `deliveryStatus: DELIVERED`.
