import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { scanSourceTree, type InvariantViolation } from "@/tests/invariant-scan";
import {
  EXPECTED_INSERT_MATCH,
  LABEL_CREATE,
  LABEL_DELETE,
  LABEL_DROP,
  LABEL_INSERT,
  LABEL_PRAGMA,
  LABEL_REPLACE,
  LABEL_UPDATE,
  SAMPLE_CREATE_TABLE,
  SAMPLE_DELETE,
  SAMPLE_DROP_TABLE,
  SAMPLE_GENERIC_POSIX,
  SAMPLE_HOST_POSIX,
  SAMPLE_HOST_WINDOWS,
  SAMPLE_INSERT,
  SAMPLE_PRAGMA_ASSIGN,
  SAMPLE_RELATIVE,
  SAMPLE_REPLACE_INTO,
  SAMPLE_SELECT,
  SAMPLE_UPDATE,
} from "@/tests/fixtures/probe-samples";

/**
 * T005: the source-tree invariant test — contracts non-negotiables 2–3.
 * Part 1 unit-tests the scanner itself against synthetic trees; part 2 scans
 * the real src/ tree (the actual gate CI runs on every push).
 */

let tmpRoot: string;

beforeAll(() => {
  tmpRoot = mkdtempSync(path.join(tmpdir(), "invariant-probe-"));
});

afterAll(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

function makeTree(relPath: string, content: string): string {
  const abs = path.join(tmpRoot, relPath);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, content);
  return abs;
}

const violationsFor = (violations: InvariantViolation[], relPath: string) =>
  violations.filter((v) => v.relPath === relPath);

describe("scanSourceTree (scanner units)", () => {
  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
    mkdirSync(tmpRoot, { recursive: true });
  });

  it(`flags ${LABEL_INSERT} as a sql-write violation`, () => {
    makeTree("a.ts", `const q = "${SAMPLE_INSERT}"`);
    const violations = scanSourceTree(tmpRoot);
    const hits = violationsFor(violations, "a.ts");
    expect(hits).toHaveLength(1);
    expect(hits[0].category).toBe("sql-write");
    expect(hits[0].match).toBe(EXPECTED_INSERT_MATCH);
  });

  it.each([
    [LABEL_UPDATE, SAMPLE_UPDATE],
    [LABEL_DELETE, SAMPLE_DELETE],
    [LABEL_DROP, SAMPLE_DROP_TABLE],
    [LABEL_CREATE, SAMPLE_CREATE_TABLE],
    [LABEL_REPLACE, SAMPLE_REPLACE_INTO],
    [LABEL_PRAGMA, SAMPLE_PRAGMA_ASSIGN],
  ])("flags %s as a sql-write violation", (_label, sample) => {
    makeTree("b.ts", `const q = "${sample}"`);
    const violations = scanSourceTree(tmpRoot);
    expect(violationsFor(violations, "b.ts")).toHaveLength(1);
  });

  it("does not flag read-only SQL (SELECT)", () => {
    makeTree("c.ts", `const q = "${SAMPLE_SELECT}"`);
    expect(scanSourceTree(tmpRoot)).toHaveLength(0);
  });

  it("flags absolute host paths (POSIX host layouts, Windows drives)", () => {
    makeTree("d1.ts", `const p = "${SAMPLE_HOST_POSIX}";`);
    makeTree("d2.ts", `const p = "${SAMPLE_HOST_WINDOWS}";`);
    const violations = scanSourceTree(tmpRoot);
    expect(violationsFor(violations, "d1.ts")).toHaveLength(1);
    expect(violationsFor(violations, "d2.ts")).toHaveLength(1);
    expect(violations.every((v) => v.category === "absolute-path")).toBe(true);
  });

  it("does not flag generic POSIX placeholders or relative paths", () => {
    makeTree("e1.ts", `const p = "${SAMPLE_GENERIC_POSIX}";`);
    makeTree("e2.ts", `const p = "${SAMPLE_RELATIVE}";`);
    expect(scanSourceTree(tmpRoot)).toHaveLength(0);
  });

  it("skips files in the documented exclusion zones", () => {
    makeTree("tests/fixtures/fixture-ddl.ts", SAMPLE_CREATE_TABLE);
    makeTree("tests/invariant-scan.ts", SAMPLE_INSERT);
    expect(scanSourceTree(tmpRoot)).toHaveLength(0);
  });

  it("reports the offending line number for actionable output", () => {
    makeTree("f.ts", ["const ok = 1;", `const q = "${SAMPLE_DELETE}"`].join("\n"));
    const violations = scanSourceTree(tmpRoot);
    expect(violationsFor(violations, "f.ts")[0].line).toBe(2);
  });
});

describe("src/ tree invariants (the CI gate)", () => {
  const srcDir = path.resolve(import.meta.dirname, "..");

  it("contains no SQL write statements under src/ (contracts invariant 2)", () => {
    const violations = scanSourceTree(srcDir, ["sql-write"]);
    expect(violations).toEqual([]);
  });

  it("contains no absolute host path constants under src/ (contracts invariant 3)", () => {
    const violations = scanSourceTree(srcDir, ["absolute-path"]);
    expect(violations).toEqual([]);
  });

  it("scanner exclusions cover only the sanctioned probe/fixture zones", () => {
    makeTree("tests/fixtures/more-ddl.ts", SAMPLE_INSERT);
    makeTree("tests/invariant-scan.ts", SAMPLE_CREATE_TABLE);
    makeTree("app/leak.ts", SAMPLE_DELETE); // NOT excluded — must be caught
    const violations = scanSourceTree(tmpRoot);
    expect(violations.map((v) => v.relPath)).toEqual(["app/leak.ts"]);
  });
});