import { describe, it, expect } from "vitest";
import {
  loadConfig,
  mergeConfigs,
  mergeAgents,
  PRODUCT,
  type DranixConfig,
  type AgentConfig,
} from "../src/config.js";

const base: DranixConfig = {
  visibility: "all",
  on_quit: "ask",
  io: "stdio",
  defaults: { focus: "mock", max_timeline: 200, max_chars: 4000 },
  agents: [
    {
      id: "mock",
      name: "Mock Echo",
      adapter: "mock",
      enabled: true,
      command: "mock",
    },
  ],
};

describe("config", () => {
  it("locks product visibility/on_quit/io", () => {
    const merged = mergeConfigs(base, {
      visibility: "focused" as DranixConfig["visibility"],
      on_quit: "exit" as DranixConfig["on_quit"],
      io: "stdio",
    });
    expect(merged.visibility).toBe(PRODUCT.visibility);
    expect(merged.on_quit).toBe(PRODUCT.on_quit);
    expect(merged.io).toBe(PRODUCT.io);
  });

  it("project config wins over user for agent fields", () => {
    const user = `
visibility = "all"
[[agents]]
id = "codex"
name = "User Codex"
adapter = "codex"
enabled = true
command = "codex"
`;
    const project = `
[[agents]]
id = "codex"
name = "Project Codex"
enabled = false
`;
    const cfg = loadConfig({
      userToml: user,
      projectToml: project,
    });
    const codex = cfg.agents.find((a) => a.id === "codex");
    expect(codex).toBeDefined();
    expect(codex!.name).toBe("Project Codex");
    expect(codex!.enabled).toBe(false);
    expect(codex!.adapter).toBe("codex");
  });

  it("soft-disable via enabled=false is preserved", () => {
    const overlay: AgentConfig[] = [
      {
        id: "mock",
        name: "Mock Echo",
        adapter: "mock",
        enabled: false,
        command: "mock",
      },
    ];
    const agents = mergeAgents(base.agents, overlay);
    expect(agents.find((a) => a.id === "mock")!.enabled).toBe(false);
  });

  it("merges defaults with project winning focus", () => {
    const cfg = loadConfig({
      userToml: `[defaults]\nfocus = "codex"\nmax_timeline = 50`,
      projectToml: `[defaults]\nfocus = "mock"`,
    });
    expect(cfg.defaults.focus).toBe("mock");
    expect(cfg.defaults.max_timeline).toBe(50);
  });

  it("keeps built-in mock when configs omit agents", () => {
    const cfg = loadConfig({ userToml: "", projectToml: null });
    expect(cfg.agents.some((a) => a.id === "mock")).toBe(true);
  });
});
