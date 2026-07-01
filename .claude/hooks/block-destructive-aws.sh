#!/bin/sh
# =============================================================================
# block-destructive-aws.sh  —  PreToolUse guard for the `Bash` tool.
#
# PURPOSE
#   Refuse destructive / irreversible AWS CLI (and Amplify/CDK) commands unless
#   the operator has explicitly acknowledged them. This is the automated backstop
#   for the aws-infra roster rule: "never run a destructive AWS command without
#   confirmation." Everything in this repo is defined-as-code and UNDEPLOYED, so
#   a delete/teardown against a real account is almost always a mistake.
#
# CONTRACT (Claude Code hooks)
#   - Claude Code invokes this with the tool call serialized as JSON on STDIN:
#       { "tool_name": "Bash", "tool_input": { "command": "aws s3 rb ..." }, ... }
#   - Exit 0            => allow the command to run.
#   - Exit 2           => BLOCK the command; STDERR is shown to the model as the
#                          reason (this is the documented "deny" exit code).
#   - Any other nonzero => surfaced as a non-blocking hook error; we avoid it so
#                          a parse hiccup never silently blocks legitimate work.
#
# DESIGN NOTES
#   - We fail OPEN on unparseable input (exit 0). A PreToolUse guard that fails
#     closed on every JSON quirk would make the agent unusable; the security
#     boundary that actually matters (tenant isolation, IAM) lives server-side.
#     What this hook buys us is protection against fat-fingered destruction.
#   - We match on the raw command text conservatively: known destructive verbs,
#     teardown subcommands, and any command that names a production target.
#   - `jq` is used when available (robust); a POSIX sed fallback keeps the hook
#     working on minimal images without jq.
# =============================================================================

set -eu

# ---- 1. Read the tool-call JSON from stdin -------------------------------------------------
payload="$(cat)"

# ---- 2. Extract the command string being run ----------------------------------------------
# Prefer jq for correct JSON decoding (handles escapes/newlines). Fall back to a
# best-effort sed extraction of .tool_input.command when jq is absent.
if command -v jq >/dev/null 2>&1; then
  command_str="$(printf '%s' "$payload" | jq -r '.tool_input.command // .tool_input.cmd // ""' 2>/dev/null || printf '')"
else
  # Best-effort: pull the first "command": "..." value. Not perfect for exotic
  # escaping, but the verb/keyword matching below is intentionally forgiving.
  command_str="$(printf '%s' "$payload" \
    | sed -n 's/.*"command"[[:space:]]*:[[:space:]]*"\(.*\)".*/\1/p' \
    | head -n 1)"
fi

# Nothing to inspect → allow (fail open).
if [ -z "$command_str" ]; then
  exit 0
fi

# Normalize to lower case once for case-insensitive keyword checks.
lc="$(printf '%s' "$command_str" | tr '[:upper:]' '[:lower:]')"

# Helper: emit the block reason on stderr and exit with the deny code (2).
block() {
  # shellcheck disable=SC2059
  printf 'BLOCKED by block-destructive-aws.sh: %s\n' "$1" >&2
  printf '\nCommand under review:\n  %s\n' "$command_str" >&2
  printf '\nThis repo is defined-as-code and UNDEPLOYED. Destructive cloud commands are\n' >&2
  printf 'refused by default. If this is genuinely intended, re-run it yourself outside\n' >&2
  printf 'the agent (or set SOTERIA_ALLOW_DESTRUCTIVE_AWS=1 in the environment to override).\n' >&2
  exit 2
}

# ---- 3. Explicit human override --------------------------------------------------------------
# An operator can opt in per-session. We check the ENV of the hook process; the
# agent cannot set this for itself mid-turn, so it remains a human decision.
if [ "${SOTERIA_ALLOW_DESTRUCTIVE_AWS:-0}" = "1" ]; then
  exit 0
fi

# ---- 4. Only scrutinize AWS-shaped commands -------------------------------------------------
# We gate on invocations of the aws CLI, the Amplify Gen 2 CLI (ampx), CDK, and
# eas — the tools that can destroy cloud state from this repo. Non-cloud shell
# commands pass straight through.
case "$lc" in
  *aws\ *|*ampx\ *|*cdk\ *|*eas\ *|*amplify\ *) : ;;   # inspect further below
  *)
    exit 0 ;;                                            # not a cloud command → allow
esac

# ---- 5. Destructive verb / subcommand patterns ----------------------------------------------
# Blocked when they appear in a cloud command. Grouped by intent for readability.
#
#   * generic destructive verbs      : delete-*, remove-*, destroy, teardown
#   * s3 object/bucket destruction   : s3 rb, s3 rm, s3api delete-*
#   * dynamodb / data destruction    : delete-table, delete-item, delete-backup
#   * cognito pool/user destruction  : delete-user-pool, delete-user, admin-delete-user
#   * cloudformation / cdk teardown  : delete-stack, cdk destroy
#   * amplify sandbox teardown       : ampx sandbox delete, sandbox --delete
#   * eas / expo project deletion    : eas ... :delete
#
# The patterns are deliberately broad: any aws subcommand beginning "delete-" or
# "remove-", plus the explicit high-blast-radius ones.
for pat in \
  ' delete-' ' remove-' ' destroy' ' teardown' ' delete ' \
  's3 rb' 's3 rm' 's3api delete' \
  'delete-table' 'delete-item' 'delete-backup' 'delete-stack' \
  'delete-user-pool' 'delete-user' 'admin-delete-user' 'delete-group' \
  'delete-function' 'delete-bucket' 'delete-object' 'empty-bucket' \
  'cdk destroy' 'sandbox delete' 'sandbox --delete' 'ampx sandbox delete' \
  ':delete' 'batch-write-item' ; do
  case "$lc" in
    *"$pat"*)
      block "matched destructive pattern '$(printf '%s' "$pat" | sed 's/^ *//')'" ;;
  esac
done

# ---- 6. Production-targeting guard ----------------------------------------------------------
# Even a "read-ish" command is refused if it points at an obvious production
# target. We look for prod markers in profile/stack/branch/env flags and in the
# raw text. This blocks e.g. `aws ... --profile prod`, `ampx --branch production`.
for prodpat in \
  '--profile prod' '--profile production' \
  '--branch prod' '--branch production' \
  '--stack prod' 'stack-name prod' \
  'aws_profile=prod' 'app_env=production' 'node_env=production' \
  '-prod' 'prod-' 'production'; do
  case "$lc" in
    *"$prodpat"*)
      block "command targets a PRODUCTION resource (matched '$prodpat')" ;;
  esac
done

# ---- 7. Default: allow -----------------------------------------------------------------------
exit 0
