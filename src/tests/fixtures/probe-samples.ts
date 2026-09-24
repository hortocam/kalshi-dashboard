/**
 * Text samples for the invariant scanner's own tests (T005).
 *
 * This directory is the codebase's single sanctioned zone for strings that the
 * source-tree invariants forbid elsewhere: the P2 fixture helper's schema DDL
 * (contracts invariant 4) and these scanner probe samples live here. Nothing
 * in this file is ever executed as SQL — it is test data for the scanner.
 */

export const SAMPLE_INSERT = "INSERT INTO t (id) VALUES (1);";
/** The exact regex-match fragment the scanner reports for SAMPLE_INSERT. */
export const EXPECTED_INSERT_MATCH = "INSERT" + " INTO";
export const SAMPLE_INSERT_OR_REPLACE = "INSERT OR REPLACE INTO t (id) VALUES (1);";
export const SAMPLE_UPDATE = "UPDATE t SET id = 1 WHERE id = 2;";
export const SAMPLE_DELETE = "DELETE FROM t WHERE id = 1;";
export const SAMPLE_DROP_TABLE = "DROP TABLE t;";
export const SAMPLE_ALTER_TABLE = "ALTER TABLE t ADD COLUMN c TEXT;";
export const SAMPLE_CREATE_TABLE = "CREATE TABLE t (id INTEGER PRIMARY KEY);";
export const SAMPLE_REPLACE_INTO = "REPLACE INTO t (id) VALUES (1);";
export const SAMPLE_PRAGMA_ASSIGN = "PRAGMA journal_mode = WAL;";

/** Reads are allowed — the scanner must not flag these. */
export const SAMPLE_SELECT = "SELECT id FROM t WHERE id = 1;";

/**
 * Statement names for scanner-test descriptions. Kept in the sanctioned
 * fixtures zone so the src/-wide gate itself never sees these words in test
 * titles or labels.
 */
export const LABEL_INSERT = "insert-row";
export const LABEL_UPDATE = "update-set";
export const LABEL_DELETE = "delete-from";
export const LABEL_DROP = "drop-table";
export const LABEL_CREATE = "create-table";
export const LABEL_REPLACE = "replace-into";
export const LABEL_PRAGMA = "pragma-assign";

/** Absolute host path samples (POSIX host layouts + Windows drives). */
export const SAMPLE_HOST_POSIX = "/home/agent/probe/store.sqlite";
export const SAMPLE_HOST_WINDOWS = "C:\\Users\\agent\\store.sqlite";

/** Not host paths — must not be flagged. */
export const SAMPLE_GENERIC_POSIX = "/data/store.sqlite";
export const SAMPLE_RELATIVE = "fixtures/store.sqlite";