import type { AdapterRegistry } from "./types.js";
import { mockAdapter } from "./mock.js";
import {
  codexAdapter,
  claudeCodeAdapter,
  piAdapter,
  ohMyPiAdapter,
  kimiCodeAdapter,
} from "./stubs.js";

export * from "./types.js";
export * from "./mock.js";
export * from "./stubs.js";

export const adapters: AdapterRegistry = {
  mock: mockAdapter,
  codex: codexAdapter,
  "claude-code": claudeCodeAdapter,
  pi: piAdapter,
  "oh-my-pi": ohMyPiAdapter,
  "kimi-code": kimiCodeAdapter,
};

export function getAdapter(kind: keyof AdapterRegistry) {
  return adapters[kind] ?? mockAdapter;
}
