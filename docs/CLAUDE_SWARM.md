# Soteria Forge — Claude Code Multi-Agent (Swarm) Guide

Companion to `SOTERIA_FORGE_REBUILD_PLAN.md`. This document is how you run the rebuild with a coordinated team of Claude Code agents instead of one session doing everything sequentially.

> **Backend now runs on Supabase (ADR-0007).** The backend pivoted AWS/Amplify → **Supabase** (Postgres + RLS + Auth + Storage + Edge Functions); tenant isolation is enforced by **Postgres RLS** (`public.current_tenant_id()` + a `BEFORE INSERT` stamp trigger), not AppSync group rules or a Lambda authorizer, and the old `backend/` is deleted. The roster, example agent definitions, and guardrails below are reconciled to that reality; a few **phase-plan references in §7–§8 are historical** (the original AWS-era plan) and are kept for provenance. The operative agent definitions always live in `.claude/agents/*.md`.

> Honest framing up front: multi-agent orchestration is powerful but it is **not free** — it burns significantly more tokens than a single session and adds coordination overhead. Use it where work genuinely parallelizes (independent modules, research, review). For sequential or same-file work, one focused session is better. You do not need the full swarm to make progress; you need it when a phase has independent workstreams.

---

## 1. The mental model

Claude Code gives you four tiers of orchestration. Match the tier to the job:

| Tier | What it is | Use when | Cost |
|---|---|---|---|
| **Single session** | One Claude Code instance | A single feature, sequential work, same-file edits | Baseline |
| **Subagents** | Helper agents spawned *within* one session; isolated context; report back to the main agent; **cannot spawn their own subagents** | Research, cross-file search, verification, focused bounded tasks that don't need to talk to each other | Moderate |
| **Agent Teams** *(experimental)* | Multiple Claude Code instances; one **team lead** coordinates; teammates each have their own context and can message each other directly | Independent modules built in parallel, competing-hypothesis debugging, cross-layer changes (mobile + backend + tests at once) | High |
| **Git worktrees / Workflows** | Manual parallel sessions (worktrees) or a deterministic JS orchestration script (Workflows, research preview) | Running whole phases in parallel yourself; scripted fan-out → reduce → synthesize | Varies |

The throughline for all of them: **fresh isolated context in, final summary out.** A worker does a large amount of work and returns only the conclusion, keeping the orchestrator's context clean.

Two things the docs are explicit about, worth internalizing:
- Claude is **conservative about parallelism by default.** If you want real fan-out, ask for it and **be specific about the number** — "use three subagents, one per module" beats "parallelize this."
- Every subagent's summary lands back in the orchestrator's context. A fan-out of many detailed reports can itself fill the window you were trying to protect. Instruct each worker to **return a summary, not everything.**

Enabling Agent Teams (experimental, off by default):
```
# settings.json or environment
CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1
```
Note the known limits: session resumption, task coordination, and shutdown behavior are rough edges. Treat teams as a sharp tool, not a default.

References: Claude Code subagents and agent-teams docs — https://code.claude.com/docs/en/agent-teams and https://docs.claude.com/en/docs/claude-code/overview

---

## 2. The Soteria Forge agent roster

Define these once as reusable agents (see §3). A role defined as a subagent can also be spawned as an agent-team teammate, so you write each one only once.

| Agent | Owns | Primary tools | Notes |
|---|---|---|---|
| `orchestrator` | Planning, task assignment, integration | (you drive this / team lead) | Holds the big picture; the only agent that sees the whole board |
| `aws-infra` | Supabase backend as code under `supabase/**` — Postgres schema, RLS policies, storage rules, grant hardening, seed (historically "aws-infra") | bash, file edit, Supabase MCP (read-heavy) | Never mutates the live project as repo work; never runs destructive DB commands without explicit confirmation |
| `api-data` | Domain contract in `packages/shared/**` — types, xAPI, tenant guard, generated Supabase DB types | file edit, bash, tests | Enforces the append-only/idempotent + tenant-scoping invariants in the contract |
| `mobile` | Expo/RN app: navigation, screens, auth flow, UI (supabase-js data client) | file edit, bash (Expo/EAS) | Aligns with Ink/Bone/Cobalt design system |
| `video` | Cloudflare Stream integration, `stream-signed-url` edge function, react-native-video, offline download | file edit, bash | Signed URLs scoped by tenant; `video_assets` metadata only |
| `offline-sync` | WatermelonDB store, NetInfo layer, idempotent statement sync queue | file edit, bash, tests | The append-only / idempotent contract is its whole job |
| `console-web` | Vue admin (repointed at Supabase), content-ops screens | file edit, bash | Reuses `packages/shared` types |
| `sfg-developer` | Cross-domain feature slices fusing engineering + EHS compliance + adult-learning (andragogy) design; senior iOS/Android + JS/TS full-stack (React, RN, Vue), Postgres SQL, SaaS, Supabase/GCP, Python-tooling generalist; methodical debugger + continuous refactorer | file edit, bash | No exclusive subtree — works as a guest under each owner's conventions; spawn with `model: fable` (Fable 5, max deliberation) for frontier slices per its escalation rubric, inherited model otherwise |
| `security-reviewer` | Tenant isolation (RLS), least-privilege keys, secrets, adversarial review | read-only + tests | Runs *against* other agents' work; can block a phase |
| `test-runner` | Test generation + execution across packages | bash, test tools | Gate for "done" |
| `docs` | Keeps the rebuild plan and `docs/adr/` current | file edit | Writes the ADR at the end of each phase |

---

## 3. Defining agents (format)

Custom agents live in `.claude/agents/` as Markdown files with frontmatter. The frontmatter sets identity, tool allowlist, and model; the body is appended to the agent's system prompt as extra instructions. **Omitting `tools` grants all tools — not none** — so scope deliberately.

Example — `security-reviewer` (the most important agent to get right):

```markdown
---
name: security-reviewer
description: Adversarially reviews changes for tenant isolation (RLS), least-privilege keys, and secret leakage. Use after any api-data, aws-infra, or offline-sync change, and before marking any phase done.
tools: Read, Grep, Glob, Bash
model: claude-opus-4-8
---

You are a security reviewer for a multi-tenant training platform handling
data for 64,000 workers under a federal + local contract. Your job is to
find problems, not to be agreeable.

On every review, check:
1. TENANT ISOLATION (non-negotiable): every table is scoped by Postgres RLS
   to public.current_tenant_id() (read from the verified session JWT), and a
   BEFORE INSERT trigger stamps tenant_id from auth.uid(). No client sends a
   tenant_id for authorization. Flag ANY path that could read or write
   another tenant's data, or any table shipped with RLS off.
2. SECRETS: no service-role key, project keys, tokens, connection strings,
   Cloudflare Stream token, or .env contents in source, logs, or commits.
3. LEAST PRIVILEGE: clients use only the RLS-protected publishable/anon key;
   edge functions read through the caller's JWT, never the service role;
   tool allowlists grant only what the component needs.
4. Report findings ranked by severity. Do not approve if tenant isolation
   is unproven.
```

Example — `offline-sync`:

```markdown
---
name: offline-sync
description: Owns the offline data layer — WatermelonDB local store, NetInfo connectivity, and the idempotent completion-statement sync queue against Supabase.
tools: Read, Edit, Write, Bash, Grep, Glob
---

You own offline-first data for a React Native training app used in hangars
with no signal. Invariants you must preserve:
- Completion statements are xAPI-style (actor, verb, object, result,
  timestamp) with a CLIENT-GENERATED UUID.
- The queue is APPEND-ONLY and sync is IDEMPOTENT by UUID — there is no
  conflict resolution, and there must never need to be.
- A worker must be able to complete an entire course offline and have it
  reconcile cleanly on reconnect.
- Never block the UI on network; local store is the source of truth until sync.
```

Per-package `CLAUDE.md` files carry local conventions (the Expo app's, the backend's, the Vue app's) so any agent working in that directory picks up the right rules.

---

## 4. Coordination patterns for this rebuild

- **Fan-out (parallel, independent):** mobile screens, individual RLS policies / migrations, or research across Supabase docs. "Use three subagents to scaffold the course-list, course-detail, and player screens independently."
- **Sequential chain (dependent):** schema + RLS → shared types → mobile/console data layer. Each agent consumes the previous one's output. This lives in the main conversation because subagents can't spawn subagents — the orchestrator is the conductor.
- **Adversarial review (quality):** a build agent (`api-data`) produces work, then `security-reviewer` audits it in a fresh context before it's accepted. This pairing is where tenant-isolation bugs get caught.
- **Git worktrees (parallel phases):** when two phases are independent enough to run at once (e.g., `video` in one worktree, `console-web` in another), use worktrees so two branches aren't fighting over one checkout.

---

## 5. Guardrails (encode these as hooks)

Hooks run around tool calls and at session/subagent boundaries — treat them like CI wired into the edit loop. The non-negotiables for this project:

- **Never commit secrets.** Block commits touching secret env files, the Supabase **service-role key**, AWS credentials, or key-shaped strings (`.claude/hooks/block-secrets.sh`).
- **Never mutate the live backend without confirmation.** No destructive command against the live Supabase project (`db reset`, `DROP`/`TRUNCATE`/`DELETE` on live, `pause_project`/`delete_branch`), and no destructive AWS CLI (`delete-*`, `remove-*`, teardown), without explicit human confirmation. The `.claude/hooks/block-destructive-aws.sh` hook guards the AWS surface; migrations are add-a-new-numbered-one, never edit-an-applied-one.
- **Tenant isolation is a release gate.** No phase is "done" until `security-reviewer` confirms the RLS isolation invariant holds for the new surface.
- **Tests before stop; lint before commit.** A `SubagentStop` / `Stop` hook runs the test suite; a pre-commit hook runs lint.
- **Issue/phase ID in branch names.** Keeps parallel worktrees and teammates traceable.
- **No malicious or exfiltrating code, ever** — including anything that would ship data off-tenant or weaken auth.

Example hook wiring (conceptual, in `.claude/settings.json`):
```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Bash", "command": ".claude/hooks/block-destructive-aws.sh" }
    ],
    "Stop": [
      { "command": "turbo run test --filter=...[HEAD]" }
    ]
  }
}
```

---

## 6. Token & cost discipline

- Reach for Agent Teams only when teammates can work **truly independently** — otherwise the coordination tokens outweigh the parallelism gain.
- Keep each worker's mandate "return a summary." Detailed dumps back into the orchestrator defeat the purpose.
- For the same starting context handed to a side worker, a **fork** is cheaper than a full teammate.
- A few delegated tasks in one session → subagents. Sustained, large-scale, cross-session parallelism → teams / worktrees. Don't over-orchestrate a task a single agent handles fine.

---

## 7. Phase → agent mapping

| Phase | Lead agent(s) | Support | Parallelizable? |
|---|---|---|---|
| 0 Foundations | `orchestrator`, `aws-infra` | `docs` | Partly (repo restructure ∥ AWS account setup) |
| 1 Identity & tenancy | `aws-infra`, `api-data` | `security-reviewer` | No — foundational, sequential |
| 2 Core data & API | `api-data` | `security-reviewer`, `test-runner` | Resolvers fan out per model |
| 3 Mobile shell | `mobile` | `test-runner` | Screens fan out |
| 4 Video | `video` | `api-data` (metadata) | Runs ∥ with late Phase 3 work |
| 5 Offline | `offline-sync` | `mobile`, `test-runner` | No — hardest phase, keep focused |
| 6 Console repoint | `console-web` | `api-data` | Runs ∥ with Phase 5 (separate worktree) |
| 7 Scale & hardening | `aws-infra`, `security-reviewer` | `test-runner` | Observability ∥ security pass |
| 8 GovCloud readiness | `orchestrator`, `aws-infra` | `docs` | Deferred / contract-triggered |

---

## 8. Concrete kickoff prompts

**Phase 2, fan-out (subagents):**
> "We're in Phase 2. Using the `aws-infra` agent, spawn three subagents in parallel — one each for the `courses`, `enrollments`, and `completion_statements` tables and their RLS policies. Each must enforce the tenant-isolation invariant (RLS scoped to `current_tenant_id()`, inserts stamped by the trigger, no client-sent tenant_id) and return only a summary of files changed and the policy applied. Then have `security-reviewer` audit all three before we accept them."

**Phase 5, focused single-stream:**
> "Phase 5, offline. Do NOT fan out — this is sequential and dependency-heavy. Using the `offline-sync` agent: (1) set up the WatermelonDB schema for downloaded courses and the statement queue, (2) wire NetInfo, (3) implement idempotent sync of append-only completion statements via the Supabase upsert (`onConflict: 'id', ignoreDuplicates: true`). After each step, run the test suite via the Stop hook before continuing."

**Cross-layer (agent team, experimental):**
> "Enable the team for this one. Team lead coordinates; spin up `mobile`, `aws-infra`, and `test-runner` as teammates to land the 'download a course for offline' feature across the app, the Supabase schema/RLS, and its tests. Teammates coordinate directly; report blockers to me. Keep it scoped to this one feature."

---

## 9. Honest caveats

- Agent Teams and Workflows are **experimental / research-preview** as of mid-2026 — expect rough edges in resumption and shutdown, and re-check the docs, since this area is changing fast.
- More agents ≠ smarter output. The win is **different resource allocation** (clean contexts, parallel wall-clock time), not raw intelligence.
- The most valuable agent here is `security-reviewer`. In a multi-tenant federal-context system, an adversarial reviewer catching one cross-tenant leak is worth more than any amount of parallel build speed.
- You are one person. The swarm multiplies your throughput, but the plan is designed to move forward even if you only ever run a single session at a time. Start simple; add agents as a phase's parallelism justifies them.

---

*Docs to keep open while orchestrating: Claude Code overview (https://docs.claude.com/en/docs/claude-code/overview) and the agent-teams guide (https://code.claude.com/docs/en/agent-teams).*
