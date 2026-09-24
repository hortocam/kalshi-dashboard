import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Source-tree invariant scanner (contracts/data-layer.md, non-negotiables 2–3):
 *
 *   2. No SQL write statement (INSERT/UPDATE/DELETE/DDL) anywhere under src/.
 *   3. No absolute host path constant anywhere under src/.
 *
 * Excluded paths (documented exceptions, reviewed in the invariant test):
 *   - this scanner module: its pattern constants are, by construction, the text
 *     it forbids;
 *   - src/tests/fixtures/: the P2 fixture helper's DDL copies the store schema
 *     verbatim (CREATE TABLE / INSERT seeds) — sanctioned by invariant 4.
 *
 * Line-based matches keep the output actionable; content matching includes
 * string literals and comments, because a write statement hidden in either is
 * still a write statement the data layer could be tricked into running.
 */

export type InvariantCategory = "sql-write" | "absolute-path";

export interface InvariantViolation {
  /** Path relative to the scanned root, POSIX-separated. */
  readonly relPath: string;
  readonly category: InvariantCategory;
  /** The matched text, trimmed. */
  readonly match: string;
  /** 1-based line number. */
  readonly line: number;
}

/** SQL write statements: INSERT/UPDATE...SET/DELETE/DROP/ALTER/CREATE/REPLACE INTO/PRAGMA assignment. */
const SQL_WRITE_PATTERNS: RegExp[] = [
  /\bINSERT\s+(OR\s+\w+\s+)?INTO\b/i,
  /\bUPDATE\s+\S+\s+SET\b/i,
  /\bDELETE\s+FROM\b/i,
  /\bREPLACE\s+INTO\b/i,
  /\bDROP\s+(TABLE|INDEX|VIEW|TRIGGER|DATABASE)\b/i,
  /\bALTER\s+TABLE\b/i,
  /\bCREATE\s+(TABLE|INDEX|UNIQUE\s+INDEX|VIEW|TRIGGER|VIRTUAL\s+TABLE)\b/i,
  /\bPRAGMA\s+\w+\s*=/i,
];

/**
 * Absolute host path constants: POSIX paths rooted in host-only directories
 * (home layouts, system trees) and Windows drive paths. Generic placeholders
 * like /path/to or /data are not host paths and do not match.
 */
const ABSOLUTE_PATH_PATTERN =
  /(?:^|[\s"'`(=:,\[])(?:\/(?:home|root|Users|var|etc|opt|srv|mnt|media|tmp|usr)\/[^\s"'`,;)\]]+|[A-Za-z]:\\[^\s"'`,;)\]]+)/;

const EXCLUDED_REL_PATHS = ["tests/invariant-scan.ts", "tests/fixtures"];

function isExcluded(relPosix: string): boolean {
  return EXCLUDED_REL_PATHS.some(
    (ex) => relPosix === ex || relPosix.startsWith(`${ex}/`)
  );
}

function firstMatchingLine(
  content: string,
  patterns: RegExp[]
): { match: string; line: number } | null {
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    for (const pattern of patterns) {
      const m = pattern.exec(lines[i]);
      if (m) {
        return { match: m[0].trim(), line: i + 1 };
      }
    }
  }
  return null;
}

function* walkFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkFiles(abs);
    } else if (statSync(abs).isFile()) {
      yield abs;
    }
  }
}

/**
 * Scan every file under `rootDir` for invariant violations. Syntactically
 * plain: the tree is source text, so no parser is needed to catch forbidden
 * statements in code, literals, or comments alike.
 */
export function scanSourceTree(
  rootDir: string,
  categories: readonly InvariantCategory[] = ["sql-write", "absolute-path"]
): InvariantViolation[] {
  const violations: InvariantViolation[] = [];

  for (const abs of walkFiles(rootDir)) {
    const relPosix = path
      .relative(rootDir, abs)
      .split(path.sep)
      .join("/");

    if (isExcluded(relPosix)) {
      continue;
    }

    let content: string;
    try {
      content = readFileSync(abs, "utf8");
    } catch {
      continue; // unreadable (e.g. removed mid-scan) — not an invariant signal
    }

    const wantSql = categories.includes("sql-write");
    const wantPath = categories.includes("absolute-path");

    const sqlHit = wantSql ? firstMatchingLine(content, SQL_WRITE_PATTERNS) : null;
    if (sqlHit) {
      violations.push({
        relPath: relPosix,
        category: "sql-write",
        match: sqlHit.match,
        line: sqlHit.line,
      });
    }

    if (wantPath) {
      const pathMatch = ABSOLUTE_PATH_PATTERN.exec(content);
      if (pathMatch) {
        const line = content.slice(0, pathMatch.index).split("\n").length;
        violations.push({
          relPath: relPosix,
          category: "absolute-path",
          match: pathMatch[0].trim(),
          line,
        });
      }
    }
  }

  return violations;
}