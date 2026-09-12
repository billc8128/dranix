import type { AgentConfig, AdapterKind } from "../config.js";

export interface SpawnSpec {
  command: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
  /** When true, process.ts uses the in-process mock echo instead of spawn */
  mock?: boolean;
}

export interface Adapter {
  kind: AdapterKind;
  /** Build a spawn spec for sending `prompt` to this agent config */
  buildSpawn(agent: AgentConfig, prompt: string): SpawnSpec;
}

export type AdapterRegistry = Record<AdapterKind, Adapter>;
