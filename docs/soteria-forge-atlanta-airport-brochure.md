# Soteria Forge LMS — Enterprise Safety & Compliance Training at Airport Scale

### A capability brief for delivering training to a 1,000-person airport workforce

> The world's busiest airport never stops. Aircraft turn every few minutes, three
> shifts run around the clock, and the people who keep it safe rarely sit at a desk.
> Training that lives on a classroom calendar or a wired PC cannot keep up. This is a
> brief about a training platform built for that reality — one that follows the worker
> onto the ramp, into the tunnel, and back into coverage without losing a single record.

---

**Prepared for:** Hartsfield-Jackson Atlanta International Airport (ATL) — Operations, Safety & Workforce Development
**Subject:** Enterprise LMS for safety, compliance, and recurrent training across a distributed 1,000-employee workforce
**Platform:** Soteria Forge — multi-tenant, offline-first, standards-based Learning Management System
**Document type:** Research story / capability hand-off brief
**Date:** June 2026

---

## Contents

1. [The 90-second story](#1-the-90-second-story)
2. [The operating reality at a major airport](#2-the-operating-reality-at-a-major-airport)
3. [What Soteria Forge is](#3-what-soteria-forge-is)
4. [How the platform answers each pain point](#4-how-the-platform-answers-each-pain-point)
5. [Built for 1,000 — and beyond: capacity & scale](#5-built-for-1000--and-beyond-capacity--scale)
6. [Capability deep dive](#6-capability-deep-dive)
7. [A concrete rollout: 1,000 employees through Safety FORGE 10-Hour](#7-a-concrete-rollout-1000-employees-through-safety-forge-10-hour)
8. [Delivery & deployment model](#8-delivery--deployment-model)
9. [Security, isolation & audit posture](#9-security-isolation--audit-posture)
10. [What ships standard vs. what we configure for ATL](#10-what-ships-standard-vs-what-we-configure-for-atl)
11. [Why Soteria Forge](#11-why-soteria-forge)
12. [Appendix A — Technical specifications at a glance](#appendix-a--technical-specifications-at-a-glance)
13. [Appendix B — Glossary](#appendix-b--glossary)

---

## 1. The 90-second story

A ramp supervisor at ATL needs every member of her crew current on fall protection,
struck-by hazards, and lockout/tagout before the next shift. Half of them are
mid-turn below-wing with no Wi-Fi. Three started this week. Two more have
certificates expiring Friday. Her "system of record" today is a spreadsheet, a
binder of paper sign-offs, and a classroom that can seat twenty at a time.

**Soteria Forge replaces all of it with one workflow:**

- She bulk-imports the roster once. New hires inherit the right assignments by
  department and crew automatically.
- Each worker installs the training app to their phone home screen — no app store,
  no IT ticket — and **downloads the course while in coverage.**
- They complete video lessons, knowledge checks, and reflections **offline, in the
  field,** during natural gaps in the shift. Every action is queued locally.
- The moment a phone re-enters coverage, progress **syncs automatically and
  idempotently** — no duplicates, no lost attempts, even if the app was closed.
- For hands-on competencies, the supervisor records a **practical sign-off** that is
  cryptographically tied to the worker, the course, and the timestamp.
- Completion issues a **dated certificate with an expiry**, and the platform flags
  **recertifications before they lapse.**
- Safety leadership sees a live **completion-rate, overdue, and certificate dashboard**
  for the whole operation, exportable for OSHA, TSA, FAA, and airport-authority audits.

That is the entire story. The rest of this document explains how each piece works and
why the platform holds up at 1,000 employees and beyond.

---

## 2. The operating reality at a major airport

Training 1,000 people at the world's busiest airport is not a content problem — the
courses exist. It is a **delivery problem.** The friction lives in *where, when, and how*
the workforce can actually be reached, and in *proving* it happened to the satisfaction
of regulators. These are the pain points Soteria Forge was designed around:

| # | Pain point at ATL | Why it breaks conventional training |
| --- | --- | --- |
| **P1** | **A deskless, mobile workforce** — ramp agents, baggage handlers, custodial, maintenance, security, concessions | Classroom and desktop-LMS delivery assumes a seat and a screen the worker does not have during the shift |
| **P2** | **Connectivity dead zones** — jet bridges, below-wing, baggage tunnels, mechanical spaces, secure areas | Cloud-only, always-online LMS platforms simply stop working where much of the work happens |
| **P3** | **High turnover & continuous onboarding** | Every new cohort means re-keying rosters, re-assigning courses, and chasing completions by hand |
| **P4** | **A multi-employer environment** — airlines, ground handlers, contractors, concessionaires, the airport authority | One shared system either leaks data between employers or forces a dozen disconnected tools |
| **P5** | **Many supervisors, one workforce** | Every front-line manager needs *their* crew's status — and must not see everyone else's |
| **P6** | **Heavy regulatory & audit load** — OSHA, TSA, FAA, hazmat, airport-specific safety | Paper sign-offs and spreadsheets are not defensible records when an auditor or incident investigator asks for proof |
| **P7** | **Recurrent training & expiring certifications** | Lapsed safety certs are a compliance and liability exposure; manual expiry tracking always slips |
| **P8** | **Hands-on competencies** that a quiz cannot prove | Fall protection, confined space, lockout/tagout require *demonstrated* skill, not just a passed test |
| **P9** | **24/7 shift work & a diverse workforce** | Fixed-schedule, single-language training cannot reach three rotating shifts |
| **P10** | **Bring-your-own-device, low data plans** | Heavy, always-streaming apps burn data and stall on personal phones |

The remainder of this brief maps every one of these to a concrete, built-in capability.

---

## 3. What Soteria Forge is

Soteria Forge is a **multi-tenant, mobile-first, offline-capable Learning Management
System** purpose-built for industrial, construction, field-service, and austere
operating environments — exactly the conditions found across an airport campus.

It is delivered as three coordinated applications over a shared data and standards core:

| Component | Audience | Role |
| --- | --- | --- |
| **Learner & Manager app** | Front-line workers, supervisors, client admins | Mobile-installable training experience + crew oversight |
| **Control console** | Program owners, course creators, superadmins | Tenant, catalog, and content management across the whole deployment |
| **API & data core** | — | Auth, tenancy, courses, attempts, completions, offline sync, xAPI, SCORM, audit |

**Foundational design principles:**

- **Offline-first, not offline-as-an-afterthought.** The learner experience assumes
  the network will disappear and is engineered to keep working when it does.
- **Standards-based.** Internal xAPI (Experience API) statement store and SCORM 1.2 /
  SCORM 2004 runtime support mean existing course packages and learning-record
  ecosystems interoperate rather than lock in.
- **Strict tenant isolation.** Every record is partitioned by tenant, so multiple
  employers or departments can share one deployment without data bleed.
- **Mobile without the app store.** Progressive Web App (PWA) install plus optional
  native iOS/Android packaging (Capacitor) — workers add it to their home screen in
  seconds.
- **Video off the critical path.** Lesson video streams from a dedicated video CDN
  (Vimeo), so the platform's own infrastructure never carries video bandwidth.

---

## 4. How the platform answers each pain point

This is the heart of the brief: a direct line from each ATL pain point to a built-in
capability and the mechanism behind it.

| Pain point | Soteria Forge capability | How it works under the hood |
| --- | --- | --- |
| **P1 — Deskless workforce** | Mobile-installable PWA + native packaging; low-bandwidth mode | Add-to-home-screen install, service-worker caching, and a per-tenant `lowBandwidthMode` flag tune the experience for phones in the field |
| **P2 — Connectivity dead zones** | **True offline learning with idempotent sync** | Lessons, attempts, and completions are queued in on-device storage (IndexedDB) with a unique idempotency key, then reconciled when coverage returns — no lost or duplicated records |
| **P3 — Turnover & onboarding** | **Bulk roster import + bulk course assignment** | A single import call provisions an entire cohort; one assignment call enrolls many users in a course at once, with a per-row accept/reject report |
| **P4 — Multi-employer environment** | **Multi-tenancy with hard data isolation** | Each employer is a tenant resolved by subdomain or a tenant header; every query is automatically scoped to that tenant's ID — records cannot cross the boundary |
| **P5 — Many supervisors** | **Role + organizational scoping** | Four roles (learner, manager, admin, superadmin); managers see only their `department` / `site` / `crew`, while admins see the whole tenant |
| **P6 — Audit & compliance load** | **Audit trail + xAPI learning records + certificates** | Privileged actions are written to an immutable audit log (actor, IP, user-agent, timestamp); learning events are stored as xAPI statements; completion produces numbered certificates |
| **P7 — Recurrent training & expiry** | **Certificate expiry + overdue tracking** | Courses carry an expiry window; certificates are stamped with issue and expiry dates; enrollments surface `overdue` status for proactive recertification |
| **P8 — Hands-on competencies** | **Practical sign-off lesson type + seat-time + sequence lock** | A dedicated `practical-signoff` lesson lets a supervisor attest demonstrated skill; minimum seat-time and sequence locking prevent click-through completion |
| **P9 — Shift work & diversity** | **Self-paced async + per-lesson language variants** | Workers train on their own schedule across all three shifts; lessons support multiple language variants |
| **P10 — BYOD / low data** | **Low-bandwidth mode + offline pre-download + CDN video** | Content is fetched once over Wi-Fi, consumed offline, and video never touches the app's own servers |

Every capability named above is a built-in part of the platform's data model and
runtime — not a roadmap promise.

---

## 5. Built for 1,000 — and beyond: capacity & scale

A 1,000-employee operation is comfortably inside Soteria Forge's design envelope. The
architecture is the reason.

### 5.1 The numbers in context

- **1,000 employees** at ATL would run as a **single dedicated tenant** with **no
  per-seat cap** — seat limits exist only for self-service marketplace packages, not
  dedicated enterprise deployments.
- The same multi-tenant design partitions far larger populations by spreading employers
  and departments across many tenants — so 1,000 is a starting point, not a ceiling.
- Bulk onboarding is built for cohort scale: an entire roster is provisioned in a single
  import, and a whole crew is enrolled in one assignment call.

### 5.2 Why it scales — by design

| Scaling concern | Architectural answer |
| --- | --- |
| **Concurrent learners at shift change** | Offline-first means most learning happens *on the device*, not against the server. Peak concurrent server load is a fraction of an always-streaming LMS because workers pull content once and sync compact deltas. |
| **Server compute** | The API is **stateless** and deploys as serverless functions that scale horizontally per request — no fixed concurrency ceiling to provision around. |
| **Database growth** | Records are stored in MongoDB (Atlas in production), which scales horizontally; every tenant-scoped query is **indexed on tenant ID** so performance holds as data grows. |
| **Video bandwidth** | Streamed from Vimeo's global CDN with domain-privacy enforcement — **zero video load on platform infrastructure**, and no large media stored in the database. |
| **App delivery** | The learner app is a static single-page application served from CDN edge locations; install and load do not hit application servers. |
| **Write storms from sync** | Sync is **idempotent**: replays, retries, and duplicate submissions collapse to a single record, so a thousand phones reconnecting at once cannot corrupt or double-count data. |

### 5.3 What this means operationally

The platform's busiest moment — a full shift coming back into coverage and syncing — is
its *cheapest* moment by design, because each device sends a small, deduplicated batch
rather than holding an open streaming session. **Capacity planning for 1,000 employees
is routine, and the same shape scales to the entire badged workforce.**

---

## 6. Capability deep dive

### 6.1 Mobile & offline-first field delivery

The single most important capability for an airport is that **training keeps working
without a network.**

- **Install to the phone in seconds** as a PWA (no app store, no MDM ticket), with
  optional native iOS/Android builds where managed distribution is preferred.
- **Pre-download in coverage, learn anywhere.** Lessons, quizzes, and offline summaries
  are cached on the device.
- **Every action is queued locally** with a unique idempotency key and a per-device
  identifier.
- **Automatic, conflict-free reconciliation.** When connectivity returns, the queue
  flushes to the server; accepted items are cleared and anything rejected is reported —
  so the worker and supervisor always know the true state.
- **Low-bandwidth mode** trims the experience for constrained personal-data plans.

> **ATL fit:** A baggage handler completes two lessons in a tunnel with no signal. The
> records sit safely on the phone. Walking back to the breakroom Wi-Fi, the phone syncs
> in the background. Nothing is re-watched, nothing is lost, nothing is double-counted.

### 6.2 Standards & interoperability (SCORM + xAPI)

- **SCORM 1.2 and SCORM 2004 runtime support** lets ATL bring existing certified course
  packages (e.g., vendor-authored safety modules) into the platform rather than rebuild
  them.
- **Internal xAPI (Experience API) statement store** captures granular learning events
  as portable records — the foundation of a Learning Record Store (LRS) — so data can
  feed airport-wide analytics or a future enterprise LRS.
- This protects ATL's investment: content and records are **based on open learning
  standards**, not a proprietary dead end.

### 6.3 The compliance engine

Safety training is only as good as its proof. Soteria Forge enforces *real* completion,
not click-through:

- **Minimum seat time** per lesson/module ensures required contact time is actually
  spent.
- **Sequence locking** prevents skipping ahead — learners progress in the intended
  order.
- **Required-lesson completion rules** compute true course progress and only mark a
  course complete when every required lesson is done.
- **Practical sign-off** lessons let a supervisor formally attest demonstrated,
  hands-on competency — essential for fall protection, confined space, and
  lockout/tagout.
- **Numbered certificates** are issued on completion, each stamped with an **issue date
  and an expiry date.**
- **Recertification visibility:** enrollments surface `overdue` status and certificates
  carry expiry, so lapses are caught *before* they become compliance gaps.

### 6.4 Org-aware administration & reporting

Built for a workforce with many supervisors and a few program owners:

- **Four roles:** learner, manager, admin, superadmin.
- **Organizational scoping by department, site, and crew** — a manager's views
  (rosters, enrollments, certificates, completion reports) are automatically narrowed to
  *their* people; admins see the full tenant.
- **Live completion reporting** rolls up total users, published courses, enrollments,
  completed vs. overdue counts, completion rate, certificates issued, and learning-record
  volume — the exact figures an audit or a safety review asks for.
- **Bulk operations** for import and assignment keep onboarding 1,000 people from
  becoming 1,000 manual steps.

### 6.5 Authoring & content

- **Rich lesson types:** video, quiz, scenario game, SCORM, document, reflection, and
  practical sign-off — enough to cover knowledge, judgment, and demonstrated skill.
- **Structured courses:** course → module → lesson, with per-module topic codes and
  contact-hour targets (ideal for OSHA-style contact-hour reporting).
- **A reference course is already modeled:** *Safety FORGE 10-Hour*, a construction-
  focused, OSHA-aligned shell (Focus Four, PPE, health hazards, final assessment, and
  supervisor sign-off) that demonstrates the full pattern and can be adapted to
  airport-specific hazards.

> **Accuracy note:** The Safety FORGE 10-Hour shell is OSHA-*aligned* content. It is not
> an official OSHA Outreach Training Program class and does not, by itself, issue an
> OSHA/DOL card; that requires an authorized-provider workflow. We call this out plainly
> so the capability is represented honestly to ATL.

### 6.6 Security, isolation & audit

Covered in full in [Section 9](#9-security-isolation--audit-posture).

---

## 7. A concrete rollout: 1,000 employees through Safety FORGE 10-Hour

A realistic, phased delivery of a 10-hour safety program to a 1,000-person operation.

| Phase | What happens | Capability used |
| --- | --- | --- |
| **0 — Stand-up (Week 1)** | ATL provisioned as a dedicated tenant; branding, subdomain, certificate-expiry policy, and offline/low-bandwidth settings configured | Multi-tenancy, per-tenant branding & settings |
| **1 — Roster load (Week 1)** | Full 1,000-person roster bulk-imported with department, site, and crew; new hires thereafter imported per cohort | Bulk user import |
| **2 — Assignment (Week 1)** | Safety FORGE 10-Hour assigned to all 1,000 in one operation, with due dates | Bulk assignment, due-date tracking |
| **3 — Install & pre-download (Weeks 1–2)** | Workers add the app to their phones over breakroom/terminal Wi-Fi and pre-cache content | PWA install, offline pre-download |
| **4 — Field learning (Weeks 2–6)** | Workers complete 10 hours across shifts, mostly offline during natural gaps; supervisors record practical sign-offs | Offline learning, seat-time, sequence lock, sign-off |
| **5 — Sync & certify (continuous)** | Devices sync on reconnect; completions issue dated certificates automatically | Idempotent sync, certificate issuance |
| **6 — Oversight (continuous)** | Safety leadership and supervisors monitor completion rate, overdue, and expiring certs; export for audit | Org-scoped reporting, audit trail |
| **7 — Recertification (ongoing)** | Platform flags expiring certificates; affected workers are re-assigned automatically | Expiry tracking, overdue status |

The same template repeats for ramp safety, hazmat, confined space, security awareness,
and any airport-specific curriculum — each as its own course on the same platform.

---

## 8. Delivery & deployment model

Soteria Forge runs on a modern, horizontally scalable, low-operational-overhead stack:

| Layer | Production service | Why it fits ATL |
| --- | --- | --- |
| **Learner & manager app** | Static SPA on Vercel (CDN edge) | Fast install/load anywhere on campus; no server load on delivery |
| **Control console** | Static SPA on Vercel | Central management for program owners |
| **API** | Stateless serverless functions on Vercel | Scales per request; no fleet to manage |
| **Database** | MongoDB Atlas | Horizontal scale, managed backups, enterprise security controls |
| **Video** | Vimeo (domain-private) | Global CDN streaming; video never stored in or served by the platform |
| **Files (SCORM, docs, thumbnails, offline bundles)** | S3-compatible / Vercel Blob object storage | Durable, scalable media storage off the database |
| **Tenant routing** | Wildcard DNS → per-employer subdomains | Each employer/department gets a branded, isolated entry point |

This shape means **no on-premises servers**, predictable scaling, and a small operational
footprint — important for an organization that wants outcomes, not infrastructure.

---

## 9. Security, isolation & audit posture

For an airport, *provability* and *separation* are as important as delivery.

- **Hard tenant isolation.** Every record carries a tenant ID and every query is scoped
  to it. One employer's data is structurally inaccessible to another — not by policy
  alone, but by how the data layer is built.
- **First-party authentication** with hashed credentials (bcrypt) and role-based access
  control across learner, manager, admin, and superadmin.
- **Tenant-matched sessions.** Tokens are validated against the resolving tenant, so a
  credential cannot be replayed against a different employer's space.
- **Immutable audit trail.** Privileged actions (user creation, imports, assignments)
  are written to an audit log capturing the actor, action, resource, IP address,
  user-agent, and timestamp — and audit logging is designed to never block or break the
  primary operation.
- **Portable, standards-based learning records** (xAPI) provide an independent,
  exportable evidence trail for regulators and incident investigations.
- **Domain-private video** prevents lesson media from being shared or hotlinked outside
  the authorized environment.

> **ATL fit:** When an OSHA inspector, TSA reviewer, or post-incident investigator asks
> *"prove this worker was trained and competent on this date,"* the answer is a
> certificate number, a dated completion record, the underlying xAPI events, and a
> supervisor sign-off — produced in seconds, scoped to exactly the right crew.

---

## 10. What ships standard vs. what we configure for ATL

In the spirit of an honest hand-off:

| Standard, out of the box | Configured/extended for ATL during onboarding |
| --- | --- |
| Multi-tenancy & data isolation | ATL tenant, branding, subdomains, certificate-expiry policy |
| Offline-first learning & idempotent sync | Department/site/crew taxonomy mapped to ATL's org chart |
| Roles & org scoping (dept/site/crew) | Supervisor accounts mapped to real crews |
| SCORM 1.2 / 2004 runtime & xAPI store | Import of any existing ATL/vendor SCORM packages |
| Bulk import & assignment | Roster integration cadence (one-time or recurring) |
| Certificates, seat-time, sequence lock, sign-off | Airport-specific courses (ramp, hazmat, confined space, security) |
| Compliance reporting dashboard | Export formats/fields tailored to ATL's auditors |
| Safety FORGE 10-Hour reference course | Final lesson videos, airport hazard scenarios, language variants |

This separation lets ATL see a working platform immediately while we tailor content and
integration to airport-specific requirements.

---

## 11. Why Soteria Forge

- **It meets the workforce where it works** — on a phone, on the ramp, in a tunnel,
  offline — instead of forcing the workforce to come to the training.
- **It proves compliance** with certificates, expiry tracking, audit trails, and
  standards-based records that hold up to OSHA, TSA, FAA, and airport-authority scrutiny.
- **It scales without drama** — 1,000 employees is routine, and the multi-tenant,
  serverless, offline-first architecture extends to the entire badged population.
- **It isolates employers cleanly** — exactly right for an airport's multi-vendor reality.
- **It respects open standards** — SCORM and xAPI protect ATL's content and data
  investment.
- **It is operationally light** — no on-prem servers, predictable scaling, fast install,
  small footprint.

**The bottom line:** Soteria Forge turns "did everyone get trained, and can we prove it?"
from a recurring scramble into a live dashboard — for 1,000 employees today and the
whole airport tomorrow.

---

## Appendix A — Technical specifications at a glance

| Area | Specification |
| --- | --- |
| **Architecture** | Multi-tenant; three apps (learner/manager, console, API) over a shared data & standards core |
| **Tenancy** | Resolved by subdomain or tenant header; per-tenant branding, settings, and isolation |
| **Roles** | Learner, Manager, Admin, Superadmin; org scoping by department / site / crew |
| **Offline** | On-device queue (IndexedDB), per-device ID, idempotent server-side sync |
| **Standards** | SCORM 1.2 & 2004 runtime; internal xAPI statement store (LRS-lite) |
| **Lesson types** | Video, quiz, scenario game, SCORM, document, reflection, practical sign-off |
| **Compliance controls** | Minimum seat time, sequence locking, required-lesson rules, supervisor sign-off |
| **Credentialing** | Numbered certificates with issue & expiry dates; overdue/expiry tracking |
| **Reporting** | Live completion rate, overdue, certificates, learning-record volume; org-scoped |
| **Bulk ops** | Roster import and multi-user course assignment with accept/reject reporting |
| **Security** | bcrypt credentials, RBAC, tenant-matched tokens, immutable audit log (actor/IP/agent) |
| **Mobile** | Installable PWA + optional native iOS/Android (Capacitor); low-bandwidth mode |
| **Video** | Vimeo CDN streaming with domain privacy; no video stored in the database |
| **Hosting** | Static SPAs + serverless API on Vercel; MongoDB Atlas; object storage for media |
| **Seat model** | Dedicated enterprise tenants are **not** per-seat capped (seat limits apply only to self-service marketplace packages) |

## Appendix B — Glossary

| Term | Meaning |
| --- | --- |
| **PWA** | Progressive Web App — a website installable to a phone's home screen, usable offline, no app store required |
| **Capacitor** | Toolkit that packages the web app as a native iOS/Android app for managed distribution |
| **SCORM** | Sharable Content Object Reference Model — a standard for packaged, interoperable e-learning content (versions 1.2 and 2004) |
| **xAPI** | Experience API — an open standard for recording granular learning experiences as portable statements |
| **LRS** | Learning Record Store — the system that holds xAPI statements |
| **Idempotent sync** | Reconciliation in which repeating the same submission produces no duplicate effect — the basis of safe offline-to-online syncing |
| **Tenant** | An isolated organizational space (e.g., one employer or department) within the shared platform |
| **Seat-time** | Minimum required time spent on a lesson before it can count as complete |
| **Practical sign-off** | A supervisor's formal attestation that a worker demonstrated a hands-on competency |

---

*Prepared as a capability hand-off brief. All capabilities described are built into the
Soteria Forge platform's data model and runtime; items requiring airport-specific
configuration or content are identified in Section 10.*
