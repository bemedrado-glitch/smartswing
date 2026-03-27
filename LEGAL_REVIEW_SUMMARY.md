# SmartSwing Legal Review Summary

Date: 2026-03-25

## Scope

This is a product-side legal and compliance review summary prepared from the codebase and policy pages.

It is not legal advice and does not replace review by licensed counsel in the jurisdictions where SmartSwing AI will operate.

## Updated In This Pass

- Privacy Policy now references Brazil and LGPD rights.
- Privacy Policy now adds legal-basis, cross-border-transfer, security, and children-data language.
- Cookie Policy now reflects consent-sensitive analytics handling more clearly.
- Accessibility page now references WCAG 2.2 AA as the design target and clarifies barrier reporting.
- Contact page now includes privacy/LGPD and accessibility request topics.

## Remaining Counsel-Level Gaps

These still require attorney review or business decisions:

1. Legal entity details
   - Confirm the exact operating legal name, mailing address, and jurisdiction of SmartSwing AI.

2. Privacy controller details
   - Confirm the controller identity and whether a dedicated privacy contact or DPO-equivalent contact should be named.

3. LGPD legal-basis mapping
   - Confirm the exact legal basis used for each category of processing under Brazil's LGPD.

4. International transfers
   - Confirm the mechanism relied on for cross-border transfers where applicable.

5. Retention schedule
   - Confirm specific retention periods for account data, payment records, support messages, uploaded content, and analytics logs.

6. Minor-user workflow
   - Confirm whether the service is intended for minors directly, through parents, or through coaches and academies, and adjust notices accordingly.

7. Terms of service details
   - Confirm governing law, dispute process, refund policy, suspension standards, and consumer-law carveouts where required.

8. Consumer-rights operations
   - Confirm the actual workflow for privacy requests, deletion, correction, California requests, and Brazil requests so the published policies match real operations.

9. Cookie and analytics governance
   - Confirm whether any non-essential analytics, advertising, or remarketing tools will be used at launch and whether a formal consent management platform is required.

## Practical Recommendation

Before broader public launch, have counsel review at least:

- `privacy-policy.html`
- `cookie-policy.html`
- `user-agreement.html`
- `california-privacy.html`
- `accessibility.html`

If launch is limited to a small invited beta, the current pages are materially better than before, but they should still be treated as interim product notices until attorney review is complete.
