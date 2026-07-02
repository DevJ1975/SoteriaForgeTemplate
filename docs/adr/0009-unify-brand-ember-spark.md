# ADR-0009: Unify the product brand on ember/spark

- **Status:** Accepted
- **Date:** 2026-07-01
- **Deciders:** Owner, Design, Platform
- **Related:** [ADR-0006](./0006-adopt-soteria-forge-ui-kit.md) — resolves the
  open brand decision it recorded

## Context

[ADR-0006](./0006-adopt-soteria-forge-ui-kit.md) adopted the Soteria Forge UI
kit as `packages/ui` and deliberately recorded an **open brand divergence**:
mobile (the kit) speaks **ember/spark** with **Oswald + Barlow Semi Condensed**
type, while `apps/console`, `apps/web`, and the root `CLAUDE.md` stayed on the
placeholder **Ink/Bone/Cobalt** identity (`ink #0E1A2E` / `blue #3DA9FC` /
`orange #FF6B1F` / `paper #F5F4EF`) with Inter. That ADR named the two
reconciliation paths — rebrand console/root to ember/spark, or re-skin the kit —
and left the pick to the owner.

Two further forces:

- The product ships **two visual languages**: a learner sees ember/spark on
  mobile and Ink/Bone/Cobalt on web/console. That is a product-quality bug, not
  a stable state.
- The docs carried a **false mirror claim**: three `CLAUDE.md` files stated that
  `packages/ui` contains `tokens.ts`/`tokens.css` "mirrored 1:1" with the
  console. No such files ever existed — `packages/ui/src/theme.ts` is, and
  always was, the kit's only token source. The claim implied a sync mechanism
  that was never there, so brand drift had no tripwire.

The owner has now decided. This ADR records the decision and the token contract
that makes it checkable.

## Decision

**Ember/spark is THE Soteria Forge brand — everywhere.**

- **`packages/ui/src/theme.ts` is the canonical brand source.** Its ember/spark
  ramps, warm-ink neutrals, and type stack define the identity; every other
  token file derives from it.
- **`apps/web/src/theme/tokens.css` and `apps/console/src/theme/tokens.css`
  mirror the kit's VALUES and stay byte-identical to each other.** The kit↔CSS
  relationship is a *value* mirror (CSS custom properties carrying the same
  hexes), not a file copy; the web↔console relationship is literal byte
  identity, so `diff` is the drift check.
- **Bare brand tokens:** ember `#E8551F` · spark `#FFB552` · ink `#1A1D22` ·
  paper `#F1EEE8`. The neutral ramp keeps its `--sf-color-ink-*` name but
  re-anchors to the kit's warm-ink values; the bare `--sf-color-blue` /
  `--sf-color-orange` tokens are **deleted** (zero remaining references).
- **Oswald (display) + Barlow Semi Condensed (body) become the platform type**
  across web and console, matching mobile. Headings use `letter-spacing: 0` —
  condensed faces degrade under negative tracking.
- **Brand hexes live only in the token sources + logo/brand art:**
  `packages/ui/src/theme.ts`, the two `tokens.css` mirrors,
  `apps/console/src/theme/soteria-forge.css`, and logo/brand SVG files.
  **Never in a component** — the standing rule is unchanged.
- **Dark scheme + toggle contract (web):** dark values are authored twice with
  identical values — a `[data-theme="dark"]` block and a `prefers-color-scheme`
  mirror. The toggle persists localStorage key `sf-theme` =
  `'light' | 'dark' | 'system'`, applied as a `data-theme` attribute on
  `document.documentElement` (attribute absent for system).

## Alternatives considered

- **Re-skin the kit to Ink/Bone/Cobalt** (ADR-0006's other path) — **rejected.**
  The kit ships a complete, coherent, *authored* identity — full ember/spark
  ramps, a designed dark scheme, gamification and report surfaces built around
  it — and mobile already renders it. Re-skinning discards finished design work
  to preserve placeholder tokens that were never a designed identity.
- **Keep the divergence** — **rejected.** Two brands in one product is a
  product-quality bug. Every new surface would deepen the split, and the false
  mirror claim shows the drift was already going unpoliced.

## Consequences

**Easier**

- One identity, one canonical source: a future rebrand is again a token-level
  edit (`theme.ts` + the two mirrored `tokens.css`), never a component hunt.
- The false "mirrored 1:1 in `packages/ui`" claim is corrected everywhere it
  appeared; the mirror contract is now real and mechanically checkable
  (web/console `tokens.css` byte-identical).

**Work this creates / watch-items**

- **Console + web re-token:** both `tokens.css` files are rewritten to the kit
  values, with ~30 `var()` renames across the two `styles.css`
  (blue-600→ember-600 · blue-700→ember-700 · blue-50/100/200→ember-50/100/200 ·
  blue-300→spark-300 · orange-500→ember-500 · orange-50→spark-50).
- **Brand SVGs re-authored:** console logo/brand art moves to the forged-shield
  mark.
- **Contrast watch-items:** white on ember-500 `#E8551F` is ~3.7:1, so primary
  web buttons use an **ember-600 fill** (`#D8451A`); AA text on paper/white uses
  ember-700 (`#B03713`). Warning `#E8A317` is **background/badge-fill only**,
  always with ink text — never used as text on a light surface.
- **Condensed body face risk:** if Barlow Semi Condensed underperforms for long
  body copy, the fallback is a token-only swap to regular Barlow — same loading
  path, no component edits.
- **Mobile app icon/splash PNGs** are binary assets; regenerating them for the
  forged-shield mark is an operator step, not repo-authored code.
