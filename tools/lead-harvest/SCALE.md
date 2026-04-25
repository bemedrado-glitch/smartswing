# Scaling Workstream A — from 91 to 10,000+ leads

The initial seed (`harvest.js` + 10 manifests) lands **91 hand-curated B2B
contacts across 11 countries** in `marketing_contacts`. Every row is
visible in the marketing dashboard's Contacts tab, filterable by source
(`Internet Leads → federation:USTA`, etc.) or by `lead-harvest:any` for
the whole batch.

This doc describes how to grow that 91 to "the largest list possible"
without crossing the legal/deliverability cliff.

## The 4 axes of scale

### Axis 1 — More manifests (additive, weeks)

Easiest scale lever. Each new manifest adds 50-300 leads. Untapped
federations + organizations to manifest next:

| Manifest to add | Est. yield | Effort |
|---|---|---|
| `usta-sections-detail.json` — full 17 USTA Section staff lists | +200 | 2-3 hrs research |
| `lta-coaching-academies.json` — every LTA-accredited academy | +400 | 3-4 hrs |
| `fft-comites-departementaux.json` — FFT department offices | +100 | 2 hrs |
| `dtb-landesverbande.json` — all 18 German state federations | +180 | 2 hrs |
| `ncaa-d1-tennis.json` — every NCAA D1 men's + women's program | +600 | 4-6 hrs |
| `itf-coach-conference-speakers.json` — public speaker lists | +150 | 1 hr |
| `wta-tour-managers.json` — public WTA tour-event director list | +60 | 1 hr |
| `pickleball-federations.json` — APP, PPA, USA Pickleball | +120 | 2 hrs |
| `tennis-magazine-editors.json` — Tennis.com, Tennis Now, etc. | +40 | 1 hr |
| `tournament-organizers-utr.json` — UTR-rated tournament orgs | +500 | 4-6 hrs |

**Total potential from manifests alone: ~2,400 verified leads.** No
scraping risk, every row hand-vetted.

### Axis 2 — Live federation API harvesters (10x lift, when we have proxies)

The `sources/_template.js` pattern already exists — every modern
federation has a JSON club-finder API behind their public club-search
page. The blocker isn't the code; it's that most federation endpoints
sit behind Cloudflare / WAFs that reject requests from serverless IPs
(AWS Lambda, Vercel functions, etc.).

To unlock these:

1. Run the harvester **from a dev laptop** (residential IP) with cookies
   and a proper browser user-agent. Each successful run can yield
   500-3,000 records per federation.
2. Or proxy through a paid service (BrightData, Oxylabs) with **legitimate
   commercial use justification** documented. Cost: ~\$50-200/month.
3. Or partner with the federation directly for an API key (USTA/LTA
   both have data-partner programs for vetted SaaS vendors).

Estimated yield per federation when live API works: **3,000-15,000 rows
per run** (every clay club, every coach, every academy in that country).

### Axis 3 — B2B enrichment via Apollo / Hunter / Clearbit (paid)

For B2B contact enrichment specifically (NOT B2C scraping), Apollo.io's
free tier gives **50 lookups/month** + paid tiers scale to thousands.
Workflow:

1. Take any club/academy from your existing list (we have 91 already)
2. Apollo finds the **decision-maker** at that org (head pro, club
   manager, academy director) with name + verified business email
3. Insert the new row with the same `consent_status: public_record`
   tagging — Apollo's database is sourced from public-LinkedIn + opted-in
   business-contact aggregation, GDPR-compliant for B2B outreach

Cost: free tier covers ~50/month, ~$50/mo for 1,000 enriched contacts,
~$200/mo for 5,000. **This is how every B2B SaaS scales their
prospecting.**

### Axis 4 — Tournament-organizer co-marketing (highest yield, slow)

Sponsor ~$200-500 to ~10 UTR/USTA-sanctioned tournaments. Each
tournament organizer agrees to email-blast their participants on behalf
of the sponsor (you). Yields **80-300 self-identified tennis players
who opted in to that organizer's list per tournament**.

Math: 10 tournaments × 150 avg attendees = **1,500 verified high-intent
opt-in players per quarter**, at ~\$3-7 per lead acquisition cost.
Compare to ~$30+/lead via Meta Ads or ~\$50+ via Google Ads.

## Recommended sequence

To get from 91 → 5,000 in 90 days **with no legal risk**:

1. **Week 1-2**: Add the 10 manifests above. → ~2,500 total
2. **Week 3**: Sign up for Apollo free tier; enrich 50 highest-priority
   clubs with their head-pro names. → ~2,550
3. **Week 4-6**: Sponsor 5 USTA-sanctioned junior tournaments (~$1,250
   total). → ~3,200 (with 600 opt-in self-identified players)
4. **Week 7-12**: Run live harvesters from a dev laptop against 3-4
   federation APIs that respond well to residential IPs. → **5,000+**

To get from 5,000 → 25,000:
- Apollo paid tier ($200/mo) for systematic decision-maker enrichment
- Quarterly tournament-sponsorship cycle compounds opt-in player list
- Federation data-partnership applications (USTA + LTA both review
  vendor pitches quarterly)

## Anti-patterns (do not pursue)

- ❌ Scrape USTA League individual player profiles (auth-walled +
  explicit ToS prohibition)
- ❌ Buy bulk "tennis enthusiast" email lists from any data broker —
  these are ALWAYS scraped + repackaged garbage that destroys deliverability
- ❌ Run any harvester against LinkedIn outside of Sales Navigator
  (HiQ Labs lawsuit; CFAA exposure)
- ❌ Use breach-sourced or "competitor user list" data, no matter how
  the broker labels it

## How to add new manifests in practice

For each federation you want to add:

1. Visit their public club-finder + coach-directory pages
2. Open browser dev tools → Network tab → filter for XHR/fetch
3. Copy 50-100 club records from their public results
4. Paste into a new `manifests/<federation-id>.json` file matching the
   schema in `manifests/README.md`
5. Run `node tools/lead-harvest/harvest.js --source=<id>` to validate
6. Run with `--all` to insert (re-running is idempotent — same rows
   update on email conflict, never duplicate)

That's the entire workflow. A focused 2-hour session can add 200-300
leads from a single new federation.
