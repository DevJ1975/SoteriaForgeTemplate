# Soteria Forge — Competitive Landscape

**Date:** 2026-07-07

**Method.** Four market-research briefs were produced by dedicated researchers, one per segment: Enterprise LMS, Frontline & deskless microlearning, EHS & safety training, and Standards & open-source baselines. Each brief profiled the segment's leading competitors (positioning, standout features, weaknesses backed by review-site themes), enumerated table-stakes capabilities, and identified differentiators and openings. This report synthesizes those briefs; the "Table stakes vs Soteria Forge today" section grades each expectation against the parallel codebase audits (which read code, not docs) as ground truth. Where a researcher marked a claim unverified, that caveat is preserved.

## Segment: Enterprise LMS

| Competitor | Positioning | Standout features | Weaknesses |
|---|---|---|---|
| Docebo | Premium AI-first enterprise LMS+LXP; extended-enterprise reference vendor; ~$25K/yr entry plus add-ons | AgentHub AI agents assembling courses from Drive/Confluence/SharePoint; MCP Server (GA expected Jul 2026) piping learning data into Claude/Copilot/ChatGPT; Go.Learn cited as category-leading offline mobile; multi-domain branded portals; SCIM 2.0, webhooks, Connect iPaaS | Add-on creep on a premium base; steep admin learning curve; reporting tedious to extract; legacy UI remnants; thin implementation support, slow tickets |
| Cornerstone Learning | Incumbent talent+learning suite for large regulated orgs; deepest compliance/certification pedigree | Galaxy AI agent system with ISO 42001 governance; SkyHive skills graph; automated certification/recertification lifecycle; Reporting 2.0 + Real Time Data Warehouse (REST/OData); Content Anytime libraries; Immerse VR for hands-on safety | Click-heavy, dated admin UI; steep learning curve; customer service the top complaint; high total cost; ~30% of users dislike overall UX |
| Absorb LMS | Mid-market-to-enterprise "AI-infused" LMS; among the strongest multi-tenant portal stories | Branded portals per audience centrally governed; Automatic Enrollment Rules + Re-Enrollment & Re-Certification cycles; Analyze BI add-on; Amplify libraries (20,000+ courses); offline-sync mobile app; Salesforce connector | Reporting the biggest gripe (BI gated to a paid add-on); **no course versioning** (updates force re-enrolling everyone); oversold ADP integration; steep advanced-feature curve |
| SAP Litmos | Fast-to-deploy compliance + extended-enterprise LMS; large bundled library; flagship Salesforce integration | Tenant-isolated AI Assistant; built-in AI SCORM authoring; offline mobile with due/overdue reminders; multi-account branded sub-domains + eCommerce; SCIM 2.0, SAML | Reporting is G2's top negative theme; dated admin UI; only three coarse admin roles; no bulk external-record upload; clunky admin workflows |
| LearnUpon | Multi-portal LMS; wins on ease of use and best-in-class support, not feature depth | Portals: fully separated branding/learners/courses centrally managed; Create+ AI authoring (plus reported Courseau acquisition); broad HRIS ecosystem; certificates with expiry/re-certification | No native SCIM (SAML JIT only) — a called-out architectural gap; limited reporting (no scheduled reports); no native interactivity engine; opaque pricing |
| 360Learning | Collaborative-learning platform — SMEs author courses; strong 2025 AI push | AI Companion; doc-to-course AI authoring + Smart Review feedback on open answers; skills auto-tagging/gap detection; attribute-driven compliance recertification; SCIM + 30+ HRIS; embedded in Workday Learning | Basic analytics (views/scores only); weak mobile admin; quizzes too simple for hands-on assessment; **6 GB total video storage cap, 400 MB file split** — poor fit for heavy video |
| TalentLMS | Value leader: transparent self-serve pricing, fast setup, SMB-to-mid-market | TalentCraft AI authoring; Branches (lightweight multi-tenancy); TalentLibrary; active-user billing with public pricing; certifications with expiry/re-assignment | Per-user pricing scales fast for deskless populations; AI/features gated to higher tiers; shallow enterprise compliance/reporting; branch model lighter than true multi-tenancy |

**Takeaways**

1. Compliance automation is fully commoditized at the top of the market: rule-based assignment, recertification cycles with expiry alerts, and audit trails are baseline — Soteria Forge currently has none of the automation layer, despite a better evidence substrate.
2. Reporting is the segment's universal sore spot (top negative theme for Litmos, Absorb, LearnUpon, 360Learning) and BI is often a paid add-on — "your data is a Postgres schema, not a report builder" is a credible counter-position.
3. Every vendor now ships AI authoring and recommendations; by 2025–26 its absence is treated as disqualifying in evaluations.
4. The 2026 frontier is agentic AI and open learning data (Docebo AgentHub + MCP Server, Cornerstone Galaxy AI) — clean, immutable xAPI in Postgres is unusually well positioned to follow cheaply.
5. Multi-tenancy is gated behind enterprise tiers and enforced in app code; database-enforced RLS isolation is both a security and an economics story against this segment.

## Segment: Frontline & deskless microlearning

| Competitor | Positioning | Standout features | Weaknesses |
|---|---|---|---|
| Axonify | Enterprise AI frontline enablement (Walmart, Kroger); daily adaptive microlearning + comms + tasks | Daily spaced-reinforcement engine (83% of users log in 2–3x/week voluntarily); May 2026 AI suite (coaching, assistant, agentic analytics, MCP/LLM integration); rewards with real value; comms + task execution blended in | Opaque enterprise pricing (third-party estimates ~$2–5/user/mo + $5k–50k implementation, unverified); heavy ongoing admin burden; content creation effectively requires professional L&D staff |
| SC Training (ex-EdApp, SafetyCulture) | Mobile-first microlearning inside the SafetyCulture ops platform; free tier + $5/learner/mo | Brain Boost spaced repetition (SM-2); offline mode with download + resync; one-click AI translation into 100+ languages (60–70% raw MT accuracy); AI authoring + big editable library | EdApp retirement (Mar 2026) stranded free-tier users' records — active trust damage; rigid templates; complaints that it "doesn't track training records as accurately as we would like" |
| eduMe | Loginless "training in the flow of work" embedded in Workday/Teams/Fountain/Braze; gig-economy strength (Uber, Gopuff) | Seamless Links/OTP passwordless access (claims 95%+ participation); trigger-based delivery on workflow events; AI lesson generation; strong outcome case studies | **No offline mode** — hard gap for austere environments; limited analytics and customization; SSO/API/branding cost extra |
| Opus Training | Restaurant/hospitality frontline LMS; per-location pricing with unlimited seats | AI Module Builder (SOPs → microlessons); auto-translation into 130+ languages (vendor-claimed up to 99% accuracy); passwordless QR login; **Checks** — manager observation + photo sign-offs blended into curricula; HRIS auto-provisioning | Vertically concentrated in hospitality; franchise permissioning and compliance-tracking gaps; quote-based pricing; offline behavior undocumented (unverified) |
| PlayerLync (Wisetail, Intertek) | The offline-first content-distribution LMS for device-equipped tablet fleets | True offline pre-sync on schedules with bandwidth-aware distribution and video compression; heavy video first-class; MDM/AppConfig shared-device management; learning + SOPs + checklists in one app | Dated UI, glitchy forms, weak reporting; expensive (third-party estimates ~$50/user/mo, unverified); post-acquisition brand absorption creates roadmap uncertainty |
| Connecteam | All-in-one deskless workforce app (scheduling, time clock, chat) with a training hub; transparent SMB pricing | Training next to the daily-use time clock; kiosk app for shared devices with per-employee PIN; SCORM upload; rewards tokens; genuinely free small-business tier | **Cannot be used offline at all** (per its own help center); training depth basic — no reinforcement/adaptive engine (unverified beyond documented features); hub pricing stacks |

**Takeaways**

1. Frictionless auth is table stakes here: QR, SMS/OTP, magic links, PINs — passwords are treated as an adoption killer. Soteria Forge is email/password with hand-pasted invite tokens.
2. True offline is astonishingly rare: only PlayerLync genuinely pre-syncs; Connecteam and eduMe have none. Soteria Forge's offline architecture is ahead of the segment — once offline video actually ships.
3. AI authoring (SOP/PDF → microlesson) and 100+-language auto-translation are now baseline expectations; SC Training's 60–70% raw MT accuracy is a beatable bar with LLM translation plus safety glossaries.
4. The segment is converging on training + comms + operations in one app; standalone LMSes without a comms channel are being displaced.
5. 2026 consolidation churn (EdApp retirement deleting free-tier records, PlayerLync's absorption into Wisetail) makes data-portability guarantees a live sales weapon.

## Segment: EHS & safety training

| Competitor | Positioning | Standout features | Weaknesses |
|---|---|---|---|
| Vector Solutions | Compliance-first LMS + deep vertical libraries; the regulated-industry training system of record | MSHA Part 46/48 courses with automated Form 5000-23 records; best-in-class 3D-animated industrial courseware; 20+ human-translated languages + 40+ AI; credential/license renewal tracking | Cumbersome admin with unfamiliar terminology; limited reporting; confusing assignment tooling; a training silo — no incident/EHS loop; true offline not evidenced (unverified) |
| HSI | Training-first EHS platform: 5,000+ course library + LMS + 30+ EHS modules | Largest single-source safety library; incident/observation → targeted retraining loop; multi-language closed captions; strong G2 momentum (4.6/5) | Steep learning curve; weeks-long implementations; customization and UI-speed complaints |
| SafetySkills | Out-of-the-box OSHA curriculum + purpose-built compliance LMS for SMB/mid-market | 1,000+ EHS/HR titles across 22 series; auto-assignment by group/role; SCORM upload; regulator-focused content authored by safety professionals | Thin beyond training (no incident loop); fewer platform features; unintuitive interface in places; very large exported course file sizes |
| KPA Flex → Novara Flex | Mobile-first no-code EHS platform for high-risk mid-market; spun off from KPA Jan 2026 | 1,000+ course library inside the same platform as inspections/incidents; no-code forms/workflows; offline mobile field capture + QR asset tagging; toolbox-talk content partnership | Less deep than enterprise suites; equipment records not viewable offline; report-navigation quirks; the corporate split creates roadmap uncertainty |
| VelocityEHS | Enterprise EHS/ESG suite (a third of Fortune Global 1000); training one module among many | Training records beside incidents/inspections for a single audit surface; new expert-built library (~150 courses, Mar 2026) with AI-assisted updates; strong chemical/ergonomics assets | Small library vs training-first rivals; overwhelming and rigid initially; limited report drill-down; year-over-year price increases flagged |
| Intelex (Fortive) | Enterprise EHSQ platform; training one configurable app in a broad suite; enterprise TCO | Closed-loop incident → corrective-action → training assignment; highly configurable; native contractor management alongside training | Unintuitive UI, difficult navigation; slow performance, recent outages; slow support; heavyweight implementation |
| SafetyCulture (iAuditor + SC Training) | Frontline ops platform: dominant mobile inspections + microlearning LMS; freemium land-and-expand | Offline microlearning with sync; AI course generation; inspection findings trigger refresher courses; toolbox-talk templates; transparent pricing (free tier, ~$5/learner/mo) | Compliance rigor lags compliance-first LMSes (record-accuracy complaints); shallow OSHA/MSHA-specific curricula; analytics depth wanting |

**Takeaways**

1. The segment's structural gap is unclaimed: training-first vendors lack the EHS corrective-action loop, suite vendors have weak training UX and painful implementations, and SC Training has engagement without compliance rigor. Rigorous portable evidence + modern mobile UX is an open position.
2. Content library depth (HSI 5,000+, Vector's 3D/MSHA courseware) is the hardest moat in this segment — partner or license rather than build.
3. The closed loop (incident/inspection → auto-assigned retraining) is what distinguishes an EHS platform from a course player; Soteria Forge has neither the requirements matrix nor the corrective-action hook yet.
4. Contractor prequalification networks (ISNetworld, Avetta, Veriforce) impose duplicate documentation on every contractor — a documented, unsolved pain no incumbent owns; a "compliance passport" export attacks it directly.
5. Time-to-value is a differentiator here: HSI/Intelex implementations run weeks-to-months; a defined-as-code template with a seeded backend can credibly demo "live before lunch."

## Segment: Standards & open-source baselines

| Competitor | Positioning | Standout features | Weaknesses |
|---|---|---|---|
| Moodle LMS + Workplace | Dominant open-source LMS and the de facto feature baseline; Workplace is the partner-only corporate distribution | Native SCORM 1.2/2004 player, H5P, quiz engine, completion rules, Open Badges 3.0 in core; Workplace multi-tenancy with per-tenant SAML and cross-tenant shared content; programs/certifications with recertification; app runs SCORM 1.2 offline | Dated UI, steep admin complexity; multi-tenancy gated to the partner product and enforced in the app layer over a shared DB; xAPI/cmi5 plugin-grade; offline partial (SCORM 2004 online-only) |
| Totara | Moodle fork turned open-core talent platform; strongest OSS-derived compliance option (gov, defense, utilities) | Org/position hierarchies auto-assigning training by role/site; programs + certifications with recertification windows and audit-ready trails; dynamic audiences; seminar/F2F management | Long complex implementations; certification-archiving model confuses admins; no bundled xAPI/LRS module; partner-mediated licensing, opaque pricing |
| Open edX | Open-source MOOC-scale platform (Axim-governed); strong authoring, weakest of the three for corporate compliance | Reusable content libraries with sync; LTI Advantage Complete; Aspects analytics in Studio; Credly/Accredible badges; proven horizontal scale | Very heavy operations (Tutor/Docker); SCORM only via a community XBlock; core multi-tenancy officially weak (shared user namespace, cross-site data bleed) needing eox-tenant; no recertification machinery |
| SCORM 1.2/2004 (standard) | Legacy but still-dominant packaging/runtime standard; the admission ticket to the off-the-shelf content pool | ~70% of world content reportedly still SCORM 1.2; all major authoring tools publish it; industrial safety libraries (HSI, eSafety, ClickSafety, HAZWOPER) ship as SCORM/AICC | Browser-JS runtime with no native offline story; client-side score reporting is tamperable; shallow data model; DoD now steers new acquisitions to xAPI/cmi5 |
| xAPI / xAPI 2.0 (IEEE 9274.1.1-2023) | The activity-stream evidence standard; now IEEE- and ISO-adopted — procurement-grade legitimacy | Tracks any experience anywhere; statements queued locally and synced idempotently by client UUID (exactly the austere-environment pattern); voiding, signed statements, State API; ADL conformance suite (1,300+ requirements) | Vocabulary inconsistency without profiles; LMS-side support mostly plugin-grade; a minimal statement store is a valid xAPI producer but **not** an LRS (no GET /statements, voiding, State/Profile APIs) |
| cmi5 (+ DoDI 1322.26) | The designated SCORM successor: xAPI profile adding launch, auth, and course structure; DoD-recommended for new acquisitions | Content lives anywhere and talks to the LRS "whenever the network allows" — architecturally suited to disconnected fields; Storyline/Rise/iSpring/Lectora export it natively; CATAPULT conformance suite | LMS-side runtime adoption still thin; installed base still overwhelmingly SCORM; fully-offline launch needs engineering beyond the spec (pre-fetched tokens, local proxy) |
| LTI 1.3 / LTI Advantage | 1EdTech tool-embedding standard (OIDC/JWT launches, grade passback); certified in 250+ products | Embeds third-party simulators/assessment engines with secure grade passback; Deep Linking picker UX | Browser/online-centric — little value to an offline-first native app; fiddly implementation; corporate deskless buyers rarely ask for it |
| OSS LRSs: Yet Analytics SQL LRS, Learning Locker | Reference open-source Learning Record Stores | SQL LRS: conformant, SQL-native (Postgres), "Reactions" deriving statements from statements (certification rollups over append-only data), LRSPipe profile-governed forwarding; DoD Iron Bank presence | Learning Locker OSS stagnated (~2021) with support shifted to Learning Pool's SaaS; SQL LRS is deliberately just an LRS — no dashboards, no LMS features |
| Watershed + Veracity Learning | Commercial LRS/learning analytics: where corporate evidence ends up | Watershed: 40+ connectors, HRIS hierarchy import, SOC 2/ISO 27001, Fortune-500 clients; Veracity: full conformance incl. signatures/attachments, free Lite tier, ~$100/mo plans (reported) | Watershed enterprise-priced (aggregator-reported ~$2,100/mo CLO tier, unverified) and analytics-only; Veracity a small vendor with a light governance story |

**Takeaways**

1. Every open-source baseline isolates tenants in application code over a shared database — Open edX officially leaks data across sites; Postgres RLS keyed to the verified JWT is a categorically stronger, auditable claim.
2. SCORM 1.2 import is the single biggest content-acquisition risk: without it, tenants can't ingest authoring-tool output or purchased safety libraries. Ship it (or bridge via SCORM Cloud Dispatch), then leapfrog to cmi5, whose async model drops naturally onto the existing offline queue.
3. Soteria's statement store is a genuine xAPI producer but honestly not an LRS; the credible wedge is per-tenant statement forwarding (LRSPipe-style) to the customer's corporate LRS, not building analytics.
4. The compliance features Moodle Workplace and Totara monetize behind partner subscriptions (recertification windows, org-driven assignment, supervisor dashboards) are computable as derived views over the append-only stream — the SQL LRS "Reactions" pattern shows how, without ever mutating evidence.
5. LTI 1.3 can be consciously skipped for now: it assumes online browser launches and is low value to an offline-first field app; revisit only if the web PWA becomes a primary embedded-content surface.

## Table stakes vs Soteria Forge today

Merged and deduped from all four segments' table-stakes lists, graded against the codebase audits (not aspirations). "Partial" means real machinery exists but a load-bearing piece is missing.

| Capability (table stakes across segments) | Status | Ground truth from the audits |
|---|---|---|
| Multi-tenant isolation with delegated tenant admins | **Have** | DB-enforced RLS + insert stamping, live-verified — stronger than incumbents' app-layer portals |
| Append-only, audit-grade completion trail | **Have** | xAPI statements, client-UUID idempotent, no UPDATE/DELETE policy — but see cascade caveat below |
| Native mobile app with offline content + resync | **Partial** | Offline-first text/quiz + idempotent sync genuinely built; offline **video** is an unimplemented scaffold; apps are source-only and currently below both stores' submission floors |
| Quizzes / knowledge checks | **Partial** | Working single-choice player with pass/fail statements; no authoring surface, client-held answer keys, unlimited attempts |
| Certificates with validity periods | **Partial** | Auto-issue with unique numbers works end-to-end; `expires_at`/revocation never written; no share/export/verification |
| Rule-based auto-assignment (role/site/hire date) | **Missing** | Manual per-user assignment only; profile crew/site fields are dead columns |
| Recertification cycles + expiry alerts with escalation | **Missing** | No scheduled jobs, no notifications; recert would even violate the current unique(user, course) certificate constraint |
| Due dates + overdue tracking | **Missing** | `due_at` rendered on every surface, settable on none; statuses never transition |
| Training matrix / compliance-status view | **Missing** | No requirements object anywhere |
| Manager/supervisor team reporting views | **Missing** | RLS grants supervisors the reads; no UI exercises them |
| Reporting dashboards + audit exports (transcripts, CSV/PDF) | **Partial** | Console rollup report + one 6-column worker CSV; no per-worker transcript, drill-down, date filters, or PDF |
| SCORM 1.2 import & playback | **Missing** | 'scorm' is a lesson-kind label with no runtime, ingest path, or player on any surface |
| xAPI emission/export to an external LRS | **Partial** | Statements are native xAPI in plain Postgres (SQL/BI access inherent), but no `/statements` API, forwarding, or conformant LRS surface |
| Public REST API + event webhooks | **Partial** | Supabase/PostgREST access exists by construction; no documented product API, no webhooks (user created, completion, certificate issued) |
| SSO (SAML/OIDC) + SCIM/HRIS provisioning | **Missing** | Email/password + invitation redemption only; per-tenant SSO explicitly deferred |
| Frictionless frontline auth (QR/OTP/PIN, no email) | **Missing** | Invite tokens are pasted by hand; no QR, SMS, or PIN flows |
| Push notifications / reminders | **Missing** | No APNs/FCM wiring, no token table, no sender anywhere |
| Multilingual delivery / auto-translation | **Missing** | Hardcoded English on all three surfaces; xAPI display maps hardcode en-US |
| AI authoring (doc-to-course) + AI recommendations | **Missing** | None |
| Off-the-shelf / regulator-aligned content library | **Missing** | Seed content only; no libraries or marketplace connectors (partner/license is the realistic path) |
| Gamification / engagement mechanics | **Missing** | None |
| Comms/announcements channel adjacent to training | **Missing** | None |
| Completion rules / sequencing enforcement | **Partial** | `sequence_locked` and seat-time fields modeled and cached; enforced nowhere |
| Competency frameworks / Open Badges | **Missing** | None |
| Content versioning | **Missing** | Courses mutate in place (note: Absorb lacks this too — it is a reviewable weakness, not universal) |
| Per-tenant branding/domains | **Missing** | Single shared brand token set; no tenant theming |
| eCommerce for external training | **Missing** | None (arguably out of scope for the template) |
| LTI 1.3 tool consumption | **Missing** | Consciously deferrable per the standards brief — low value to an offline-first field app |
| Security/compliance posture (SOC 2, GDPR artifacts) | **Partial** | Strong in-code posture (RLS, secret hygiene, hooks); no formal certifications — a template buyer inherits the audit burden |
| Transparent / low-friction commercial entry | **N/A (structural)** | Template economics replace per-seat SaaS pricing entirely — a different model, and the point |

One honesty caveat the audits surfaced: the "append-only" guarantee currently holds against clients but not against routine admin lifecycle — `ON DELETE CASCADE` from profiles and courses can destroy statements and certificates. Fixing that (P0 in the gap audit) is prerequisite to marketing the evidence trail.

## Differentiators worth adopting

Competitor capabilities that fit Soteria Forge's architecture and market, roughly in order of leverage:

1. **Rule-based compliance automation over org structure** (Totara, Absorb, Cornerstone): requirements matrix + recertification windows as derived state over the append-only stream — the killer industrial feature, and computable without mutating evidence (the SQL LRS "Reactions" pattern is the blueprint).
2. **On-the-floor skill verification** (Opus Checks): manager observation, photo evidence, and sign-offs blended into the curriculum — maps directly onto the planned supervisor-attestation xAPI statements and fixes the indefensible self-marked practical-signoff.
3. **AI authoring from SOPs/PDFs/videos** (Opus, SC Training, TalentLMS, Litmos): now table stakes; buildable on commodity LLM APIs against the console's (to-be-built) content editor.
4. **LLM auto-translation with safety-terminology glossaries** (SC Training 100+ languages at 60–70% accuracy; Opus 130+): a beatable bar and an OSHA-understandability requirement.
5. **Passwordless frontline auth** (eduMe Seamless Links, Opus QR login): Supabase Auth supports OTP/phone flows — QR/badge-scan onboarding is a cheap, high-visibility win.
6. **Spaced-repetition reinforcement** (Axonify, SC Training Brain Boost): the append-only statement history is exactly the evidence stream a reinforcement engine needs; avoid Axonify's admin burden by keeping authoring template-simple.
7. **Statement forwarding to corporate LRSs** (LRSPipe/Watershed ecosystem): be the tamper-evident field system-of-record; let the enterprise keep its analytics stack.
8. **Toolbox-talk capture and lightweight comms** (Novara Flex, SafetyCulture, Connecteam): the segment is converging on training+ops+comms; offline crew sign-ins are what the outbox was built for.
9. **Per-location unlimited-seat pricing** (Opus): the commercial wedge high-turnover operators love — and one Supabase economics can actually support.
10. **An MCP/agent surface over learning data** (Docebo's headline 2026 move): "who on site B lapses on fall-protection this month?" is a small, credible follow-on once compliance state exists — and the immutable trail makes agent answers trustworthy.

## Where Soteria Forge can win

- **Offline-FIRST as architecture, not checkbox.** Across all four segments, genuine offline is rare (PlayerLync only, at high cost; Connecteam and eduMe have none; Moodle's is partial; enterprise "offline" is caching). The WatermelonDB store + append-only, client-UUID-idempotent xAPI drain is conflict-free by construction — "completions recorded in a no-signal refinery basement, synced conflict-free later" is a demo no competitor covered can run. Condition: offline **video** must actually ship (P0 in the gap audit) for the claim to be credible.
- **Evidence, not records.** No reviewed competitor markets an immutable completion ledger; mutable LMS records are a known credibility gap in audits and litigation, and record-accuracy complaints dog SC Training and PlayerLync. The append-only trail — once the cascade-deletion hole is fixed and transcript exports exist — is a pitch aimed at safety officers, GCs, and OSHA/MSHA inspections that incumbents cannot copy without re-architecting.
- **Database-enforced tenant isolation as a provable guarantee.** Incumbents (commercial and open-source alike) segregate tenants in app code over shared infrastructure; Open edX officially leaks across sites. Postgres RLS keyed to the verified JWT holds even if app code is wrong — decisive in contractor ecosystems where rival subcontractors share an owner/GC instance, and now standards-adjacent (xAPI 2.0 is IEEE/ISO-adopted, useful in procurement).
- **Template economics vs per-seat SaaS.** Docebo starts ~$25K/yr plus add-ons; Axonify is enterprise-quoted with five-figure implementations; TalentLMS's per-user billing punishes 64,000-worker rosters with contractor churn; Moodle Workplace and Totara carry a partner tax. Near-zero marginal cost per tenant supports per-site/per-project unlimited-seat pricing and a white-label business for safety consultancies, franchisors, and training providers — a model, not just a discount.
- **Heavy video at commodity cost.** Cloudflare Stream signed URLs + MP4 downloads against 360Learning's 6 GB cap and PlayerLync's per-device pricing; video bytes never touch Postgres, keeping unit economics flat.
- **Timing: consolidation churn and standards tailwind.** EdApp's 2026 retirement stranded records; PlayerLync is being absorbed; DoD policy steers new acquisitions to xAPI/cmi5 while LMS-side cmi5 runtimes remain rare. Data-portability guarantees ("your records are standard xAPI in exportable Postgres, never hostage") plus an offline-capable cmi5 path is an underserved niche with a procurement tailwind.
- **The unclaimed EHS position.** Rigorous, portable compliance evidence + SC-Training-grade mobile UX + hours-not-months time-to-value is a combination no incumbent currently holds. The gap audit's P0 list (authoring, due dates, recert, sign-off, requirements matrix) is precisely the work required to claim it.

## Sources

Deduped URLs provided by the researchers, grouped by segment.

**Enterprise LMS**

- https://www.docebo.com/
- https://www.reworked.co/learning-development/docebo-agenthub-unifies-learning-knowledge-skills-intelligence/
- https://joshbersin.com/2025/06/the-ld-revolution-docebo-goes-ai-native-sana-expands-what-do-you-do/
- https://help.docebo.com/hc/en-us/articles/4407581695378-Docebo-Connect
- https://www.stitchflow.com/scim/docebo
- https://www.g2.com/products/docebo/reviews
- https://www.educate-me.co/blog/docebo-pricing
- https://www.opus.so/blog/best-mobile-lms-frontline-teams
- https://talentedlearning.com/lms/docebo/
- https://www.cornerstoneondemand.com/platform/cornerstone-galaxy-ai/
- https://www.cornerstoneondemand.com/resources/article/smarter-faster-and-more-connected-with-ai-powered-innovation-in-the-july-2025-release/
- https://www.businesswire.com/news/home/20250916590703/en/AI-Ready-Workforces-Start-Here-The-Next-Evolution-of-Cornerstone-Galaxy-at-HR-Tech-2025
- https://joshbersin.com/2026/05/cornerstone-launches-its-reinvention-helping-to-redefine-corporate-learning/
- https://ensaantech.com/blog/cornerstone-learning-suite/
- https://www.g2.com/products/cornerstone-learning/reviews
- https://www.selecthub.com/p/lms-software/cornerstone-lms/
- https://www.capterra.com/p/150446/Cornerstone-LMS/reviews/
- https://www.absorblms.com/solutions/enterprise-lms
- https://www.absorblms.com/blog/deliver-multiple-learner-experiences-multi-tenant-lms
- https://support.absorblms.com/hc/en-us/articles/360053094693-Automatic-Enrollment-Rules
- https://support.absorblms.com/hc/en-us/articles/219544607-Re-Enrollment-Re-Certification
- https://www.absorblms.com/features/content-libraries/absorb-amplify
- https://www.absorblms.com/features/integrations/apis
- https://www.g2.com/products/absorb-software-absorb-lms/reviews
- https://talentedlearning.com/lms/absorb-lms/
- https://www.softwareadvice.com/lms/absorb-profile/reviews/
- https://www.litmos.com/solutions/compliance-training
- https://www.litmos.com/features/ai-solutions/ai-assistant
- https://www.litmos.com/features/mobile-app
- https://www.litmos.com/features/external-training
- https://www.litmos.com/wp-content/uploads/2023/02/AddOn-Multi-Account-infographic.pdf
- https://learn.microsoft.com/en-us/entra/identity/saas-apps/litmos-provisioning-tutorial
- https://elearningindustry.com/directory/elearning-software/litmos-lms/reviews
- https://www.peerspot.com/questions/what-needs-improvement-with-sap-litmos
- https://www.sap.com/products/hcm/partners/litmos-us-lp-litmos-ai-learning-management-system-and-training-content.html
- https://www.learnupon.com/features/integrations/
- https://docs.learnupon.com/api/
- https://www.stitchflow.com/user-management/learnupon/api
- https://talentedlearning.com/lms/learnupon/
- https://www.courseplatformsreview.com/tools/learnupon-lms/
- https://elearningindustry.com/directory/elearning-software/learnupon-lms/reviews
- https://research.com/software/reviews/learnupon-lms
- https://360learning.com/
- https://www.businesswire.com/news/home/20251001382117/en/360Learning-Launches-AI-Companion-to-Transform-LD-With-Intelligent-Learning-Partner
- https://www.businesswire.com/news/home/20251113372917/en/360Learning-Integrates-with-Workday-Learning-to-Transform-Enterprise-Learning-Experiences
- https://360learning.com/product/skills/
- https://support.360learning.com/hc/en-us/articles/15226356498580-Configure-the-SCIM-integration
- https://360learning.com/blog/partners-platforms-integrations/
- https://www.g2.com/products/360learning/reviews?qs=pros-and-cons
- https://www.group.app/blog/360learning-review/
- https://www.talentlms.com/features/branches
- https://www.talentlms.com/library/
- https://www.teachfloor.com/blog/talentlms-pricing
- https://www.educate-me.co/blog/talentlms-review
- https://www.e-learningpartners.com/blog/talentcraft-by-talentlms-review-everything-you-need-to-know
- https://www.learningrevolution.net/talentlms-review/

**Frontline & deskless microlearning**

- https://axonify.com/platform/
- https://www.businesswire.com/news/home/20260518372923/en/Axonify-Redefines-Frontline-Enablement-with-AI-Powered-Platform-to-Deliver-the-Last-Mile-of-Strategy
- https://axonify.com/news/axonify-acquires-nudge-to-bring-digital-employee-experience-to-the-next-level/
- https://axonify.com/customer-stories/walmart/
- https://www.g2.com/products/axonify/reviews
- https://www.itqlick.com/axonify/pricing
- https://www.softwareadvice.com/lms/axonify-profile/
- https://training.safetyculture.com/
- https://training.safetyculture.com/pricing/
- https://training.safetyculture.com/spaced-repetition/
- https://training.safetyculture.com/ai-translation/
- https://support.edapp.com/edapp-is-retiring-choose-your-next-step
- https://support.edapp.com/offline-mode
- https://www.g2.com/products/sc-training-formerly-edapp/reviews
- https://blog.overpass.co.uk/edapp-shutting-down-march-2026/
- https://www.edume.com/
- https://www.edume.com/mobile-microlearning-platform
- https://www.edume.com/integrations
- https://help.edume.com/using-otp-links-for-qr-codes-workflows-and-other-distribution
- https://www.edume.com/case-studies/gopuff
- https://www.g2.com/products/edume/reviews
- https://www.capterra.com/p/178862/EduMe/pricing/
- https://www.opus.so/
- https://www.opus.so/pricing-plans
- https://www.opus.so/platform/training
- https://www.opus.so/solutions/role-based-training
- https://www.g2.com/products/opus-training/reviews
- https://www.opus.so/customer-stories/how-just-salad-won-the-hearts-of-millennials-through-digital-training
- https://www.schoox.com/blog/5-best-opus-training-alternatives-ranked-for-2026/
- https://www.playerlync.com/industries/restaurants/
- https://www.businesswire.com/news/home/20230823319468/en/Intertek-Group-Announces-That-It-Has-Acquired-PlayerLync-Holdings-Inc.
- https://www.businesswire.com/news/home/20240611608639/en/Wisetail-an-Intertek-Company-Revolutionizes-Workforce-Training-and-Operations-with-New-Product-Offering
- https://help.playerlync.com/technical-faqs/file-sync-faq
- https://www.selecthub.com/p/workforce-management-software/playerlync/
- https://www.itqlick.com/playerlync-software
- https://www.softwareadvice.com/lms/playerlync-profile/reviews/
- https://connecteam.com/
- https://connecteam.com/pricing/
- https://connecteam.com/employee-training-software/
- https://help.connecteam.com/en/articles/9414361-can-the-connecteam-app-be-used-offline
- https://help.connecteam.com/en/articles/6135619-the-kiosk-app
- https://help.connecteam.com/en/articles/9464224-course-objects
- https://www.capterra.com/p/153140/Connecteam/pricing/

**EHS & safety training**

- https://www.capterra.com/p/209683/Convergence-Training/reviews/
- https://www.selecthub.com/p/lms-software/vector-lms/
- https://www.vectorsolutions.com/course-search/libraries-industrial/msha-training/
- https://www.vectorsolutions.com/resources/course-catalogs/health-safety-environment-hse-foreign-language-training-library/
- https://www.softwareadvice.com/lms/convergence-profile/
- https://www.g2.com/products/hsi-hsi/reviews
- https://hsi.com/courses
- https://hsi.com/solutions/ehs-environmental-health-and-safety
- https://www.ehsinsight.com/blog/ehs-insight-vs-hsi-ehs-program-management-vs.-a-training-first-platform
- https://www.capterra.com/p/172814/HSI/reviews/
- https://safetyskills.com/course-catalogs
- https://www.capterra.com.au/reviews/97113/safetyskills
- https://cloudsds.com/ehs-training/best-15-lms-for-safety-training-in-2026-analysis/
- https://www.itqlick.com/safetyskills
- https://www.g2.com/products/kpa-flex/reviews
- https://kpa.io/blog/kpa-separates-businesses-launching-novara-to-serve-high-risk-industries/
- https://novara.com/blog/novara-announces-partnership-with-safety-meeting-outlines-inc-to-provide-compliance-topics-and-training-to-flex/
- https://www.softwareadvice.com/ehs/mykpaonline-profile/
- https://ehsreviews.com/kpa-flex-review/
- https://www.ehs.com/solution/safety/training-learning/
- https://www.globenewswire.com/news-release/2026/03/04/3249352/0/en/velocityehs-introduces-expert-built-training-library-ehs-leaders-can-trust.html
- https://www.capterra.com/p/88891/EHS-Management-Software/reviews/
- https://www.g2.com/products/velocityehs-ehs-software-to-outpace-risk/reviews
- https://www.intelex.com/products/applications/training-management-software/
- https://www.g2.com/products/intelex-ehsq/reviews
- https://www.capterra.com/p/80803/EHS-Management-Software/reviews/
- https://www.gartner.com/reviews/product/intelex-ehs-software
- https://ehsreviews.com/intelex-review/
- https://training.safetyculture.com/features/
- https://training.safetyculture.com/offline-mode/
- https://www.atlantictraining.com/blog/reviews-of-mobile-apps-for-workplace-safety-training/
- https://safetyculture.com/inspections-and-reports

**Standards & open-source baselines**

- https://moodle.com/products/workplace/
- https://moodle.com/news/moodle-workplace-4-multi-tenancy/
- https://docs.moodle.org/500/en/Multi-tenancy
- https://docs.moodle.org/500/en/Moodle_Workplace_release_notes
- https://moodledev.io/general/releases
- https://docs.moodle.org/500/en/Moodle_app_offline_features
- https://docs.moodle.org/502/en/Moodle_app_SCORM_player
- https://moodledev.io/general/app_releases/v5/v5.0.0
- https://moodle.org/plugins/logstore_xapi
- https://moodle.org/mod/forum/discuss.php?d=361319
- https://www.capterra.com/p/80691/Moodle/reviews/
- https://eliterate.us/moodle-workplace-a-new-product-and-change-in-open-source-deployment/
- https://totara.com/articles/discover-whats-new-in-totara-v19/
- https://www.totara.com/license/
- https://totara.com/resources/hierarchies/
- https://www.totara.com/compliance-training/
- https://www.g2.com/products/totara-lms/reviews
- https://www.capterra.com/p/123703/Totara-LMS/reviews/
- https://www.hubkengroup.com/resources/what-is-totara-the-ultimate-guide-to-a-totara-lms
- https://totara.com/articles/faster-feature-product-releases/
- https://docs.openedx.org/en/latest/community/release_notes/ulmo.html
- https://docs.openedx.org/en/latest/community/release_notes/ulmo/ulmo_marketing_notes.html
- https://openedx.org/blog/discover-the-open-edx-teak-release/
- https://openedx.org/blog/whats-new-in-ulmo/
- https://appsembler.com/blog/mastering-scorm-with-open-edx-a-guide/
- https://www.edunext.co/articles/using-scorm-contents-in-open-edx-courses/
- https://discuss.openedx.org/t/multi-tenancy-support/5524
- https://github.com/eduNEXT/eox-tenant
- https://www.edunext.co/articles/latest-open-edx-versions/
- https://scorm.com/scorm-explained/
- https://scorm.com/scorm-explained/business-of-scorm/scorm-versions/
- https://www.easygenerator.com/en/blog/results-tracking/scorm-1-2-and-scorm-2004/
- https://hsi.com/solutions/employee-training-and-development/scorm-aicc-compliant-training-courses
- https://esafety.com/content/
- https://hazwoper-osha.com/scorm-packages
- https://www.adlnet.gov/assets/uploads/DODI-FY24FR.pdf
- https://standards.ieee.org/ieee/9274.1.1/7321/
- https://xapi.com.au/xapi-iso-and-the-quiet-shift-most-people-have-missed/
- https://opensource.ieee.org/xapi/xapi-base-standard-documentation/-/blob/main/9274.1.1%20xAPI%20Base%20Standard%20for%20LRSs.md
- https://github.com/adlnet/lrs-conformance-test-suite
- https://lrstest.adlnet.gov/about
- https://github.com/AICC/cmi-5_Spec_Current/blob/quartz/cmi5_spec.md
- https://aicc.github.io/CMI-5_Spec_Current/SCORM/
- https://xapi.com/cmi5/technical/
- https://rusticisoftware.com/blog/taking-cmi5-adoption-further-by-developing-a-conformance-test-suite/
- https://opensource.ieee.org/xapi-cmi5/9274.3.1
- https://www.didask.com/en/post/cmi5-quel-est-ce-nouveau-standard-du-e-learning
- https://access.articulate.com/support/article/Storyline-360-Publish-to-cmi5
- https://www.1edtech.org/standards/lti
- https://www.imsglobal.org/lti-advantage-overview
- https://www.imsglobal.org/spec/lti-ags/v2p0
- https://www.1edtech.org/standards/lti/why-adopt-lti-1p3
- https://github.com/yetanalytics/lrsql
- https://www.yetanalytics.com/sql-lrs
- https://www.sqllrs.com/lrspipe
- https://repo1.dso.mil/dsop/opensource/yetanalytics/sql-lrs
- https://github.com/LearningLocker/learninglocker
- https://learningpool.com/blog/learning-locker-open-source-v2-is-here
- https://learningpool.com/blog/learning-locker-lrs-what-you-missed-in-100-commits
- https://www.proprofstraining.com/blog/learning-record-store-lrs/
- https://www.watershedlrs.com/product/
- https://www.watershedlrs.com/about-us/
- https://rusticisoftware.com/blog/welcoming-watershed-ltg/
- https://www.watershedlrs.com/product/pricing/
- https://www.trustradius.com/products/watershed-lrs/pricing
- https://www.capterra.com/p/212122/Watershed/
- https://lrs.io/home/features
- https://lrs.io/home/lrs-pricing
- https://veracity.it/veracity_learning_lite_free_xapi_learning_record_store_lrs
