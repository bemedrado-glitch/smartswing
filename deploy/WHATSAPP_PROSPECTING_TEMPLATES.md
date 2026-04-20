# SmartSwing AI — WhatsApp Prospecting Templates (for Meta approval)

**Submit these in Meta Business Manager → WhatsApp → Message Templates.**
Approval usually takes 1–24 hours. Category: `MARKETING` for prospecting, `UTILITY` for transactional.

Each template references variables as `{{1}}`, `{{2}}` in Meta's syntax.
The cadence runner substitutes SmartSwing tokens (`{{first_name}}`, etc.) into these positional variables
before sending — the mapping lives in the `cadence_whatsapp.template_vars` JSONB column (ordered array).

---

## Template 1 — Cold intro (prospecting)

**Name:** `smartswing_intro_v1`
**Category:** `MARKETING`
**Language:** `en_US` (also submit `pt_BR`, `es_LA` variants for LatAm)

**Body:**
```
Hi {{1}}, this is the SmartSwing AI team.

We help tennis and pickleball players see exactly what's holding their game back — with 30-second AI swing analysis.

Most players find their #1 fix in the first clip. Want the 2 free analyses on us?

{{2}}
```

**Example variables for Meta preview:**
- `{{1}}` → `Bernardo`
- `{{2}}` → `https://www.smartswingai.com/analyze.html`

**SmartSwing mapping (put in `cadence_whatsapp.template_vars`):**
```json
["{{first_name}}", "{{analyze_url}}"]
```

---

## Template 2 — Follow-up (3 days after intro, no engagement)

**Name:** `smartswing_followup_v1`
**Category:** `MARKETING`
**Language:** `en_US`

**Body:**
```
Hey {{1}}, quick one —

Did the analyze link come through okay? Takes 30 seconds, one phone clip from the baseline is all you need. Most players find the fix that's been costing them 10+ points per match.

Try it here: {{2}}

Reply STOP to opt out.
```

**SmartSwing mapping:**
```json
["{{first_name}}", "{{analyze_url}}"]
```

---

## Template 3 — Paywall nudge (used 2 free analyses)

**Name:** `smartswing_paywall_v1`
**Category:** `MARKETING`
**Language:** `en_US`

**Body:**
```
{{1}}, you've used both free SmartSwing analyses. Strong start.

The AI already flagged your top pattern — now's the window to drill it before the old muscle memory sets back in.

Player plan (10 analyses/mo + drill library) is $9.99/mo, cancel anytime: {{2}}

30-day money-back guarantee. Reply STOP to opt out.
```

**SmartSwing mapping:**
```json
["{{first_name}}", "{{pricing_url}}"]
```

---

## Template 4 — Coach/club outreach (B2B prospecting)

**Name:** `smartswing_coach_intro_v1`
**Category:** `MARKETING`
**Language:** `en_US`

**Body:**
```
Hi {{1}}, reaching out from SmartSwing AI.

We give coaches and clubs a dashboard that turns every lesson into a video report your players (and their parents) actually understand.

15-min walkthrough this week? {{2}}

Reply STOP to opt out.
```

**SmartSwing mapping:**
```json
["{{first_name}}", "{{app_url}}/contact.html"]
```

---

## How to seed a cadence after templates are approved

Once Meta approves the templates, insert cadence steps like this (SQL or via the dashboard once the UI lands):

```sql
-- Example: 3-step WhatsApp-first prospecting cadence
INSERT INTO cadence_whatsapp (cadence_id, sequence_num, template_name, template_lang, template_vars, delay_days) VALUES
  ('<cadence_id>', 1, 'smartswing_intro_v1',      'en_US', '["{{first_name}}","{{analyze_url}}"]'::jsonb, 0),
  ('<cadence_id>', 2, 'smartswing_followup_v1',   'en_US', '["{{first_name}}","{{analyze_url}}"]'::jsonb, 3),
  ('<cadence_id>', 3, 'smartswing_paywall_v1',    'en_US', '["{{first_name}}","{{pricing_url}}"]'::jsonb, 10);
```

For Latin America, also insert `smartswing_intro_v1_pt_BR` / `_es_LA` variants and
branch on contact locale (future enhancement).

## Compliance checklist

- [ ] Every template includes "Reply STOP to opt out" in `MARKETING` category
- [ ] Templates do NOT include promotional discounts > 50% (Meta rejects these)
- [ ] Phone numbers used for prospecting are in E.164 format
- [ ] Contacts imported from public federation/club directories have a legitimate-interest basis
  (LGPD in Brazil, GDPR in EU, TCPA-equivalent considerations in US)
- [ ] The sender phone number has been verified in Meta Business Manager
- [ ] A "Quality Rating" monitor is bookmarked: Business Manager → WhatsApp → your number → Quality
