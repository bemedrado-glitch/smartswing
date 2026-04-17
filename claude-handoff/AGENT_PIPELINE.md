# SmartSwing Agent Pipeline — Architecture

**Status:** design locked, schemas drafted, implementation pending.
**Owner:** Bruno.
**Last updated:** 2026-04-17.

## Core principles

1. **One agent, one job.** The old `marketing_director` doing approve + calendarize + post is three jobs. Split into Editor-in-Chief (quality), CMO (human approval), Scheduler (timing), Publisher (posting).
2. **Structured handoffs, not free text.** Every agent emits a typed JSON artifact validated against a schema. Next agent rejects on validation failure.
3. **Deterministic orchestration > LLM-as-router.** The dashboard (code) routes between agents. LLMs are used only where judgment is needed.
4. **Fail loud, fail cheap.** Validation failure stops the pipeline and surfaces to human. Max 2 revise cycles, then escalate.
5. **Feedback loop is mandatory.** Analyst → Strategist weekly. No exceptions.

## The three handoff schemas

All three live in `api/_lib/schemas/` and are the contract between every stage.

| Schema | Produced by | Consumed by | Purpose |
|---|---|---|---|
| [`content-brief.schema.json`](../api/_lib/schemas/content-brief.schema.json) | Planner | Copywriter, Visual Gen, Video Gen | One post's angle, hook, CTA, audience, visual/video spec, success metric. |
| [`post-package.schema.json`](../api/_lib/schemas/post-package.schema.json) | Assembler | Editor-in-Chief, CMO, Scheduler, Publisher | Assembled copy + assets + per-platform variants + review scores + scheduling. |
| [`post-result.schema.json`](../api/_lib/schemas/post-result.schema.json) | Publisher (initial) + Analyst (updates) | Strategist | Publish status, engagement, conversions, success evaluation, learning signals. |

Each agent reads one schema, writes another. **No free-form string passing between agents.**

## Pipeline

```
 Strategist (weekly)  ──▶  ContentPlan.json
        │
        ▼
 Planner (daily)      ──▶  ContentBrief.json  (one per post)
        │
        ├──▶ Copywriter   ──▶ copy draft
        ├──▶ Visual Gen   ──▶ image URLs
        └──▶ Video Gen    ──▶ video URL + captions
                 │
                 ▼
         Assembler (code, no LLM) ──▶ PostPackage.json  [schema-validated]
                 │
                 ▼
         Editor-in-Chief ──▶ decision: approved | revise(reasons) | reject
                 │
           ┌─────┴─────┐
        approved    revise  ──▶ loop back (max 2 cycles)
           │
           ▼
         CMO (human-in-loop)  ──▶ YES / NO
           │
           ▼
         Scheduler ──▶ scheduled_for
           │
           ▼
         Publisher (per-platform code)  ──▶ PostResult.json (initial)
           │
           ▼
         Analyst (daily cron)  ──▶ PostResult.json (metrics updated)
           │
           └──▶ feeds Strategist weekly
```

## Agents × skills map

| Agent | Runtime responsibility | Authoring skills (used *here* to design prompts/logic) |
|---|---|---|
| Strategist | Weekly research + plan | `market-research`, `competitive-ads-extractor`, `last30days`, `content-engine`, `deep-research` |
| Planner | Brief generation from plan | `content-engine`, `ab-test-setup` |
| Copywriter | Draft copy from brief | `content-research-writer`, `content-engine`, `prompt-optimizer`, `twitter-algorithm-optimizer` |
| Visual Gen | Image generation | `generate-image`, `ckm-banner-design`, `infographics`, `seo-image-gen` |
| Video Gen | Video generation | `fal-ai-media`, `videodb`, `videodb-skills`, `video-editing` |
| Assembler | Deterministic schema assembly | *none (code-only)* |
| Editor-in-Chief | Rubric scoring, structured feedback | `content-design`, `ai-seo`, `code-review` (patterns) |
| CMO | Final human yes/no | *UI-only* |
| Scheduler | Queue by `publish_at` | `schedule`, `scheduled-tasks` |
| Publisher | Platform API calls | `crosspost`, `x-api`, `connect` |
| Analyst | Metrics pull + eval | `analytics-product`, `analytics-tracking` |

## Editor-in-Chief rubric (v1)

Scores 0–5 on each dimension. Decision thresholds:
- **approved**: all ≥ 3 AND no dimension = 0
- **revise**: any dimension = 2 (structured revision_notes required)
- **reject**: any dimension = 0 OR legal_compliance ≤ 2

Dimensions: `brand_voice`, `hook_strength`, `cta_clarity`, `platform_fit`, `factual_accuracy`, `legal_compliance`.

## Orchestrator guardrails

- Max 2 revise cycles per package. Cycle 3 → escalate to human with full history.
- Per-package `cost_cents` budget cap. Exceeding cap halts and notifies CMO.
- All agent calls logged to `agent_tasks` with input/output JSON + latency + model.
- Analyst evaluation window: 72h post-publish by default.
- Attribution window: 7 days (UTM + internal signup join).

## What this replaces

`api/marketing.js` lines 129–187 (`SYSTEM_PROMPTS`) and lines 310–3400 (workflow chains) will be migrated in phases. Current behavior kept behind a feature flag until the new pipeline is validated end-to-end on one platform (recommend: LinkedIn, lowest-risk audience).

## Migration phases (proposed — not yet sequenced)

1. Schemas + validators land in `api/_lib/schemas/` ← **DONE**
2. Assembler + Editor-in-Chief endpoints (deterministic + scored gate)
3. Planner endpoint (brief generation from a seed plan)
4. Publisher adapters (start with one platform)
5. Analyst cron + PostResult updates
6. Strategist weekly loop
7. Flip old `WORKFLOW_CHAINS` off
