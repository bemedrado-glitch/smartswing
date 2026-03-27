# Claude Code Kickoff Prompt

Paste the block below into Claude Code if you want a strong cold start:

```text
You are continuing work on the SmartSwing AI website.

Project root:
C:\Users\bmedrado\Desktop\SmartSwing\_smartswing_repo

Before changing code, read these files in order:
1. claude-handoff/WEBSITE_ARCHITECTURE.md
2. claude-handoff/CUSTOMER_JOURNEY_AND_NAVIGATION.md
3. claude-handoff/PLATFORMS_AND_FILES.md
4. claude-handoff/CODEBASE_FILE_MAP.md
5. claude-handoff/codebase-manifest.json

If you need a cold-start snapshot of the source, use:
claude-handoff/CODEBASE_SNAPSHOT.txt

Current product shape:
- Multi-page static website served on Vercel
- Frontend is HTML + CSS + vanilla JavaScript
- Shared client state and business logic live in app-data.js under window.SmartSwingStore
- Auth, database, and storage are handled by Supabase
- Paid plans use Stripe-hosted checkout through Vercel serverless functions in /api
- GitHub Actions runs smoke tests and deploys to Vercel

Critical implementation details:
- This is not a React or Next.js app
- Local browser mode exists as a fallback when Supabase runtime config is missing
- Auth pages rely on public-app-config.js and /api/runtime-config.js
- Payment state is synchronized both on redirect verification and Stripe webhooks
- The main analysis experience is analyze.html plus app-data.js and the biomechanics scripts

Working rules:
- Prefer editing existing files over introducing a framework rewrite
- Preserve the shared SmartSwingStore patterns unless a refactor is explicitly requested
- Keep Vercel, Stripe, and Supabase integrations intact
- Run npm test after meaningful changes
- Be careful not to include node_modules, dist, .vercel, qa artifacts, or browser test profiles in handoff outputs

When you respond after reading the docs, summarize:
1. current architecture
2. critical product flows
3. likely files to touch for the requested task
```
