<#
  Soteria Forge — one-shot local setup to build & run the Android learner app
  (apps/mobile) and use Claude Code inside Android Studio. Windows PowerShell.

  Run from the REPO ROOT on YOUR machine (needs Node 18+, git, and — for the
  actual build — Android Studio + an emulator/device). Writes the CLIENT-SAFE
  Supabase values into apps/mobile/.env; never touches secrets.

      pwsh ./scripts/setup-android.ps1
#>
$ErrorActionPreference = "Stop"

# Client-safe config (public URL + publishable/anon key — RLS-protected).
# The service-role key must NEVER go here.
$SupabaseUrl     = "https://bgnadngztngkwzneknhd.supabase.co"
$SupabaseAnonKey = "sb_publishable_A8ekb2Fm8XwM2AP8t4FPEg_vWPhsjGQ"

Write-Host "==> Node check (need 18+)"
node -v

Write-Host "==> Install Claude Code CLI (global)"
npm install -g @anthropic-ai/claude-code

Write-Host "==> Register the Supabase MCP server with Claude Code"
claude mcp add supabase -- npx -y "@supabase/mcp-server-supabase@latest" --project-ref=bgnadngztngkwzneknhd

Write-Host "==> Update to the latest code (best-effort)"
try { git pull --ff-only } catch { Write-Host "   (skipped git pull — update manually if needed)" }

Write-Host "==> Install workspace deps + build the shared package"
npm install
npm run build --workspace "@soteria-forge/shared"

Write-Host "==> Write apps/mobile/.env (client-safe values; skips if it exists)"
if (-not (Test-Path "apps/mobile/.env")) {
  "EXPO_PUBLIC_SUPABASE_URL=$SupabaseUrl`nEXPO_PUBLIC_SUPABASE_ANON_KEY=$SupabaseAnonKey" |
    Set-Content -Path "apps/mobile/.env" -Encoding ascii
  Write-Host "   wrote apps/mobile/.env"
} else {
  Write-Host "   apps/mobile/.env exists - leaving it"
}

Write-Host ""
Write-Host "DONE. Next steps (in Android Studio):"
Write-Host "  1) Device Manager -> launch an Android emulator (or plug in a device)."
Write-Host "  2) Terminal (repo root):  claude    # sign in; optional: type /ide"
Write-Host "  3) Build & launch:  cd apps/mobile ; npx expo run:android"
Write-Host "  4) Sign in:  worker@atl.test / SoteriaForge!2026"
Write-Host "     (Video is a placeholder until Cloudflare Stream secrets are set; everything else works.)"
