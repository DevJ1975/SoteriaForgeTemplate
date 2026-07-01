#!/usr/bin/env bash
#
# Soteria Forge — one-shot local setup to build & run the Android learner app
# (apps/mobile) and use Claude Code inside Android Studio.
#
# Run from the REPO ROOT on YOUR machine (needs Node 18+, git, and — for the
# actual build — Android Studio + an emulator/device). This writes the
# CLIENT-SAFE Supabase values into apps/mobile/.env; it never touches secrets.
#
#   bash scripts/setup-android.sh
#
set -euo pipefail

# Client-safe config (public URL + publishable/anon key — RLS-protected).
# The service-role key must NEVER go here.
SUPABASE_URL="https://bgnadngztngkwzneknhd.supabase.co"
SUPABASE_ANON_KEY="sb_publishable_A8ekb2Fm8XwM2AP8t4FPEg_vWPhsjGQ"

echo "==> Node check (need 18+)"
command -v node >/dev/null || { echo "Install Node: https://nodejs.org"; exit 1; }
node -v

echo "==> Install Claude Code CLI (global)"
npm install -g @anthropic-ai/claude-code

echo "==> Register the Supabase MCP server with Claude Code"
claude mcp add supabase -- npx -y @supabase/mcp-server-supabase@latest \
  --project-ref=bgnadngztngkwzneknhd || true

echo "==> Update to the latest code (best-effort)"
git pull --ff-only 2>/dev/null || echo "   (skipped git pull — update manually if needed)"

echo "==> Install workspace deps + build the shared package"
npm install
npm run build --workspace @soteria-forge/shared

echo "==> Write apps/mobile/.env (client-safe values; skips if it exists)"
if [ ! -f apps/mobile/.env ]; then
  printf 'EXPO_PUBLIC_SUPABASE_URL=%s\nEXPO_PUBLIC_SUPABASE_ANON_KEY=%s\n' \
    "$SUPABASE_URL" "$SUPABASE_ANON_KEY" > apps/mobile/.env
  echo "   wrote apps/mobile/.env"
else
  echo "   apps/mobile/.env exists — leaving it"
fi

cat <<'NEXT'

DONE. Next steps (in Android Studio):
  1) Device Manager -> launch an Android emulator (or plug in a device).
  2) Open the Terminal (repo root) and run:  claude
       - complete the browser sign-in the first time
       - optional: type /ide to pair Claude with Android Studio
  3) Build & launch:  cd apps/mobile && npx expo run:android
  4) Sign in:  worker@atl.test / SoteriaForge!2026
     (Video shows a "not available yet" placeholder until Cloudflare Stream
      secrets are set — see docs/OPERATIONS.md. Everything else works.)
NEXT
