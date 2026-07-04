# Handoff — "StoryDoc" Clone (React + Next.js)

> **Purpose of this document.** This is a self-contained engineering handoff for a
> separate agent/developer to build a **Storydoc-style interactive document app** from
> scratch in **React + Next.js**. It assumes no access to the conversation that produced
> it. Read it top to bottom, confirm the few open questions in §17, then build to the
> MVP scope in §4 and the acceptance criteria in §15.

---

## Contents

1. [What we're building](#1-what-were-building)
2. [Background: what Storydoc is](#2-background-what-storydoc-is)
3. [Goals & non-goals](#3-goals--non-goals)
4. [MVP scope vs. later phases](#4-mvp-scope-vs-later-phases)
5. [Core concept: the document model](#5-core-concept-the-document-model)
6. [Block (component) catalog](#6-block-component-catalog)
7. [Tech stack](#7-tech-stack)
8. [Architecture](#8-architecture)
9. [Data model](#9-data-model)
10. [Route map (App Router)](#10-route-map-app-router)
11. [The rendering engine](#11-the-rendering-engine)
12. [The editor](#12-the-editor)
13. [Theming & design system](#13-theming--design-system)
14. [Analytics](#14-analytics)
15. [Acceptance criteria (Definition of Done for MVP)](#15-acceptance-criteria-definition-of-done-for-mvp)
16. [Getting started](#16-getting-started)
17. [Open questions to confirm before building](#17-open-questions-to-confirm-before-building)
18. [Appendix A — Seed content (a real story doc)](#appendix-a--seed-content-a-real-story-doc)
19. [Appendix B — Milestone plan](#appendix-b--milestone-plan)

---

## 1. What we're building

A web app where a user can **create, edit, theme, publish, and track interactive
"story docs"** — scroll-based, responsive, web-native documents that replace static
PDF/PowerPoint decks. Think: a marketing brochure, sales deck, proposal, or report that
lives at a shareable URL, adapts to mobile, embeds video and interactive components, and
reports back who read it and for how long.

The product has three surfaces:

| Surface | Who | What it does |
| --- | --- | --- |
| **Dashboard** | Authors | Create/manage docs, see analytics |
| **Editor** | Authors | Build a doc out of ordered sections and blocks; set theme; publish |
| **Reader** | Recipients | View the published, interactive doc at a public link; engagement is tracked |

A complete, real story doc is provided as **seed content in [Appendix A](#appendix-a--seed-content-a-real-story-doc)** — use it as the first document the app renders and as test data for the analytics pipeline.

---

## 2. Background: what Storydoc is

[Storydoc](https://storydoc.com) is a SaaS tool for building **interactive presentations
and documents** instead of static slides. Its differentiators — and the features worth
cloning — are:

- **Scroll-based, slide-like sections** that combine into one continuous, narrative web page.
- **Interactive components**: embedded video, tabs, image galleries, animated reveals,
  CTAs, lead-capture forms, "book a meeting" embeds.
- **Automatically responsive** — one doc renders well on desktop and mobile without manual layout.
- **Branded themes** — colors, fonts, logo applied consistently across a doc.
- **Personalization** — per-recipient links that inject variables (e.g. a name or company) into the content.
- **Engagement analytics** — who opened it, time spent per section, read-through/completion, CTA clicks, captured leads.
- **Shareable link + embed + PDF export**.

We are cloning the **author → publish → read → measure** loop, not the entire Storydoc
feature surface. See scope in §4.

---

## 3. Goals & non-goals

**Goals**
- Authors can produce a polished interactive doc with **no code**, from a block-based editor.
- Published docs are **fast, responsive, accessible, and SEO/OG-friendly**.
- Authors get **actionable engagement analytics** per doc and per section.
- The codebase is a clean, typed, conventional **Next.js (App Router) + React** app that's easy to extend.

**Non-goals (explicitly out of scope for the first build)**
- Real-time multiplayer co-editing.
- A free-form drag-anywhere canvas (we use a structured section/block model instead — far simpler and more robust).
- E-signature / proposal acceptance flows.
- AI content generation (left as a Phase 3 hook, not built).
- Custom domains per doc, billing/subscriptions, and team org charts/roles.

---

## 4. MVP scope vs. later phases

### MVP (build this first)
1. **Auth** — email magic-link or credentials sign-up/sign-in.
2. **Dashboard** — list, create, duplicate, rename, delete docs; show status (draft/published) and headline stats.
3. **Editor** — add/reorder/delete **sections**; within a section add/reorder/delete **blocks**; edit block content and per-block style; live preview; autosave.
4. **Block catalog** — the MVP subset in §6.
5. **Theme** — pick/customize a theme (colors, font pairing, density) applied to the whole doc; ship 2–3 presets including the "Soteria Forge" brand theme from Appendix A.
6. **Publish + Reader** — publish to a public slug; reader is server-rendered, responsive, with smooth scroll, a progress indicator, and section anchors.
7. **Analytics** — record views, unique viewers, time-per-section, completion, and CTA clicks; show them on a per-doc analytics page.
8. **Sharing** — copy public link; basic personalization variables (`{{first_name}}`, `{{company}}`) via query params.
9. **Seed** — the Appendix A document loads as an example/template.

### Phase 2
- Lead-capture form block + a leads inbox.
- PDF export of a published doc.
- More block types (tabs, accordion, gallery, stats, embed/iframe, calendar embed).
- Password-gated docs; link expiry.
- Per-recipient personalized links with a tracked recipient identity.

### Phase 3
- AI "generate a draft doc from a prompt or pasted markdown".
- Custom domains, team workspaces & roles, billing.

---

## 5. Core concept: the document model

A story doc is **structured JSON**, not free-form HTML. This is the single most important
design decision: it makes the editor, the renderer, analytics anchors, and versioning all
straightforward.

```
Story (doc)
├─ meta: { title, slug, status, ogImage, themeId }
├─ theme: ThemeTokens (or reference to a Theme)
└─ sections: Section[]            // ordered, each ≈ one "slide"/band
     ├─ id, layout, background, paddingScale, anchor
     └─ blocks: Block[]           // ordered components inside the section
          └─ { id, type, props, style? }
```

- A **Section** is a full-width horizontal band (one visual "slide" in the scroll). It owns
  background, vertical rhythm, and an analytics anchor.
- A **Block** is a typed component inside a section (heading, rich text, image, CTA, …).
- The renderer maps `block.type` → a React component. The editor edits the same tree.
- Store the whole tree as a single `jsonb` column (`Story.content`). Validate it with a
  **Zod** schema that is the shared source of truth for editor and renderer.

Keep a versioned `schemaVersion` field on the document so the model can evolve.

---

## 6. Block (component) catalog

Each block is `{ id, type, props, style? }`. Implement the **MVP set** first.

| Block `type` | MVP? | Key props |
| --- | --- | --- |
| `hero` | ✅ | `eyebrow`, `title`, `subtitle`, `media?`, `cta?` |
| `heading` | ✅ | `text`, `level` (1–4), `align` |
| `richText` | ✅ | `html`/portable rich-text JSON (TipTap) |
| `image` | ✅ | `src`, `alt`, `caption?`, `fit` |
| `video` | ✅ | `provider` (youtube/vimeo/mp4), `url`, `poster?` |
| `button` / `cta` | ✅ | `label`, `href`, `variant`, `trackingId` |
| `callout` | ✅ | `tone` (info/success/warn), `title`, `body` |
| `stats` | ✅ | `items: { value, label }[]` |
| `list` | ✅ | `style` (bullet/check/number), `items[]` |
| `divider` / `spacer` | ✅ | `size` |
| `table` | ✅ | `headers[]`, `rows[][]` |
| `quote` | ➖ P2 | `text`, `attribution` |
| `tabs` | ➖ P2 | `tabs: { label, blocks[] }[]` |
| `accordion` | ➖ P2 | `items: { q, a }[]` |
| `gallery` | ➖ P2 | `images[]`, `layout` |
| `embed` | ➖ P2 | `url` (iframe), `aspect` |
| `form` (lead capture) | ➖ P2 | `fields[]`, `submitLabel`, `destination` |
| `calendar` | ➖ P3 | `provider`, `url` |

Every block should support a small shared `style` object (margin scale, alignment,
max-width, background) so authors can adjust without new block types.

---

## 7. Tech stack

Recommended, opinionated defaults. The constraint is **React + Next.js**; the rest is
chosen to minimize bespoke work. Swap items in §17 if you prefer.

| Concern | Choice | Why |
| --- | --- | --- |
| Framework | **Next.js (App Router) + TypeScript** | Required; RSC + server actions fit the read/render/track loop |
| UI | **React 18+**, **Tailwind CSS**, **shadcn/ui** (Radix primitives) | Fast, accessible, themeable |
| Icons | **lucide-react** | Clean, consistent |
| DB + ORM | **PostgreSQL + Prisma** | Typed schema; `jsonb` for doc content. Neon/Supabase/Vercel Postgres all fine |
| Auth | **Auth.js (NextAuth v5)** | First-class Next.js integration |
| Rich text | **TipTap** (ProseMirror) | Block-friendly rich text editing → JSON |
| Drag & drop | **dnd-kit** | Reorder sections/blocks |
| Editor state | **Zustand** | Lightweight client store for the editor tree |
| Validation | **Zod** | One schema shared by editor + renderer + API |
| Charts (analytics) | **Recharts** | Simple per-section/time charts |
| Hosting | **Vercel** | Native Next.js target; edge + serverless |

> If a backend-as-a-service is preferred, **Supabase** (Postgres + Auth + Storage) is a clean
> single-vendor substitute for Prisma+Auth.js+blob storage. Pick one path in §17.

---

## 8. Architecture

- **Server Components by default.** The **Reader** (`/v/[slug]`) is a Server Component that
  loads the doc and renders blocks server-side for speed + SEO + OG tags. Only interactive
  blocks (video, tabs, forms, scroll tracking) hydrate as Client Components.
- **Editor is client-side.** The editor is a Client Component tree backed by a Zustand
  store holding the working document; changes **autosave** via a server action (debounced).
- **Server actions for mutations** (create/update/publish doc, submit lead). **Route
  handlers** for the high-volume, fire-and-forget **analytics ingest** (`POST /api/track`)
  and any webhooks.
- **Content is the contract.** The Zod-validated document JSON is the boundary between
  editor and renderer; never render arbitrary HTML strings without sanitizing.
- **Separation of concerns**
  - `lib/blocks/` — block schema (Zod), registry, and the `type → component` map.
  - `components/reader/` — read-only block renderers.
  - `components/editor/` — editable block wrappers + inspector controls.
  - `lib/analytics/` — client tracker + server ingest + aggregation queries.

```
            ┌────────────┐    autosave (server action)    ┌────────────┐
  Author ──▶│   Editor   │ ──────────────────────────────▶│  Postgres  │
            │ (client)   │◀──────── load doc ──────────────│  (Prisma)  │
            └────────────┘                                 └─────▲──────┘
                                                                 │ aggregate
            ┌────────────┐   POST /api/track (events)            │
 Recipient ─▶│  Reader   │ ──────────────────────────────────────┘
            │ (RSC+hydr) │
            └────────────┘
```

---

## 9. Data model

Prisma-style sketch (adapt names as needed). Use `jsonb` for `Story.content` and
`Theme.tokens`.

```prisma
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  stories   Story[]
  createdAt DateTime @default(now())
}

model Story {
  id            String   @id @default(cuid())
  ownerId       String
  owner         User     @relation(fields: [ownerId], references: [id])
  title         String
  slug          String   @unique          // public reader URL: /v/[slug]
  status        Status   @default(DRAFT)  // DRAFT | PUBLISHED | ARCHIVED
  content       Json                       // the Section[]/Block[] tree (Zod-validated)
  themeId       String?
  theme         Theme?   @relation(fields: [themeId], references: [id])
  ogImageUrl    String?
  schemaVersion Int      @default(1)
  publishedAt   DateTime?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  sessions      ViewSession[]
  events        AnalyticsEvent[]
  leads         Lead[]
}

model Theme {
  id      String  @id @default(cuid())
  name    String
  tokens  Json    // colors, fonts, radius, spacing, density
  stories Story[]
}

model ViewSession {
  id         String   @id @default(cuid())
  storyId    String
  story      Story    @relation(fields: [storyId], references: [id])
  visitorId  String   // anon cookie/localStorage id
  recipient  String?  // from personalization link (e.g. name/company)
  referrer   String?
  device     String?
  startedAt  DateTime @default(now())
  lastSeenAt DateTime @default(now())
  completed  Boolean  @default(false) // reached final section
  events     AnalyticsEvent[]
}

model AnalyticsEvent {
  id        String   @id @default(cuid())
  storyId   String
  story     Story    @relation(fields: [storyId], references: [id])
  sessionId String
  session   ViewSession @relation(fields: [sessionId], references: [id])
  type      String   // doc_view | section_view | section_time | cta_click | form_submit | doc_complete
  sectionId String?
  value     Float?   // e.g. seconds for section_time
  meta      Json?
  createdAt DateTime @default(now())
}

model Lead {
  id        String   @id @default(cuid())
  storyId   String
  story     Story    @relation(fields: [storyId], references: [id])
  data      Json     // submitted form fields
  createdAt DateTime @default(now())
}

enum Status { DRAFT PUBLISHED ARCHIVED }
```

---

## 10. Route map (App Router)

```
app/
  (marketing)/
    page.tsx                      # public landing
  (auth)/
    login/page.tsx
    signup/page.tsx
  (app)/                          # authenticated; layout guards session
    dashboard/page.tsx            # list/create docs
    editor/[storyId]/page.tsx     # the editor
    analytics/[storyId]/page.tsx  # per-doc analytics
    settings/page.tsx
  v/[slug]/page.tsx               # PUBLIC reader (server-rendered, OG tags)
  api/
    track/route.ts                # POST analytics events (no auth, rate-limited)
    leads/route.ts                # POST lead capture
  layout.tsx
  globals.css

lib/
  blocks/{schema.ts, registry.ts}
  db.ts                           # prisma client
  auth.ts                         # auth.js config
  analytics/{tracker.ts, ingest.ts, queries.ts}
  personalize.ts                  # {{var}} substitution

components/
  reader/<BlockName>.tsx          # read-only renderers
  editor/<...>.tsx                # editable wrappers + inspector
  ui/...                          # shadcn components
```

Prefer **server actions** (colocated in `app/(app)/.../actions.ts`) for doc CRUD/publish
over hand-rolled API routes; keep `/api/track` and `/api/leads` as route handlers.

---

## 11. The rendering engine

The renderer is the heart of the app. Keep it a pure function of the document JSON.

- **Block registry**: `registry[type] = { reader: Component, editor: Component, schema: ZodType, defaultProps }`.
- **Reader** walks `sections[].blocks[]` and renders `registry[block.type].reader`. Unknown
  types render nothing (forward-compatible). Wrap each `Section` with its analytics anchor
  (`data-section-id`) and theme-aware background.
- **Theme** is applied as **CSS variables** on the doc root (`--sd-color-primary`, `--sd-font-display`, …)
  so all blocks style from tokens; no hard-coded colors in blocks.
- **Responsiveness** is automatic: sections are vertical bands; blocks use fluid Tailwind
  classes and CSS grid/flex; media is `max-width: 100%`. No fixed pixel canvas.
- **Rich text** (`richText` block) renders sanitized TipTap JSON → HTML (use a server-safe
  renderer; sanitize with e.g. `isomorphic-dompurify` if emitting HTML).
- **Personalization**: before render, run `personalize(content, vars)` to replace
  `{{first_name}}`/`{{company}}` tokens from the share link's query params.
- **SEO/OG**: the reader page exports `generateMetadata` from the doc's title/`ogImageUrl`.

The same registry powers the editor (renders `registry[type].editor`) — build once, use twice.

---

## 12. The editor

- **Layout**: left = section/block outline (reorderable via dnd-kit); center = live canvas
  (renders the actual reader components, click to select); right = **inspector** (edit the
  selected block's `props` + `style`).
- **State**: Zustand store holds the working `Story.content`. All edits mutate the store;
  a **debounced autosave** (≈800ms) calls the `updateStory` server action. Show a saved/saving indicator.
- **Add block / add section**: "+" affordances; new blocks come from `registry[type].defaultProps`.
- **Rich text**: TipTap editor bound to the `richText` block; persist as TipTap JSON.
- **Theme panel**: edit theme tokens live; changes reflect immediately via CSS variables.
- **Publish**: server action sets `status=PUBLISHED`, `publishedAt`, ensures unique `slug`,
  returns the public URL.
- **Guardrails**: validate the doc with the Zod schema before publish; block publish on invalid content.

Keep the editor a **structured form over JSON**, not a contenteditable canvas — it is far
more reliable and is the correct interpretation of "Storydoc-like" for an MVP.

---

## 13. Theming & design system

- Theme tokens: `{ colors: {primary, accent, bg, surface, text, muted}, font: {display, body}, radius, density }`.
- Apply as CSS variables on the reader/editor root; Tailwind reads them via `theme.extend` or
  arbitrary `var(--sd-*)` values.
- Ship presets: **Soteria Forge** (primary `#3DA9FC`, accent `#FF6B1F` — see Appendix A),
  plus a neutral "Slate" and a high-contrast "Mono".
- Fonts via `next/font`. Default pairing: a strong display face + a readable body face.
- Respect `prefers-reduced-motion`; keep animations subtle (fade/slide-in on scroll via IntersectionObserver).

---

## 14. Analytics

The measurable read-through is a core value prop — build it for the MVP.

**Client tracker** (`lib/analytics/tracker.ts`, runs on the reader):
- On load: create/restore a `visitorId` (localStorage) and start a `ViewSession`; emit `doc_view`.
- Use **IntersectionObserver** on each `[data-section-id]` to emit `section_view` and to
  accumulate dwell time, flushed as `section_time` (seconds) on exit/visibility change.
- `cta_click` on tracked buttons; `form_submit` on lead forms; `doc_complete` when the last section is seen.
- Batch events and `POST /api/track` with `navigator.sendBeacon` on `visibilitychange`/unload.

**Server ingest** (`/api/track`): validate, rate-limit, upsert session `lastSeenAt`, insert events. No auth (public reader), but guard against abuse.

**Aggregation + dashboard** (`analytics/[storyId]`):
- Headline: total views, unique visitors, avg. time on doc, completion rate, CTA clicks, leads.
- Per-section bar chart: avg. dwell time and view count (find drop-off).
- Recent sessions list (device, referrer, recipient, time spent, completed?).

---

## 15. Acceptance criteria (Definition of Done for MVP)

A reviewer should be able to:

1. **Sign up / sign in** and land on an empty dashboard.
2. **Create a doc** (blank or from the seed template) and open it in the editor.
3. **Edit**: add/reorder/delete sections and blocks (all MVP block types in §6), edit rich
   text, set a CTA link; changes **autosave** and survive reload.
4. **Theme**: switch to the Soteria Forge preset and tweak a color; the canvas updates live.
5. **Publish** and open the **public reader URL** in a new browser:
   - Renders all MVP blocks correctly.
   - Is **fully responsive** (verify at 375px and 1440px) with smooth scroll + progress indicator.
   - Has correct **title/OG meta**.
   - A personalization link like `?first_name=Jamil&company=ATL` injects those values.
6. **Analytics**: after viewing the public doc and scrolling through, the doc's analytics
   page shows the view, per-section dwell time, completion, and any CTA click.
7. **Seed**: the Appendix A document renders end-to-end as a real example.
8. **Quality bar**: TypeScript strict passes, `next build` succeeds, no console errors on
   reader/editor, Lighthouse a11y ≥ 90 on the reader.

---

## 16. Getting started

```bash
# scaffold
npx create-next-app@latest storydoc-clone --typescript --tailwind --eslint --app --src-dir

cd storydoc-clone

# core deps
npm i @prisma/client next-auth@beta zod zustand @dnd-kit/core @dnd-kit/sortable \
      @tiptap/react @tiptap/starter-kit lucide-react recharts isomorphic-dompurify
npm i -D prisma

# ui
npx shadcn@latest init

# db
npx prisma init        # set DATABASE_URL, then model per §9
npx prisma migrate dev --name init
```

**Env vars** (`.env`):
```
DATABASE_URL=postgresql://...
NEXTAUTH_SECRET=...           # openssl rand -base64 32
NEXTAUTH_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**Deploy:** Vercel project from the repo; add the same env vars; attach a Postgres
(Neon/Supabase/Vercel Postgres). The Reader route should be cacheable/ISR where possible;
`/api/track` runs as a serverless function.

---

## 17. Open questions to confirm before building

1. **Auth method** — magic-link email vs. credentials vs. an OAuth provider (Google)?
   (Default: email magic-link via Auth.js.)
2. **Backend** — Prisma + Postgres + Auth.js (default) **or** Supabase all-in-one?
3. **Public URL shape** — `/v/[slug]` (default) or a workspace-scoped `/[workspace]/[slug]`?
4. **Brand** — is this a generic StoryDoc clone, or should it ship pre-branded as
   "Soteria Forge" using the Appendix A theme as the default?
5. **PDF export** — needed in MVP or Phase 2? (Default: Phase 2.)
6. **Image/file uploads** — uploader + blob storage in MVP, or external URLs only to start?
   (Default: external URLs in MVP, uploads in Phase 2.)

---

## Appendix A — Seed content (a real story doc)

Use this as the first template and as analytics test data. It is a marketing brochure for
an LMS ("Soteria Forge") targeting a large airport operation. The full long-form source is
available as markdown at `docs/soteria-forge-atlanta-airport-brochure.md` in the sibling
repository; below is the same content mapped to the **section/block model** so it drops
straight into the renderer.

**Suggested theme (Soteria Forge preset):**
```json
{
  "name": "Soteria Forge",
  "tokens": {
    "colors": { "primary": "#3DA9FC", "accent": "#FF6B1F", "bg": "#0B1622",
                "surface": "#13202E", "text": "#F4F8FB", "muted": "#9DB2C3" },
    "font": { "display": "Space Grotesk", "body": "Inter" },
    "radius": "16px", "density": "comfortable"
  }
}
```

**Document (abbreviated to the first sections — extend from the markdown source):**
```json
{
  "schemaVersion": 1,
  "meta": { "title": "Soteria Forge LMS — Training at Airport Scale", "slug": "soteria-forge-atl", "status": "DRAFT", "themeId": "soteria-forge" },
  "sections": [
    {
      "id": "s-hero", "layout": "hero", "background": "gradient",
      "blocks": [
        { "id": "b1", "type": "hero", "props": {
          "eyebrow": "Capability brief",
          "title": "Enterprise safety training, built for airport scale",
          "subtitle": "Multi-tenant, offline-first, standards-based LMS for a distributed 1,000-employee workforce.",
          "cta": { "label": "See how it works", "href": "#how" } } }
      ]
    },
    {
      "id": "s-story", "layout": "single", "anchor": "story",
      "blocks": [
        { "id": "b2", "type": "heading", "props": { "text": "The 90-second story", "level": 2 } },
        { "id": "b3", "type": "richText", "props": { "html": "<p>A ramp supervisor needs every crew member current on fall protection and lockout/tagout before the next shift — half of them below-wing with no Wi-Fi. Today that's a spreadsheet, a binder of paper sign-offs, and a 20-seat classroom. Soteria Forge replaces all of it with one workflow.</p>" } }
      ]
    },
    {
      "id": "s-pain", "layout": "single", "anchor": "pain",
      "blocks": [
        { "id": "b4", "type": "heading", "props": { "text": "The operating reality", "level": 2 } },
        { "id": "b5", "type": "stats", "props": { "items": [
          { "value": "1,000", "label": "employees to train & recertify" },
          { "value": "3", "label": "rotating shifts, 24/7" },
          { "value": "0", "label": "desks on the ramp" } ] } },
        { "id": "b6", "type": "list", "props": { "style": "check", "items": [
          "Deskless, mobile workforce",
          "Connectivity dead zones (tunnels, jet bridges, below-wing)",
          "High turnover & continuous onboarding",
          "Multi-employer environment needing data isolation",
          "Heavy OSHA / TSA / FAA audit load",
          "Expiring certifications to track" ] } }
      ]
    },
    {
      "id": "s-how", "layout": "single", "anchor": "how", "background": "surface",
      "blocks": [
        { "id": "b7", "type": "heading", "props": { "text": "How the platform answers it", "level": 2 } },
        { "id": "b8", "type": "table", "props": {
          "headers": ["Pain point", "Capability"],
          "rows": [
            ["Connectivity dead zones", "True offline learning with idempotent sync"],
            ["Onboarding at scale", "Bulk roster import + bulk course assignment"],
            ["Multi-employer", "Multi-tenant isolation by tenant ID"],
            ["Audit load", "Audit trail + xAPI records + dated certificates"],
            ["Recurrent training", "Certificate expiry + overdue tracking"],
            ["Hands-on skills", "Supervisor practical sign-off"] ] } },
        { "id": "b9", "type": "callout", "props": { "tone": "info",
          "title": "ATL fit",
          "body": "A handler completes lessons in a tunnel with no signal; records sync automatically on reconnect — nothing re-watched, nothing lost, nothing double-counted." } }
      ]
    },
    {
      "id": "s-cta", "layout": "single", "anchor": "cta", "background": "primary",
      "blocks": [
        { "id": "b10", "type": "heading", "props": { "text": "Turn \"did everyone get trained?\" into a live dashboard.", "level": 2, "align": "center" } },
        { "id": "b11", "type": "cta", "props": { "label": "Request a walkthrough", "href": "mailto:hello@example.com", "variant": "accent", "trackingId": "cta-primary" } }
      ]
    }
  ]
}
```

> Extend the `sections` array with the remaining content (capacity/scale, capability deep
> dive, rollout timeline, security, why-us) from the markdown source. The point of the seed
> is to exercise every MVP block type and the analytics anchors end-to-end.

---

## Appendix B — Milestone plan

| Milestone | Deliverable |
| --- | --- |
| **M1 — Skeleton** | Next.js app, Tailwind/shadcn, Prisma schema + migration, Auth.js, empty dashboard |
| **M2 — Renderer** | Block registry + Zod schema; Reader route renders the Appendix A seed responsively |
| **M3 — Editor** | Section/block outline, inspector, TipTap, dnd-kit reorder, autosave |
| **M4 — Publish + Theme** | Publish flow, public slug, theme tokens + presets, OG/SEO, personalization |
| **M5 — Analytics** | Client tracker, `/api/track`, aggregation queries, analytics dashboard |
| **M6 — Polish** | A11y pass, Lighthouse, empty/error states, `next build` clean, deploy to Vercel |

---

*End of handoff. Confirm §17, then start at Milestone 1.*
