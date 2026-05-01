# 🧹 SweepAI

> **Conservative AI maintenance for any repository.**
> Forked from [openclaw/clawsweeper](https://github.com/openclaw/clawsweeper) — rebuilt to be model-agnostic, self-hosted, and yours.

SweepAI scans your open issues and pull requests, reviews them with the LLM of your choice, and only takes action when the evidence is strong. No spam. No reckless closes. Just a clean backlog and your time back.

---

## Why SweepAI Exists

Maintaining open-source projects (or even private repos with a team) means drowning in notifications. Stale issues. Duplicate reports. Drive-by PRs that need work. You know the ones — they sit open for months because you don't have time to triage them.

SweepAI automates the triage. It reviews every item, writes a markdown report, posts a durable comment, and — only when confidence is high — closes or merges. You stay in control. It just does the boring work.

---

## What It Does

### Issue/PR Sweeper
- Scans open issues and PRs on a schedule
- Reviews each item with your chosen LLM
- Writes a report: decision, evidence, confidence, proposed action
- Syncs one durable comment per item (edits in place, no spam)
- Closes only when evidence is strong: duplicate, stale, already fixed, out of scope

### Commit Sweeper
- Reviews code-bearing commits on `main`
- Writes a per-commit report
- Optional GitHub Check Run for CI integration

---

## Model-Agnostic by Design

SweepAI doesn't lock you into one AI vendor. Use whatever CLI tool you have installed.

| Provider | CLI | Status | Best For |
|----------|-----|--------|----------|
| **Codex** (OpenAI) | `codex exec` | ✅ Production | Full feature parity, schema enforcement, sandboxing |
| **Claude Code** (Anthropic) | `claude -p` | ⚠️ Beta | Deep reasoning, long context |
| **Gemini** (Google) | `gemini run` | ⚠️ Experimental | Cheap, fast summaries |
| **OpenCode** | `opencode run` | ⚠️ Beta | Model-agnostic, provider-hopping |
| **Kimi** (Moonshot AI) | `kimi run` | ⚠️ Beta | Chinese-optimized, long context |

### Quick Start

```bash
# Default: OpenAI Codex
pnpm run review

# Claude Code
LLM_PROVIDER=claude LLM_MODEL=claude-sonnet-4 pnpm run review

# Gemini
LLM_PROVIDER=gemini LLM_MODEL=gemini-2.5-pro pnpm run review

# OpenCode
LLM_PROVIDER=opencode LLM_MODEL=gpt-4o pnpm run review

# Kimi
LLM_PROVIDER=kimi LLM_MODEL=kimi-k2 pnpm run review
```

### Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `LLM_PROVIDER` | `codex` | Provider slug |
| `LLM_MODEL` | `gpt-5.5` | Model identifier |
| `LLM_REASONING_EFFORT` | `high` | `low` / `medium` / `high` |
| `LLM_SERVICE_TIER` | `fast` | `fast` / `default` |
| `LLM_SANDBOX` | `read-only` | `read-only` / `danger-full-access` (Codex only) |

Legacy `CODEX_*` env vars still work as fallbacks.

### Installing Provider CLIs

**Claude Code:**
```bash
npm install -g @anthropic-ai/claude-code
claude config set login_method api
export ANTHROPIC_API_KEY=sk-ant-...
```

**Gemini:**
```bash
npm install -g @google/gemini-cli
export GEMINI_API_KEY=...
```

**OpenCode:**
```bash
npm install -g opencode
export OPENCODE_API_KEY=...
```

**Kimi:**
```bash
npm install -g kimi-cli
export MOONSHOT_API_KEY=...
```

---

## Setup

### 1. Clone and Install

```bash
git clone https://github.com/daniel-silva-perez/sweepai.git
cd sweepai
pnpm install
pnpm run build
```

### 2. Configure Your Repository

Edit `src/repository-profiles.ts` to add your repo:

```typescript
export const REPOSITORY_PROFILES: readonly RepositoryProfile[] = [
  {
    targetRepo: "yourname/yourrepo",
    slug: "yourname-yourrepo",
    displayName: "YourRepo",
    checkoutDir: "yourrepo",
    promptNote: "Use the YourRepo source tree and current main branch.",
    applyCloseRules: {
      issue: ["implemented_on_main", "cannot_reproduce", "duplicate_or_superseded", "not_actionable_in_repo", "incoherent", "stale_insufficient_info"],
      pull_request: ["implemented_on_main", "cannot_reproduce", "duplicate_or_superseded", "not_actionable_in_repo", "incoherent"],
    },
  },
];
```

### 3. Set Environment Variables

```bash
export GH_TOKEN=ghp_...              # GitHub personal access token
export LLM_PROVIDER=codex            # or claude, gemini, opencode, kimi
export LLM_MODEL=gpt-5.5            # provider-specific model
export OPENAI_API_KEY=sk-...         # if using Codex
```

### 4. Run a Test Review

```bash
# Review one specific issue/PR
pnpm run review -- --target_repo yourname/yourrepo --item_number 42

# Plan a batch review (dry run)
pnpm run plan -- --target_repo yourname/yourrepo
```

### 5. Enable Scheduled Runs (Optional)

Copy `.github/workflows/sweep.yml` into your repo, set secrets in GitHub Settings → Secrets and Variables → Actions:

- `GH_TOKEN`
- `OPENAI_API_KEY` (or provider-specific key)
- `LLM_PROVIDER`
- `LLM_MODEL`

---

## How It Works

### Review Lane (Safe)
- Scans open issues/PRs
- Hydrates context: body, comments, diff, CI status
- Sends to LLM with structured prompt
- Writes report to `records/<repo>/items/<number>.md`
- Syncs durable comment (creates or edits in place)
- **Never closes anything**

### Apply Lane (Guarded)
- Reads existing reports
- Re-fetches live GitHub state
- Checks: labels, maintainer authorship, paired PR/issue state, snapshot drift
- Closes only unchanged, high-confidence proposals
- Moves closed reports to `records/<repo>/closed/<number>.md`

### Commit Sweeper
- Triggered by push events on `main`
- Classifies commits: code-bearing vs docs-only
- Reviews code commits with LLM
- Writes `records/<repo>/commits/<sha>.md`
- Optional GitHub Check Run

---

## Safety Guardrails

- **Maintainer-authored items are never auto-closed**
- **Security-sensitive reports are quarantined** — routed to human triage
- **Snapshot drift blocks apply** — if the item changed since review, it stays open
- **Proposal-first** — review runs don't mutate anything; apply is separate
- **Idempotency** — every action has a stable key, recorded in the report

---

## Commands

| Command | Purpose |
|---------|---------|
| `pnpm run build` | Compile TypeScript |
| `pnpm run plan` | Generate review plan (dry run) |
| `pnpm run review` | Run review lane |
| `pnpm run apply-decisions` | Execute pending closures |
| `pnpm run audit` | Compare live GitHub vs stored reports |
| `pnpm run reconcile` | Fix report placement drift |
| `pnpm run status` | Update per-repo status JSON |
| `pnpm run commit-review` | Review commits on `main` |
| `pnpm run test:unit` | Run unit tests |
| `pnpm run check` | Full CI check (build, lint, test, format) |

---

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐     ┌─────────────┐
│  Scheduler  │────▶│ Review Lane  │────▶│ Apply Lane  │────▶│  Dashboard   │
│  (cron)     │     │  (LLM)       │     │  (execute)   │     │  (state repo)│
└─────────────┘     └──────────────┘     └─────────────┘     └─────────────┘
        │                   │                   │
   Every 15 min        Every hour            Every 15 min
   (hot items)       (daily for <30d)       (close eligible)
```

- **Review lane** is proposal-only. It never closes items.
- **Apply lane** is the only path that mutates GitHub.
- **State repo** (`yourname/sweepai-state`) stores durable `records/`, `jobs/`, `results/`.
- This repo stays focused on source, workflows, docs, and tests.

---

## Customization

### Repository Profiles

Per-repo rules live in `src/repository-profiles.ts`. You can:
- Set different close reasons per repo
- Disable auto-close entirely for sensitive repos
- Add custom prompt notes

### Prompts

Review prompts are in `prompts/`. Edit them to change:
- Review depth
- Security focus
- Tone (crustacean-friendly is the default)

### Decision Schema

The structured output schema is at `schema/clawsweeper-decision.schema.json`. The LLM must return JSON matching this schema. Codex enforces it natively; other providers need post-validation (add `ajv` if you want this).

---

## Limitations

### Non-Codex Providers

Claude, Gemini, OpenCode, and Kimi lack native support for:
- `--output-schema` structured JSON enforcement
- `--sandbox` filesystem isolation
- `--output-last-message` guaranteed file writes

Output extraction is best-effort. For production use with non-Codex providers, add JSON schema validation after the LLM call.

### Scale

- Max 100 parallel shards
- 10-minute timeout per item review
- Designed for repos with <1000 open items

---

## Contributing

This is a personal fork. Issues and PRs are welcome, but the primary goal is keeping it working for my repos. If you want a community-driven alternative, check the upstream [openclaw/clawsweeper](https://github.com/openclaw/clawsweeper).

---

## License

MIT. Fork it, modify it, sell it. See [LICENSE](LICENSE).

---

## Credits

- Original: [openclaw/clawsweeper](https://github.com/openclaw/clawsweeper) by Peter Steinberger
- Model-agnostic layer: added by [Daniel Silva Perez](https://github.com/daniel-silva-perez)
- Built for shipping, not for maintenance hell.
