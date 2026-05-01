# Architecture

How SweepAI works under the hood. Written for anyone who wants to understand (or modify) the system.

## System Overview

SweepAI is a scheduled GitHub maintenance bot with two lanes:

1. **Review Lane:** Reads open issues/PRs, generates markdown reports, posts durable comments
2. **Apply Lane:** Syncs comments, closes items when confidence is high

Both lanes are deterministic, auditable, and run in GitHub Actions.

## Data Flow

```
GitHub API ──▶ clawsweeper.ts ──▶ LLM Provider ──▶ Markdown Report
                                     │                    │
                                     ▼                    ▼
                              CLI Tool (codex,        State Repo
                              claude, etc.)           (Git-backed)
                                                         │
                                                         ▼
                                                   GitHub Comment
```

## Core Modules

### `src/clawsweeper.ts` (~3,000 lines)

The main engine. Handles:
- GitHub API pagination and rate limiting
- Shard-based parallel processing
- Report generation and archiving
- Comment sync (create or update in place)
- Apply decisions with safety guards

**Key functions I modified:**
- `runCodex()` → now `runLLM()` with provider parameter
- `DEFAULT_CODEX_MODEL` → `DEFAULT_LLM_MODEL`
- All error messages generalized from "Codex failed" → "LLM failed"

### `src/llm-providers.ts` (~200 lines, my addition)

New abstraction layer. Defines:

```typescript
interface LLMProvider {
  runLLM(args: LLMArgs): LLMResult;
}
```

**Implementations:**

| Provider | CLI Pattern | JSON Handling | Sandbox |
|----------|-------------|---------------|---------|
| `CodexProvider` | `codex exec --json` | Native `--output-schema` | Native `--sandbox` |
| `ClaudeCodeProvider` | `claude -p` | Regex extraction from markdown | None |
| `GeminiProvider` | `gemini run` | Regex extraction | None |
| `OpenCodeProvider` | `opencode run` | Regex extraction | None |
| `KimiProvider` | `kimi run` | Regex extraction | None |

**Factory:**
```typescript
export function createLLMProvider(provider: string): LLMProvider {
  switch (provider) {
    case "codex": return new CodexProvider();
    case "claude": return new ClaudeCodeProvider();
    case "gemini": return new GeminiProvider();
    case "opencode": return new OpenCodeProvider();
    case "kimi": return new KimiProvider();
    default: throw new Error(`Unknown provider: ${provider}`);
  }
}
```

### `src/repair/` (separate lane)

Not yet refactored — still has hardcoded `spawnSync("codex", ...)` at `run-worker.ts:194`. This is the next abstraction target.

## State Management

SweepAI doesn't use a database. It uses Git.

**State repo structure:**
```
records/
  <repo-slug>/
    items/
      123.md      # Open issue #123 report
      456.md      # Open PR #456 report
    closed/
      789.md      # Archived closed item
    commits/
      abc123.md   # Commit review report
```

Each markdown file is both human-readable and machine-parseable (YAML front matter + body).

## Concurrency Model

- **Shard-level parallelism:** `shard_count` workers, each processing items sequentially
- **Not batch-parallel:** `batch_size` controls items per shard, not concurrent LLM calls
- **Max LLM sessions = shard_count** (conservative to avoid rate limits)

## Safety Guards

1. **Proposal-only by default:** Review lane never mutates GitHub
2. **Snapshot drift detection:** If item changed since review, skip apply
3. **Maintainer protection:** Items by maintainers or with protected labels are non-closeable
4. **Locked comment handling:** 403 on locked items = terminal skip, not retry
5. **Deduplication:** Duplicate guards prevent multiple repair PRs for same issue

## Configuration Hierarchy

```
CLI args (highest priority)
  ↓
Environment variables (LLM_*)
  ↓
Legacy env vars (CODEX_*)
  ↓
Hardcoded defaults (lowest priority)
```

## Build Pipeline

```bash
pnpm run build        # tsgo -p tsconfig.json
pnpm run build:repair # tsgo -p tsconfig.repair.json
pnpm run check        # lint + typecheck + test
```

`tsgo` is used instead of `tsc` for faster compilation. The build must pass before any PR is merged.

## Future Work

- [ ] Refactor `src/repair/run-worker.ts` to use provider abstraction
- [ ] Add JSON schema validation (ajv) for non-Codex providers
- [ ] Docker sandbox for providers without native sandboxing
- [ ] Provider-specific retry logic (each CLI fails differently)
- [ ] Add more providers: Ollama (local), GitHub Copilot CLI, etc.
