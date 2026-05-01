# SweepAI Internal Feature Map

Read when: changing SweepAI automation, debugging a generated PR, wiring
comment commands, or deciding where a new lane belongs.

This document explains how the current SweepAI features fit together. It is
an internal maintainer map, not a runbook with secrets. Keep token values,
private key material, and one-off execution windows out of this file.

## Design Shape

SweepAI is a conservative, targeted automation layer for OpenClaw issue and
PR maintenance. It does not scan the whole backlog by itself. It takes a known
cluster, hydrates current GitHub state, asks LLM for a structured decision,
then lets deterministic scripts perform the allowed writes.

The core invariants:

- One cluster maps to one job file.
- One implementation path maps to one branch: `sweepai/<cluster-id>`.
- One branch should produce or update one PR.
- LLM workers do not get GitHub write tokens.
- GitHub writes happen through deterministic scripts with live-state checks.
- Merge stays closed unless a maintainer explicitly opens the merge gate.
- Security-sensitive work is out of scope and must be routed elsewhere.

## Main Objects

### Job File

Path: `jobs/<repo-slug>/inbox/*.md`

A job file is the durable request. It contains frontmatter for the repo,
cluster id, refs, mode, allowed actions, gates, and the maintainer prompt. It
is committed before dispatch because Actions reads the job file from GitHub.

Common creation paths:

- `pnpm run repair:create-job -- --repo openclaw/openclaw --refs 123 --prompt-file /tmp/prompt.md`
- `pnpm run repair:create-job -- --from-report ../sweepai/records/.../items/123.md`
- gitcrawl import scripts for larger clustered backlog batches

`create-job` checks for an existing matching PR or branch before writing a new
job. That is the primary duplicate-PR guard.

### Cluster Plan

Path: `.sweepai-repair/runs/<run>/cluster-plan.json`

Created by `scripts/plan-cluster.ts`. It hydrates the listed GitHub refs,
linked refs, labels, bodies, comments, PR files, PR reviews, PR review
comments, checks, and current `main` state. The LLM worker receives this as
its live evidence bundle.

### Worker Result

Path: `.sweepai-repair/runs/<run>/result.json`

Created by `scripts/run-worker.ts` via `llm exec` using
`schema/repair/llm-result.schema.json`. The worker can recommend actions and fix
artifacts, but it must not mutate GitHub directly.

`scripts/review-results.ts` validates the result before any follow-up lane
trusts it.

### Fix Artifact

Path: `.sweepai-repair/runs/<run>/fix-artifact.json` and embedded result
fields.

A fix artifact tells the deterministic executor how to repair a contributor
branch or create/update a SweepAI replacement branch. It includes likely
files, validation commands, credit notes, changelog requirements, source PRs,
and the planned PR title/body.

### Published Ledger

Paths:

- `results/runs/*.json`
- `results/openclaw/*.md`
- `repair-apply-report.json`
- `docs/repair/README.md` dashboard sections

These are the sanitized durable record. Full prompts, transcripts, and raw run
artifacts stay in Actions artifacts or local `.sweepai-repair/runs`.

## Modes

### `plan`

Read-only recommendation mode. The worker classifies the cluster and returns
structured JSON. No GitHub writes should happen.

### `execute`

Structured-result application mode. It can apply reviewed safe comments,
closures, and explicit merge actions, but only through deterministic scripts
and only when gates permit.

### `autonomous`

Full targeted repair mode. SweepAI hydrates live state, asks LLM to produce
or refine a fix plan, then `execute-fix-artifact` can repair a branch or open a
replacement PR. Direct mutation still happens outside LLM.

## Cloud Worker Flow

Workflow: `.github/workflows/repair-cluster-worker.yml`

The cluster worker has two jobs:

1. `cluster`
   - checks out SweepAI
   - mints a read GitHub App token when configured
   - installs LLM
   - validates the job
   - hydrates the cluster
   - runs LLM in read-only mode
   - reviews the structured result
   - uploads transfer artifacts

2. `execute`
   - runs only for `execute` or `autonomous`
   - mints a write GitHub App token when configured
   - downloads worker artifacts
   - runs `execute-fix-artifact`
   - runs `apply-result`
   - runs `post-flight`
   - labels SweepAI targets
   - uploads final artifacts

The workflow concurrency group is based on job path and mode, so repeat
dispatches of the same job queue instead of racing each other.

## Creating Implementation PRs

Script: `scripts/execute-fix-artifact.ts`

This is the PR creation and branch repair engine.

It can:

- update a maintainer-editable contributor branch when that path is safe
- fall back to a replacement branch when the source branch is uneditable or
  unsafe
- create or update `sweepai/<cluster-id>`
- push checkpoint commits after LLM edits
- run changed-surface validation
- run LLM `/review`
- address LLM review findings
- open or update the target PR
- post an idempotent adopted-automerge outcome comment when no executable fix
  artifact is available
- preserve contributor credit in co-author trailers, PR body, and closeout comments

The executor prepares a temporary checkout of the target repo. LLM edits that
checkout without GitHub credentials. The deterministic executor commits,
pushes, opens PRs, and comments using the GitHub token.

When replacing a meaningful contributor PR, the executor fetches the source PR
author, skips bot authors, adds `Co-authored-by` trailers to replacement
checkpoint commits, records carried-forward credit in the replacement PR body,
and says in the source close comment that the contribution is carried forward
rather than rejected.

Generated SweepAI PRs are marked by:

- branch prefix: `sweepai/`
- committed repair job metadata for the branch cluster id

The `sweepai` label is a reporting hint from `scripts/tag-sweepai-targets.ts`,
not a PR identity boundary.

Current operational gotcha: OpenClaw's PR queue policy can close PRs when the
SweepAI app author has more than 10 active PRs. That is a target-repo policy
interaction, not evidence that the generated PR is invalid. Reduce or land the
active SweepAI queue before reopening those PRs.

Replacement PR creation also has a per-area backpressure guard. Before opening a
new `sweepai/*` replacement branch, `execute-fix-artifact` groups the proposed
`likely_files` into touched areas such as `extensions/discord`, `src/core`, or
`docs`, reads open SweepAI PRs in the target repo, and blocks if the same area
already has `CLAWSWEEPER_MAX_ACTIVE_PRS_PER_AREA` open SweepAI PRs. The default
limit is `50`; set it to `0` only for a deliberately uncapped execution window.
Common changelog and release-note files are ignored for this backpressure check
because they are shared support files rather than a meaningful repair area.

## SweepAI Commit Findings

Workflow: `.github/workflows/repair-commit-finding-intake.yml`
Script: `scripts/commit-finding-intake.ts`

SweepAI can dispatch `sweepai_commit_finding` when a main-branch commit
review report has `result: findings`. SweepAI treats that report as a source
finding, not as an order to open a PR.

The intake step fetches the report from latest `openclaw/sweepai@main`,
writes one audit file, and then decides whether an automatic repair PR is
allowed:

- audit path: `results/commit-findings/<repo-slug>/<sha>.md`
- job path: `jobs/<owner>/inbox/sweepai-commit-<repo-slug>-<shortsha>.md`
- branch: `sweepai/sweepai-commit-<repo-slug>-<shortsha>`

Non-finding, disabled, security/privacy/supply-chain, and broad findings stop
at the audit record. Eligible ordinary bug/regression/reliability findings get a
deterministic synthetic SweepAI result and fix artifact. That skips the normal
cluster-planning LLM pass and sends the report straight to
`execute-fix-artifact`, where LLM is used for the repair loop against latest
target `main`.

Commit-finding fix artifacts set `allow_no_pr: true`. If the repair loop
verifies the report but produces no target-repo diff, SweepAI records a clean
skipped no-PR outcome instead of failing the workflow.

The generated job uses `source: sweepai_commit` and may have no issue/PR
`candidates`. The fix artifact uses `repair_strategy: new_fix_pr`; merge and
close actions remain blocked.

## Applying Comments, Closures, And Merges

Script: `scripts/apply-result.ts`

This script owns safe GitHub mutations from reviewed worker results.

It re-fetches every live target before writing. It blocks when:

- the target changed since review
- the target is closed
- the target is maintainer-authored and not explicitly allowed
- the target is security-sensitive
- the job does not allow the action
- the action lacks required canonical/fix evidence
- merge preflight is incomplete

Close comments include idempotency markers so reruns do not post duplicates.

Merging is intentionally hard. Merge requires:

- job allows merge
- `allow_merge: true`
- `CLAWSWEEPER_ALLOW_MERGE=1`
- clean merge state
- clean relevant checks
- resolved human review threads
- resolved review-bot findings
- passed LLM `/review`
- validation evidence
- security clearance

With merge gated closed, SweepAI labels ready candidates for human review
instead of merging.

## Post-Flight Finalization

Script: `scripts/post-flight.ts`

Post-flight watches the PRs that `execute-fix-artifact` opened or repaired.
It waits for merge readiness, validates merge preflight, and either:

- merges when the merge gate is explicitly open, or
- labels the PR with human-review/merge-ready labels, or
- records the exact blocker.

After a canonical fix lands, post-flight can apply planned post-merge closeouts
for duplicate or superseded items covered by that fix.

## Open PR Finalizer

Workflow: `.github/workflows/finalize-open-prs.yml`
Script: `scripts/finalize-open-prs.ts`

The finalizer scans open SweepAI PRs in the target repo. It finds PRs by the
`sweepai/*` branch prefix. It classifies blockers:

- draft
- stale/conflicting branch
- dirty or unknown merge state
- failing or pending checks
- unresolved review threads
- review required or changes requested
- missing merge preflight
- missing result backfill
- security hold

When `--dispatch-repairs --execute` is enabled, it dispatches the existing
cluster job back through `repair-cluster-worker.yml` instead of creating another PR.
The idempotency key includes target repo, PR number, and head SHA, so the same
PR/head is not repeatedly repaired unless `--allow-repeat` is used.

This is the lane to extend for richer CI self-repair. The next improvement is
to fetch compact failed-check logs, classify transient infra failures, rerun
clearly transient jobs, and pass branch-caused failures into the repair prompt.

## Self-Heal Failed SweepAI Runs

Workflow: `.github/workflows/repair-self-heal.yml`
Script: `src/repair/self-heal-failed-runs.ts`

Self-heal retries failed SweepAI cluster-worker runs. It reads published
`results/runs/*.json`, selects the latest failed run per source job, skips jobs
already retried unless `--allow-repeat` is set, and dispatches fresh worker
runs.

Important distinction: this heals failed SweepAI worker runs. It does not
currently inspect target PR CI logs. Target PR repair belongs in the open PR
finalizer/comment command repair path.

## Maintainer Comment Routing

Workflow: `.github/workflows/repair-comment-router.yml`
Scripts:

- `src/repair/comment-router.ts`
- `src/repair/comment-router-core.ts`

Comment routing scans recent target-repo issue/PR comments and accepts only
maintainer-authored commands. Default allowed GitHub `author_association`
values:

- `OWNER`
- `MEMBER`
- `COLLABORATOR`

Contributor comments are ignored without a reply.

The generated-PR auto-update design is documented in
[`docs/repair/auto-update-prs.md`](auto-update-prs.md). That lane lets trusted
SweepAI comments dispatch a repair run for an existing SweepAI PR or a
PR explicitly opted into `sweepai:automerge` without allowing arbitrary
comment authors to trigger work.

Accepted command styles:

```text
/sweepai status
@sweepai status
@openclaw-sweepai status
@openclaw-sweepai[bot] status
```

Accepted mentions are `@sweepai`, `@sweepai[bot]`,
`@openclaw-sweepai`, and `@openclaw-sweepai[bot]`.

Supported commands:

```text
/review
/sweepai status
/sweepai re-review
/sweepai fix ci
/sweepai address review
/sweepai rebase
/sweepai autofix
/sweepai automerge
/sweepai approve
/sweepai explain
/sweepai stop
@sweepai re-review
@sweepai review
@openclaw-sweepai fix ci
@sweepai why did automerge stop here?
```

Behavior:

- `status` and `explain`: post a short status response.
- `review` and `re-review`: dispatch SweepAI review again for an open issue
  or PR.
- Freeform `@sweepai ...` maintainer mentions: dispatch a read-only assist
  review with the mention text as one-off instructions. The model can answer or
  recommend existing structured safe actions, but cannot directly merge, close,
  label, or push code.
- `fix ci`: dispatch the existing SweepAI PR's job for repair.
- `address review`: dispatch the existing SweepAI PR's job for repair.
- `rebase`: dispatch the existing SweepAI PR's job for repair.
- `autofix`: label any open PR with `sweepai:autofix`, create an adopted
  job if needed, and dispatch a SweepAI review for the current head without
  allowing merge.
- `automerge`: label any open PR with `sweepai:automerge`, create an
  adopted job if needed, and dispatch a SweepAI review for the current
  head.
- `approve`: maintainer-only exact-head approval after human review; clears
  pause labels and merges only through the normal automerge readiness checks and
  merge gates.
- `stop`: label the item for human review.

Repair commands apply to existing SweepAI PRs and PRs opted into
`sweepai:autofix` or `sweepai:automerge`. The router finds SweepAI PRs by the
`sweepai/*` branch, resolves or creates the backing job, posts one
idempotent response marker, and dispatches `repair-cluster-worker.yml`.

Trusted SweepAI comments become `sweepai_auto_repair`. Preferred
comments use hidden `sweepai-verdict:*` markers and include
`sweepai-action:fix-required` only when SweepAI should wake up. For PRs
already opted into `sweepai:autofix` or `sweepai:automerge`, trusted
`needs-human` and `human-review` verdicts pause the loop with
`sweepai:human-review`. Repair dispatch requires an accepted repair verdict
or action marker. The default caps are ten automatic repair iterations per PR
and one dispatch per PR head SHA. The per-PR cap is total across head SHA
changes, so repeated findings on the same commit do not stampede the branch and
a single PR cannot loop forever.

For PRs labeled `sweepai:autofix` or `sweepai:automerge`, trusted
SweepAI `pass`, `approved`, or `no-changes` verdict markers become
`sweepai_auto_merge`. Autofix and draft PRs never merge. Automerge merges
only when the marker SHA matches the current PR head, checks are green, GitHub
mergeability is clean, no human-review label is present, the PR is not draft,
and both `CLAWSWEEPER_ALLOW_MERGE=1` and `CLAWSWEEPER_ALLOW_AUTOMERGE=1` are set.
Otherwise it leaves the PR open and labels it `sweepai:human-review` and
`sweepai:merge-ready` when merge gates are closed.

The scheduled workflow is dry by default. Set
`CLAWSWEEPER_COMMENT_ROUTER_EXECUTE=1` to let scheduled runs post replies and
dispatch workers. Manual workflow dispatch can also pass `execute=true`.
Branch mutation still requires the downstream `CLAWSWEEPER_ALLOW_EXECUTE=1` and
`CLAWSWEEPER_ALLOW_FIX_PR=1` gates.

Ledgers:

- `results/comment-router.json`: processed command ledger
- `results/comment-router-latest.json`: latest scan report

Command replies are marker-backed and edited in place per item, intent, and
head SHA. Repeated maintainer nudges update the same small status comment
instead of leaving duplicate crustacean notes.

## Label Backfill

Script: `scripts/tag-sweepai-targets.ts`

This script labels SweepAI-created or SweepAI-tracked PRs/issues in the
target repo. It helps downstream tools and maintainers distinguish generated
work from ordinary contributor work.

The exact label is `sweepai`. The script intentionally refuses alternate
label names to keep the marker stable.

## Job Hygiene

Scripts:

- `scripts/sweep-openclaw-jobs.ts`
- `scripts/promote-stuck-jobs.ts`
- `scripts/requeue-job.ts`

These scripts manage the SweepAI backlog:

- move finalized jobs out of inbox
- park old or never-run jobs in outbox/stuck
- promote parked jobs back into inbox
- resolve a run id or job path and requeue it

They should not create new implementation PRs by themselves. They control job
inventory and dispatch pressure.

## Dashboard Publishing

Workflow: `.github/workflows/publish-results.yml`
Script: `scripts/publish-result.ts`

Publishing turns raw run artifacts into durable, sanitized summaries. It updates
the README dashboard, per-cluster markdown reports, and aggregate JSON ledgers.

The README dashboard is the public status surface, but it is derived from the
latest published artifacts. For live truth, check GitHub Actions and the target
PR directly.

## Gates And Variables

Important gates:

- `CLAWSWEEPER_ALLOW_EXECUTE`: allows deterministic write lanes. Workflows treat
  any value except literal `1` as closed.
- `CLAWSWEEPER_ALLOW_FIX_PR`: allows branch repair and replacement PR creation.
  Workflows treat any value except literal `1` as closed.
- `CLAWSWEEPER_ALLOW_MERGE`: allows SweepAI to merge. Keep this `0` unless a
  maintainer explicitly opens it.
- `CLAWSWEEPER_ALLOW_AUTOMERGE`: allows the comment router to merge a
  `sweepai:automerge` PR after SweepAI passes the exact current head.
  Keep this `0` unless a maintainer explicitly opens an automerge window.
- `CLAWSWEEPER_COMMENT_ROUTER_EXECUTE`: lets scheduled comment routing post
  replies and dispatch workers.

Important defaults:

- `CLAWSWEEPER_MODEL`: default worker model, usually `gpt-5.5`.
- `CLAWSWEEPER_CODEX_REASONING_EFFORT`: model reasoning effort; use `xhigh` for
  difficult repair work.
- `CLAWSWEEPER_MAX_LIVE_WORKERS`: dispatch capacity guard.
- `CLAWSWEEPER_MAX_ACTIVE_PRS_PER_AREA`: replacement PR area backpressure; default
  is `50` open SweepAI PRs per touched area, and `0` disables the cap.
- SweepAI commit-finding repair PRs get the `sweepai:commit-finding`
  label in addition to the standard `sweepai` tracking label.
- `CLAWSWEEPER_TARGET_VALIDATION_MODE`: changed-only validation by default.
- `CLAWSWEEPER_RESOLVE_REVIEW_THREADS`: lets fix execution resolve threads after
  it addresses them.

## Where To Add New Behavior

- New issue/PR-to-PR entrypoint: extend `create-job` or add an importer that
  writes the same job schema.
- Better CI self-repair: extend `finalize-open-prs` to collect failed check
  logs and classify rerun vs repair.
- New maintainer command: extend `comment-router-core.ts` parsing and
  `comment-router.ts` execution.
- New mutation type: add schema support, worker prompt policy, result review
  validation, and deterministic application in `apply-result`.
- New dashboard field: publish it from `publish-result`, not from ad hoc README
  edits.

## Safety Checklist For Changes

Before shipping automation changes:

```bash
pnpm run repair:validate
pnpm run check
actionlint .github/workflows/<changed-workflow>.yml
git diff --check
```

For live lanes, dry-run first when available:

```bash
pnpm run repair:comment-router -- --repo openclaw/openclaw --lookback-minutes 180
pnpm run repair:finalize-open-prs -- --write-report
pnpm run repair:tag-sweepai -- --live
```

Do not treat a dry report as permission to mutate. A maintainer still needs to
open the relevant execution gate or run the workflow with `execute=true`.
