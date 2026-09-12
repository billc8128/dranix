import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { parse as parseToml } from "smol-toml";

export type AdapterKind =
  | "mock"
  | "codex"
  | "claude-code"
  | "pi"
  | "oh-my-pi"
  | "kimi-code";

export type Visibility = "all" | "focused" | "mentions";
export type OnQuit = "ask" | "exit" | "detach";
export type IoMode = "stdio";

export interface AgentConfig {
  id: string;
  name: string;
  adapter: AdapterKind;
  enabled: boolean;
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
}

export type AgentPatch = Partial<AgentConfig> & { id: string };

export interface DefaultsConfig {
  focus?: string;
  max_timeline?: number;
  max_chars?: number;
}

export interface DranixConfig {
  visibility: Visibility;
  on_quit: OnQuit;
  io: IoMode;
  defaults: DefaultsConfig;
  agents: AgentConfig[];
}

export const PRODUCT = {
  name: "dranix",
  visibility: "all" as Visibility,
  on_quit: "ask" as OnQuit,
  io: "stdio" as IoMode,
};

const DEFAULT_CONFIG: DranixConfig = {
  visibility: PRODUCT.visibility,
  on_quit: PRODUCT.on_quit,
  io: PRODUCT.io,
  defaults: {
    focus: "mock",
    max_timeline: 200,
    max_chars: 4000,
  },
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

function userConfigPath(): string {
  return join(homedir(), ".config", "dranix", "agents.toml");
}

function projectConfigPath(cwd = process.cwd()): string {
  return join(resolve(cwd), "agents.toml");
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Only fields explicitly present in TOML (plus required id). */
export function parseAgentPatch(raw: unknown): AgentPatch | null {
  const obj = asRecord(raw);
  const id = typeof obj.id === "string" ? obj.id.trim() : "";
  if (!id) return null;

  const patch: AgentPatch = { id };

  if (typeof obj.name === "string" && obj.name.trim()) patch.name = obj.name;
  if (typeof obj.adapter === "string" && obj.adapter.trim()) {
    patch.adapter = obj.adapter as AdapterKind;
  }
  if ("enabled" in obj) patch.enabled = obj.enabled !== false;
  if (typeof obj.command === "string" && obj.command.trim()) {
    patch.command = obj.command;
  }
  if (Array.isArray(obj.args)) {
    patch.args = obj.args.filter((a): a is string => typeof a === "string");
  }
  if (typeof obj.cwd === "string") patch.cwd = obj.cwd;
  if (obj.env && typeof obj.env === "object" && !Array.isArray(obj.env)) {
    patch.env = Object.fromEntries(
      Object.entries(obj.env as Record<string, unknown>).filter(
        (e): e is [string, string] => typeof e[1] === "string",
      ),
    );
  }
  return patch;
}

function materializeAgent(patch: AgentPatch): AgentConfig {
  return {
    id: patch.id,
    name: patch.name ?? patch.id,
    adapter: patch.adapter ?? "mock",
    enabled: patch.enabled ?? true,
    command: patch.command ?? patch.id,
    args: patch.args,
    cwd: patch.cwd,
    env: patch.env,
  };
}

interface ParsedPartial {
  visibility?: Visibility;
  on_quit?: OnQuit;
  io?: IoMode;
  defaults: DefaultsConfig;
  agentPatches: AgentPatch[];
}

function parseConfigToml(text: string): ParsedPartial {
  const raw = asRecord(parseToml(text));
  const defaultsRaw = asRecord(raw.defaults);
  const agentsRaw = Array.isArray(raw.agents) ? raw.agents : [];

  const agentPatches = agentsRaw
    .map((a) => parseAgentPatch(a))
    .filter((a): a is AgentPatch => a !== null);

  const visibility =
    raw.visibility === "all" ||
    raw.visibility === "focused" ||
    raw.visibility === "mentions"
      ? raw.visibility
      : undefined;

  const on_quit =
    raw.on_quit === "ask" || raw.on_quit === "exit" || raw.on_quit === "detach"
      ? raw.on_quit
      : undefined;

  const io = raw.io === "stdio" ? "stdio" : undefined;

  return {
    ...(visibility ? { visibility } : {}),
    ...(on_quit ? { on_quit } : {}),
    ...(io ? { io } : {}),
    defaults: {
      focus:
        typeof defaultsRaw.focus === "string" ? defaultsRaw.focus : undefined,
      max_timeline:
        typeof defaultsRaw.max_timeline === "number"
          ? defaultsRaw.max_timeline
          : undefined,
      max_chars:
        typeof defaultsRaw.max_chars === "number"
          ? defaultsRaw.max_chars
          : undefined,
    },
    agentPatches,
  };
}

function readTomlFile(path: string): ParsedPartial | null {
  if (!existsSync(path)) return null;
  try {
    const text = readFileSync(path, "utf8");
    if (!text.trim()) return null;
    return parseConfigToml(text);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse config at ${path}: ${msg}`);
  }
}

/** Merge agents by id; later patches only overwrite explicitly set fields. */
export function mergeAgents(
  base: AgentConfig[],
  overlay: Array<AgentConfig | AgentPatch>,
): AgentConfig[] {
  const map = new Map<string, AgentConfig>();
  for (const a of base) map.set(a.id, { ...a });
  for (const patch of overlay) {
    const prev = map.get(patch.id);
    if (!prev) {
      map.set(patch.id, materializeAgent(patch));
      continue;
    }
    const next: AgentConfig = { ...prev };
    if (patch.name !== undefined) next.name = patch.name;
    if (patch.adapter !== undefined) next.adapter = patch.adapter;
    if (patch.enabled !== undefined) next.enabled = patch.enabled;
    if (patch.command !== undefined) next.command = patch.command;
    if (patch.args !== undefined) next.args = patch.args;
    if (patch.cwd !== undefined) next.cwd = patch.cwd;
    if (patch.env !== undefined) next.env = patch.env;
    map.set(patch.id, next);
  }
  return [...map.values()];
}

export function mergeConfigs(
  base: DranixConfig,
  ...overlays: Array<ParsedPartial | Partial<DranixConfig> | null | undefined>
): DranixConfig {
  let result: DranixConfig = {
    ...base,
    defaults: { ...base.defaults },
    agents: base.agents.map((a) => ({ ...a })),
  };

  for (const overlay of overlays) {
    if (!overlay) continue;

    const defaults =
      "defaults" in overlay && overlay.defaults
        ? overlay.defaults
        : undefined;

    const agentPatches =
      "agentPatches" in overlay && Array.isArray(overlay.agentPatches)
        ? overlay.agentPatches
        : "agents" in overlay && Array.isArray(overlay.agents)
          ? (overlay.agents as AgentConfig[])
          : [];

    result = {
      visibility:
        "visibility" in overlay && overlay.visibility
          ? (overlay.visibility as Visibility)
          : result.visibility,
      on_quit:
        "on_quit" in overlay && overlay.on_quit
          ? (overlay.on_quit as OnQuit)
          : result.on_quit,
      io: "io" in overlay && overlay.io ? (overlay.io as IoMode) : result.io,
      defaults: {
        ...result.defaults,
        ...Object.fromEntries(
          Object.entries(defaults ?? {}).filter(([, v]) => v !== undefined),
        ),
      },
      agents:
        agentPatches.length > 0
          ? mergeAgents(result.agents, agentPatches)
          : result.agents,
    };
  }

  // Locked product constraints
  result.visibility = PRODUCT.visibility;
  result.on_quit = PRODUCT.on_quit;
  result.io = PRODUCT.io;

  return result;
}

export interface LoadConfigOptions {
  cwd?: string;
  userPath?: string;
  projectPath?: string;
  /** Injected TOML strings for tests */
  userToml?: string | null;
  projectToml?: string | null;
}

export function loadConfig(opts: LoadConfigOptions = {}): DranixConfig {
  const userPath = opts.userPath ?? userConfigPath();
  const projectPath = opts.projectPath ?? projectConfigPath(opts.cwd);

  const userPartial =
    opts.userToml !== undefined
      ? opts.userToml && opts.userToml.trim()
        ? parseConfigToml(opts.userToml)
        : null
      : readTomlFile(userPath);

  const projectPartial =
    opts.projectToml !== undefined
      ? opts.projectToml && opts.projectToml.trim()
        ? parseConfigToml(opts.projectToml)
        : null
      : readTomlFile(projectPath);

  // Project wins over user
  return mergeConfigs(DEFAULT_CONFIG, userPartial, projectPartial);
}

export function enabledAgents(config: DranixConfig): AgentConfig[] {
  return config.agents.filter((a) => a.enabled);
}

export function findAgent(
  config: DranixConfig,
  id: string,
): AgentConfig | undefined {
  return config.agents.find((a) => a.id === id);
}

export function configPaths(cwd = process.cwd()): {
  user: string;
  project: string;
} {
  return { user: userConfigPath(), project: projectConfigPath(cwd) };
}
