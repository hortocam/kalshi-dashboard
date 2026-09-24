/**
 * Start-time configuration (contracts/data-layer.md — Configuration contract).
 *
 * Exactly three configuration inputs exist; nothing else is read (FR-012, FR-019):
 *   - KALSHI_RESEARCH_DB    absolute path to the research store (required, no default)
 *   - KALSHI_SKILL_REPO_DIR path to a skill-repo checkout (optional; enables the
 *                          skill-changes card — read by lib/store/skilllog.ts in P3)
 *   - HOSTNAME / PORT       bind address / port (defaults 127.0.0.1 / 3000)
 *
 * No gateway/proxy/SSO endpoints are read or hard-coded anywhere (FR-019);
 * deployment wiring (Traefik/Authentik) is configuration at deploy time only.
 */

/** Absolute path to the research store; required — the app refuses to start without it. */
export const ENV_STORE_DB = "KALSHI_RESEARCH_DB";

/** Optional path to a checkout of github.com/hortocam/kalshi-skill. */
export const ENV_SKILL_REPO_DIR = "KALSHI_SKILL_REPO_DIR";

/** Bind address default: localhost-only (SC-008). */
export const DEFAULT_HOST = "127.0.0.1";

/** Port default. */
export const DEFAULT_PORT = 3000;

/** Typed error thrown when configuration is missing or invalid at start time. */
export class ConfigError extends Error {
  readonly name = "ConfigError";
  /** Env var names that were required but absent (empty for validation errors). */
  readonly missingVars: string[];

  constructor(message: string, missingVars: string[] = []) {
    super(message);
    this.missingVars = missingVars;
  }
}

function missingEnvError(missingVars: string[]): ConfigError {
  return new ConfigError(
    `Missing required environment variable(s): ${missingVars.join(", ")}. ` +
      `Set ${ENV_STORE_DB} to the absolute path of the Kalshi research store.`,
    missingVars
  );
}

export interface DashboardConfig {
  /** Absolute path to the research store (required, env KALSHI_RESEARCH_DB). */
  readonly researchDbPath: string;
  /** Skill repo checkout dir, or null when env KALSHI_SKILL_REPO_DIR is unset. */
  readonly skillRepoDir: string | null;
  /** Bind address (env HOSTNAME, default 127.0.0.1). */
  readonly host: string;
  /** Port (env PORT, default 3000). */
  readonly port: number;
}

/**
 * Read and validate configuration from the given environment record.
 * Throws {@link ConfigError} when required vars are missing or PORT is not
 * an integer. Never reads any other environment variable.
 */
export function loadConfig(
  env: Record<string, string | undefined> = process.env
): DashboardConfig {
  const missingVars: string[] = [];

  const researchDbPath = env[ENV_STORE_DB]?.trim();
  if (!researchDbPath) {
    missingVars.push(ENV_STORE_DB);
  }

  if (missingVars.length > 0) {
    throw missingEnvError(missingVars);
  }

  const portRaw = env.PORT?.trim();
  let port = DEFAULT_PORT;
  if (portRaw) {
    const parsed = Number(portRaw);
    if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
      throw new ConfigError(`PORT="${portRaw}" is not a valid port number`);
    }
    port = parsed;
  }

  const host = env.HOSTNAME?.trim() || DEFAULT_HOST;

  const skillRepoDir = env[ENV_SKILL_REPO_DIR]?.trim() || null;

  return {
    researchDbPath: researchDbPath as string,
    skillRepoDir,
    host,
    port,
  };
}