# Competitor user-base intelligence — legitimate channels

When the team wants to reach SwingVision / TopCourt / PlaySight /
TennisAnalytics users, **never go after their subscriber lists**.
That's auth-walled data — touching it is criminal liability under the
US CFAA + GDPR + breach-of-contract.

These are the legitimate alternatives that actually work.

## Channel 1: App store reviewers

iOS App Store + Google Play reviews are public. People who write
reviews of SwingVision are by definition users; their usernames are
public; engaging with their reviews (or replying to public comments)
is fully permitted.

- **What to fetch**: review username, rating, review text, date
- **Where to use it**: signal for Meta/Google ad targeting (which apps
  do reviewers also engage with?), social listening, content angles
  (their complaints become your blog posts)
- **Tools**: scraperapi.com, sensortower (paid), or the free
  `app-store-scraper` npm package

## Channel 2: Reddit + tennis tech forum mentions

r/tennis, r/10s, TennisWarehouse forum, Talk Tennis — every "Has
anyone tried SwingVision vs ___?" thread is a goldmine of self-
identified users debating alternatives. Reply to the thread (with
SmartSwing transparency: "I work at SmartSwing, here's our take, no
pressure to switch") instead of harvesting authors.

- **Tools**: Reddit's official API (free, with rate limits), Brandwatch
  / Mention (paid social listening)

## Channel 3: Backlink intelligence

Which clubs, coaches, blogs, YouTube channels, and equipment retailers
link to SwingVision's website? Those are warm B2B prospects for
SmartSwing — they already vetted that "AI tennis analysis" is real.

- **Tools**: Ahrefs (free tier shows top 100 backlinks), the existing
  `searchfit-seo:competitor-analyzer` skill in this repo

## Channel 4: Meta Lookalike Audiences

Once you have ~50 paying SmartSwing customers, upload them to Meta as
a "Custom Audience" and ask Meta to build a lookalike. Meta's ML
silently identifies people in their network with similar signals — a
chunk of those will be SwingVision users. **You never see the list.**
You just run ads to it. Fully GDPR-compliant because Meta does the
matching server-side using hashed PII the user has already opted into.

## Channel 5: YouTube + SwingVision blog comments

SwingVision publishes free blog posts + has an active YouTube channel.
The comments are public. Engaging in them (with disclosure) is the
fastest way to demonstrate SmartSwing's thinking to their audience
without ever touching their database.

## Anti-patterns — never do these

- ❌ Buy "SwingVision user list" from any data broker — they don't
  have one; they have a generic "tennis enthusiast" scraped list
  re-labeled
- ❌ Run a fake comparison-site offering "import your SwingVision data"
  to phish their users
- ❌ Use SEO doorway pages mimicking SwingVision branding
- ❌ Hire ex-SwingVision employees specifically to bring user lists
  (that's literally a tort + their NDA)
- ❌ Scrape `swingvision.com/users/*` — the URL pattern alone telegraphs
  intent; CFAA exposure is real
