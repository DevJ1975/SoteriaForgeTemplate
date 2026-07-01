#!/bin/sh
# =============================================================================
# block-secrets.sh  —  PreToolUse guard for the `Bash` tool.
#
# PURPOSE
#   Stop secrets from being committed or written into tracked source. Two classes
#   of hazard are caught:
#     1. Committing/staging a real `.env` (or other secret-bearing) file.
#     2. Any command whose text contains a key-shaped string (AWS access key id,
#        a PEM private-key header, or a well-known token prefix).
#   The repo convention is: ONLY `.env.example` placeholders are tracked; real
#   credentials live in git-ignored files (`.env`, `amplify_outputs.json`) and
#   are never pasted into source or commit content.
#
# CONTRACT (Claude Code hooks)
#   - Tool call arrives as JSON on STDIN: { "tool_input": { "command": "..." } }.
#   - Exit 0  => allow.
#   - Exit 2  => BLOCK; STDERR is the reason shown to the model.
#   - Other nonzero exits are treated as hook errors → avoided; we fail OPEN on
#     unparseable input so a JSON hiccup never blocks legitimate work.
#
# SCOPE
#   This inspects the COMMAND TEXT (what `git commit`/`echo >`/`tee`/`cat <<` is
#   about to do). It is a guard against the agent typing or committing a secret,
#   not a full filesystem scanner — that belongs to CI secret-scanning. Kept fast
#   and dependency-light (jq preferred, sed fallback).
# =============================================================================

set -eu

# ---- 1. Read the tool-call JSON --------------------------------------------------------------
payload="$(cat)"

# ---- 2. Extract the command string -----------------------------------------------------------
if command -v jq >/dev/null 2>&1; then
  command_str="$(printf '%s' "$payload" | jq -r '.tool_input.command // .tool_input.cmd // ""' 2>/dev/null || printf '')"
else
  command_str="$(printf '%s' "$payload" \
    | sed -n 's/.*"command"[[:space:]]*:[[:space:]]*"\(.*\)".*/\1/p' \
    | head -n 1)"
fi

# Nothing to inspect → allow.
[ -z "$command_str" ] && exit 0

lc="$(printf '%s' "$command_str" | tr '[:upper:]' '[:lower:]')"

block() {
  printf 'BLOCKED by block-secrets.sh: %s\n' "$1" >&2
  printf '\nCommand under review:\n  %s\n' "$command_str" >&2
  printf '\nRepo policy: only `.env.example` PLACEHOLDERS are tracked. Real secrets live in\n' >&2
  printf 'git-ignored files (.env, amplify_outputs.json) and must never be committed or\n' >&2
  printf 'written into source. Remove the secret (use a placeholder) and try again.\n' >&2
  exit 2
}

# ---- 3. Block committing/staging real .env (but allow *.example) -----------------------------
# Match git add/commit that references a `.env` path which is NOT an *.example.
# We look for a bare `.env` token (optionally with a leading path) not followed
# by `.example`. This catches `.env`, `apps/api/.env`, `.env.local`, etc.
case "$lc" in
  *git\ add*|*git\ commit*|*git\ stage*)
    # Any `.env` reference that isn't `.env.example` / `.env.*.example`.
    if printf '%s' "$command_str" \
        | grep -Eq -e '(^|[[:space:]"'\''/])\.env([.][a-z0-9_-]+)?([[:space:]"'\''/]|$)' ; then
      # The `.env` reference is an *.example form only when EVERY occurrence ends
      # in `.example`; otherwise a real `.env` is in play → block. We rely on the
      # substring case below (no negative-lookahead, which POSIX grep lacks).
      case "$lc" in
        *.env.example*|*.env.*.example*) : ;;   # example-only reference → allow
        *) block "attempt to git add/commit a real .env file (only .env.example is tracked)" ;;
      esac
    fi
    ;;
esac

# Also block writing INTO a real .env via redirection/tee/heredoc that then gets
# committed — catch direct writes to `.env` (not `.env.example`).
case "$lc" in
  *">"*.env*|*tee*.env*|*"cat >"*.env*)
    case "$lc" in
      *.env.example*) : ;;
      *) block "attempt to write into a real .env file (use .env.example with placeholders)" ;;
    esac
    ;;
esac

# ---- 4. Key-shaped string detection ----------------------------------------------------------
# These patterns indicate a literal secret in the command text. We scan the RAW
# command (case-sensitive where the format is case-sensitive).

# NOTE: every pattern is passed via `grep -e --` so a pattern that begins with a
# dash (e.g. the PEM header) is never mistaken for a grep option.

# 4a. AWS access key id: AKIA / ASIA / AGPA / AIDA + 16 uppercase alnum.
if printf '%s' "$command_str" | grep -Eq -e '(AKIA|ASIA|AGPA|AIDA|AROA|ANPA)[0-9A-Z]{16}'; then
  block "command contains an AWS access key id (AKIA…/ASIA…). Never commit credentials."
fi

# 4b. PEM private key header (RSA/EC/OPENSSH/generic).
if printf '%s' "$command_str" | grep -Eq -e '-----BEGIN ([A-Z ]+ )?PRIVATE KEY-----'; then
  block "command contains a PEM private key block. Never commit private keys."
fi

# 4c. Common high-signal token prefixes (GitHub, Slack, Stripe secret).
if printf '%s' "$command_str" | grep -Eq -e '(ghp_|gho_|ghs_|github_pat_)[0-9A-Za-z_]{20,}'; then
  block "command contains a GitHub token."
fi
if printf '%s' "$command_str" | grep -Eq -e 'xox[abpsr]-[0-9A-Za-z-]{10,}'; then
  block "command contains a Slack token."
fi
if printf '%s' "$command_str" | grep -Eq -e 'sk_(live|test)_[0-9A-Za-z]{16,}'; then
  block "command contains a Stripe secret key."
fi

# 4d. AWS secret access key assignment: a base64-ish value bound to an obviously
#     secret variable name. Kept narrow to avoid false positives on ordinary
#     long strings.
if printf '%s' "$lc" | grep -Eq -e '(aws_secret_access_key|secret_access_key|aws_session_token)[[:space:]]*[=:][[:space:]]*["'\'']?[0-9a-z/+]{20,}'; then
  block "command assigns an AWS secret access key / session token inline."
fi

# ---- 5. Default: allow -----------------------------------------------------------------------
exit 0
