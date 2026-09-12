import { spawn } from "node:child_process";
import type { AgentConfig } from "./config.js";
import { getAdapter } from "./adapters/index.js";
import { mockEcho } from "./adapters/mock.js";
import type { SpawnSpec } from "./adapters/types.js";

export interface RunResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  code: number | null;
  stubbed?: boolean;
  mock?: boolean;
}

export interface RunOptions {
  /** Timeout ms for real child processes (default 120s) */
  timeoutMs?: number;
  /** Force mock even for non-mock adapters (tests) */
  forceMock?: boolean;
}

export function buildSpec(agent: AgentConfig, prompt: string): SpawnSpec {
  const adapter = getAdapter(agent.adapter);
  return adapter.buildSpawn(agent, prompt);
}

/**
 * Run an agent turn.
 * - mock adapter (or forceMock): in-process echo
 * - other adapters: spawn command template; on missing binary, return stubbed error
 */
export async function runAgent(
  agent: AgentConfig, prompt: string, opts: RunOptions = {}):
  Promise<RunResult> {
  if (!agent.enabled) {
    return {
      ok: false,
      stdout: "",
      stderr: `Agent @${agent.id} is disabled (soft-disable). Use /enable ${agent.id}`,
      code: 1,
    };
  }

  const spec = buildSpec(agent, prompt);

  if (spec.mock || opts.forceMock || agent.adapter === "mock") {
    const stdout = mockEcho(prompt, agent.id);
    return { ok: true, stdout, stderr: "", code: 0, mock: true };
  }

  // Real adapter stubs: attempt spawn; surface clear stub messaging
  return spawnChild(spec, opts.timeoutMs ?? 120_000, agent.id);
}

function spawnChild(
  spec: SpawnSpec,
  timeoutMs: number,
  agentId: string,
): Promise<RunResult> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (result: RunResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    let child;
    try {
      child = spawn(spec.command, spec.args, {
        cwd: spec.cwd,
        env: { ...process.env, ...spec.env },
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      finish({
        ok: false,
        stdout: "",
        stderr: `Failed to spawn @${agentId} (${spec.command}): ${msg}`,
        code: 1,
        stubbed: true,
      });
      return;
    }

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      finish({
        ok: false,
        stdout,
        stderr: stderr || `Timed out after ${timeoutMs}ms`,
        code: null,
        stubbed: true,
      });
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      finish({
        ok: false,
        stdout,
        stderr:
          stderr ||
          `Adapter @${agentId} stub spawn failed (${spec.command}): ${err.message}. Install the CLI or use the mock agent.`,
        code: 1,
        stubbed: true,
      });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      finish({
        ok: code === 0,
        stdout: stdout.trimEnd(),
        stderr: stderr.trimEnd(),
        code,
        stubbed: true,
      });
    });
  });
}
