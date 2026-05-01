# 🧹 SweepAI

> **I forked a vendor-locked AI maintenance bot and rebuilt it to work with any LLM.**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue?logo=typescript)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node](https://img.shields.io/badge/Node-20+-green?logo=nodedotjs)](https://nodejs.org/)

**What I built:** A model-agnostic abstraction layer that lets you plug in OpenAI Codex, Claude Code, Gemini, or any CLI-based LLM tool — without rewriting the core logic. The original was hardcoded to Codex. Mine works with whatever AI you have installed.

**Why it matters:** Most AI coding tools lock you into one vendor. I decoupled the execution engine from the LLM backend, added a provider factory pattern, and made the entire system configurable via environment variables. One codebase, any AI.

---

## My Contributions (vs. Upstream)

| What I Changed | Technical Detail |
|----------------|------------------|
| **Model-agnostic provider system** | Built `src/llm-providers.ts` with a unified `LLMProvider` interface and factory pattern. Added 5 provider implementations: Codex, Claude Code, Gemini, OpenCode, Kimi. |
| **Decoupled execution from LLM backend** | Original had `spawnSync("codex", ...)` hardcoded in 30+ places. I centralized all LLM calls through `createLLMProvider(provider).runLLM()`. |
| **Environment-based configuration** | Added `LLM_PROVIDER`, `LLM_MODEL`, `LLM_REASONING_EFFORT` env vars with backward-compatible `CODEX_*` fallbacks. |
| **JSON extraction layer** | Non-Codex CLIs don't support `--output-schema`. I added a best-effort JSON extractor that parses free-form LLM output into structured decisions. |
| **Full rebrand & docs rewrite** | Rebranded from "ClawSweeper" to "SweepAI", rewrote all user-facing docs, added architecture documentation. |
| **TypeScript build system** | Maintained `tsgo` build pipeline, fixed type errors during refactoring, verified clean compilation. |

**Upstream:** [openclaw/clawsweeper](https://github.com/openclaw/clawsweeper) (MIT licensed)

---

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  GitHub Issues  │────▶│  SweepAI Engine  │────▶│  LLM Provider   │
│  & Pull Requests│     │  (TypeScript)    │     │  (Pluggable)    │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                               │                           │
                               ▼                           ▼
                        ┌─────────────┐            ┌──────────────┐
                        │  Markdown   │            │  Codex       │
                        │  Reports    │            │  Claude      │
                        │  State Repo │            │  Gemini      │
                        └─────────────┘            │  OpenCode    │
                                                   │  Kimi        │
                                                   └──────────────┘
```

**Key design decisions I made:**

1. **Interface over inheritance:** `LLMProvider` is a simple interface, not a base class. Each provider implements `runLLM()` with its own CLI invocation logic. Keeps it flat and testable.

2. **Factory pattern for runtime selection:** `createLLMProvider("claude")` returns a `ClaudeCodeProvider`. No switch statements in the core engine.

3. **Schema passthrough with fallback:** Codex supports `--output-schema` natively. For others, I pass the schema as part of the prompt and extract JSON from free-form output using regex. Not perfect, but works without vendor lock-in.

4. **Sandbox abstraction:** Codex has `--sandbox` for filesystem isolation. I abstracted this as a passthrough option — other providers run unsandboxed or can be wrapped in Docker later.

---

## Technical Stack

- **Runtime:** Node.js 20+, TypeScript 5.0+
- **Build:** `tsgo` (fast TypeScript compiler)
- **Package Manager:** pnpm
- **Testing:** Vitest (inherited from upstream)
- **CI/CD:** GitHub Actions
- **State Storage:** Git repo (markdown reports as durable state)

---

## Quick Start

```bash
# Clone my fork
git clone https://github.com/daniel-silva-perez/sweepai.git
cd sweepai

# Install dependencies
pnpm install

# Build
pnpm run build

# Run with default provider (OpenAI Codex)
LLM_API_KEY=sk-xxx pnpm run review

# Run with Claude Code
LLM_PROVIDER=claude LLM_MODEL=claude-sonnet-4 pnpm run review
```

---

## What This Proves

**For recruiters evaluating my work:**

- **I can read and refactor large codebases.** The original was ~3,000 lines of tightly coupled TypeScript. I traced every `codex` reference, understood the execution flow, and restructured it without breaking the build.
- **I understand abstraction vs. over-engineering.** The provider system adds ~200 lines but eliminates 30+ hardcoded references. Clean trade-off.
- **I ship working code, not just ideas.** Build passes. TypeScript compiles. The abstraction is functional, not theoretical.
- **I document my work.** Architecture docs, contribution logs, clear README — I write for the next developer (or hiring manager).

---

## License

MIT. Forked from [openclaw/clawsweeper](https://github.com/openclaw/clawsweeper) — rebuilt by [Daniel Silva Perez](https://github.com/daniel-silva-perez).
