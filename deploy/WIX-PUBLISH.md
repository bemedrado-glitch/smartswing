# Wix Publish Plan (New SmartSwing Version)

## Reality check

Wix does not let me directly edit your logged-in site from this terminal session.
I prepared the app to be deployment-ready and Wix-embed-ready.

## What is ready now

- Self-contained app assets under `assets/` (no external parent-folder references).
- Full app and tests passing.
- Release builder script:
  - `deploy/build-release.ps1`
- Wix iframe snippet:
  - `deploy/wix-embed-snippet.html`

## Recommended deployment flow

1. Host this app as a standalone site (Vercel/Netlify/GitHub Pages).
2. In Wix, replace the current website content with a full-screen embed page that loads that hosted URL.
3. Keep Wix for domain/marketing/navigation, keep app runtime on the deployed host.

This is the most stable way to run TensorFlow/video analysis in Wix context.

## Wix steps (manual, 10-15 minutes)

1. Open your Wix dashboard.
2. Create a new blank page: `SmartSwing App`.
3. Add element: `Embed Code` -> `Embed a Widget`.
4. Paste code from `deploy/wix-embed-snippet.html`.
5. Replace `https://YOUR-SMARTSWING-APP-URL` with your deployed URL.
6. Stretch the embed component to full page width/height.
7. Set this page as homepage, or route your CTA buttons to this page.
8. Publish.

## Security guardrails

- Never paste Supabase `service_role` keys into Wix custom code.
- Only frontend-safe keys (anon/public) are allowed in client code.
- Keep private keys only in host environment variables (Vercel/Netlify/GitHub Actions secrets).
- Do not store personal data in Wix page code.

## Build package command

From project root (`_smartswing_web`):

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\build-release.ps1
```

Output:

- `dist/smartswing-release.zip`
