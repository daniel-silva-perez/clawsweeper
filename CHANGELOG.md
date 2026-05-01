# Changelog

All notable SweepAI changes are tracked here.

## 0.2.0 - Unreleased

### Added

- **Model-agnostic LLM support.** SweepAI now works with any CLI-based LLM tool:
  - OpenAI Codex (production-ready)
  - Anthropic Claude Code (beta)
  - Google Gemini (experimental)
  - OpenCode (beta)
  - Moonshot Kimi (beta)
- New `src/llm-providers.ts` abstraction layer with unified `LLMProvider` interface.
- Provider factory: `createLLMProvider()` picks implementation from `LLM_PROVIDER` env var.
- Backward-compatible: old `CODEX_*` env vars and `--codex-*` CLI flags still work.
- Updated docs with provider comparison table, quick-start examples, and setup instructions.

### Changed

- Renamed project from "ClawSweeper" to "SweepAI".
- Rebranded all user-facing docs, comments, and error messages.
- Generalized "Codex review" → "LLM review" throughout.
- `DEFAULT_CODEX_MODEL` → `DEFAULT_LLM_MODEL`.
- New CLI args: `--llm-model`, `--llm-provider`, `--llm-reasoning-effort`, etc.

## 0.1.0 - 2026-05-01

### Forked

- Forked from [openclaw/clawsweeper](https://github.com/openclaw/clawsweeper) (MIT licensed).
- Stripped OpenClaw-specific branding and defaults.
- Kept all original functionality: review lane, apply lane, commit sweeper, audit, reconcile.

### Original ClawSweeper Features (Preserved)

- Conservative maintenance bot that writes one markdown review record per open issue or PR.
- Proposal-only review flow plus explicit apply mode for unchanged, high-confidence closes.
- Targeted single-item review support.
- Durable automated review comments updated in place.
- Separate hourly apply/comment-sync workflow lane.
- Five-minute hot-intake review lane for new and recently active issues.
- Archived `closed/` records so `items/` stays focused on open tracked items.
- Read-only audit command for checking live GitHub state against generated records.
- Review runtime metadata including model and reasoning effort.
- MIT licensing.
