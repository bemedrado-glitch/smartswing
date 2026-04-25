# Manifests — curated seed data per federation

Each `<federation>.json` file is a hand-vetted seed list of B2B contacts
sourced from the federation's **public** club-finder / coach-directory
pages. These are "trust me" entries — every record was confirmed via
the federation's own public listing on the date in `_meta.fetched_at`.

Manifests exist because:
- Most federation directories sit behind Cloudflare and don't respond
  reliably to serverless scrapers
- A curated seed of 50-100 verified records per country (the largest
  academies, USTA-ranked clubs, etc.) outperforms 10k scraped rows
  that turn out to be dead emails or misformatted addresses
- New manifests can be added without writing code — the `manifest`
  source picks them up automatically

## Schema

```json
{
  "_meta": {
    "federation_id": "USTA",
    "country": "United States",
    "country_code": "US",
    "fetched_at": "2026-04-25",
    "fetched_from": "https://www.usta.com/en/home/play/find-a-place-to-play.html",
    "consent_basis": "public-directory",
    "notes": "Top 50 USTA-ranked tennis academies + flagship sectional clubs"
  },
  "records": [
    {
      "persona": "academy",
      "name": "IMG Academy Tennis",
      "email": "tennisinquiries@imgacademy.com",
      "phone": "+1 941-749-8323",
      "website": "https://www.imgacademy.com/sports/tennis",
      "city": "Bradenton",
      "state": "FL",
      "address": "5650 Bollettieri Blvd, Bradenton, FL 34210"
    }
  ]
}
```

## Adding a new manifest

1. Create `manifests/<federation-id>.json` (lowercase id)
2. Copy + populate the schema above
3. Run `node tools/lead-harvest/harvest.js --source=<federation-id>`
4. Records flow into `marketing_contacts` with proper provenance tagging

The harvester is idempotent — running the same manifest twice will
update existing rows on `email` conflict, never duplicate.
