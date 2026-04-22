# Brand Tokens Migration Guide (M1 + M3 from audit)

The audit flagged:
- **9 font families** in use (Inter, Plus Jakarta Sans, DM Sans, Sora, Manrope, etc.)
- **Two button systems** (pill `999px` vs rounded `14px`)
- **Drifted color tokens** (`--cyan: #ffd84d`, `--orange: #ffd84d`)

## What's now canonical

### Fonts (M1 — already migrated)

Five pages migrated in PR #94:
- `dashboard.html` — Plus Jakarta Sans → DM Sans (Sora retained for display)
- `settings.html` — Plus Jakarta Sans → DM Sans
- `login.html` — Inter → DM Sans
- `signup.html` — Inter → DM Sans
- `marketing.html` — dropped Inter, kept DM Sans

Remaining pages already use DM Sans or DM Sans + Sora. Only `smartswing-technical-docs.html` still loads Inter + Plus Jakarta + JetBrains Mono (code-heavy page — can migrate later, low priority).

### Radii (M3 — tokens ready, migration opt-in)

**Two canonical shapes:**
- `var(--ss-radius-pill)` (999px) — primary CTAs, chips, badges, avatars
- `var(--ss-radius-lg)` (14px) — panel buttons, cards, form controls on app pages
- `var(--ss-radius-md)` (10px) — inputs, small controls
- `var(--ss-radius-sm)` (6px) — tiny chips, tags, code elements

### Colors + typography + spacing

See `brand-tokens.css` for the full token set. Canonical variables exported under `--ss-*` namespace:
- Colors: `--ss-volt`, `--ss-gold`, `--ss-red`, etc.
- Fonts: `--ss-font-body`, `--ss-font-display`, `--ss-font-mono`
- Spacing: `--ss-space-1` through `--ss-space-8`
- Motion: `--ss-duration-fast`, `--ss-ease`
- Elevation: `--ss-shadow-sm`, `--ss-shadow-md`, `--ss-shadow-lg`

## How to use on new pages

```html
<head>
  <!-- preferably as the first stylesheet so other CSS can reference tokens -->
  <link rel="stylesheet" href="./brand-tokens.css">
</head>

<style>
  .my-cta { border-radius: var(--ss-radius-pill); }
  h1      { font-family: var(--ss-font-display); }
  .panel  { background: var(--ss-bg-soft); border: 1px solid var(--ss-line); }
</style>

<!-- Or use utility classes directly: -->
<button class="ss-btn-primary">Start Free Analysis</button>
<a class="ss-btn-ghost" href="./pricing.html">View pricing</a>
<button class="ss-btn-app">Save</button>
```

## Migration strategy for existing pages

Don't mass-migrate — too risky for cosmetic gain. Instead:

1. **Include `brand-tokens.css`** on any page you're already editing for other reasons
2. **Replace hardcoded colors/radii/fonts** with `var(--ss-*)` tokens as you touch them
3. **When renaming a component**, swap to utility classes (`ss-btn-primary` etc.)
4. Over 3-5 sprints, the site converges on the tokens without a single risky PR

## Radius decision rule of thumb

**Use pill when:**
- The element is a primary action ("Start Free", "Book Demo", "Sign Up")
- It's a chip or badge (status pill, stage badge)
- It's an avatar or icon circle

**Use 14px rounded when:**
- It's inside a panel or card (Save / Cancel / secondary buttons)
- It's a form input or dropdown
- It's on an app page (dashboard, settings, analyze) where a pill looks too marketing-y

When in doubt on an app page: `--ss-radius-lg` (14px). When in doubt on a marketing page: `--ss-radius-pill` (999px).

## Pages NOT yet migrated to tokens

Every HTML page except new ones (`shared-footer.js`, `skeleton-loader.css`, `brand-tokens.css`). Migrate incrementally.
