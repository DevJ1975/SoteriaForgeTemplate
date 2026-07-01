# Soteria Forge — Rebuild Plan

**Target:** a mobile-first (iOS + Android), offline-capable, multi-tenant training platform with heavy video, single sign-on, and headroom for 64,000 workers.
**Anchor use case:** the ATL "Curb to Cabin" workforce training program.
**Contract posture:** federal + local, with a deferred path to FedRAMP/GovCloud hosting.

> A note before the detail: this is a real rebuild, not a weekend refactor, so it is written to be shipped **incrementally**. Each phase produces something that works and can be demoed on its own. You never have to hold the whole thing in your head at once — finish a phase, prove it, move to the next. You are building this solo with an agent swarm, and the plan is scoped for that reality.

---

## 1. Where things stand today

The current `DevJ1975/SoteriaForgeTemplate` repo is a clean npm-workspaces monorepo with four packages:

| Package | Stack today | Role |
|---|---|---|
| `@soteria-forge/shared` | Plain TypeScript (`tsc`) | Shared types / utilities |
| `@soteria-forge/lms` | Vue 3 + TypeScript, Vite 7 | Learner-facing web SPA |
| `@soteria-forge/console` | Vue 3 + TypeScript, Vite 7 | Admin / ops SPA |
| `@soteria-forge/api` | TypeScript, Node 24, MongoDB | Serverless API (Vercel) |

It is multi-tenant with hand-rolled JWT tenant-matching, deployed to Vercel (currently via CLI, since the GitHub auto-deploy link broke around the "Complete Soteria brand integration" commit).

**What that architecture cannot do**, and why the rebuild exists: native app-store distribution, reliable offline use in a hangar with no signal, and encrypted offline video. Those are mobile-platform problems, not web-SPA problems — no amount of service-worker work on the Vue app gets you there.

---

## 2. Target architecture

```
                     ┌──────────────────────────────┐
                     │   Mobile app (learner)        │
                     │   React Native + Expo         │
                     │   • Cognito auth              │
                     │   • WatermelonDB offline store│
                     │   • react-native-video v7     │
                     └───────┬───────────┬───────────┘
                             │           │
             GraphQL (AppSync)│           │ signed playback / MP4 download
                             │           │
        ┌────────────────────▼───┐   ┌───▼──────────────────┐
        │  AWS backend            │   │  Cloudflare Stream   │
        │  • Cognito (Lite)       │   │  (video only)        │
        │  • AppSync + DynamoDB   │   └──────────────────────┘
        │  • Lambda functions     │
        │  • S3 + CloudFront      │
        └────────────────────▲───┘
                             │ GraphQL (same API)
                     ┌───────┴───────────────┐
                     │  Admin console (Vue)   │
                     │  kept, repointed        │
                     └────────────────────────┘
```

### Stack decisions and the reasoning behind each

- **Mobile: React Native + Expo** (custom dev client + EAS Build). One codebase for iOS and Android; aligns with what you already run on Soteria Assurance and Zero Two Hundred, so no new language. Expo Go is *not* enough here — the video and offline libraries need native modules, so you build a custom dev client.
- **Auth: Amazon Cognito, Lite tier.** 50,000 monthly active users free (pick Lite explicitly — the default Essentials tier only gives 10,000). Enterprise clients that demand SSO get their own SAML/OIDC identity provider federated *into* the single pool, scoped by tenant.
- **Database: DynamoDB.** Always-free tier (25 GB, ~200M requests/mo) covers you well past MVP. Single-table, tenant-scoped design.
- **API + sync surface: AWS AppSync (GraphQL) + Lambda.** AppSync is the managed GraphQL layer over DynamoDB; Lambda handles custom business logic and the token/tenant authorizer.
- **Backend framework: AWS Amplify Gen 2** (code-first TypeScript, CDK underneath) — *see the important caveat in §5.*
- **Video: Cloudflare Stream stays.** For internal compliance training (no DRM requirement), Stream is far cheaper than Mux and has a built-in MP4 download endpoint that makes offline the simplest possible path. Running video on Cloudflare while everything else is on AWS is a normal, deliberate split — not a compromise.
- **Offline data: WatermelonDB (local SQLite) + an event-sourced sync queue** against AppSync. This is the piece that changed since our first conversation — details in §5.
- **Admin console: the existing Vue `console` app, kept and repointed** at the new API. Desktop back-office work is exactly what a Vue SPA is good at; there's no reason to make it mobile.

---

## 3. What is kept, rebuilt, and retired

| | Component | Disposition |
|---|---|---|
| **Kept** | Vue `console` admin app | Repoint at Cognito + AppSync (Phase 6) |
| **Kept** | Cloudflare Stream | Video pipeline unchanged; wire into new metadata model |
| **Kept** | `packages/shared` | Expand into the shared domain model / xAPI statement schemas |
| **Kept** | Domain & business logic concepts | LOTO/hot-work/confined-space course structure, tenant model — the *ideas* carry forward even though the code is re-expressed |
| **Rebuilt** | Learner experience | Net-new React Native app replaces the Vue `lms` SPA |
| **Rebuilt** | API | Lambda + AppSync replaces the Vercel/Mongo serverless functions |
| **Rebuilt** | Data layer | DynamoDB replaces MongoDB |
| **Rebuilt** | Auth | Cognito replaces the hand-rolled JWT |
| **Retired** | `packages/lms` (Vue web LMS) | Archived in git history; its screens inform the mobile UX but it is not carried forward. (A lightweight web-companion LMS can be revisited later if desktop learners emerge — not MVP.) |
| **Retired** | MongoDB | — |
| **Retired** | Vercel hosting for the API | Frontend/admin hosting can stay on Vercel or move to Amplify Hosting; the *API* moves to AWS |

---

## 4. Target repository structure

Adopt **Turborepo** (matches Soteria Assurance, and it manages the now-mixed toolchain — RN app + Vue app + AWS backend — far better than plain npm workspaces).

```
soteria-forge/
├── apps/
│   ├── mobile/            # NEW — React Native + Expo learner app
│   └── console/           # KEPT — Vue admin, repointed
├── packages/
│   ├── shared/            # EXPANDED — domain types, xAPI statement schemas, validation
│   └── ui/                # optional — shared design tokens (Ink/Bone/Cobalt)
├── backend/               # NEW — Amplify Gen 2 backend definition (TypeScript)
│   ├── auth/              # Cognito
│   ├── data/              # AppSync schema + DynamoDB
│   ├── storage/           # S3
│   └── functions/         # Lambda (tenant authorizer, custom logic)
├── docs/
│   ├── SOTERIA_FORGE_REBUILD_PLAN.md   # this file
│   ├── adr/               # architecture decision records
│   └── CLAUDE_SWARM.md    # agent orchestration guide
├── .claude/
│   ├── agents/            # subagent / teammate definitions
│   └── settings.json      # hooks, permissions
├── turbo.json
└── package.json
```

---

## 5. The offline architecture (the part that changed — read this carefully)

When we first talked, the plan leaned on Amplify DataStore for automatic offline sync. **That is no longer viable for a current build:** Amplify Gen 2 (the version AWS recommends for all new projects) does **not** include DataStore. DataStore was a Gen 1 feature, and Gen 1 is now maintenance-only. So the "sync just works" engine is gone from the recommended path.

This is not a setback — it validates the event-sourced approach and makes it the *correct* design rather than a workaround. You assemble the offline layer from three parts:

1. **Local store — WatermelonDB (SQLite).** Fast, built for offline-first React Native, holds the learner's downloaded courses, quiz state, and an append-only queue of completion events.
2. **Connectivity detection — `@react-native-community/netinfo`.** Toggles between local-only operation and sync.
3. **Sync engine — event-sourced completion statements over AppSync.** This is the heart of it, and it aligns with the xAPI/SCORM/cmi5 model you already use in Soteria FIELD:
   - Every learner action (started module, passed quiz, completed course, watched video segment) becomes an **xAPI-style statement**: actor, verb, object, result, timestamp — with a **client-generated UUID**.
   - Statements are **append-only** and **idempotent by UUID**. Offline, they queue locally. On reconnect, they POST to an AppSync mutation; the server dedupes by UUID and writes to DynamoDB.
   - Because statements are append-only and idempotent, there are **no merge conflicts** to resolve — the hardest part of offline sync simply doesn't arise. A worker can complete an entire course in airplane mode in a hangar, and it reconciles cleanly hours later when the phone finds signal.

**Offline video** is separate and simpler: Cloudflare Stream's MP4 download endpoint gives you a downloadable file; the `react-native-video` v7 offline plugin stores it locally (encrypted via iOS Keychain / Android Keystore) and plays it in airplane mode. DynamoDB only ever stores video *metadata* (the Stream playback ID, tenant, course link) — never the bytes.

### One real architectural fork to decide in Phase 0

- **Option A — Amplify Gen 2** (recommended for you): code-first TypeScript backend that provisions Cognito, AppSync, DynamoDB, S3, and Lambda for you, with a CDK escape hatch when you need raw control. Fastest path to a working multi-tenant backend, still teaches the core services, and because it's defined as code it stays portable to GovCloud later. You hand-build only the offline sync layer (which you'd do anyway now).
- **Option B — raw AWS CDK** wiring each service by hand. Maximum control and the deepest learning of AWS primitives (best if you want every knob for GovCloud from day one), but materially more work for a solo dev.

**Recommendation:** start with **Option A**. It gets you to a demoable product fastest, still exposes and teaches Cognito/AppSync/DynamoDB/Lambda, and the CDK escape hatch means you are never locked out of the primitives when the airport contract's compliance terms firm up.

---

## 6. Multi-tenant model

### Identity (Cognito)
- **Single user pool**, not pool-per-tenant. At 64k users across many company tenants, one pool with a `custom:tenantId` attribute stays inside limits and free tier; pool-per-tenant hits Cognito ceilings and multiplies operational cost.
- **Groups for roles:** `worker`, `supervisor`, `tenant-admin`, `super-admin`.
- **Enterprise SSO** clients (e.g., a large airline or a DoD-adjacent contractor) get a SAML/OIDC identity provider federated into the pool, scoped to their tenant. You only pay the federation MAU rate when a client actually turns this on.

### Data (DynamoDB, single-table)
Tenant isolation is enforced in the **partition key** and re-checked in **every resolver/authorizer**:

```
PK = TENANT#<tenantId>
SK = COURSE#<courseId> | USER#<userId> | ENROLLMENT#<userId>#<courseId> | STMT#<statementId> | VIDEO#<videoId>
```

The old repo's "Enforce token tenant match" instinct was right — the rebuild does it properly: a Lambda authorizer (or AppSync auth rule) compares the `custom:tenantId` claim on the caller's token against the tenant partition being requested, and **refuses any cross-tenant read or write**. This is the single most important security invariant in the system, and it is treated as non-negotiable throughout (see the swarm guide's guardrails).

---

## 7. Phased execution plan

Each phase ends with a concrete, demoable deliverable. Phases map directly onto agent assignments in `CLAUDE_SWARM.md`.

### Phase 0 — Foundations & guardrails
- Create the AWS account; secure it: root MFA, an IAM admin user, stop using root for daily work.
- Complete the 5 free-tier onboarding tasks for the $100 credit — one of them (test a Bedrock prompt) doubles as **AIF-C01 study**.
- Set a **$1 AWS Budget alert** before building anything else.
- Decide the Vercel question: keep it for frontend/admin hosting, or consolidate. The *API* leaves Vercel regardless.
- Restructure the repo (Turborepo, `apps/mobile`, `backend/`, expand `shared`).
- Stand up the swarm scaffolding: `CLAUDE.md` per package, `.claude/agents/`, hooks.
- Decide Option A vs B (§5).
- **Deliverable:** secured AWS account with budget alarms, clean monorepo skeleton, agents configured.

### Phase 1 — Identity & tenancy
- Cognito user pool (Lite), `custom:tenantId`, role groups.
- Tenant registry table in DynamoDB.
- Lambda authorizer enforcing token→tenant match.
- Seed test tenants (including an "ATL Curb-to-Cabin" tenant).
- **Deliverable:** a user signs in, their token carries tenant + role, and the backend provably rejects cross-tenant access.

### Phase 2 — Core data & API
- Code-first schema: `Tenant`, `User`, `Course`, `Module`, `Lesson`, `Enrollment`, `CompletionStatement`, `VideoAsset`.
- AppSync GraphQL API with per-model authorization (owner + group + tenant).
- **Deliverable:** tenant-isolated CRUD for courses/modules/enrollments, testable via the GraphQL console.

### Phase 3 — Mobile app shell
- Expo custom dev client + EAS Build for iOS and Android.
- Auth flow wired to Cognito.
- Navigation, tenant-aware home, course list, offline-aware shell.
- **Deliverable:** an installable dev build where a worker signs in and sees their tenant's courses (online).

### Phase 4 — Video
- Cloudflare Stream account + admin upload pipeline.
- `VideoAsset` metadata in DynamoDB; tenant-scoped signed playback URLs.
- `react-native-video` v7 streaming playback in the app.
- **Deliverable:** a worker streams a training video in the app.

### Phase 5 — Offline (the hard one — budget extra time)
- WatermelonDB local store + NetInfo connectivity layer.
- Offline video download (Stream MP4 + offline plugin, encrypted storage).
- Event-sourced completion statements: local append-only queue, idempotent sync on reconnect.
- **Deliverable:** a worker downloads a course *and* its video, completes the whole thing in airplane mode, reconnects, and progress syncs cleanly.

### Phase 6 — Admin console repoint + content ops
- Point the Vue `console` at the new Cognito + AppSync.
- Tenant management, course authoring, video upload, roster/enrollment, completion reporting.
- **Deliverable:** an admin creates a tenant, authors a course, uploads a video, enrolls workers, and sees completions.

### Phase 7 — Scale, observability, hardening (64k readiness)
- DynamoDB capacity strategy (on-demand vs provisioned + autoscaling), GSIs for every access pattern.
- CloudWatch dashboards + alarms, X-Ray tracing, structured logs.
- Handle the real load shape: **shift-start burst** (thousands of workers open the app at the same minute) → API Gateway throttling/caching, Cognito RPS headroom.
- CloudFront in front of S3 assets.
- Security pass: tenant-isolation test suite, least-privilege IAM, secrets handling.
- **Deliverable:** documented capacity plan, live alarms, and a passing tenant-isolation test suite.

### Phase 8 — GovCloud / compliance readiness (deferred, contract-triggered)
- **First, clarify with the airport's contracting officer** whether the *software* must run on FedRAMP-authorized hosting, or whether "federal" here concerns Trainovate's *contracting status* (SDVOSB, set-aside eligibility). These are different requirements, and conflating them is the most common way teams over-build.
- If FedRAMP hosting is required: apply for GovCloud early (approval has lead time, and reviewers sometimes push back on brand-new accounts), port the Amplify/CDK backend to the GovCloud partition, and account for Cognito's GovCloud caveats (its standard free tier does not apply in GovCloud) and data-residency rules.
- **Deliverable:** a readiness checklist — not a build — until the contract's data-handling terms actually require it.

---

## 8. Scale considerations for 64,000 workers

- **Cognito:** 64k MAU on Lite = first 50k free, ~14k billable at roughly $0.0055/MAU ≈ **~$77/mo** at full active usage. Inactive users cost nothing.
- **DynamoDB:** completion statements are small, append-only writes — cheap. Use on-demand capacity to absorb bursts, or provisioned + autoscaling if usage becomes predictable. Design GSIs up front for your read patterns (courses-by-tenant, enrollments-by-user, statements-by-user).
- **The burst pattern is the real design constraint.** Industrial workforces don't trickle in — a shift starts and thousands of phones hit the API in the same few minutes. Plan API Gateway throttling and caching, and confirm Cognito RPS headroom, against that spike rather than against a smooth average.
- **Video is the cost driver, not compute.** At 64k workers, your bill is dominated by Cloudflare Stream *delivery* minutes, not by AWS. Model it against Stream's ~$1/1,000 delivered-minutes rate using (avg training-video minutes × workers × replays). Offline download actually helps here — a video downloaded once and watched offline isn't re-streamed on every view.

---

## 9. Rough cost model

| Stage | Monthly cost driver |
|---|---|
| MVP (Phases 0–5, dev) | ~$0 — Always-free tier (Lambda/DynamoDB/CloudFront/SQS) + Cognito Lite under 50k + $200 credits |
| Early production | Low tens of dollars — mostly Cloudflare Stream storage/delivery for your video library |
| 64k scale | Dominated by Cloudflare Stream delivery; Cognito ~$77/mo; DynamoDB/AppSync/Lambda modest |

**Watch the free-tier clock:** the AWS Free Plan (post-July-2025 accounts) closes automatically at 6 months or when the $200 credit runs out. **Put a calendar reminder to move to a Paid Plan before then** — an auto-closed account means your resources shut down.

---

## 10. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Offline sync (Phase 5) is genuinely the hard part | Budget extra time; the append-only/idempotent design removes the worst of it (no conflict resolution) |
| Amplify Gen 2 has no DataStore | Already accounted for — hand-built WatermelonDB + statement queue |
| Enterprise SSO federation complexity | Deferred until a client actually needs it; single-pool + per-tenant IdP is the clean pattern when it arrives |
| Free-tier account auto-closes at 6mo/$200 | Calendar reminder → Paid Plan before the cutoff |
| GovCloud approval lead time | Start the eligibility conversation early *if* the contract requires FedRAMP hosting |
| Solo-dev bandwidth (~2–3 hrs/day) | The whole plan is incremental by design — ship a phase, prove it, continue; the agent swarm multiplies your throughput |

---

## 11. Definition of done (per phase)

A phase is done when: its deliverable demos end-to-end, the tenant-isolation invariant still holds, tests for the new surface pass, no secrets are committed, and the relevant ADR in `docs/adr/` is written. The swarm's `security-reviewer` and `test-runner` agents enforce these before a phase is called complete.

---

*Companion document: `CLAUDE_SWARM.md` — how to run this rebuild with a coordinated team of Claude Code agents.*
