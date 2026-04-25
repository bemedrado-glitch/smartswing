# SmartSwing AI — Lead Harvester (Workstream A)

**Goal**: build a pluggable harvester that pulls publicly-listed B2B
tennis contacts (clubs, coaches, academies) from federation directories
across the 10 largest tennis countries and lands them in
`marketing_contacts` with proper consent + source tagging.

## What this is — and is NOT

**This system harvests:**
- Tennis clubs from federation public club-finders
- Certified coaches from federation public coach directories
- Junior academies + tennis camps from federation listings
- All sourced from pages **explicitly published for prospective members
  to find a club / coach / academy** — i.e. published *for the purpose
  of being contacted*

**This system does NOT and will not:**
- Scrape individual amateur or recreational player profiles
- Pull contact info from auth-walled sites (LinkedIn, Instagram,
  competitor apps, USTA League player profiles)
- Touch any breach-sourced data
- Store anything without `consent_status` + `data_source` provenance

Every row inserted is tagged with:
- `data_source = 'federation:<id>'` (e.g., `federation:USTA`)
- `consent_status = 'public-directory'` (the legal basis is "the contact
  was published for the explicit purpose of being contacted by
  prospective members" — this is a documented "legitimate interest"
  under GDPR Recital 47 for B2B contact data)
- `enrichment_source = 'lead-harvest:v1'`
- `enrichment_batch = '<ISO date>:<federation>:<run-id>'`
- `persona = 'club' | 'coach' | 'academy'`

The cadence engine respects `consent_status` — outreach to these rows
will use the B2B opt-out template, not the same flow as opt-in
SmartSwing users.

## Architecture

```
tools/lead-harvest/
  ├── README.md                 ← you are here
  ├── competitor-intel.md       ← legitimate ways to reach competitor users
  ├── harvest.js                ← entry point: `node tools/lead-harvest/harvest.js [--source=usta]`
  ├── _lib/
  │   ├── supabase.js           ← thin wrapper for batch upserts
  │   ├── http.js               ← fetch with timeout + UA + rate limit
  │   ├── normalise.js          ← shared address/phone/email normaliser
  │   └── audit-log.js          ← run-log persisted to /tools/lead-harvest/runs/
  └── sources/
      ├── usta.js               ← United States Tennis Association
      ├── lta.js                ← Lawn Tennis Association (UK)
      ├── tennis-australia.js   ← Tennis Australia
      └── _template.js          ← copy-paste template for new federations
```

Each source file exports:

```js
module.exports = {
  id:       'USTA',                  // matches data_source tag
  country:  'United States',
  countryCode: 'US',
  consent:  'public-directory',
  // Returns an async iterable / array of normalised lead records.
  fetch: async function (opts) { ... }
};
```

## Run a harvest

```bash
# Single source, dry-run (no DB writes, prints what would land)
node tools/lead-harvest/harvest.js --source=usta --dry-run

# Single source, live insert
node tools/lead-harvest/harvest.js --source=usta

# All registered sources
node tools/lead-harvest/harvest.js --all

# Limit per source (great for first runs)
node tools/lead-harvest/harvest.js --source=usta --limit=100
```

## Adding a new federation

1. Copy `sources/_template.js` to `sources/<your-federation>.js`
2. Implement the `fetch()` function — it should be **resilient to
   missing fields** (federation pages drop fields all the time)
3. Register the source in `harvest.js` SOURCES map
4. Test with `--dry-run --limit=5` first
5. PR with a sample of the parsed output in the description

## Legal & compliance

- Federation public-directory data is published for the purpose of being
  contacted (Recital 47 GDPR + Article 14 transparency requirements).
- Outreach uses the B2B opt-out template (see `api/_lib/cadence-runner.js`)
  with one-click unsubscribe + suppression list integration.
- Every row carries `data_source` + `consent_status` so a downstream
  audit (DPIA, complaint) can trace the legal basis row-by-row.
- Run logs persist to `tools/lead-harvest/runs/<iso>-<source>.json` for
  audit trail + idempotency.
