# SmartSwing Claude Code Handoff

This folder is the transfer package for continuing SmartSwing AI in Claude Code.

Use the active repo root:

- `C:\Users\bmedrado\Desktop\SmartSwing\_smartswing_repo`

Read these files in this order:

1. `CLAUDE_CODE_KICKOFF.md`
2. `WEBSITE_ARCHITECTURE.md`
3. `CUSTOMER_JOURNEY_AND_NAVIGATION.md`
4. `PLATFORMS_AND_FILES.md`
5. `CODEBASE_FILE_MAP.md`
6. `codebase-manifest.json`
7. `CODEBASE_SNAPSHOT.txt`

What this package contains:

- architecture of the current production-oriented website
- customer journey and navigation flow
- platform inventory with the exact files that control each platform
- a categorized file map of the codebase
- a machine-readable manifest of included source files
- one bundled source snapshot file for cold-start AI context transfer

Important context:

- The current, richest codebase is `_smartswing_repo`, not `_smartswing_web`.
- The site is a multi-page static HTML/CSS/vanilla JS app, not React/Next.
- Shared application state lives in `app-data.js` through `window.SmartSwingStore`.
- Auth and data sync are built around Supabase, with local browser fallback mode when cloud config is missing.
- Billing is Stripe-hosted checkout plus Vercel serverless functions.
- Deploy target is Vercel, with GitHub Actions for CI and deploy.

Recommended Claude Code workflow:

1. Open the repo at `C:\Users\bmedrado\Desktop\SmartSwing\_smartswing_repo`.
2. Read `claude-handoff/CLAUDE_CODE_KICKOFF.md`.
3. Inspect the docs in this folder before editing product files.
4. Treat `CODEBASE_SNAPSHOT.txt` as a fallback context artifact, not as the primary place to edit.
5. Make changes in the real source files, then run `npm test`.
