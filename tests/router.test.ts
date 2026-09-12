import { describe, it, expect } from "vitest";
import {
  route,
  extractMentions,
  stripFirstMention,
  parseCommand,
  type RouterState,
} from "../src/router.js";

const state: RouterState = {
  focus: "mock",
  allowMentionOverride: true,
};

describe("router", () => {
  it("routes empty input", () => {
    expect(route("   ", state).kind).toBe("empty");
  });

  it("parses slash commands before mentions", () => {
    const r = route("/focus claude", state);
    expect(r.kind).toBe("command");
    expect(r.command).toBe("focus");
    expect(r.args).toEqual(["claude"]);
  });

  it("uses first @mention only for multi-@", () => {
    const mentions = extractMentions("hey @codex and @claude please");
    expect(mentions).toEqual(["codex", "claude"]);

    const r = route("@codex @claude do the thing", state);
    expect(r.kind).toBe("mention");
    expect(r.agentId).toBe("codex");
    expect(r.text).toBe("@claude do the thing");
    expect(r.mentions?.[0]).toBe("codex");
  });

  it("strips first mention from text", () => {
    expect(stripFirstMention("@pi hello world", "pi")).toBe("hello world");
  });

  it("defaults to focus when no mention", () => {
    const r = route("just a message", state);
    expect(r.kind).toBe("focus_default");
    expect(r.agentId).toBe("mock");
    expect(r.text).toBe("just a message");
  });

  it("mention overrides destination once without implying focus change", () => {
    const r = route("@claude review this", { ...state, focus: "mock" });
    expect(r.kind).toBe("mention");
    expect(r.agentId).toBe("claude");
    // focus in state unchanged by route(); caller decides
    expect(state.focus).toBe("mock");
  });

  it("parseCommand handles args", () => {
    expect(parseCommand("/disable codex")).toEqual({
      command: "disable",
      args: ["codex"],
    });
    expect(parseCommand("not a command")).toBeNull();
  });
});
