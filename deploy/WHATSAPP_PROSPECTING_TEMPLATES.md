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

## Language variants (submit alongside en_US for LatAm reach)

The cadence-runner automatically picks the right template language based on the contact's phone country code (see `api/_lib/channel-router.js` → `resolveTemplateLang`). Submit each template in multiple languages — Meta treats each (name + language) pair as a separate approval.

### Template 1 — Cold intro — **pt_BR** (Brazil)

**Name:** `smartswing_intro_v1`  **Language:** `pt_BR`

```
Oi {{1}}, aqui é do time da SmartSwing AI.

Ajudamos jogadores de tênis e beach tennis a ver exatamente o que está travando o jogo — com análise de swing por IA em 30 segundos.

A maioria descobre o ponto chave na primeira gravação. Quer fazer 2 análises grátis por nossa conta?

{{2}}

Responda PARAR para sair.
```

### Template 1 — Cold intro — **es_LA** (Latin American Spanish)

**Name:** `smartswing_intro_v1`  **Language:** `es_LA`

```
Hola {{1}}, te escribe el equipo de SmartSwing AI.

Ayudamos a tenistas a ver exactamente qué está frenando su juego — con análisis de swing por IA en 30 segundos.

La mayoría encuentra el punto clave en el primer video. ¿Quieres 2 análisis gratis de nuestra parte?

{{2}}

Responde ALTO para darte de baja.
```

### Template 2 — Follow-up — **pt_BR**

**Name:** `smartswing_followup_v1`  **Language:** `pt_BR`

```
Oi {{1}}, só passando pra confirmar —

O link da análise chegou? São 30 segundos, um clipe do celular da linha de fundo já basta. Maioria descobre o ajuste que tá custando 10+ pontos por partida.

Testa aqui: {{2}}

PARAR pra sair.
```

### Template 2 — Follow-up — **es_LA**

**Name:** `smartswing_followup_v1`  **Language:** `es_LA`

```
Hola {{1}}, pasando rápido —

¿Te llegó el link del análisis? Son 30 segundos, un video del celular desde la línea de fondo basta. La mayoría encuentra el ajuste que les cuesta 10+ puntos por partido.

Probalo acá: {{2}}

Responde ALTO para darte de baja.
```

### Template 3 — Paywall nudge — **pt_BR**

**Name:** `smartswing_paywall_v1`  **Language:** `pt_BR`

```
{{1}}, você usou suas 2 análises grátis da SmartSwing. Começo forte.

A IA já identificou seu padrão principal — agora é a hora de treinar antes da memória muscular antiga voltar.

Plano Player (10 análises/mês + biblioteca de drills) é R$ 49/mês, cancela quando quiser: {{2}}

30 dias de garantia. PARAR pra sair.
```

### Template 3 — Paywall nudge — **es_LA**

**Name:** `smartswing_paywall_v1`  **Language:** `es_LA`

```
{{1}}, usaste tus 2 análisis gratis de SmartSwing. Buen arranque.

La IA ya identificó tu patrón principal — ahora es el momento de entrenarlo antes de que la memoria muscular vieja vuelva.

Plan Player (10 análisis/mes + librería de drills) es $9.99 USD/mes, cancelás cuando quieras: {{2}}

Garantía de 30 días. Responde ALTO para darte de baja.
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

## Meta webhook setup (required for inbound replies + opt-outs)

Without this configured, any prospect who replies to your WhatsApp cadence is lost — and STOP replies won't stop your cadences.

### Steps

1. **Generate a verify token** (any random string). In Vercel env vars add:
   ```
   WHATSAPP_VERIFY_TOKEN=<your-random-string>
   ```
   Redeploy.

2. **Meta Business Manager → WhatsApp → Configuration → Webhooks**:
   - Callback URL: `https://www.smartswingai.com/api/marketing/whatsapp-webhook`
   - Verify token: paste the same string you put in Vercel
   - Click **Verify and save** — Meta hits our GET endpoint, we echo back the challenge, Meta stores the subscription.

3. **Subscribe to events** (same page):
   - ☑ `messages` (inbound text/button/reply)
   - ☑ `message_status` (sent/delivered/read/failed)

4. **Test inbound flow**:
   - From a test phone, send any message to your business WhatsApp number
   - Within 5s it should appear in Supabase: `select * from whatsapp_inbound_messages order by received_at desc limit 5;`
   - Reply `STOP` from the same phone → `marketing_contacts.whatsapp_opted_out` flips to `true`, any pending WhatsApp cadence steps for that contact are auto-skipped

### What the webhook does

- **Inbound messages** → logged in `whatsapp_inbound_messages` table (dedupe on provider id). Used later for customer-service window tracking (Meta's 24h rule — free-form replies only work within 24h of a prospect's last inbound).
- **Opt-out keywords** → `STOP / UNSUBSCRIBE / CANCEL / END / QUIT / PARAR / SAIR / DETENER / ALTO / CANCELAR / ARRETER / STOPPEN` (case-insensitive, multi-language). Triggers:
  1. `marketing_contacts.whatsapp_opted_out = true`
  2. `marketing_contacts.preferred_channel = 'sms'` (so future cadences route to SMS instead)
  3. Pending WhatsApp cadence steps get marked `status = 'skipped'` with reason `whatsapp_opt_out`
- **Delivery status updates** → writes to `cadence_step_executions.delivery_state` (`sent → delivered → read` or `failed`), so you can see deliverability in the dashboard.

---

## Compliance checklist

- [ ] Every template includes "Reply STOP to opt out" in `MARKETING` category
- [ ] Templates do NOT include promotional discounts > 50% (Meta rejects these)
- [ ] Phone numbers used for prospecting are in E.164 format
- [ ] Contacts imported from public federation/club directories have a legitimate-interest basis
  (LGPD in Brazil, GDPR in EU, TCPA-equivalent considerations in US)
- [ ] The sender phone number has been verified in Meta Business Manager
- [ ] A "Quality Rating" monitor is bookmarked: Business Manager → WhatsApp → your number → Quality
