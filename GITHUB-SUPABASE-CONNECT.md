# GitHub + Supabase Connection Checklist

## 1) Supabase project setup

1. Open Supabase SQL editor.
2. Run migrations in order:
   - `supabase/migrations/20260319_smartswing_core.sql`
   - `supabase/migrations/20260319_smartswing_sync_extensions.sql`
   - `supabase/migrations/20260319_smartswing_retention_loop.sql`
3. Verify buckets exist:
   - `tennis-videos` (private)
   - `analysis-reports` (private)

## 2) Frontend Supabase config

In browser console (or app bootstrap script), set public config:

```js
localStorage.setItem('smartswing_supabase_config', JSON.stringify({
  url: 'https://YOUR_PROJECT.supabase.co',
  anonKey: 'YOUR_PUBLIC_ANON_KEY'
}));
```

Only public anon key belongs in client code.

## 3) GitHub Actions secrets

In GitHub repo settings -> Secrets and variables -> Actions, add:

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

Never commit:
- Supabase service role key
- OpenAI secret keys
- Any personal tokens

## 4) What is now connected

- App auth and sync can use Supabase when config exists.
- Assessments, goals, drill assignments, progress events, and coach sessions are saved locally and synced to API tables.
- Contact messages can sync to Supabase.
- Optional artifact upload hook for videos/reports is available.
- GitHub CI/deploy workflows are scaffolded.
