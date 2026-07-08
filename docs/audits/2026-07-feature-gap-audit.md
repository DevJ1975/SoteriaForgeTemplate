# Soteria Forge — Feature Gap Audit

**Date:** 2026-07-07

**Method.** Five expert lenses each audited this repository independently: LMS product & learning science, UI/UX & accessibility, EHS compliance & field reality, iOS platform & App Store readiness, and Android platform & fleet deployment. Every audit read the code itself — Supabase migrations, app source, config, and CI — not the docs or marketing material, and each finding cites specific files and line evidence. This report synthesizes their current-state assessments, strengths, and gaps; the consolidated backlog dedupes overlapping findings across lenses into a single ranked list.

Lens abbreviations used below: **LMS** (product & learning science), **UX** (UI/UX & accessibility), **EHS** (compliance & field reality), **iOS**, **AND** (Android).

## Where the product stands today

Soteria Forge is a well-engineered multi-tenant LMS **skeleton whose deepest investment is the trust/data layer, not the learning layer**. The live Supabase backend (migrations 01–12) carries tenants, profiles (four roles), courses/modules/lessons (7 lesson kinds), enrollments, append-only xAPI `completion_statements` (PK = client UUID, no UPDATE/DELETE policy), metadata-only `video_assets`, invitations + `provision_tenant` RPCs, and trigger-issued certificates; enrollment progress is recomputed server-side from the statement stream. Tenant isolation is genuinely enforced in Postgres RLS — with insert-stamping triggers, a role-escalation guard, and FK-consistency hardening — and no client ever sends a `tenant_id`.

The clients are source-only but substantive. `apps/mobile` is a real offline-first learner app: WatermelonDB catalog cache, an append-only completion outbox idempotent by client UUID with exponential backoff and an identity fence, crash-safe resumable quizzes with pass/fail statements, Cloudflare Stream playback via a tenant-checked signed-URL edge function, certificates, and Keychain/Keystore session storage done correctly. `apps/console` (a single 1,772-line Vue `App.vue`) does tenant provisioning, invites, course/module/lesson **header** authoring, roster assignment, a read-only compliance report, and a certificates register. `apps/web` is deliberately browse+play only. The core learning loop demonstrably closes end-to-end: statement → progress trigger → certificate trigger → console report.

The honest counterweight: much of what a training buyer calls "the LMS" is vocabulary without machinery. Quiz/lesson content cannot be authored anywhere; due dates, certificate expiry, and overdue statuses are dead plumbing with no writer; the supervisor role has zero product surface; practical sign-off is worker-self-attested; offline **video** — the headline promise — is an unimplemented scaffold; there are no notifications, no i18n, no SCORM runtime, no transcript exports; and the pinned Expo SDK 52 toolchain is below both Apple's and Google's current store submission floors, so neither binary can ship at all today.

## Lens: LMS product & learning science

**Strengths**

- Tenant isolation enforced in the database itself (RLS + insert stamping, live-verified), and an xAPI completion spine with correct LRS-grade semantics — append-only, client-UUID idempotency, shared fail-fast builders.
- Offline-first mobile is real engineering: durable outbox with backoff and rejected-row quarantine, crash-safe quiz id pinning, tenant-tagged cache, node:test coverage in CI.
- The learning loop closes end-to-end today: completion statement → server progress trigger → auto-issued certificate → console compliance report.
- Production-shaped role model and tenant lifecycle: invitation issue/redeem with expiry, role-escalation guard, `provision_tenant` RPC, documented role bridge.

**Gaps**

| Gap | Why it matters | Suggestion | Priority | Effort |
|---|---|---|---|---|
| No authoring path for quiz/lesson content | The built QuizPlayer and body rendering have no way to receive content except hand-written SQL; the flagship assessment feature is dark | Console lesson-content editor writing the documented `lessons.content` shape; promote the LessonContent contract into `packages/shared` | P0 | M |
| Due dates exist everywhere except where they are set | `due_at` is rendered/counted on mobile and in reports but always NULL — deadline-driven compliance is the core buying reason | Due-date input in console assign flow; pg_cron job flipping statuses to overdue server-side | P0 | S |
| No certificate expiry or recertification cycle | Industrial training recurs by regulation; today the product handles a worker's first completion only | `courses.valid_for_days`, set `expires_at` in the issue trigger, scheduled expiry-window re-enrollment, expiring-soon views | P0 | M |
| Notifications/reminders absent (push, email, escalation) | Deskless workers don't open an LMS spontaneously; nudges are what move completion rates | `notification_outbox` table + scheduled edge function draining to email and Expo push | P1 | L |
| Supervisor persona unserved (no crew model, dashboard, or verified sign-off) | The foreman is the distribution channel for field training; schema/RLS anticipate it but no surface uses it | Console access for supervisors, first-class crew/site, supervisor-session attestation statements for practical-signoff | P1 | L |
| Shallow assessment engine (client-held keys, unlimited attempts, one item type) | The assessment is the product's legal defensibility; answer keys ship to the device today | Server-held answer keys + server-scored high-stakes mode; enforce attempt limits; more item types | P1 | L |
| Reporting stops at rollups — no transcript, no exports | Auditors need a per-worker transcript out of the system; there is zero CSV/PDF export of records | Worker drill-down transcript view + CSV export; certificate PDF via existing UI kit | P1 | M |
| Standards interop is vocabulary only (no SCORM/cmi5/LRS API) | Buyers arrive with SCORM libraries and corporate LRSs; every course must be rebuilt by hand | xAPI `/statements` edge-function facade first, then SCORM package ingest + lightweight web runtime | P1 | XL |
| No curriculum above a single course (paths, prerequisites, rules) | Industrial onboarding is a role-based matrix, not ad-hoc per-user picks; manual assignment doesn't scale | `learning_paths` + `assignment_rules` tables, scheduled server-side assigner, sequential gating in players | P1 | L |
| Web PWA records no learning activity | Kiosk/desktop training earns no credit; the compliance record splits by device | Port the shared idempotent completion outbox pattern (IndexedDB) into `apps/web` | P1 | M |
| Video engagement unmeasured; completion honor-system | No evidence anyone watched anything on a "heavy video" platform; defined video verbs never emitted | Throttled `progressed`/`watchedVideoSegment` statements from both players via the existing outbox | P2 | M |
| No localization / multi-language support | Multilingual crews and OSHA understandability expectations; hardcoded en-US everywhere | UI string catalogs + content translation layer + locale-keyed xAPI display maps | P2 | M |
| No ILT/vILT sessions, rosters, or attendance | A large share of industrial training is instructor-led; blended programs live half in spreadsheets | `sessions` + attendance as append-only xAPI "attended" statements through the outbox | P2 | L |
| No content versioning | Edits mutate published courses under in-flight learners; certificates can't say what was completed | Immutable `course_versions` snapshots on publish; stamp version into statement context and certificates | P2 | L |

## Lens: UI/UX & accessibility

**Strengths**

- State-coverage discipline on every mobile screen (skeletons, error+retry, empty, partial-failure), and offline UX honesty — banner, toasts, and data hooks all read the same connectivity source.
- Design-token discipline holds in code: zero hardcoded brand hexes, mirrored tokens across all three surfaces, persisted light/dark themes.
- Reduced-motion honored kit-wide and accessibility roles/labels on most primitives — rare rigor for a template.
- Auth/onboarding unusually complete: invite redemption with URL/token parsing, offline cold-start identity, anti-enumeration password reset.

**Gaps**

| Gap | Why it matters | Suggestion | Priority | Effort |
|---|---|---|---|---|
| Quizzes/lesson content cannot be authored anywhere | A buyer cannot create a single working quiz or reading lesson through the product | Console content editor (question builder + body textarea) writing the shape the mobile parser validates | P0 | M |
| Offline video download has no UI and unwired native seams | The core austere-environment promise; a worker cannot "take a course to the field" | Download-course action, per-lesson state chips, Downloads/storage screen, implement the existing seams | P0 | L |
| Due dates render everywhere, settable nowhere | The whole overdue pipeline is dead code in practice | Due-date picker in the console assign flow; include `due_at` in the upsert | P0 | S |
| Measured WCAG contrast failures on status surfaces | Offline banner ~2.2:1, primary button ~3.65:1 — failures in a sunlight-first market; blocks 508 buyers | On-color tokens (ink-on-amber, darker ember), contrast assertion test in CI | P1 | S |
| No i18n scaffolding — hardcoded English | ~A third of US construction is Spanish-primary; no seam even for paid translation | String-catalog layer, ship es-US first, locale-keyed xAPI display maps | P1 | L |
| No font-scaling strategy; sub-44px touch targets | Gloves and aging/ESL workers need big targets; 200% text is untested and will break layouts | Kit-level minHeight 48 + hitSlop, `maxFontSizeMultiplier` policy, minWidth over fixed widths | P1 | M |
| Kit primitives silent/unassociated for screen readers | Completion toasts never announced; TextField labels/errors not tied to inputs; modals don't trap focus | Live-region toast announcements, label/error association, `accessibilityViewIsModal` — fixed once in the kit | P1 | M |
| Permanently-rejected completions vanish silently | Worker sees Complete locally while the tenant record never receives it — worst possible failure mode | "My training record" screen (synced/waiting/needs-attention + retry); implement the stubbed console Sync Health | P1 | M |
| Console ergonomics (no routing, confirmations, search/paging; demo creds prefilled) | Unusable at 500 workers; cascading deletes with no confirm; embarrassing prefilled super-admin login | vue-router per view, ConfirmDialog, table toolbar with search/sort/`range()` paging, DEV-gate demo creds | P1 | L |
| No notifications or reminders | Due/overdue/expiring training never nudges anyone | Phase 1: local notifications from cached due dates; Phase 2: server-set expiry + email digests | P1 | L |
| Supervisor role is a badge, not a workflow | Practical-signoff completes via the worker's own Mark-complete button; no crew view | Supervisor tab with crew readiness + a sign-off flow emitting a supervisor-session xAPI statement | P2 | L |
| Certificate share/export and verification absent | Home says "view and share"; there is no Share call, no PDF, no third-party verification | view-shot → Share on mobile; public `/verify/:certificateNumber` page with PII-free RPC + QR | P2 | M |
| Dev Showcase gallery ships as a primary tab; no Profile destination | First-impression polish suffers exactly where a pilot evaluation looks | Gate Showcase behind `__DEV__`; add a Profile tab housing downloads, sync status, certificates, sign-out | P2 | S |

## Lens: EHS compliance & field reality

**Strengths**

- The append-only, idempotent xAPI evidence trail is exactly the right substrate for legally defensible training records.
- Rigorous row-level tenant isolation with role-escalation and FK-consistency hardening, visibly security-reviewed in git history.
- Certificates auto-issue exactly once via a SECURITY DEFINER trigger with unique tenant-prefixed numbers, immutable to clients.
- Profiles already carry `job_title`/`department`/`crew`/`site` and courses carry role/category/tags — natural anchors for a requirements matrix.

**Gaps**

| Gap | Why it matters | Suggestion | Priority | Effort |
|---|---|---|---|---|
| No training-requirements matrix or compliance-status engine | "Who is out of compliance today?" is the safety director's daily question; without it the LMS is just a course player | `training_requirements` (selector → course, recurrence, grace) + compliance RPC, auto-enrollment, console matrix dashboard | P0 | L |
| Certificate expiration/recert cycles are inert schema | HAZWOPER refreshers, 3-year forklift evals, MSHA annuals — tenants drift out of compliance silently | Set `expires_at` in the issue trigger, daily scheduled job for expired transitions + grace-window re-enrollment | P0 | M |
| Practical/OJT sign-off is worker-self-attested | Forklift/fall-protection/LOTO require a qualified evaluator's identity on the record; RLS currently forbids supervisor attestation | Supervisor-driven evaluation flow (evaluator from `auth.uid()`, checklist, signature hash, photo), security-reviewed RLS path | P0 | L |
| Training records destroyed by lifecycle cascades; no auditor-grade export | `ON DELETE CASCADE` from profiles/courses silently destroys "append-only" evidence; sole export is a 6-column CSV | Flip FKs to RESTRICT, soft deactivate/archive lifecycle, per-worker/per-course transcript exports | P0 | M |
| Due dates, overdue transitions, and reminders are display-only plumbing | Nothing writes `due_at`, no status transition ever runs, zero notifications | Wire `dueAt` through the assign flow, daily scheduled transition job, email/push reminders | P1 | M |
| Assessment integrity shallow (no authoring, client keys, no attempt/seat-time/sequence enforcement) | A worker can "complete" a 45-minute course in 20 seconds; ANSI Z490.1 expects documented evaluation | Console authoring; server-side scoring with RLS-hidden keys; enforce attempt limits, seat time, sequence locking | P1 | L |
| Supervisor (foreman) role has no product surface | RLS already grants supervisors the reads; console gates them out, mobile shows a cosmetic badge | Field-first supervisor tab: crew compliance roster (green/amber/red), sign-offs, toolbox talks | P1 | M |
| Toolbox talks / tailgate meetings with sign-in capture don't exist | The highest-frequency training event in construction; the offline outbox is built for exactly this | `field_sessions` table + attendees as append-only "attended" statements from the supervisor's device | P1 | M |
| No multilingual delivery | OSHA requires training in a language workers understand; page-one RFP item | Learner-surface i18n, language-keyed content variants, per-language video/caption tracks | P1 | L |
| No external-credential registry or field verification | OSHA cards, MSHA 5000-23, CPR certs live in a spreadsheet; the product never becomes the system of record | `external_credentials` table with card-photo upload to tenant-media; QR verification for internal certs | P1 | M |
| Competent/qualified-person designations can't be expressed | Site audits ask "who is your competent person?"; also the prerequisite for evaluator eligibility | `designations` table (type, designated_by, basis, effective/expiry) surfaced on profiles and crew views | P2 | S |
| No course versioning | "Show me the curriculum as delivered that date" is a standard litigation demand | Immutable `course_versions` snapshots; stamp version into statement context and transcripts | P2 | M |
| No contractor/multi-employer site model | A GC tenant cannot onboard, orient, or verify another employer's workers — the most common cross-company workflow | Consent-based sharing: time-boxed visitor orientations via invitations, cross-tenant QR credential verification | P2 | L |
| No incident → retraining linkage | Post-incident refresher assignment is standard corrective action (and sometimes mandatory) | `retraining_actions` table + inbound per-tenant webhook creating enrollments with due dates | P2 | M |
| SCORM is an enum value with no runtime | "Can you play our existing SCORM?" is a first-demo question the schema promises and the product can't keep | SCORM 1.2 playback in `apps/web` (packages in tenant-media, CMI→xAPI adapter), or descope honestly | P2 | XL |

## Lens: iOS platform & App Store readiness

**Strengths**

- Session security done right: refresh tokens in the iOS Keychain via a chunked, fail-closed, unit-tested expo-secure-store adapter with AppState-driven refresh.
- Client-side tenant discipline matches the #1 invariant: tenant only from the verified session, deep-link params never trusted, media only via server-minted signed URLs.
- Graceful degradation everywhere (unconfigured backend, 501/403 video, missing native modules) — exactly the resilience App Review exercises.
- EAS build config exists as code with remote versioning and a monorepo-aware post-install hook; a seeded demo tenant is ready-made review collateral.

**Gaps**

| Gap | Why it matters | Suggestion | Priority | Effort |
|---|---|---|---|---|
| Toolchain below the App Store minimum (Expo SDK 52) | App Store Connect rejects non-iOS-26-SDK binaries since Apr 28, 2026 — no binary can reach TestFlight at all | Upgrade to Expo SDK 54+ with New Architecture; re-validate the four native modules; pin build image; expo-doctor in CI | P0 | M |
| Offline video is a scaffold with no media path | The "offline" playback branch performs a network query; the encrypt-then-play design maps to no react-native-video capability | Signed Stream MP4 download URLs via the edge function, expo-file-system seams with iOS Data Protection, download UI, local-row playback | P0 | XL |
| Submission surface absent (no icons, ITMS-90474 orientation failure, no privacy manifests/deletion story) | Multiple independent hard blocks to upload, plus Guideline 2.1/5.1.1 collateral gaps | Store-readiness pass as code: assets, `requireFullScreen`, `privacyManifests`, submit config, `docs/APP_STORE.md`, deletion flow | P0 | M |
| Push notifications entirely absent (no APNs) | Due-date/assignment/expiry nudges are THE re-engagement loop for deskless workers | expo-notifications + RLS-scoped `device_push_tokens` migration + pg_cron edge sender, deep-linking to courses | P1 | L |
| No universal links or QR-to-lesson path | Jobsite QR codes and invite links can't reliably open the app; invite redemption is paste-only | `associatedDomains` + AASA served by `apps/web`, opaque-id deep links, optional in-app QR scanner | P1 | M |
| No OTA update capability | Every JS fix ships at App Review latency — wrong for a stamped-out template | expo-updates with `runtimeVersion` policy, channels mapped to existing EAS profiles | P1 | M |
| Completion integrity shallow at the player | No watch telemetry, no resume, modeled gating fields (`sequence_locked`, seat time) never enforced | Periodic append-only "progressed" statements via the outbox, resume positions, sequence + watched-threshold gating | P1 | M |
| No background sync or background transfer | Records move only while the app is foregrounded; supervisors see stale compliance state | expo-background-task (BGTaskScheduler) draining the idempotent outbox; background-session downloads | P2 | M |
| iPad/Dynamic Type/captions surface-level | Shared trailer iPads, Section 508 buyers, and loud jobsites where captions are a core feature | Type ramp with multiplier caps, two-pane iPad layouts, caption tracks required on Stream uploads | P2 | M |
| No biometric re-auth or shared-device posture | Anyone holding the device is the last signed-in worker, writing that worker's record | expo-local-authentication gate (per-tenant flag); pin `keychainAccessible` explicitly | P2 | S |
| iOS release engineering and crash visibility missing | Android-only build runbook; zero crash reporting for devices at remote sites | TestFlight runbook, @sentry/react-native with PII-scrubbed breadcrumbs, expo-doctor CI job | P2 | M |
| No widgets, App Intents, or Live Activities | "Next training due" lock-screen presence is the ambient nudge deskless workers actually see | WidgetKit extension fed by an App Group snapshot of the user's own RLS-read summary | P3 | M |

## Lens: Android platform & fleet deployment

**Strengths**

- Refresh token lives in the Android Keystore via the chunked fail-closed adapter — most RN apps get this wrong.
- The outbox architecture is exactly right for Android's execution model: idempotent-by-UUID drains mean killed processes and duplicate WorkManager runs can never corrupt records.
- Offline-first text learning genuinely works, with a dependency-injected, node-testable offline layer.
- EAS is set up correctly for Android (dev/preview APK, production AAB, managed credentials, remote versioning).

**Gaps**

| Gap | Why it matters | Suggestion | Priority | Effort |
|---|---|---|---|---|
| Target API below Google Play's submission floor | API 35 required since Aug 2025 (API 36 ~Aug 2026); no submission possible, including Managed Google Play | Expo SDK 54+ in one pass; flip newArch + WatermelonDB JSI; review edge-to-edge and 16KB page-size changes | P0 | M |
| Offline video download is an unimplemented scaffold | A zero-connectivity worker cannot watch anything; the offline branch queries Supabase over the network | expo-file-system resumable downloads via signed URLs, dataSync foreground service, storage budgeting/eviction UI, local-URI playback | P0 | XL |
| Sync never runs in the background | Doze/process death park completions until next app open; same-day compliance dashboards go stale | expo-background-task periodic drain with network constraint — free-by-design given UUID idempotency | P1 | M |
| No FCM push | Due/overdue/assignment nudges can't reach workers; first-demo buyer question | expo-notifications + channels, RLS own-rows `device_push_tokens`, pg_cron edge sender with opaque-id payloads | P1 | L |
| No account deletion path or Data-safety inventory | Hard Play policy gate (enforced since 2024); actor PII inside append-only statements needs an explicit retention answer | Service-role deletion edge function retaining statements under documented compliance basis; Settings entry; web deletion page; `docs/PLAY_DATA_SAFETY.md` | P1 | M |
| No Android Enterprise managed configuration | MDM fleets (Intune/SOTI) can't push config; every template buyer must cut a custom build | `app_restrictions.xml` config plugin + RestrictionsManager read at boot — connection config only, never tenant authorization | P1 | M |
| No shared-device/crew-tablet mode | Switching workers requires online sign-in; sign-out wipes the tenant catalog and any undrained statements | Keystore-vaulted multi-session with PIN switching, catalog-preserving switches, idle auto-lock, kiosk/LockTask docs | P1 | XL |
| No crash reporting or fleet telemetry | A bricked field device is invisible; rejected statements are stored locally and reported nowhere | @sentry/react-native + a `device_sync_status` heartbeat surfaced as a console "devices behind" rollup | P1 | M |
| Deep links, App Links, and QR flows absent | Invites are hand-pasted; push (once added) has nowhere to route; links open the browser | autoVerify intent filters + `assetlinks.json` from `apps/web`, QR scanning on Join, QR on invites/certificates | P2 | M |
| WebView iframe playback with no low-bandwidth controls | Heavy on 2GB-RAM rugged devices; no bitrate cap, data-saver, or wifi-only policy; catalog prefetch is passive | Native ExoPlayer HLS with connectivity-derived `maxBitRate`, wifi-only settings, assigned-course prefetch | P2 | L |
| No OTA update channel | Every JS fix is a days-long Play + MDM re-deploy | expo-updates with fingerprint runtime policy and per-profile channels | P2 | S |
| TalkBack/font-scale and glove-reality UX unproven | Fixed sizes blow up at 200% scale; no live-region announcements for offline/sync states | Multiplier policy, 48dp targets, live regions on the banner + sync announcements, TalkBack checklist | P2 | M |
| No app shortcuts, resume surface, or widget | Cheap engagement differentiation; meanwhile a dev Showcase tab ships in production navigation | expo-quick-actions shortcuts; Glance widget over the local cache; `__DEV__`-gate Showcase | P3 | S |

## Consolidated backlog

Overlapping findings deduped into one ranked list. Owner is the primary code home; several items also require a `security-reviewer` pass (data access, auth, sync, storage) per repo rules.

| # | Pri | Item | Lenses | Owner | Effort |
|---|-----|------|--------|-------|--------|
| 1 | P0 | Console lesson/quiz content authoring — write `lessons.content` in the shape mobile already parses; promote the LessonContent contract to shared | LMS, UX, EHS | apps/console + packages/shared | M |
| 2 | P0 | Due-date assignment + server-side overdue/expired transitions (pg_cron) — activates already-built badges, KPIs, and report tiles | LMS, UX, EHS | apps/console + supabase | S |
| 3 | P0 | Certificate expiry + recertification lifecycle — `valid_for_days`, `expires_at` in the issue trigger, grace-window re-enrollment, expiring-soon views | LMS, EHS, UX | supabase + apps/console | M |
| 4 | P0 | Mobile toolchain upgrade to Expo SDK 54+ / New Architecture — both stores currently reject the pinned SDK 52 build outright | iOS, AND | apps/mobile | M |
| 5 | P0 | Evidence retention + transcripts — flip statement/certificate FKs from CASCADE to RESTRICT, soft deactivate/archive lifecycle, per-worker transcript CSV/PDF export | EHS, LMS | supabase + apps/console | M |
| 6 | P0 | Offline video download end-to-end — signed MP4 download URLs, file-system seams, download/storage UI, local playback, eviction | UX, iOS, AND | apps/mobile + supabase | XL |
| 7 | P0 | Store submission surface — icons/splash, `requireFullScreen`, privacy manifests, account deletion + Data-safety inventory, review collateral | iOS, AND | apps/mobile | M |
| 8 | P0 | Verified practical sign-off — supervisor-session attestation with evaluator identity, checklist, signature evidence (security-reviewed RLS path) | EHS, LMS, UX | cross-cutting (supabase + apps/mobile) | L |
| 9 | P0 | Training-requirements matrix + compliance-status engine — role/site/crew → required courses with recurrence, auto-enrollment, "out of compliance today" dashboard | EHS (LMS learning-paths gap overlaps) | supabase + apps/console | L |
| 10 | P1 | Notifications rail — push (APNs/FCM) + email for assignment, due-soon, overdue escalation, cert expiry, invitations | LMS, UX, EHS, iOS, AND | cross-cutting | L |
| 11 | P1 | Supervisor field surface — crew readiness roster, first-class crew/site model, console access for the role, toolbox-talk capture | LMS, EHS, UX | apps/mobile + apps/console | L |
| 12 | P1 | Assessment + completion integrity — server-held answer keys and scoring, attempt limits, seat-time and sequence enforcement, video watch telemetry | LMS, EHS, iOS | cross-cutting | L |
| 13 | P1 | i18n + Spanish-first localization — UI string catalogs, content language variants, locale-keyed xAPI display maps | LMS, UX, EHS | cross-cutting | L |
| 14 | P1 | Background sync — WorkManager/BGTaskScheduler periodic outbox drain (free-by-design given UUID idempotency) | AND, iOS | apps/mobile | M |
| 15 | P1 | Sync trust + observability — "My training record" screen with rejected/retry states, console Sync Health, crash reporting, device heartbeat | UX, AND, iOS | apps/mobile + apps/console | M |
| 16 | P1 | Field accessibility hardening — fix measured contrast failures, 48px targets + hitSlop, font-scaling policy, screen-reader kit fixes (toasts, labels, modals) | UX, iOS, AND | packages/ui | M |
| 17 | P1 | Web PWA completion parity — IndexedDB outbox + shared statement builders so kiosk/desktop training records identically | LMS | apps/web | M |
| 18 | P1 | Deep links / universal links / App Links + QR — AASA and assetlinks from apps/web, invite and lesson routes, in-app scanner | iOS, AND | apps/mobile + apps/web | M |
| 19 | P1 | Console ergonomics — vue-router per view, destructive-action confirmations, search/sort/pagination, remove prefilled demo credentials | UX | apps/console | L |
| 20 | P1 | OTA updates — expo-updates with channels per existing EAS profile | iOS, AND | apps/mobile | M |
| 21 | P1 | External credential wallet + certificate QR verification — record/expiry-track OSHA cards etc.; PII-free public verify endpoint | EHS, UX | supabase + apps/console + apps/web | M |
| 22 | P1 | Toolbox-talk / field-session capture — sessions table + offline attendee sign-ins as append-only "attended" statements | EHS | supabase + apps/mobile | M |
| 23 | P1 | MDM managed configuration — `app_restrictions.xml` config plugin; connection config only, tenant stays JWT-derived | AND | apps/mobile | M |
| 24 | P1 | Crew/shared-device mode — Keystore-vaulted multi-session, PIN switching, catalog-preserving switch, idle lock, kiosk docs | AND | apps/mobile | XL |
| 25 | P1 | Standards interop wedge — xAPI `/statements` edge-function facade over completion_statements, then SCORM 1.2 ingest + web runtime | LMS, EHS | supabase + apps/web | XL |
| 26 | P2 | Content versioning — immutable course-tree snapshots on publish, version stamped into statement context and certificates | LMS, EHS | supabase | L |
| 27 | P2 | Video engagement analytics beyond gating — drop-off/rewatch insight from the emitted telemetry stream | LMS | cross-cutting | M |
| 28 | P2 | ILT/vILT sessions, rosters, and attendance | LMS | supabase + apps/console + apps/mobile | L |
| 29 | P2 | Competent/qualified-person designations table + evaluator eligibility checks | EHS | supabase + apps/console | S |
| 30 | P2 | Native HLS playback + low-bandwidth controls, wifi-only prefetch of assigned courses | AND | apps/mobile | L |
| 31 | P2 | Biometric re-auth / shared-device session posture (per-tenant flag) | iOS | apps/mobile | S |
| 32 | P2 | Replace dev Showcase tab with a Profile tab (downloads, sync status, certificates, sign-out) | UX, AND | apps/mobile | S |
| 33 | P2 | iPad two-pane layouts, Dynamic Type ramp, video captions | iOS | apps/mobile + packages/ui | M |
| 34 | P2 | Multi-employer/contractor orientation model (consent-based, isolation-preserving) | EHS | cross-cutting | L |
| 35 | P2 | Incident → retraining webhook (`retraining_actions` + per-tenant inbound API key) | EHS | supabase | M |
| 36 | P3 | Widgets, app shortcuts, App Intents / Live Activities | iOS, AND | apps/mobile | M |

## Quick wins

High-value items at S or M effort — most activate machinery that is already built:

- **Due dates (S, #2):** one console input + one insert field + one scheduled job turns on overdue badges, KPIs, sorting, and report tiles that already ship dark.
- **Contrast fixes (S, part of #16):** ink-on-amber banner, darker ember button fill, and a CI contrast assertion — measured WCAG failures on the highest-stakes surfaces.
- **Showcase → Profile tab (S, #32):** removes a dev gallery from production navigation and gives sync status, downloads, and certificates a home.
- **Designations table (S, #29):** small migration with outsized EHS credibility ("who is your competent person?").
- **Biometric re-auth + `keychainAccessible` pin (S, #31).**
- **OTA updates (S on Android, M on iOS, #20):** config-only; de-risks the entire first-submission review loop.
- **Console content authoring (M, #1):** the single gap that turns the working QuizPlayer from a demo into a product.
- **Certificate expiry/recert (M, #3):** the recurring-training engine this market buys.
- **Evidence retention + transcript export (M, #5):** protects the product's core asset — legal evidence — before anything else is built on it.
- **SDK upgrade (M, #4) and store surface (M, #7):** nothing ships to a device until these land.
- **Web completion parity (M, #17), sync visibility (M, #15), background sync (M, #14), deep links (M, #18):** each closes a trust or reach gap with bounded scope.
