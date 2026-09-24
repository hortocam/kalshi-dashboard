/**
 * skilllog.ts — FR-003, D3: recent changes to the Kalshi skill (the homepage
 * skill-changes card, wired to UI in P3). Reads `git log` of the configured
 * skill-repo checkout — the path comes from env KALSHI_SKILL_REPO_DIR via
 * config (never a hard-coded host path, FR-012/FR-019). When the repo is not
 * configured, missing, or not a git repo, the result is [] and the UI shows
 * its explicit "skill changes unavailable" state.
 *
 * Server-side only (spawns git); capped 10 commits / 30 days.
 */
import { execFile } from "node:child_process";

export interface SkillChange {
  /** Commit date, YYYY-MM-DD (author date). */
  readonly date: string;
  /** Short commit hash. */
  readonly hash: string;
  /** Commit subject (first line). */
  readonly subject: string;
}

export interface SkillLogOptions {
  /** Absolute path to the skill repo checkout, or null when not configured. */
  readonly repoDir: string | null;
  /** Window length in days (default 30, D3). */
  readonly sinceDays?: number;
  /** Max entries (default 10, D3). */
  readonly max?: number;
  /** Window anchor (ms epoch); defaults to the current time (tests inject). */
  readonly now?: number;
}

const DEFAULT_SINCE_DAYS = 30;
const DEFAULT_MAX = 10;

function gitLog(
  repoDir: string,
  sinceIso: string,
  max: number
): Promise<SkillChange[]> {
  return new Promise((resolve) => {
    execFile(
      "git",
      [
        "-C",
        repoDir,
        "log",
        `--since=${sinceIso}`,
        "--date=short",
        "--pretty=%H|%ad|%s",
        `-n${max}`,
      ],
      { timeout: 5000 },
      (err, stdout) => {
        if (err || !stdout) {
          // Not a repo, git missing, or no commits: the unavailable state.
          resolve([]);
          return;
        }
        const changes: SkillChange[] = [];
        for (const line of stdout.split("\n")) {
          if (!line) continue;
          const sep1 = line.indexOf("|");
          const sep2 = line.indexOf("|", sep1 + 1);
          if (sep1 < 0 || sep2 < 0) continue;
          const hash = line.slice(0, sep1);
          const date = line.slice(sep1 + 1, sep2);
          const subject = line.slice(sep2 + 1);
          if (!hash || !date) continue;
          changes.push({
            date,
            hash: hash.slice(0, 10),
            subject,
          });
        }
        resolve(changes);
      }
    );
  });
}

export async function getSkillChanges(
  options: SkillLogOptions
): Promise<SkillChange[]> {
  const { repoDir } = options;
  if (!repoDir) return [];
  const sinceDays = options.sinceDays ?? DEFAULT_SINCE_DAYS;
  const max = options.max ?? DEFAULT_MAX;
  const now = options.now ?? Date.now();
  const since = new Date(now - sinceDays * 86400000).toISOString();
  return gitLog(repoDir, since, max);
}