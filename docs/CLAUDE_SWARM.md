# Soteria Forge — Claude Code Multi-Agent (Swarm) Guide

Companion to `SOTERIA_FORGE_REBUILD_PLAN.md`. This document is how you run the rebuild with a coordinated team of Claude Code agents instead of one session doing everything sequentially.

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
| `aws-infra` | Amplify Gen 2 / CDK, Cognito, DynamoDB tables, S3, IAM, AppSync provisioning | bash, file edit, AWS CLI (read-heavy) | Never touches production; never runs destructive AWS commands without explicit confirmation |
| `api-data` | GraphQL schema, resolvers, Lambda business logic, the tenant authorizer | file edit, bash, tests | Enforces the tenant-match invariant in every resolver |
| `mobile` | Expo/RN app: navigation, screens, auth flow, UI | file edit, bash (Expo/EAS) | Aligns with Ink/Bone/Cobalt design system |
| `video` | Cloudflare Stream integration, react-native-video, offline download | file edit, bash | Signed URLs scoped by tenant; encrypted local storage |
| `offline-sync` | WatermelonDB store, NetInfo layer, event-sourced statement queue | file edit, bash, tests | The append-only / idempotent contract is its whole job |
| `console-web` | Vue admin repoint, content-ops screens | file edit, bash | Reuses `packages/shared` types |
| `security-reviewer` | Tenant isolation, least-privilege IAM, secrets, adversarial review | read-only + tests | Runs *against* other agents' work; can block a phase |
| `test-runner` | Test generation + execution across packages | bash, test tools | Gate for "done" |
| `docs` | Keeps the rebuild plan and `docs/adr/` current | file edit | Writes the ADR at the end of each phase |

---

## 3. Defining agents (format)

Custom agents live in `.claude/agents/` as Markdown files with frontmatter. The frontmatter sets identity, tool allowlist, and model; the body is appended to the agent's system prompt as extra instructions. **Omitting `tools` grants all tools — not none** — so scope deliberately.

Example — `security-reviewer` (the most important agent to get right):

```markdown
---
name: security-reviewer
description: Adversarially reviews changes for tenant isolation, least-privilege IAM, and secret leakage. Use after any api-data, aws-infra, or offline-sync change, and before marking any phase done.
tools: Read, Grep, Glob, Bash
model: claude-opus-4-8
---

You are a security reviewer for a multi-tenant training platform handling
data for 64,000 workers under a federal + local contract. Your job is to
find problems, not to be agreeable.

On every review, check:
1. TENANT ISOLATION (non-negotiable): every DynamoDB access is scoped by
   TENANT#<tenantId>; every AppSync resolver / Lambda authorizer compares the
   caller's custom:tenantId claim against the tenant partition and refuses
   cross-tenant reads and writes. Flag ANY path that could read or write
   another tenant's data.
2. SECRETS: no AWS keys, tokens, connection strings, or .env contents in
   source, logs, or commits.
3. LEAST PRIVILEGE: IAM roles and tool allowlists grant only what the
   component needs.
4. Report findings ranked by severity. Do not approve if tenant isolation
   is unproven.
```

Example — `offline-sync`:

```markdown
---
name: offline-sync
description: Owns the offline data layer — WatermelonDB local store, NetInfo connectivity, and the event-sourced completion-statement sync queue against AppSync.
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

- **Fan-out (parallel, independent):** mobile screens, individual AppSync resolvers, or research across AWS docs. "Use three subagents to scaffold the course-list, course-detail, and player screens independently."
- **Sequential chain (dependent):** schema → resolvers → mobile data layer. Each agent consumes the previous one's output. This lives in the main conversation because subagents can't spawn subagents — the orchestrator is the conductor.
- **Adversarial review (quality):** a build agent (`api-data`) produces work, then `security-reviewer` audits it in a fresh context before it's accepted. This pairing is where tenant-isolation bugs get caught.
- **Git worktrees (parallel phases):** when two phases are independent enough to run at once (e.g., `video` in one worktree, `console-web` in another), use worktrees so two branches aren't fighting over one checkout.

---

## 5. Guardrails (encode these as hooks)

Hooks run around tool calls and at session/subagent boundaries — treat them like CI wired into the edit loop. The non-negotiables for this project:

- **Never commit secrets.** Block commits touching `.env`, AWS credentials, or key-shaped strings.
- **Never target production AWS.** No destructive AWS CLI (`delete-*`, `remove-*`, teardown) without explicit human confirmation. Agents operate against dev/sandbox only.
- **Tenant isolation is a release gate.** No phase is "done" until `security-reviewer` confirms the isolation invariant holds for the new surface.
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
> "We're in Phase 2. Using the `api-data` agent, spawn three subagents in parallel — one each for the Course, Enrollment, and CompletionStatement AppSync resolvers. Each must enforce the tenant-match invariant (compare `custom:tenantId` claim to the tenant partition) and return only a summary of files changed and the auth check applied. Then have `security-reviewer` audit all three before we accept them."

**Phase 5, focused single-stream:**
> "Phase 5, offline. Do NOT fan out — this is sequential and dependency-heavy. Using the `offline-sync` agent: (1) set up the WatermelonDB schema for downloaded courses and the statement queue, (2) wire NetInfo, (3) implement idempotent sync of append-only completion statements to the AppSync mutation. After each step, run the test suite via the Stop hook before continuing."

**Cross-layer (agent team, experimental):**
> "Enable the team for this one. Team lead coordinates; spin up `mobile`, `api-data`, and `test-runner` as teammates to land the 'download a course for offline' feature across the app, the resolver, and its tests. Teammates coordinate directly; report blockers to me. Keep it scoped to this one feature."

---

## 9. Honest caveats

- Agent Teams and Workflows are **experimental / research-preview** as of mid-2026 — expect rough edges in resumption and shutdown, and re-check the docs, since this area is changing fast.
- More agents ≠ smarter output. The win is **different resource allocation** (clean contexts, parallel wall-clock time), not raw intelligence.
- The most valuable agent here is `security-reviewer`. In a multi-tenant federal-context system, an adversarial reviewer catching one cross-tenant leak is worth more than any amount of parallel build speed.
- You are one person. The swarm multiplies your throughput, but the plan is designed to move forward even if you only ever run a single session at a time. Start simple; add agents as a phase's parallelism justifies them.

---

*Docs to keep open while orchestrating: Claude Code overview (https://docs.claude.com/en/docs/claude-code/overview) and the agent-teams guide (https://code.claude.com/docs/en/agent-teams).*
