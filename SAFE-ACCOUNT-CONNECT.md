# SmartSwing Account Connection (Secure)

This machine cannot directly control your logged-in browser sessions.  
Use the steps below once, then I can continue from terminal safely.

## 1) GitHub auth (required for push/deploy)

Run:

```powershell
& "C:\Program Files\GitHub CLI\gh.exe" auth login --hostname github.com --git-protocol https --web
& "C:\Program Files\GitHub CLI\gh.exe" auth status
```

After this, I can push updates to `https://github.com/bemedrado-glitch/smartswing`.

## 2) Supabase auth (required for DB/storage automation)

Use your Supabase dashboard to create a Personal Access Token:
- Supabase dashboard -> Account -> Access Tokens -> Create token

Then set it only in your current shell session:

```powershell
$env:SUPABASE_ACCESS_TOKEN="paste_token_here"
```

No token is stored in code, and it is never committed.

## 3) Secrets safety rules

- Keep `.env.local` out of source control.
- Never commit `service_role` keys.
- Frontend uses only public anon key (`NEXT_PUBLIC_SUPABASE_ANON_KEY`).
- Rotate tokens immediately if accidentally exposed.

## 4) Migration file ready

Core migration prepared at:

`supabase/migrations/20260319_smartswing_core.sql`

Includes:
- profiles, assessments, coach_sessions, contact_messages
- RLS policies
- auth trigger for profile creation
- private storage bucket `tennis-videos` + object policies
- performance indexes
