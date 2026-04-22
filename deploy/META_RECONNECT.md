# Reconnect Meta (Facebook + Instagram) — Token Rotation

## Why this happens

Meta Page Access Tokens look permanent but aren't truly:
- They inherit the **expiration of the user token** that minted them
- If the Meta user (you) rotates password, disconnects the app, or Meta's automated trust system flags suspicious activity, ALL tokens derived from your account are invalidated
- Scope changes on the Meta app re-prompt for consent — old tokens lose the new scopes

You'll see `/api/marketing/social-health` return `META_100` error on both `meta_facebook` and `meta_instagram` when this happens.

## First: diagnose

```bash
curl https://www.smartswingai.com/api/marketing/meta-token-diagnostics
```

Response tells you EXACTLY what's wrong:

| `error_code` | Meaning | Fix path |
|---|---|---|
| `OK` | Token valid + all scopes present | Not a token issue — investigate META_PAGE_ID / META_IG_ACCOUNT_ID instead |
| `TOKEN_EXPIRED` | Token expired (date shown in response) | Run **Path A** below (60 seconds) |
| `MISSING_SCOPES` | Token valid but lacks required permissions | Run **Path B** (3 minutes — Graph API Explorer) |
| `TOKEN_INVALID` | Revoked or malformed | Run **Path B** |
| `MISSING_TOKEN` / `MISSING_APP_CREDENTIALS` | Env vars missing in Vercel | Set them, redeploy |
| `DEBUG_TOKEN_FAILED` | `META_APP_ID` / `META_APP_SECRET` don't match the app that minted the token | Confirm they're from the SAME Meta app in developers.facebook.com |

---

## Path A — Token expired (fastest)

If `/meta-token-diagnostics` shows `is_expired: true` and the rest looks fine, just mint a new long-lived page token:

```bash
curl -X POST https://www.smartswingai.com/api/marketing/meta-token-exchange
```

The response contains `permanent_page_token`. Copy it, paste into Vercel → Environment Variables → `META_PAGE_ACCESS_TOKEN` → Save → Redeploy.

**⚠️ Caveat:** this path works only if your CURRENT token is still a valid short-lived token (within its 60-day window). If the error is `TOKEN_EXPIRED` because it's been months, you need Path B.

---

## Path B — Full reconnect (~3 minutes)

### Step 1 — Graph API Explorer

Open: https://developers.facebook.com/tools/explorer/

1. **Meta App** dropdown (top right) — select your SmartSwing app (or create one if you haven't)
2. **User or Page** dropdown — select **User Token**
3. Click **Generate Access Token**
4. Check ALL these permissions:
   - `pages_show_list`
   - `pages_read_engagement`
   - `pages_manage_posts`
   - `instagram_basic`
   - `instagram_manage_insights`
   - `instagram_content_publish`
   - `business_management`
5. Click **Generate Token** → Meta pops a consent dialog → approve
6. Copy the token that appears

### Step 2 — Convert to long-lived + page token

In Graph API Explorer, change the URL to:
```
/oauth/access_token?grant_type=fb_exchange_token&client_id={APP_ID}&client_secret={APP_SECRET}&fb_exchange_token={SHORT_LIVED_TOKEN}
```
Replace `{APP_ID}`, `{APP_SECRET}`, `{SHORT_LIVED_TOKEN}`. Click Submit. Response contains a 60-day user token.

Then call `/me/accounts?access_token={LONG_LIVED_TOKEN}` — response lists your pages with their `access_token`. The page token is **permanent** (does not expire as long as user token was valid at creation time).

### Step 3 — Update Vercel

Copy the page's `access_token` → Vercel → Environment Variables → `META_PAGE_ACCESS_TOKEN` → Save → **Deployments → latest → ⋯ → Redeploy**.

### Step 4 — Verify

```bash
# Confirm token is healthy
curl https://www.smartswingai.com/api/marketing/meta-token-diagnostics

# Confirm FB + IG both now show connected
curl https://www.smartswingai.com/api/marketing/social-health
```

Both should return `ok: true` / `connected: true`. Reload the marketing dashboard — Instagram + Facebook status should turn green.

---

## Preventing this next time

- **Set a calendar reminder** to re-check every 45 days (before the 60-day exchange window closes)
- **Use a Meta System User** instead of a personal account: Business Settings → Users → System Users → Add → generate a never-expiring token scoped to the business (same pattern we used for WhatsApp in PR #73)
- **Subscribe to token expiry webhook**: Meta can call your app when a user's permissions change

System user tokens are the gold standard — they don't expire unless the system user is deleted, and they survive the personal Facebook account owner changing their password or leaving the organization.
