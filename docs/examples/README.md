# `docs/examples/` — reference snippets (not wired into a build)

Self-contained reference code that shows how to consume Soteria Forge backend surfaces from a
context the shipped apps don't cover. These files are **documentation**, not part of any workspace
build — copy them into a real app once you decide where that surface should live.

## `StreamWebPlayer.tsx` — React (web) Cloudflare Stream player

The learner app is **React Native** and the console is **Vue 3**, so neither can import
[`@cloudflare/stream-react`](https://www.npmjs.com/package/@cloudflare/stream-react) — it renders a
web `<iframe>` and depends on the DOM. This reference is the surface where that package fits
natively: a **React DOM** app.

It reuses the SAME tenant-checked path as mobile/console — it calls the deployed `stream-signed-url`
edge function for a short-lived signed **token** (RLS-scoped to the caller's tenant; no `tenant_id`
is ever sent) and hands that token to the official `<Stream>` player via `src={token}` +
`customerCode`. It degrades on 501 (provider not configured) / 403 (video not in your tenant) /
other errors, and never gates anything.

### Where should the web player live? (open decision)

This file is intentionally **not** added as a workspace package, because that would introduce a new
React-web build target and touch centrally-owned root wiring (`package.json` workspaces,
`turbo.json`). Pick a home first:

- **A new `apps/web`** — a full learner/preview web app (new Vite/Next React app, its own deploy).
- **Embed in an existing React site** — drop `StreamWebPlayer.tsx` in and pass it an authenticated
  `supabase` client + a `lessonId`.
- **Keep as reference only** — mobile (WebView) + console (iframe preview) already cover playback;
  leave this as documentation.

Once the home is chosen: `npm add @cloudflare/stream-react @supabase/supabase-js` in that app and
import the component. See `docs/OPERATIONS.md` → "Cloudflare Stream (video)" for the secrets the
edge function needs before it returns a token (until then it returns 501 and the player shows the
"not available yet" placeholder).
