# AGENTS.MD

SweepAI is a conservative AI maintenance bot for any repository.
Keep changes narrow, evidence-backed, and automation-safe.

## Structure

- Main code: `src/clawsweeper.ts`.
- Repair lane code: `src/repair/`; durable generated state lives in
  `yourname/sweepai-state`.
- Tests: `test/clawsweeper.test.ts`.
- Workflow: `.github/workflows/sweep.yml`.
- Explainer: `README.md`; state/dashboard repo: `../sweepai-state`.
- Open/reviewed records in state repo:
  `records/<repo-slug>/items/<number>.md`.
- Archived records in state repo:
  `records/<repo-slug>/closed/<number>.md`.
- Scratch/generated output: `.artifacts/`, `artifacts/`, `apply-report.json`.

Preserve one flat `items/` and `closed/` report layout per repository slug. Do
not split reports into issue/PR subtrees.

## Operating Model

- Review lane is proposal-only. It never closes GitHub items.
- Apply lane mutates GitHub by syncing the durable LLM review comment and then
  closing only unchanged, high-confidence proposals.
- Repository-specific rules live in `src/repository-profiles.ts`; you can
  configure close rules per repo.
- Worker concurrency is shard-level: each shard processes its selected items
  sequentially. Maximum parallel LLM sessions equals `shard_count`, not
  `batch_size * shard_count`.
- `yourname/sweepai-state` is the live status surface and generated state
  store. Check current Actions and that repo before trusting local generated
  timestamps.
- When asked about PRs outside this repo, treat the task as
  monitoring/debugging how SweepAI workflows operate on that PR. Do not fix
  foreign PR branches directly; SweepAI repair/automerge workflows own those
  branch edits.
- When referencing GitHub issues or PRs in user-facing output, always include
  the full GitHub URL, not only `#12345`.

## Safety Rules

- Do not run live apply/close commands unless explicitly asked.
- For apply-path repros, copy one report into a temp `items/` dir and pass
  `--skip-dashboard`, `--item-number`, and a temp `--closed-dir`.
- Treat maintainer-authored and protected-label items as non-closeable.
- Snapshot or `updated_at` drift blocks apply unless the only change is the
  existing SweepAI review comment.
- Open-but-locked issues can exist when stale automation locked a closed issue
  and the author later reopened it. These must be skipped, not allowed to crash
  the apply run.
- Locked-comment 403s from GitHub are terminal apply skips, not retryable API
  failures.

## Commands

```bash
corepack enable
pnpm install
pnpm run build
pnpm run test:unit
pnpm run format
pnpm run check
```

Use `pnpm run check` before handoff for code/test/workflow changes.

## GitHub Checks

Useful live probes:

```bash
gh run list --repo daniel-silva-perez/sweepai --limit 20 --json databaseId,displayTitle,status,conclusion,createdAt,updatedAt
gh api repos/daniel-silva-perez/sweepai/readme --jq '.content' | base64 --decode
gh api graphql -f query='query { repository(owner:"yourname", name:"yourrepo") { issues(states: OPEN) { totalCount } pullRequests(states: OPEN) { totalCount } } }'
```

For throughput/default tuning, inspect and update both `src/clawsweeper.ts` and
`.github/workflows/sweep.yml`; continuation paths can otherwise keep stale
defaults.
