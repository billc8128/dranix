import type { Adapter, SpawnSpec } from "./types.js";
import type { AgentConfig, AdapterKind } from "../config.js";

function stub(
  kind: AdapterKind,
  defaultCommand: string,
  defaultArgs: string[],
): Adapter {
  return {
    kind,
    buildSpawn(agent: AgentConfig, prompt: string): SpawnSpec {
      const command = agent.command || defaultCommand;
      const baseArgs = agent.args?.length ? [...agent.args] : [...defaultArgs];
      // Prompt is appended; real adapters may refine this later.
      return {
        command,
        args: [...baseArgs, prompt],
        cwd: agent.cwd,
        env: agent.env,
        mock: false,
      };
    },
  };
}

/** Command-template stubs — spawn shapes only; not wired as production runners yet. */
export const codexAdapter = stub("codex", "codex", ["exec", "--"]);
export const claudeCodeAdapter = stub("claude-code", "claude", ["-p", "--"]);
export const piAdapter = stub("pi", "pi", ["--"]);
export const ohMyPiAdapter = stub("oh-my-pi", "oh-my-pi", ["--"]);
export const kimiCodeAdapter = stub("kimi-code", "kimi", ["--"]);
