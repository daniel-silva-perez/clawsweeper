import { spawnSync } from "node:child_process";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { codexEnv } from "./codex-env.js";
import { safeOutputTail } from "./clawsweeper-text.js";

export interface LLMExecOptions {
  promptPath: string;
  outputPath: string;
  model: string;
  reasoningEffort?: string;
  serviceTier?: string;
  sandboxMode?: string;
  timeoutMs: number;
  workDir: string;
  repoDir: string;
  schemaPath?: string;
}

export interface LLMExecResult {
  status: number | null;
  stdout: string;
  stderr: string;
  error?: Error;
}

export interface LLMProvider {
  readonly name: string;
  exec(options: LLMExecOptions): LLMExecResult;
}

// ─── Codex Provider (OpenAI) ───

export class CodexProvider implements LLMProvider {
  readonly name = "codex";

  exec(options: LLMExecOptions): LLMExecResult {
    const args = [
      "exec",
      "-m", options.model,
      "-c", `model_reasoning_effort="${options.reasoningEffort ?? "high"}"`,
      "-c", `service_tier="${options.serviceTier ?? "fast"}"`,
      "-c", 'forced_login_method="api"',
      "-c", 'approval_policy="never"',
      "-C", options.repoDir,
      ...(options.schemaPath ? ["--output-schema", options.schemaPath] : []),
      "--output-last-message", options.outputPath,
      "--sandbox", options.sandboxMode ?? "read-only",
      "-",
    ];

    return spawnSync("codex", args, {
      cwd: options.repoDir,
      encoding: "utf8",
      env: codexEnv(),
      input: readFileSync(options.promptPath, "utf8"),
      maxBuffer: 128 * 1024 * 1024,
      timeout: options.timeoutMs,
    });
  }
}

// ─── Claude Code Provider (Anthropic) ───

export class ClaudeCodeProvider implements LLMProvider {
  readonly name = "claude";

  exec(options: LLMExecOptions): LLMExecResult {
    const args = [
      "-p",
      "--allowedTools", "Bash,Edit,Read,View",
      "--outputFormat", "json",
      "--cwd", options.repoDir,
    ];

    const result = spawnSync("claude", args, {
      cwd: options.repoDir,
      encoding: "utf8",
      env: { ...process.env, CLAUDE_CODE_DEBUG: "1" },
      input: readFileSync(options.promptPath, "utf8"),
      maxBuffer: 128 * 1024 * 1024,
      timeout: options.timeoutMs,
    });

    if (result.stdout && existsSync(options.workDir)) {
      try {
        const jsonMatch = result.stdout.match(/```json\n([\s\S]*?)\n```/) 
                         || result.stdout.match(/\{[\s\S]*\}/);
        const extracted = jsonMatch ? jsonMatch[0] : result.stdout;
        writeFileSync(options.outputPath, extracted.trim(), "utf8");
      } catch {
        writeFileSync(options.outputPath, result.stdout, "utf8");
      }
    }

    return result;
  }
}

// ─── Gemini CLI Provider (Google) ───

export class GeminiProvider implements LLMProvider {
  readonly name = "gemini";

  exec(options: LLMExecOptions): LLMExecResult {
    const args = [
      "run",
      "--model", options.model,
      "--format", "json",
      "--prompt-file", options.promptPath,
    ];

    const result = spawnSync("gemini", args, {
      cwd: options.repoDir,
      encoding: "utf8",
      env: process.env,
      maxBuffer: 128 * 1024 * 1024,
      timeout: options.timeoutMs,
    });

    if (result.stdout && existsSync(options.workDir)) {
      writeFileSync(options.outputPath, result.stdout.trim(), "utf8");
    }

    return result;
  }
}

// ─── OpenCode Provider ───

export class OpenCodeProvider implements LLMProvider {
  readonly name = "opencode";

  exec(options: LLMExecOptions): LLMExecResult {
    const args = [
      "run",
      "--model", options.model,
      "--input", options.promptPath,
      "--output", options.outputPath,
      "--cwd", options.repoDir,
    ];

    return spawnSync("opencode", args, {
      cwd: options.repoDir,
      encoding: "utf8",
      env: process.env,
      maxBuffer: 128 * 1024 * 1024,
      timeout: options.timeoutMs,
    });
  }
}

// ─── Kimi CLI Provider (Moonshot AI) ───

export class KimiProvider implements LLMProvider {
  readonly name = "kimi";

  exec(options: LLMExecOptions): LLMExecResult {
    const args = [
      "run",
      "--model", options.model,
      "--prompt", readFileSync(options.promptPath, "utf8"),
      "--output", options.outputPath,
    ];

    return spawnSync("kimi", args, {
      cwd: options.repoDir,
      encoding: "utf8",
      env: process.env,
      maxBuffer: 128 * 1024 * 1024,
      timeout: options.timeoutMs,
    });
  }
}

// ─── Provider Factory ───

export function createLLMProvider(providerName?: string): LLMProvider {
  const name = (providerName ?? process.env.LLM_PROVIDER ?? "codex").toLowerCase().trim();

  switch (name) {
    case "codex":
    case "openai":
      return new CodexProvider();
    case "claude":
    case "anthropic":
    case "claude-code":
      return new ClaudeCodeProvider();
    case "gemini":
    case "google":
      return new GeminiProvider();
    case "opencode":
      return new OpenCodeProvider();
    case "kimi":
    case "moonshot":
      return new KimiProvider();
    default:
      throw new Error(
        `Unknown LLM provider: "${name}". ` +
        `Supported: codex, claude, gemini, opencode, kimi. ` +
        `Set via LLM_PROVIDER env var or --llm-provider flag.`
      );
  }
}

// ─── Unified runLLM helper ───

export function runLLM(
  provider: LLMProvider,
  options: LLMExecOptions,
): LLMExecResult {
  return provider.exec(options);
}
