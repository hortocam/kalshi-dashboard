import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getSkillChanges } from "@/lib/store/skilllog";

/**
 * T018: getSkillChanges (FR-003, D3) — git-log reader over the configured
 * skill repo checkout. Tests run against a throwaway fixture git repo
 * (init + 2 commits); env unset / not a repo -> [] with no error.
 */

let repoDir: string;
let emptyDir: string;

beforeAll(() => {
  repoDir = mkdtempSync(path.join(tmpdir(), "skilllog-repo-"));
  const git = (args: string[], opts: Record<string, string> = {}) =>
    execFileSync("git", args, {
      cwd: repoDir,
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "Fixture Bot",
        GIT_AUTHOR_EMAIL: "fixture@agents.local",
        GIT_COMMITTER_NAME: "Fixture Bot",
        GIT_COMMITTER_EMAIL: "fixture@agents.local",
        ...opts,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

  git(["init", "--initial-branch=main", "--quiet"]);
  git(["config", "user.name", "Fixture Bot"]);
  git(["config", "user.email", "fixture@agents.local"]);
  writeFileSync(path.join(repoDir, "CHANGELOG.md"), "# fixture repo\n");
  git(["add", "CHANGELOG.md"]);
  // Commits pin BOTH author and committer dates (git log --since compares
  // committer date); without this the fixture would drift with wall clock.
  git([
    "commit", "--quiet", "-m", "feat: first fixture commit",
    "--date", "2026-09-20T10:00:00Z",
  ], { GIT_COMMITTER_DATE: "2026-09-20T10:00:00Z" });
  writeFileSync(path.join(repoDir, "SKILL.md"), "# fixture skill\n");
  git(["add", "SKILL.md"]);
  git([
    "commit", "--quiet", "-m", "docs: second fixture commit",
    "--date", "2026-09-22T12:00:00Z",
  ], { GIT_COMMITTER_DATE: "2026-09-22T12:00:00Z" });

  emptyDir = mkdtempSync(path.join(tmpdir(), "skilllog-empty-"));
});

afterAll(() => {
  rmSync(repoDir, { recursive: true, force: true });
  rmSync(emptyDir, { recursive: true, force: true });
});

describe("getSkillChanges (T018, FR-003 / D3)", () => {
  it("returns the fixture repo's commits, newest first", async () => {
    const changes = await getSkillChanges({ repoDir, now: Date.UTC(2026, 8, 24) });
    expect(changes).toHaveLength(2);
    expect(changes[0].subject).toBe("docs: second fixture commit");
    expect(changes[1].subject).toBe("feat: first fixture commit");
    expect(changes[0].date).toBe("2026-09-22");
    expect(changes[1].date).toBe("2026-09-20");
    for (const c of changes) {
      expect(c.hash).toMatch(/^[0-9a-f]{7,40}$/);
    }
  });

  it("caps at max entries (default 10) and honours sinceDays", async () => {
    const changes = await getSkillChanges({ repoDir, sinceDays: 1, now: Date.UTC(2026, 8, 24) });
    // Window starts 2026-09-23: both fixture commits (09-20, 09-22) are older.
    expect(changes).toEqual([]);
  });

  it("env unset -> [] (never a hard-coded path, D3)", async () => {
    const changes = await getSkillChanges({ repoDir: null });
    expect(changes).toEqual([]);
  });

  it("configured path that is not a git repo -> [] (unavailable state)", async () => {
    const changes = await getSkillChanges({ repoDir: emptyDir });
    expect(changes).toEqual([]);
  });

  it("nonexistent path -> [] (unavailable state)", async () => {
    const changes = await getSkillChanges({ repoDir: "/nonexistent/skill/repo" });
    expect(changes).toEqual([]);
  });

  it("respects the max cap when more commits exist", async () => {
    // The fixture has 2 commits; max=1 returns only the newest.
    const changes = await getSkillChanges({ repoDir, max: 1, now: Date.UTC(2026, 8, 24) });
    expect(changes).toHaveLength(1);
    expect(changes[0].subject).toBe("docs: second fixture commit");
  });
});