# Functionality audit — "Construction Safety Series — Curriculum & Production Plan" vs the codebase

| | |
|---|---|
| **Audit date** | 2026-07-04 |
| **Deck** | "Construction Safety Series — Curriculum & Production Plan", ref `SF-CUR-2026-CSS-01`, 14 slides |
| **Deck PDF sha256** | `aa073b548bcfa1ba478a5d08a7243cd146056521b0c34ed09a1b15cb5059bd58` (PDF deliberately not committed) |
| **Audited commit** | `4e0a939` |
| **Method note** | **Code is the source of truth; every verdict carries file evidence.** Docs and comments were used only as leads — each citation below was re-read at the stated lines before being asserted. |

The deck is the plan of record for the Construction Safety Series. This audit answers one
question per claim: *does the platform, at commit `4e0a939`, actually do this end-to-end?*

---

## 1. Method

**Extraction.** Text was extracted from the 14-page PDF and re-derived into an atomic claims
register: one row per independently auditable assertion, with a verbatim quote and slide number.
Page footers (a tokenized share URL plus a timestamp) and trailing page-number lines were
stripped from all quoted material and from the Appendix A inventory; PDF ligatures (fi/ffl) were
normalized to plain text. Claim IDs `D-01`…`D-15` are stable and cross-referenced by other docs;
where a cluster splits into atomic claims it uses suffixes (`D-01a`…). Non-auditable claims
(marketing framing, statistics, external regulatory facts, production tooling) are excluded from
verdicts but listed in Appendix A's non-auditable table (`N-xx`) so nothing silently disappears.

**Classes.** `feature` (product behavior), `content` (curriculum/media inventory), `platform`
(infrastructure/integration), `game` (interactive/scenario layer), `non-auditable`.

**Verdicts** (verbatim rubric):

- **IMPLEMENTED** — an end-to-end usable path exists in code (authoring → delivery → completion
  evidence where relevant).
- **PARTIAL** — some layer exists (schema/type/UI) but the end-to-end path breaks — the breaking
  layer is NAMED.
- **ABSENT** — no meaningful code surface — with evidence-of-absence cited (e.g. the switch
  statement that lacks the case, the insert that omits the column).
- **N/A** — non-product claim.

**Severity** (verbatim rubric):

- **P0** — blocks the deck's core loop (the deck sells this as central).
- **P1** — partial with a broken end-to-end path.
- **P2** — enhancement gap.
- **P3** — cosmetic / roadmap.

*Application note:* severity ranks the **gap**, not the verdict. P1's canonical case is a
PARTIAL claim with a broken end-to-end path; an ABSENT claim also rates P1 when it is
deck-central without blocking the four-beat core loop itself (e.g. the jurisdiction model),
and P2 when it is a fallback or hygiene feature.

---

## 2. Executive summary

**Verdict counts** (21 atomic claims from 15 clusters; excludes 8 non-auditable `N-xx` rows):

| Verdict | Count | Claims |
|---|---|---|
| IMPLEMENTED | 3 | D-01a, D-01b, D-14 |
| PARTIAL | 8 | D-02, D-03, D-05, D-06a, D-07, D-09c, D-10, D-13 |
| ABSENT | 9 | D-01c, D-01d, D-04, D-06b, D-08, D-09a, D-09b, D-11, D-12 |
| N/A | 1 | D-15 |

Severity spread: **4 × P0** (D-01c, D-01d, D-03, D-04), **8 × P1**, **4 × P2**, **1 × P3**.

**Top-5 gaps:**

1. **P0 — "Decide It" branching scenario engine is absent** (D-01c, D-04). No scenario lesson
   kind, no branching model, no scenario player; `kind='game'` exists in the schema but is
   unauthorable in the console and dead-ends in the one mobile player screen.
2. **P0 — "Prove It" gamified assessment is absent** (D-01d). The deck's mini-games/timed hazard
   hunts have no engine; the nearest surface is a plain single-choice quiz (see gap 3).
3. **P0 — no authoring path for assessable content** (D-03). The pass-gate machinery (threshold,
   scoring, passed/failed evidence) is real, but no console surface writes `lessons.content`
   questions, so the ≥80% gate is unreachable without hand-written SQL.
4. **P1 — beat-level xAPI evidence is never emitted** (D-02). The verb catalog and the outbox
   accept `launched/experienced/answered`; production code emits only
   `completed`/`passed`/`failed`.
5. **P1 — the jurisdiction model (FED/CAL/NEV, strictest-wins) does not exist anywhere** (D-08).
   Zero jurisdiction, citation, or state-plan surface in schema, types, or UI.

Close behind: supervisor-attested sign-off (D-05, P1 — the worker self-completes a
`practical-signoff`, and current RLS structurally prevents a supervisor from recording a
statement about a worker) and offline media (D-10, P1 — the download engine is a never-invoked
scaffold).

**Honest posture.** The platform's spine is genuinely strong and is exactly what the deck's
tracking story needs underneath: tenant isolation by Postgres RLS with server-side stamping,
an append-only, idempotent, crash-safe xAPI statement pipeline that survives dead zones,
progress recomputed server-side from statements, automatic tamper-proof certificates, and
tenant-checked signed video playback that degrades gracefully. What the deck sells *on top* of
that spine mostly does not exist yet: the interactive third and fourth beats (scenario, game),
authoring depth (quiz questions, any lesson content), the compliance layer (jurisdictions,
citation review flags), granular evidence, supervised attestation, and EN/ES. The deck describes
a curriculum product; the repo today is a very solid completion-evidence platform with a
video+quiz delivery surface and a one-course seed.

---

## 3. Audit matrix

Evidence paths are repo-relative. For ABSENT verdicts the citation is evidence-of-absence.

| ID | Claim (verbatim, slide) | Class | Verdict | Evidence | Gap detail | Sev |
|---|---|---|---|---|---|---|
| D-01a | "1 · See It VIDEO — Real-world context and why-it-matters" (S5); "Every module runs the same four-beat media arc" (S2) | feature | **IMPLEMENTED** | Authoring: `apps/console/src/services/api.ts:945-955` (video lesson) + `:1344-1391` (`setLessonVideo` links a Stream `playback_id`). Delivery: `apps/mobile/src/screens/LessonPlayerScreen.tsx:272,375-474`; `apps/web/src/components/StreamWebPlayer.tsx:117-124`; `supabase/functions/stream-signed-url/index.ts:95-119`. Evidence: `LessonPlayerScreen.tsx:184-195` | Full loop: console authors → tenant-checked signed playback → `completed` statement. | — |
| D-01b | "2 · Understand It BLENDER ANIMATION — The invisible mechanism" (S5) | content | **IMPLEMENTED** (as delivery) | Same pipeline as D-01a — a rendered animation is a video asset; `supabase/migrations/20260701041403_01_core_schema.sql:118-128` (`video_assets`, provider-agnostic metadata) | No dedicated "animation" kind is needed; the beat rides the video path. No animation *content* exists (see D-12). | — |
| D-01c | "3 · Decide It AI SCENARIO — Branching jobsite decisions with consequence beats" (S5); "Every choice branches" (S6) | game | **ABSENT** | No scenario kind in the `lessons.kind` CHECK (`…01_core_schema.sql:70`); the nearest kind `game` is missing from the console's kind options (`apps/console/src/App.vue:378-384`) and falls to the generic `default` in the only mobile player's kind switch (`apps/mobile/src/screens/LessonPlayerScreen.tsx:51-88`), which mounts a player only for `kind==='video'` (`:272`). Repo-wide grep for scenario/branching logic matches only display copy in an in-memory preview object (`apps/console/src/App.vue:188`) | No branching model, no scenario player, no authoring; `game` lessons render title + "mark complete". | P0 |
| D-01d | "4 · Prove It" — "Harness inspection pass/fail · clearance-calculation mini-game · timed roof hazard hunt" (S10, S6) | game | **ABSENT** | Same dead-end as D-01c for `kind='game'` (`LessonPlayerScreen.tsx:51-88,272`; `App.vue:378-384`). No game engine, timer, or mini-game surface anywhere in `apps/**` or `packages/ui` (gamification components there are display-only, §5 K-3) | The non-gamified quiz path is the nearest surface and is itself authoring-blocked (D-03). | P0 |
| D-02 | "every beat emits xAPI evidence to the LRS" (S2); "TRACKING — EVERY BEAT EMITS EVIDENCE: launched · experienced · answered · passed" (S7) | platform | **PARTIAL** | Verb catalog complete incl. `launched/experienced/answered/progressed/played/paused`: `packages/shared/src/xapi.ts:32-48`. Outbox is verb-agnostic (accepts `experienced` in `apps/mobile/src/offline/__tests__/queue.test.ts:114,337`). But the only production emit sites are `completed` (`LessonPlayerScreen.tsx:190`) and `passed`/`failed` (`apps/mobile/src/components/QuizPlayer.tsx:85-90`); web/console emit nothing (console only reads statements, `apps/console/src/services/api.ts:1111`) | Breaking layer: **emission call sites** — no code ever enqueues `launched`, `experienced`, or `answered`. The pipeline beneath is ready. | P1 |
| D-03 | "≥ 80% gamified assessment score" — "competency, not seat time" (S7) | feature | **PARTIAL** | Threshold plumbing real: `lessons.passing_score` (`…01_core_schema.sql:76`), default 80 (`apps/mobile/src/api/lessonContent.ts:67`), resolution order (`:171-176`), enforcement + retake-with-new-UUID (`QuizPlayer.tsx:110,204-215,271-284`), `passed` counts toward progress (`supabase/migrations/20260701210000_12_progress_verbs_and_advisor_fixes.sql:47-56`) | Breaking layer: **authoring** — both console lesson writers omit `content` (`apps/console/src/services/api.ts:723-733` and `:945-955`; update path `:966-974`), confirmed by `lessonContent.ts:5-11`; seed authors none (`supabase/seed.sql:61-68`). No quiz can exist without hand-written SQL. (Integrity note: scoring is on-device with `correctChoiceId` client-readable — accepted MVP trade-off, `lessonContent.ts:36-41`; see §5 K-7.) | P0 |
| D-04 | "SCENARIO mastery path completed" as a completion gate (S7) | game | **ABSENT** | No scenario surface (D-01c evidence); completion is uniformly "all required lessons carry a `completed|passed` statement" (`…12_….sql:44-68`) — no per-beat or mastery-path gating construct exists | Course completion cannot distinguish a mastered scenario from any other checked-off lesson. | P0 |
| D-05 | "SIGN-OFF — in-person skills check" (S7); "in-person skills sign-offs" (S2); "sign-offs recorded against the learner profile" (S7) | feature | **PARTIAL** | Kind exists and is authorable: `…01_core_schema.sql:70`, `App.vue:383`; labeled in players (`apps/mobile/src/screens/CourseDetailScreen.tsx:55-56`, `LessonPlayerScreen.tsx:76-81`); its statement is recorded against the learner (`user_id`) | Breaking layer: **attestation**. The worker self-completes via the generic mark-complete (`LessonPlayerScreen.tsx:159-220` — no role gate, no supervisor identity, no signature). Structurally, RLS `statements_insert` binds `user_id = auth.uid()` (`…12_….sql:74-77`), so a supervisor *cannot* record a statement about a worker at all. | P1 |
| D-06a | "xAPI statements to your LRS" (S7); "xAPI → LRS" (S13) | platform | **PARTIAL** | Internal LRS-shaped store fully real: append-only `completion_statements` (`…01_core_schema.sql:101-115`), idempotent upsert `onConflict: 'id', ignoreDuplicates: true` (`apps/mobile/src/offline/transport.ts:67`), engine (`apps/mobile/src/offline/sync.ts:2-22`) | Breaking layer: **forwarding** — grep for `LRS`/learning-record-store across `apps/`, `packages/`, `supabase/` returns zero; no webhook/edge-function fan-out to a tenant's external LRS exists. | P1 |
| D-06b | "SCORM 1.2 fallback for legacy tenants" (S7, S13) | platform | **ABSENT** | Dormant types only: `ScormRuntimeVersion '1.2'|'2004'`, `ScormRuntimeDTO/State` (`packages/shared/src/domain.ts:418-456`), `AssetKind 'scorm-package'` (`:30`), `OfflineSyncItem 'scorm-runtime'` (`:403`), helpers (`:668-676`) — no callers. `kind='scorm'` is unauthorable (`App.vue:378-384`) and hits the player's `default` branch (`LessonPlayerScreen.tsx:82-87`); no runtime API adapter, manifest parser, or export anywhere | Types without a runtime; effectively a paper feature. | P2 |
| D-07 | "One curriculum, three assignment profiles… ASSIGN: TIER 1 + TIER 2 CORE… ASSIGN: TIERS 1–3 BY TRADE + C1" (S2) | feature | **PARTIAL** | Enrollment + idempotent bulk assignment real: `…01_core_schema.sql:84-98` (`unique (user_id, course_id)`); `apps/console/src/services/api.ts:998-1002,1033` (`assignCourse` bulk upsert) | Breaking layer: **profile model** — no tier/track/trade/assignment-profile concept in schema, shared types, or console (grep for pathway/tier/track/designation matches only UI cosmetics and comments). Assignment is manual, per-course, per-user-set. | P1 |
| D-08 | "Three lanes, one curriculum… the platform renders the citations for their jurisdiction — and where a state plan is stricter, the strictest rule wins" (S4); per-lane citations on S10 | platform | **ABSENT** | Zero jurisdiction surface: no jurisdiction/citation/state-plan column in any migration (`supabase/migrations/*.sql`), no field in `packages/shared/src/domain.ts`, no rendering logic in any app (repo-wide grep for jurisdiction/Cal-OSHA/NRS 618/29 CFR in product code: no hits) | Per-learner citation rendering and strictest-wins resolution have no data model to stand on. | P1 |
| D-09a | "EN / ES from day one, all modules" (S2) | platform | **ABSENT** | No i18n framework or locale switch anywhere (grep: only `localeCompare` sorts); all UI copy hardcoded English; statements hardcode `'en-US'` display (`LessonPlayerScreen.tsx:190`, `QuizPlayer.tsx:75`). Dormant legacy DTO field `languageVariants?: string[]` (`domain.ts:94,133`) has no runtime consumer | No language model for content, UI, or evidence. | P1 |
| D-09b | "Captions on all video & animation" (S2) | platform | **ABSENT** | Live `video_assets` has no captions column (`…01_core_schema.sql:118-128`); the only captions field is the retired AWS-era `VideoAssetRecord.captionsAssetKey` (`domain.ts:592`), unreferenced by any live path | Cloudflare Stream can *carry* embedded captions, but the platform neither manages nor verifies them — "all video" is unenforceable. | P2 |
| D-09c | "WCAG-conscious learner UI" (S2) | platform | **PARTIAL** | Real affordances: radio roles + accessibility state (`QuizPlayer.tsx:475-480`), `aria-hidden` glyphs + heading focus management (`apps/web/src/screens/CourseDetail.tsx:82-97,144-146`), reduced-motion handling on web sign-in (`apps/web/src/screens/SignIn.tsx:42`) | Breaking layer: **verification** — no a11y audit, no automated axe/contrast gate in CI; "conscious" is plausible, "conformant" is unproven. | P3 |
| D-10 | "offline-capable module packages for jobsites with poor connectivity" (S13) | platform | **PARTIAL** | Real offline: statement outbox + idempotent sync (`apps/mobile/src/offline/queue.ts`, `sync.ts`, `transport.ts:67`), catalog cache incl. lesson content for offline quizzes (`apps/mobile/src/offline/localStore.ts:1-26`, `apps/mobile/src/db/schema.ts:55-60`), quiz resume (`apps/mobile/src/offline/quizStore.ts:1-25`) | Breaking layer: **media + packaging**. `VideoDownloader` (encrypt-at-rest download engine, `apps/mobile/src/offline/video.ts:107-212`) is exported (`offline/index.ts:73`) but invoked by no screen; the player's "cached offline rendition" check is a *live Postgres query* on `video_assets.download_url` (`apps/mobile/src/api/videoPlayback.ts:118-132,175-184`) that needs network and returns a remote URL. No module-package bundling concept exists. | P1 |
| D-11 | "Every module carries a regulatory-review flag — citation version + last-reviewed date" (S13) | feature | **ABSENT** | `modules` table has no such columns (`…01_core_schema.sql:53-63`); repo-wide grep for regulatory/citation/last_reviewed/review_flag in product code: zero hits | No review-cadence metadata anywhere; compliance-as-final-gate has no system surface. | P2 |
| D-12 | "16 MODULES / 4 TIERS / 2 CAPSTONE PATHS" (S1); curriculum map with per-module durations (S9); M4 module detail (S10) | content | **ABSENT** | Seed = 1 published course, 1 module, 2 lessons, no authored content, no video asset rows (`supabase/seed.sql:28-41,56-68`). Duration columns exist at course/lesson level (`…01_core_schema.sql:45,73`) but not module level (S9 quotes per-module minutes) | None of M1–M16, the tiers, or the capstones exist as content; the schema could hold them (minus module-level duration and everything in D-07/D-08/D-13). | P1 |
| D-13 | "C1 Competent Person Pathway — bundles M4 · M8 · M9 (+ M11)… designation track" ; "C2… OSHA-30-ALIGNED" (S11) | feature | **PARTIAL** | Per-course certificates auto-issue, immutable to clients: `supabase/migrations/20260701054000_11_certificates.sql:4-53` | Breaking layer: **pathway model** — no multi-course bundle/designation construct; the console's bundle surface is an in-memory echo stub with no table (`apps/console/src/services/api.ts:1527-1583`). A "designation" spanning courses cannot be expressed or awarded. | P2 |
| D-14 | "WebView delivery for the Three.js / gamified layers" (S13) | platform | **IMPLEMENTED** (the seam) | The exact pattern is in production for video: `react-native-webview` renders a server-minted, tenant-checked embed URL (`LessonPlayerScreen.tsx:408-425`; token minting `supabase/functions/stream-signed-url/index.ts:34,95-119`) | The delivery mechanism is proven end-to-end; nothing *interactive* currently routes through it — that content gap is D-01c/D-01d, designed in ADR-0011 / `docs/unity-games-integration-design.md`. | — |
| D-15 | "PHASE 1 MVP — M1 M3 M4 M8… a demoable vertical slice" (S12) | non-auditable | **N/A** | Roadmap input, not a code claim | Consumed as sequencing input in §4. | — |

---

## 4. Prioritized gap list

Owners per the swarm roster in `docs/CLAUDE_SWARM.md` (§2). Sizes: S ≲ a day of focused agent
work, M ≈ a multi-session slice, L = a phased workstream. Sequencing assumes the deck's Phase 1
target (a demoable four-beat vertical slice).

### P0 — blocks the core loop

| # | Gap | Claims | Owner(s) | Size | Sequencing / notes |
|---|---|---|---|---|---|
| G-1 | Quiz/question **authoring** — console UI writing the documented `lessons.content` shape; promote the content contract from `apps/mobile/src/api/lessonContent.ts` into `packages/shared` | D-03 (+ enables a Prove-It-lite for D-01d) | `console-web` + `api-data`; `test-runner` gate | M | **Do first.** Cheapest P0; the entire scoring/evidence/progress chain below it already works. |
| G-2 | "Decide It" **branching scenario engine** — scenario content model, player, and mastery evidence | D-01c, D-04 | `sfg-developer` (design lead) + `mobile`, `api-data`; `security-reviewer` on the bridge | L | Design is being authored **in parallel** — see **`docs/adr/0011-unity-webgl-games.md`** and **`docs/unity-games-integration-design.md`** (not yet in-tree at the audited commit `4e0a939`; cite, do not duplicate here). Delivery seam already exists (D-14). |
| G-3 | "Prove It" **gamified assessment** — mini-game/timed-drill layer emitting scored xAPI results | D-01d | `sfg-developer` + `mobile` | L | Same integration seam and ADR as G-2; ship after G-1 so a non-game assessment gate exists meanwhile. |

### P1 — partial with a broken end-to-end path

| # | Gap | Claims | Owner(s) | Size | Sequencing / notes |
|---|---|---|---|---|---|
| G-4 | **Beat-level evidence emission** — `launched` on lesson open, `experienced` on media completion, `answered` per question; wire web `onPlay`/`onPause` (§5 K-5) | D-02 | `mobile` + `offline-sync` (queue is already verb-agnostic) + `console-web` (reporting) | S–M | Early, alongside G-1 — it multiplies the value of everything else. Watch outbox volume for `answered`. |
| G-5 | **Supervisor attestation** for `practical-signoff` — supervisor-authored sign-off about a learner (new migration: attestation policy or a signoffs table; today `statements_insert` hard-binds `user_id = auth.uid()`) | D-05 | `aws-infra` (migration) + `mobile` UI; **mandatory `security-reviewer` gate** (touches RLS) | M | Before any competent-person messaging; the current self-attest flow would not survive an audit. |
| G-6 | **Jurisdiction model** — jurisdiction entity, per-course/lesson citation mapping, learner/site jurisdiction, strictest-wins resolution, rendering | D-08 | `api-data` (contract) + `aws-infra` (schema) + `console-web`/`mobile` (render) | L | Pairs naturally with G-13 (review flags) as one "compliance spine" slice. |
| G-7 | **Assignment profiles** — tier/track/profile tables + assign-by-profile in console | D-07 | `aws-infra` + `api-data` + `console-web` | M | After content exists (G-10); manual bulk-assign is a workable interim. |
| G-8 | **EN/ES** — i18n framework, localized content fields, localized statement displays | D-09a | `mobile` + `console-web` + `api-data` | L | Cheapest when started before content production locks in single-language shapes. |
| G-9 | **Offline media + module packages** — invoke the existing `VideoDownloader` scaffold from a real download flow; make `useLessonVideo` consult the local `videos` table instead of a live `download_url` query; define a module-package manifest | D-10 | `offline-sync` + `video` | M–L | The statement/catalog/quiz offline layers are done; this closes the last (media) leg. |
| G-10 | **Content production M1–M16** — produced via the console by the curriculum team; repo enablers: G-1 plus a Python seed/import harness | D-12 | curriculum team (outside repo); harness: `sfg-developer` | L (content) / S (harness) | Phase-1 order per the deck: M1, M3, M4, M8. |
| G-11 | **External LRS forwarding** — per-tenant LRS endpoint config + statement fan-out (edge function/webhook off `completion_statements`) | D-06a | `aws-infra`; `security-reviewer` (credentials, egress) | M | Design-level first; internal store already preserves everything to forward later. |

### P2 — enhancement gaps

| # | Gap | Claims | Owner(s) | Size |
|---|---|---|---|---|
| G-12 | Captions management — `video_assets` captions metadata + console upload/verify + "all video has captions" report | D-09b | `video` + `aws-infra` + `console-web` | S–M |
| G-13 | Regulatory-review flag — citation version + last-reviewed columns on modules/courses + console review queue | D-11 | `aws-infra` + `console-web` | S |
| G-14 | Pathways/designations — multi-course bundle model, designation award on bundle completion (extends the certificate trigger) | D-13 | `api-data` + `aws-infra` | M |
| G-15 | SCORM 1.2 — either build a runtime (L) or **descope explicitly via an ADR** and stop selling the fallback; dormant types today are worse than either | D-06b | `sfg-developer` (recommendation: descope ADR first) | S (ADR) / L (runtime) |

### P3 — cosmetic / roadmap

| # | Gap | Claims | Owner(s) | Size |
|---|---|---|---|---|
| G-16 | WCAG verification pass — axe/contrast checks in CI, screen-reader pass over the three learner surfaces | D-09c | `console-web` + `mobile` | S–M |

**Suggested overall sequence** (Phase-1-aligned): G-1 → G-4 → G-5 → G-2/G-3 (per ADR-0011) →
G-13 + G-6 (compliance spine) → G-9 → G-10 content ramp → remainder by tier.

---

## 5. Known gaps NOT claimed by the deck

Found during the same code pass; listed so this is a complete functionality audit rather than
deck-flattery. None of these blocks a deck claim directly.

| # | Finding | Evidence |
|---|---|---|
| K-1 | The web app has no invite-redemption flow — a session without a profile is treated as unauthenticated; only mobile can join a tenant | `apps/web/src/auth.tsx:18`; mobile `apps/mobile/src/screens/JoinTenantScreen.tsx`; invites schema `supabase/migrations/20260701045000_06_invitations.sql:1-23` |
| K-2 | Console commerce panels (packages/bundles/billing) are echo stubs — no backing tables; writes return in-memory objects | `apps/console/src/services/api.ts:1527-1583` |
| K-3 | Gamification UI has no data model — `AchievementBadge`/`RankMedal`/`LeaderboardRow` exist in `packages/ui/src/`; Home badges are derived on-device from enrollment aggregates; `RankMedal`/`LeaderboardRow` are used by no app; nothing persists achievements/points/ranks | `apps/mobile/src/screens/HomeScreen.tsx:184-228`; grep: no app imports RankMedal/LeaderboardRow |
| K-4 | Reflection lessons capture no learner response — the statement carries `result: { completion: true }` only; `XapiResult.response` exists unused | `apps/mobile/src/screens/LessonPlayerScreen.tsx:184-195`; `packages/shared/src/xapi.ts:89` |
| K-5 | Web engagement callbacks unwired — `StreamWebPlayer` exposes `onPlay`/`onPause` but its only mount passes neither (feeds D-02/G-4) | `apps/web/src/components/StreamWebPlayer.tsx:55-56`; `apps/web/src/screens/CourseDetail.tsx:209` |
| K-6 | The private `tenant-media` storage bucket is wired to no client code — document lessons cannot carry attachments yet | `supabase/migrations/20260701041536_03_storage.sql:4-11`; grep: zero `storage.from(` callers in `apps/**` |
| K-7 | Quiz integrity trade-off — scoring is on-device and `correctChoiceId` ships in RLS-readable content (documented, accepted for offline MVP); server-side scoring is the hardening path if a tenant needs audit-grade assessment integrity (relevant to D-03) | `apps/mobile/src/api/lessonContent.ts:36-41` |

---

## 6. Appendix A — slide-by-slide extracted inventory

Cleaned: page-footer lines (a tokenized share URL + timestamp) and the trailing page-number
lines are stripped; ligatures normalized. This is an inventory of assertions, not a full
transcript.

| Slide | Contents |
|---|---|
| 1 | Title: "Construction Safety Series — OSHA · CAL/OSHA · NEVADA OSHA". Tagline "From awareness to demonstrated competency — one curriculum, compliant across three jurisdictions at once." Headline stats: 16 MODULES / 4 TIERS / 2 CAPSTONE PATHS. → D-08, D-12 |
| 2 | "One curriculum, three assignment profiles. Every module runs the same four-beat media arc, and every beat emits xAPI evidence to the LRS." New-hire profile (OSHA-10-aligned awareness, "ASSIGN: TIER 1 + TIER 2 CORE"); experienced/CP profile ("ASSIGN: TIERS 1–3 BY TRADE + C1", "in-person skills sign-offs"). Footer strip: "EN / ES from day one, all modules · Captions on all video & animation · WCAG-conscious learner UI". → D-01, D-02, D-05, D-07, D-09 |
| 3 | "Why this series exists — the data": 1,032 construction/extraction deaths (2024 CFOI); 65% of 2011–2021 deaths from the Focus Four; falls 370/1,032; struck-by; caught-in/between; electrocution ≈9%; "a US worker died… every 104 minutes in 2024"; sources BLS CFOI 2024 / CPWR. → N-01 |
| 4 | "Three lanes, one curriculum… the platform renders the citations for their jurisdiction — and where a state plan is stricter, the strictest rule wins." FED: 29 CFR 1926, §5(a)(1). CAL: Title 8, IIPP §3203/§1509, §342 ≤8 hr serious-injury report, §341 permits, §3395 heat. NEV: NRS/NAC 618, OSHA-10/30 within 15 days of hire (NRS 618.983/.987), stricter cranes/steel/asbestos/PV, NEPs trenching/silica; "complements the card — doesn't replace it". → D-08 (platform), N-03 (external facts) |
| 5 | "The four-beat instructional model… each beat maps to exactly one media type." 1 See It (VIDEO), 2 Understand It (BLENDER ANIMATION), 3 Decide It (AI SCENARIO — "Branching jobsite decisions with consequence beats"). → D-01a/b/c |
| 6 | "What each build looks like" — Blender/EEVEE animation mock (free-fall/decel/clearance); AI-scenario mock ("Fall Protection Scenario 3", guardrail-pulled decision with choices A/B/C, "Every choice branches — the roof plays out the consequence"). → D-01c, N-04 |
| 7 | "Completion gates — competency, not seat time": "≥ 80% gamified assessment score + SCENARIO mastery path completed + SIGN-OFF in-person skills check — competent-person tasks only". Tracking strip: "launched · experienced · answered · passed"; "xAPI statements to your LRS · SCORM 1.2 fallback for legacy tenants · sign-offs recorded against the learner profile". → D-02, D-03, D-04, D-05, D-06 |
| 8 | "The project world — one unifying jobsite": ground-up wide-body MRO hangar campus; one recurring cast; "THE BUILD IS THE SYLLABUS — PHASES UNLOCK MODULE SETTINGS" (excavation M8/M12; steel M4/M11/M14; concrete M2/M6/M12; roof-truss M5). → N-05 |
| 9 | "Curriculum map — 16 modules, 4 tiers": Tier 1 Foundations (M1 25′, M2…); Tier 2 Focus Four (M4 Fall Protection 35′, M5 25′, M6…); Tier 3 High-Hazard (M8 35′, M9 30′, M10, M12 28′, M13 25′, M14); Tier 4 Environment/Health/Readiness (M15 28′, M16). → D-12 |
| 10 | "Inside a module — M4 · Fall Protection": objectives (trigger heights, system selection, harness/anchor, ABCD + rescue plan); per-lane citations (FED Subpart M .501/.502/.503; CAL T8 §1669–§1671.2, §1670; NEV adopts Subpart M); the four beats incl. PROVE IT = "Harness inspection pass/fail · clearance-calculation mini-game · timed roof hazard hunt". → D-01, D-08, D-12 |
| 11 | "Two capstone pathways": C1 Competent Person Pathway (bundles M4·M8·M9 + M11; daily-inspection sims; stop-work scenarios; "SIGN-OFF in-person skills verification required"); C2 program ownership (Cal IIPP + NV written program & heat JHA, NV 15-day clock, incident investigation, recordkeeping) — "OSHA-30-ALIGNED". → D-05, D-13 |
| 12 | "Phased build — prove the engine, then scale it": PHASE 1 MVP = M1 M3 M4 M8 ("Proves the See → Understand → Decide → Prove engine end-to-end — a demoable vertical slice. Stand up the full Blender library here."); PHASE 2 = M5 M6 M7 M9 M12. → D-15, N-08 |
| 13 | "Asset library & platform fit": reusable site/avatar/equipment library; CONTENT GOVERNANCE: "Every module carries a regulatory-review flag — citation version + last-reviewed date… standing review cadence, compliance review as the final gate"; SOTERIA FORGE FIT: "WebView delivery for the Three.js / gamified layers · xAPI → LRS with SCORM 1.2 fallback · offline-capable module packages for jobsites with poor connectivity". → D-06, D-10, D-11, D-14, N-06 |
| 14 | "Review gate & next steps": 1 Compliance review (EHS counsel verifies Fed/Cal/Nev citations, sets review cadence); 2 Phase 1 greenlight (script/board M1·M3·M4·M8). "Citations reflect standards as of July 2026… The 16-page curriculum plan SF-CUR-2026-CSS-01 is the reference document." → N-07 |

**Non-auditable claims register** (excluded from verdicts; nothing dropped):

| ID | Claim | Slide | Why non-auditable |
|---|---|---|---|
| N-01 | Fatality statistics (1,032 deaths; 65% Focus Four; 370 falls; ≈9% electrocution; every 104 minutes) | 3 | External statistics (BLS/CPWR), not product functionality |
| N-02 | "From awareness to demonstrated competency — one curriculum, compliant across three jurisdictions at once" | 1 | Marketing framing (its mechanics are audited as D-01/D-03/D-08) |
| N-03 | Specific regulatory assertions (IIPP §3203/§1509; §342 ≤8 hr; §341; §3395; NRS 618.983/.987 15-day; NEPs; Subpart M cites) | 4, 10 | External legal facts — for EHS counsel per S14, not code |
| N-04 | Blender/EEVEE production tooling and render specifics | 5, 6, 12 | Production pipeline outside this repo |
| N-05 | Unifying MRO-hangar project world, recurring cast, phase-unlocked settings | 8 | Creative/production design, no platform surface claimed |
| N-06 | Asset library reuse strategy (site/avatar/equipment; "build once, reuse everywhere") | 13 | Production economics, not platform behavior |
| N-07 | Review gate & next steps (compliance review; Phase 1 greenlight); "standards as of July 2026" | 14 | Process/roadmap |
| N-08 | Phase 2 module scope (M5 M6 M7 M9 M12) | 12 | Roadmap (with D-15) |

---

## 7. Appendix B — evidence index

Every file cited above, once, with its role in this audit.

| File | Role |
|---|---|
| `supabase/migrations/20260701041403_01_core_schema.sql` | Live schema: lesson kinds incl. dormant `game`/`scorm` (:70), `passing_score` (:76), `content` jsonb default (:77), enrollments (:84-98), append-only statements (:101-115), `video_assets` metadata-only, no captions/language (:118-128), duration columns (:45, :73), no jurisdiction/review columns anywhere |
| `supabase/migrations/20260701041536_03_storage.sql` | Private `tenant-media` bucket, first-path-segment tenant scoping (:4-11) — wired to no client (K-6) |
| `supabase/migrations/20260701045000_06_invitations.sql` | Server-side invitations + stamped redemption (K-1 context) |
| `supabase/migrations/20260701051000_08_enrollment_progress_from_statements.sql` | Progress recomputed from statements (superseded matcher :26-32) |
| `supabase/migrations/20260701054000_11_certificates.sql` | Auto-issued, client-immutable certificates (:4-53) — D-13's implemented half |
| `supabase/migrations/20260701210000_12_progress_verbs_and_advisor_fixes.sql` | Progress counts exactly `completed|passed` (:47-56); `statements_insert` binds `user_id = auth.uid()` (:74-77) — D-05's structural blocker |
| `supabase/seed.sql` | The entire content inventory: 2 tenants, 1 course, 1 module, 2 lessons, no content/video rows (:28-41, :56-68) — D-12 |
| `supabase/functions/stream-signed-url/index.ts` | Tenant-checked (caller-JWT RLS) signed playback minting, 2 h TTL, 501 degrade (:34, :95-119, :126-128) — D-01a/D-14 |
| `packages/shared/src/xapi.ts` | Full verb catalog incl. `launched/experienced/answered` (:32-48); unused `result.response` (:89) — D-02, K-4 |
| `packages/shared/src/domain.ts` | `LessonKind` (:27); dormant SCORM types (:30, :403, :418-456, :668-676) — D-06b; dormant `languageVariants` (:94, :133) and `captionsAssetKey` (:592) — D-09 |
| `apps/mobile/src/screens/LessonPlayerScreen.tsx` | The only mobile player: kind switch where `game`/`scorm` hit `default` (:51-88), self-serve mark-complete incl. `practical-signoff` (:76-81, :159-220), `completed` emission (:184-195), video-only player mount (:272), WebView embed pattern (:408-425) |
| `apps/mobile/src/components/QuizPlayer.tsx` | Threshold enforcement (:110), `passed`/`failed` + score (:85-90), crash-safe pinned attempt UUID (:204-215), retake = new id (:271-284) — D-03's working half |
| `apps/mobile/src/api/lessonContent.ts` | The `lessons.content` contract; "console… writes NO content" (:5-11); default pass 80 (:67); on-device scoring trade-off (:36-41) |
| `apps/mobile/src/api/courseTree.ts` | Kind narrowing incl. `game`/`scorm` passthrough (:136-149); statement-backed completion reads (:287) |
| `apps/mobile/src/api/videoPlayback.ts` | "Offline rendition" check is a live `video_assets.download_url` query (:118-132, :175-184) — D-10's media break |
| `apps/mobile/src/offline/queue.ts` | Append-only outbox; verb-agnostic enqueue; `COMPLETION_VERB_IDS` mirrors migration 12 (:136-139) |
| `apps/mobile/src/offline/sync.ts` | No-conflict-resolution proof + injected transport (:2-22, :170) |
| `apps/mobile/src/offline/transport.ts` | The idempotent upsert `onConflict: 'id', ignoreDuplicates: true` (:67) — D-06a's implemented half |
| `apps/mobile/src/offline/localStore.ts` | Offline catalog cache (server→device one-way) (:1-26) — D-10's working half |
| `apps/mobile/src/offline/quizStore.ts` | Offline quiz resume + idempotent submission pinning (:1-25) |
| `apps/mobile/src/offline/video.ts` | `VideoDownloader` encrypt-at-rest scaffold (:107-212), exported (`offline/index.ts:73`) but invoked by no screen — D-10 |
| `apps/mobile/src/db/schema.ts` | Local store tables incl. `videos` bookkeeping and cached lesson content (:43-60) |
| `apps/mobile/src/offline/__tests__/queue.test.ts` | Proof the outbox accepts non-completion verbs (`experienced`, :114, :337) — D-02 |
| `apps/mobile/src/screens/CourseDetailScreen.tsx` | Label-only handling of `scorm`/`game` (:45-64) |
| `apps/mobile/src/screens/HomeScreen.tsx` | Enrollment-derived (non-persisted) achievement badges (:184-228) — K-3 |
| `apps/mobile/src/screens/JoinTenantScreen.tsx` | Mobile invite redemption exists (K-1 contrast) |
| `apps/web/src/screens/CourseDetail.tsx` | All-7-kind glyphs (:37-80); non-video "open it in the app" placeholder (:207-219); player mounted without engagement callbacks (:209) |
| `apps/web/src/components/StreamWebPlayer.tsx` | Web Stream player; unused `onPlay`/`onPause` seam (:55-56, :117-124) |
| `apps/web/src/screens/SignIn.tsx` | Reduced-motion handling (:42) — D-09c |
| `apps/web/src/auth.tsx` | "no invite-redemption flow" (:18) — K-1 |
| `apps/console/src/App.vue` | `LESSON_KIND_OPTIONS` omit `game`/`scorm` (:378-384); in-memory preview object containing the only "scenario" string in the repo (:159-203, :188) |
| `apps/console/src/services/api.ts` | Lesson writers omit `content` (:723-733, :945-955, :966-974); bulk `assignCourse` (:998-1002, :1033); statement reads for reports (:1111); `setLessonVideo` incl. `download_url` authoring (:1344-1391); commerce echo stubs (:1527-1583) |
| `packages/ui/src/AchievementBadge.tsx`, `packages/ui/src/RankMedal.tsx`, `packages/ui/src/LeaderboardRow.tsx` | Display-only gamification kit; latter two unused by any app — K-3 |
| `docs/CLAUDE_SWARM.md` | Agent roster used for gap ownership (§2 table) |
| `docs/adr/0011-unity-webgl-games.md`, `docs/unity-games-integration-design.md` | Scenario/game integration design — authored in parallel to this audit (not yet in-tree at the audited commit `4e0a939`); G-2/G-3 reference them rather than duplicating design |
