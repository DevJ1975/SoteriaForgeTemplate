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

### It now has a home: `apps/web`

The in-repo React web surface was built — **`apps/web`** (a Vite + React learner/preview app:
Supabase sign-in → browse RLS-scoped courses → play video lessons). Its live implementation lives at
`apps/web/src/components/StreamWebPlayer.tsx`, which imports the app's own `supabase` client.

**This `docs/examples/` copy is kept as the PORTABLE reference** — it takes an authenticated
`supabase` client as a prop, so you can drop it into an **external** React site (outside this
monorepo) without wiring. For the in-repo app, use `apps/web` instead.

Either way: `npm add @cloudflare/stream-react @supabase/supabase-js` in the host app. See
`docs/OPERATIONS.md` → "Cloudflare Stream (video)" for the secrets the edge function needs before it
returns a token (until then it returns 501 and the player shows the "not available yet" placeholder).
