# Supabase OAuth Production Setup

Use this checklist after the SmartSwing public Supabase URL and anon key are available.

## SmartSwing production URLs

- Site URL: `https://www.smartswingai.com`
- OAuth callback URL: `https://www.smartswingai.com/auth-callback.html`

## Public config file

Set these values in:

- [public-app-config.js](C:/Users/bmedrado/Desktop/SmartSwing/_smartswing_repo/public-app-config.js)

```js
window.SMARTSWING_SUPABASE_CONFIG = {
  url: 'https://YOUR_PROJECT.supabase.co',
  anonKey: 'YOUR_PUBLIC_SUPABASE_ANON_KEY'
};
```

## Supabase dashboard

1. Open `Authentication -> URL Configuration`.
2. Set `Site URL` to:
   - `https://www.smartswingai.com`
3. Add redirect URL:
   - `https://www.smartswingai.com/auth-callback.html`

## Providers to enable

Enable these in `Authentication -> Providers`:

- Google
- Facebook
- Apple

## Provider console notes

### Google

- Configure the Google OAuth client in Google Cloud.
- Add the callback URL that Supabase provides for your project:
  - `https://<YOUR_PROJECT_REF>.supabase.co/auth/v1/callback`

### Facebook / Meta

- Configure Facebook Login in the Meta developer console.
- Add the same Supabase callback URL:
  - `https://<YOUR_PROJECT_REF>.supabase.co/auth/v1/callback`

### Apple

- Configure Sign in with Apple in Apple Developer.
- Add the same Supabase callback URL:
  - `https://<YOUR_PROJECT_REF>.supabase.co/auth/v1/callback`

## Important

- Use only the public anon key in the browser.
- Do not place the Supabase service role key in any public file.
- SmartSwing now routes OAuth through `auth-callback.html`, which restores the Supabase session and redirects to the correct dashboard.
