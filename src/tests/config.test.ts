import { describe, expect, it } from "vitest";

import {
  ConfigError,
  DEFAULT_HOST,
  DEFAULT_PORT,
  ENV_SKILL_REPO_DIR,
  ENV_STORE_DB,
  loadConfig,
} from "@/lib/config";

describe("loadConfig", () => {
  it("returns defaults 127.0.0.1:3000 when bind env is unset", () => {
    const cfg = loadConfig({
      [ENV_STORE_DB]: "/store/dev.sqlite",
    });
    expect(cfg).toEqual({
      researchDbPath: "/store/dev.sqlite",
      skillRepoDir: null,
      host: DEFAULT_HOST,
      port: DEFAULT_PORT,
    });
    expect(DEFAULT_HOST).toBe("127.0.0.1");
    expect(DEFAULT_PORT).toBe(3000);
  });

  it("honours HOSTNAME/PORT overrides and the optional skill repo dir", () => {
    const cfg = loadConfig({
      [ENV_STORE_DB]: "/store/dev.sqlite",
      [ENV_SKILL_REPO_DIR]: "/repos/kalshi-skill",
      HOSTNAME: "0.0.0.0",
      PORT: "8080",
    });
    expect(cfg.host).toBe("0.0.0.0");
    expect(cfg.port).toBe(8080);
    expect(cfg.skillRepoDir).toBe("/repos/kalshi-skill");
  });

  it("maps only the three contract env vars and nothing else", () => {
    const cfg = loadConfig({
      [ENV_STORE_DB]: "/store/dev.sqlite",
      KALSHI_TRAEFIK_URL: "https://sso.example.internal",
      AUTHENTIK_HOST: "authentik.internal",
    } as Record<string, string>);
    expect(Object.keys(cfg).sort()).toEqual([
      "host",
      "port",
      "researchDbPath",
      "skillRepoDir",
    ]);
  });

  it("throws the typed ConfigError when the store path is missing", () => {
    expect(() => loadConfig({})).toThrow(ConfigError);
    try {
      loadConfig({});
      expect.unreachable("loadConfig should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      const cfgErr = err as ConfigError;
      expect(cfgErr.missingVars).toContain(ENV_STORE_DB);
      expect(cfgErr.message).toContain(ENV_STORE_DB);
    }
  });

  it("treats a blank store path as missing (typed error, not a crash)", () => {
    expect(() => loadConfig({ [ENV_STORE_DB]: "   " })).toThrow(ConfigError);
  });

  it.each([
    ["not-a-number", `PORT="not-a-number" is not a valid port number`],
    ["0", `PORT="0" is not a valid port number`],
    ["-1", `PORT="-1" is not a valid port number`],
    ["70000", `PORT="70000" is not a valid port number`],
    ["3.14", `PORT="3.14" is not a valid port number`],
  ])("rejects PORT=%s with the typed error", (port, expectedMessage) => {
    try {
      loadConfig({ [ENV_STORE_DB]: "/store/dev.sqlite", PORT: port });
      expect.unreachable(`PORT=${port} should have thrown`);
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      expect((err as ConfigError).message).toBe(expectedMessage);
    }
  });

  it("falls back to the default port when PORT is set to an empty string", () => {
    const cfg = loadConfig({ [ENV_STORE_DB]: "/store/dev.sqlite", PORT: "" });
    expect(cfg.port).toBe(DEFAULT_PORT);
  });
});