import type { Adapter } from "./types.js";
import type { AgentConfig } from "../config.js";

/** In-process echo adapter — no real child process. */
export const mockAdapter: Adapter = {
  kind: "mock",
  buildSpawn(agent: AgentConfig, prompt: string) {
    return {
      command: agent.command || "mock",
      args: [prompt],
      cwd: agent.cwd,
      env: agent.env,
      mock: true,
    };
  },
};

export function mockEcho(prompt: string, agentId: string): string {
  const trimmed = prompt.trim();
  if (!trimmed) return `(${agentId}) empty prompt`;
  return `(${agentId}) ${trimmed}`;
}
