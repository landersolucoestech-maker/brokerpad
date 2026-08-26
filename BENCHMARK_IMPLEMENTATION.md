# BrokerPad — Competitive Benchmark Consolidation

This build consolidates relevant broker-CRM capabilities from the current auto-transport software benchmark into BrokerPad without adding duplicate sidebar modules.

## Consolidated owners

- **Dashboard:** lead response, quote conversion, dispatch cycle, carrier acceptance, revenue/agent, follow-up completion, acquisition attribution, customer portal adoption, reputation and exceptions.
- **CRM:** lead API intake, scoring, routing (round robin / geography / time / performance), SLA, consent-aware nurture, visual sales pipeline, lead-source performance, repeat-customer prefill, customer tags and relationship history.
- **Quotes / Quote Calculator:** 24/7 auto-quote, manual override, multi-vehicle pricing, pricing policy guardrails, suggested carrier pay, customer portal, quote acceptance and follow-up sequences.
- **Orders:** complete lifecycle, interested-carrier offer comparison, preferred/private carrier matching, lane history, controlled auto-repricing, master/sub-orders and settlement/document gates. Dispatch remains an order workflow, not a duplicate standalone data owner.
- **Carriers:** onboarding checklist, authority/insurance/doc verification, private carrier network, lane profiles, repeat-carrier rate/performance history and policy-controlled self-dispatch eligibility.
- **Communications:** unified inbox, phone/SMS/email operating model, inbound screen-pop, power dialer, auto-logging, email/SMS engagement metrics, status/event templates and long-tail nurture.
- **Documents:** e-sign audit certificates, customer agreements, carrier agreements/rate confirmations, eBOL/POD, condition/photo evidence, insurance/W-9/driver/truck records and versioned storage.
- **Accounting:** carrier settlements gated by proof of delivery, sales commissions, customer payment routing, order reconciliation and order-linked financial flows.
- **Settings → Automations:** immediate lead response, nurture, controlled carrier-pay repricing, lifecycle updates, insurance expiry, invoice collection and review-request automation. AI voice/dispatch/carrier outreach is explicitly marked Planned rather than pretending to be live.
- **Settings → Integrations:** stable integration surfaces for lead APIs/webhooks, phone/SMS, email, VIN decoding, FMCSA/carrier data, payments, accounting, reputation providers and historical-data migration with mapping/dry-run validation. Load-board providers remain integrations under Settings and are not reintroduced as a sidebar module.
- **Settings → Security:** MFA, per-user export audit and sensitive-export controls.
- **Reports:** corrected to Import / Export only. Custom report creation, KPI cards, saved reports and report-builder workflows are removed.
- **Global search:** customer, order, VIN, phone, carrier, document and invoice lookup from the top bar.

## Benchmark sources synthesized

- ProABD: instant quote engine, configurable zones/adjustments, multi-vehicle pricing, auto-follow-up, controlled repricing, carrier network, customer portal, payments, commissions, attribution and communications.
- Message Plane: unified communications, power dialer, carrier verification, customer portal, global search, custom homepage/work queue, event templates, lead distribution, reporting KPIs and reputation workflows.
- BATS CRM: interested carriers, eDoc/e-sign dispatch, master/sub-orders, status controls, customer tracker, lead sources/forms, automated workflows, commission tracking and secure operational structure.
- TheCarGo: branded portal, 24/7 quoting, long nurture, carrier vetting, per-user export audit, own payment gateway model and AI roadmap concepts.
- CarShipIO: one-click quote acceptance-to-order flow, carrier onboarding, private carrier network, lane matching, self-dispatch eligibility, split orders, customer tracking, vendor payments and repeat-customer CRM context.
- Cronetic / Dispatchable: lead routing, visual pipeline, response/performance tracking, customer/carrier portal concepts, e-sign, payment, drip campaigns, history tracking, tasks and operational integrations.
- TruxCRM (supplemental current benchmark): one connected shipment record and end-to-end customer/payment/carrier reconciliation.

This remains a front-end prototype. Real telephony, payment movement, XLSX server-side import persistence, e-signature cryptography, carrier verification and provider integrations require backend services and real credentials. The prototype now generates valid XLSX exports directly in the browser; XLSX import selection/validation is present, while persistence remains a backend responsibility.
