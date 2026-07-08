# Soteria Forge — Implementation Roadmap

**Date:** 2026-07-08

**Derived from:** [`2026-07-feature-gap-audit.md`](./2026-07-feature-gap-audit.md) (the consolidated 36-item
backlog) and [`2026-07-competitive-landscape.md`](./2026-07-competitive-landscape.md) (table-stakes and
win strategy). Those reports establish *what* is missing and *why*; this document adds the two things they
deliberately left out — **dependency order** and **how the swarm executes it**. Backlog IDs below (`#1`…`#36`)
refer to the "Consolidated backlog" table in the gap audit.

---

## Strategic frame

The competitive analysis found one **unclaimed position**: rigorous, portable, tamper-evident compliance
evidence + genuinely offline-first mobile UX at template economics — a combination no incumbent holds. Every
sequencing decision below serves getting there, under one ordering principle:

> **Don't build on sand.** The two P0s that everything else rests on — the evidence-integrity fix (`#5`) and
> the mobile toolchain upgrade (`#4`) — go *first*, before we pour more product on top of a foundation that
> can silently delete records or that no store will accept.

Two wedges to protect and build, in priority order:

1. **The evidence trail is the crown jewel — and it's currently breakable.** `ON DELETE CASCADE` from
   `profiles`/`courses` can destroy "append-only" statements and certificates. We cannot *market* immutable
   evidence until this is closed. It is cheap and it is first.
2. **Offline-first is a real moat — but only once video ships.** The architecture (WatermelonDB + append-only,
   UUID-idempotent xAPI drain) is ahead of the segment, yet the headline "take a course to a no-signal
   refinery basement" demo can't run because offline **video** is an unimplemented scaffold.

---

## Critical path to v1 (shippable + credible)

The minimum spine to (a) sell the EHS evidence story honestly and (b) get both apps into stores with the
offline promise real. Ten items; everything else in the backlog is hardening and reach layered on top.

```
#5  Evidence retention (cascade→RESTRICT, soft-delete, transcripts)   ─┐  foundation
#4  Mobile toolchain → Expo SDK 54+ / New Arch                        ─┘  (parallel, both first)
        │                    │
        ▼                    ▼
#2  Due dates + pg_cron   #1  Console content authoring   ──► closes the "it's a demo" gap
    status transitions       (+ LessonContent → shared)
        │                    │
        ▼                    ▼
#3  Cert expiry + recert  ─► #9  Requirements matrix + compliance engine  ──► the EHS wedge
        │                    │
        ▼                    ▼
#8  Verified practical sign-off (supervisor attestation)
        │
        ▼
#7  Store submission surface ─► #6  Offline video end-to-end ─► #10  Notifications rail
        (needs #4)                (needs #4; the headliner)      (the re-engagement loop)
```

**v1 line = the 9 P0s + notifications (`#10`).** Ship that and the product is honest to demo, legal to rely
on, and present in both app stores. The P1/P2 tail (Phases 4–5) is competitive parity and reach.

---

## Key dependencies & gotchas

- **`#4` (SDK upgrade) blocks all mobile feature work.** Build offline video, push, background sync, deep
  links, and the store surface *against the upgraded toolchain* or you pay for them twice. It is a big-bang
  that goes early and merges before other mobile branches fork.
- **`#2` establishes the scheduled-job primitive (pg_cron).** Recert (`#3`), the compliance engine (`#9`),
  and notification escalation (`#10`) all reuse it — which is why an S-effort quick win sits on the critical
  path.
- **`#3` requires relaxing the `unique(user, course)` certificate constraint.** Recertification issues a *new*
  dated certificate each cycle; the current constraint forbids it. Schema change ships with `#3`.
- **`#8` and `#11` are coupled.** Verified sign-off needs a supervisor identity and surface; the RLS path that
  lets a supervisor attest to a worker's record is a `security-reviewer` gate item (today RLS *blocks* it).
- **`#5` gates the marketing claim, not just the code.** Transcript export (its second half) is what auditors
  actually ask for; it's bundled here so "evidence" means "exportable evidence."
- **`security-reviewer` is a required gate** on every data/auth/sync/storage change: `#5, #8, #9, #10, #21,
  #23, #24` at minimum. `#23` (MDM managed config) must carry connection config **only** — tenant
  authorization stays JWT-derived, never MDM-pushed.

---

## Phased plan

Effort is relative (S/M/L/XL from the audit); a phase parallelizes across agent owners, so phase weight ≠ sum
of items. Each phase has an **exit test** — the demonstrable capability that says it's done.

### Phase 0 — Protect the foundation & unblock the toolchain
*Goal: stop the bleeding and clear the two blockers everything depends on.*

| # | Item | Owner | Effort |
|---|------|-------|--------|
| #5 | Evidence retention: FKs `CASCADE`→`RESTRICT`, soft deactivate/archive lifecycle, per-worker/per-course transcript CSV/PDF export | aws-infra + console-web · **security-reviewer gate** | M |
| #4 | Mobile toolchain → Expo SDK 54+, New Architecture, WatermelonDB JSI; expo-doctor in CI | mobile + ios-developer + android-developer | M |
| #2 | Due-date input in assign flow + pg_cron overdue/expired transitions (also lands the scheduled-job primitive) | console-web + aws-infra | S |
| #16a | Contrast fixes (ink-on-amber banner, darker ember fill) + CI contrast assertion | ui-ux → packages/ui | S |

**Exit test:** a super-admin cannot delete a profile out from under its statements; an assigned course shows a
real due date and flips to *overdue* server-side overnight; both mobile apps build clean on the new SDK;
CI fails on a sub-AA brand pairing.

**Closes:** the evidence-integrity hole that blocks the whole pitch; the store-floor blocker; the dead
due-date pipeline; measured WCAG failures.

### Phase 1 — Close the learning loop for real customers
*Goal: turn a working demo into a product a buyer can actually author into.*

| # | Item | Owner | Effort |
|---|------|-------|--------|
| #1 | Console lesson/quiz content authoring; promote the `LessonContent` contract to `packages/shared` | console-web + api-data | M |
| #3 | Certificate expiry + recertification lifecycle (`valid_for_days`, `expires_at` in the issue trigger, grace-window re-enrollment, relax `unique(user,course)`) | aws-infra + console-web | M |
| #17 | Web PWA completion parity — IndexedDB outbox + shared statement builders so kiosk/desktop training earns credit | (web owner) + api-data | M |
| #15a | "My training record" screen — synced / waiting / needs-attention + retry (fixes silently-dropped completions) | mobile | M |

**Exit test:** a tenant-admin builds a quiz in the console with **zero SQL**, a worker passes it on mobile *and*
on the web PWA and both record identically, a certificate issues with an expiry date, and a worker can see
that their completion actually reached the tenant.

**Closes:** the #1 gap flagged by three lenses (unreachable authoring); the recurring-training engine the
market buys; the device-split compliance record; the worst-case silent-drop failure mode.

### Phase 2 — Claim the EHS position (the wedge)
*Goal: answer "who is out of compliance today?" and make practical sign-off defensible.*

| # | Item | Owner | Effort |
|---|------|-------|--------|
| #9 | Training-requirements matrix (role/site/crew → required courses, recurrence, grace) + compliance RPC + auto-enrollment + "out of compliance today" dashboard | aws-infra + console-web · **security-reviewer gate** | L |
| #11 | Supervisor field surface — first-class crew/site model, crew-readiness roster (green/amber/red), console access for the role | mobile + console-web | L |
| #8 | Verified practical/OJT sign-off — supervisor-session attestation with evaluator identity (from `auth.uid()`), checklist, signature hash, photo | cross-cutting · **security-reviewer gate** | L |
| #22 | Toolbox-talk / tailgate capture — `field_sessions` + offline attendee sign-ins as append-only "attended" statements | aws-infra + mobile | M |

**Exit test:** a safety director opens one dashboard and sees every worker's compliance status by
requirement; a foreman signs off a forklift evaluation on a tablet and the record carries *the evaluator's*
verified identity, not the worker's self-attestation; a tailgate meeting sign-in syncs from the field.

**Closes:** the structural EHS gap the competitive report calls "unclaimed" — the requirements engine, the
supervisor persona (RLS anticipates it; nothing used it), and the indefensible self-marked sign-off.

### Phase 3 — Ship to devices & make offline real
*Goal: both apps in stores, and the offline-first claim demonstrable.*

| # | Item | Owner | Effort |
|---|------|-------|--------|
| #7 | Store submission surface — icons/splash, `requireFullScreen`, privacy manifests, account deletion + Data-safety inventory, review collateral, `docs/APP_STORE.md` + `docs/PLAY_DATA_SAFETY.md` | mobile + ios-developer + android-developer | M |
| #6 | Offline video end-to-end — signed MP4 download URLs via the edge function, `expo-file-system` seams, download/storage UI, local-row playback, eviction | mobile + video + aws-infra | XL |
| #10 | Notifications rail — APNs/FCM + email for assignment, due-soon, overdue escalation, cert expiry, invitations (`device_push_tokens` + pg_cron sender) | cross-cutting · **security-reviewer gate** | L |
| #14 | Background sync — BGTaskScheduler/expo-background-task periodic outbox drain (free-by-design given UUID idempotency) | mobile + ios-developer + android-developer | M |
| #18 | Deep links / universal links / App Links + QR — AASA & assetlinks from the web app, invite + lesson routes, in-app scanner | mobile + (web owner) | M |
| #20 | OTA updates — expo-updates channels per EAS profile (de-risks the whole first-submission loop) | mobile | M (S on Android) |

**Exit test:** a worker downloads an assigned course *including its video* over wifi, watches it in a
no-signal zone, and the completion syncs conflict-free on reconnect **while the app is backgrounded**; a
due-training push opens the right lesson; both binaries pass store review preflight; a JS fix ships without a
store round-trip.

**Closes:** the store-shippability blocker; the headline offline promise; the deskless re-engagement loop.
**This is the phase that makes the two competitive wedges demonstrable.**

### Phase 4 — Competitive parity & reach (P1 tail)
*Goal: erase the "now table stakes, we lack it" list from the competitive report.*

| # | Item | Owner | Effort |
|---|------|-------|--------|
| #12 | Assessment + completion integrity — server-held answer keys & scoring, attempt limits, seat-time + sequence enforcement, video watch telemetry | cross-cutting | L |
| #13 | i18n + Spanish-first — UI string catalogs, content language variants, locale-keyed xAPI display maps (OSHA understandability) | cross-cutting | L |
| #16b | Field a11y hardening (remainder) — 48px targets + hitSlop, font-scaling policy, screen-reader kit fixes (toasts, labels, modal focus) | ui-ux → packages/ui | M |
| #21 | External credential wallet + certificate QR verification — OSHA/MSHA cards with expiry; PII-free public `/verify/:cert` endpoint | aws-infra + console-web + (web owner) · **gate** | M |
| #19 | Console ergonomics — vue-router per view, destructive-action confirmations, search/sort/pagination, remove prefilled demo creds | console-web | L |
| #15b | Sync trust + observability (remainder) — console Sync Health, crash reporting, device heartbeat rollup | mobile + console-web | M |
| #25 | Standards-interop wedge — xAPI `/statements` edge-function facade over `completion_statements`, then SCORM 1.2 ingest + lightweight web runtime | aws-infra + (web owner) | XL |
| #23 | MDM managed configuration — `app_restrictions.xml` (connection config only; tenant stays JWT-derived) | android-developer · **gate** | M |
| #24 | Crew/shared-device mode — Keystore-vaulted multi-session, PIN switching, catalog-preserving switch, idle lock, kiosk docs | android-developer + mobile · **gate** | XL |

**Exit test:** a high-stakes exam scores server-side with hidden keys and enforced attempts; a Spanish-primary
crew completes training in Spanish; a SCORM package from Storyline imports and plays; a shared crew tablet
switches workers by PIN without wiping the catalog or mis-attributing completions.

### Phase 5 — Differentiation & polish (P2/P3, opportunistic)
*Goal: pull individual items forward whenever they buy outsized credibility for their effort.*

`#26` content versioning · `#27` video engagement analytics · `#28` ILT/vILT sessions · `#29` competent-person
designations *(S — pull forward)* · `#30` native HLS + low-bandwidth controls · `#31` biometric re-auth *(S)* ·
`#32` Showcase→Profile tab *(S — pull forward)* · `#33` iPad two-pane + Dynamic Type + captions · `#34`
multi-employer/contractor orientation · `#35` incident→retraining webhook · `#36` widgets / App Intents.

---

## Quick wins — pull forward into any gap

High value at S effort, most activating machinery that already ships. Slot these between larger items whenever
an owner has slack:

- **`#2` due dates** *(already Phase 0)* — one input + one field + one job lights up dormant badges, KPIs,
  sorting, and report tiles.
- **`#16a` contrast + CI assertion** *(already Phase 0)* — unblocks 508/government buyers.
- **`#29` designations table** — small migration, outsized EHS credibility ("who is your competent person?"),
  and the prerequisite for evaluator eligibility in `#8`.
- **`#32` Showcase→Profile tab** — removes a dev gallery from production nav; gives downloads/sync/certs a home.
- **`#31` biometric re-auth + explicit `keychainAccessible`** — shared-device safety for a small change.

---

## Parallel workstreams (how the swarm runs it)

The phases interleave across four mostly-independent tracks plus the quality gate. Within a phase, fan out one
owner per track; sequence only across the dependency arrows above.

| Track | Owner agent(s) | Spine through the phases |
|-------|----------------|--------------------------|
| **Backend / data contract** | `aws-infra`, `api-data` | `#5` retention → `#2` pg_cron → `#3` recert → `#9` requirements engine → `#25` xAPI facade/SCORM → `#26` versioning |
| **Mobile platform** | `mobile`, `ios-developer`, `android-developer`, `offline-sync` | `#4` SDK → `#15a` record screen → `#7` store surface → `#6` offline video → `#14` background sync → `#18` deep links → `#23`/`#24` fleet |
| **Console / admin** | `console-web` | `#1` authoring → `#3` recert UI → `#9` compliance dashboard → `#11` supervisor console → `#19` ergonomics |
| **Web PWA** | web owner (guest under `console-web`/`api-data` conventions) | `#17` completion parity → `#18` AASA/assetlinks → `#21` public verify → `#25` SCORM runtime |
| **Quality gate (always-on)** | `security-reviewer`, `test-runner`, `ui-ux`, `lms-expert`, `ehs-expert` | Review every data/auth/sync/storage change before done; green-bar before merge; spec each learning/compliance feature *before* its UI |

**Kickoff pattern (per the swarm guide):** the `orchestrator` decomposes a phase, routes one slice per track,
and holds the contract; advisory experts (`lms-expert`, `ehs-expert`, `ui-ux`) write the spec — objective,
mastery criterion, xAPI evidence, acceptance criteria — *before* a builder starts; `security-reviewer` holds
the release gate on anything that can cross a tenant boundary; `test-runner` is the definition of done.

---

## Risks & sequencing cautions

- **Offline video (`#6`) is the single XL on the critical path.** Its hardest sub-problem is signed-URL expiry
  vs. an offline device — the download design must handle a token that dies while the worker is off-grid.
  De-risk with a spike before committing the phase estimate.
- **Don't let Phase 4 breadth starve the v1 line.** The P1 tail is large; hold it until the 9 P0s + `#10`
  merge, or the "shippable + credible" milestone slips indefinitely.
- **Content libraries are a buy, not a build** (competitive report): HSI's 5,000+ and Vector's 3D/MSHA
  courseware are the segment's hardest moat. Partner or license; keep engineering focused on the platform.
- **The append-only invariant is non-negotiable through all of this.** Recert, requirements state, sign-off,
  and compliance rollups are all *derived views* over the immutable statement stream (the SQL-LRS "Reactions"
  pattern) — never mutations of it. Any design that updates a statement is wrong by construction.
