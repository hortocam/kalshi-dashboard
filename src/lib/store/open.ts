/**
 * openStore — the single SQLite entry point (contracts/data-layer.md).
 *
 * Invariant 1: exactly this module ever opens SQLite, always readOnly:true.
 * Every other module obtains its handle from openStore and issues SELECTs
 * only. A corrupt/unopenable store that is not simply missing surfaces as
 * StoreUnavailableError (transient, retryable) per the contract.
 */
import { DatabaseSync } from "node:sqlite";
import { statSync } from "node:fs";

/** Schema versions this dashboard can read (FR-013). */
export const SUPPORTED_SCHEMA_VERSIONS: readonly number[] = [2];

/**
 * Base class of the store error hierarchy. UI layers branch on
 * `instanceof StoreError` and render the mapped state. Concrete subclasses
 * override `name` so `err.name` reads the concrete class even through
 * instanceof-free switches.
 */
export class StoreError extends Error {
  override name = "StoreError";
}

/** The configured store file does not exist → UI renders "store not available". */
export class StoreMissingError extends StoreError {
  override readonly name = "StoreMissingError";
}

/**
 * The store's schema version is not in SUPPORTED_SCHEMA_VERSIONS → UI renders
 * the version-mismatch state (FR-013: never render guessed data).
 */
export class SchemaMismatchError extends StoreError {
  override readonly name = "SchemaMismatchError";
  readonly found: number;
  readonly supported: readonly number[];

  constructor(found: number, supported: readonly number[]) {
    super(
      `Store schema version ${found} not supported ` +
        `(supported: ${supported.join(", ")})`
    );
    this.found = found;
    this.supported = supported;
  }
}

/** Transient open failure (corrupt file, WAL contention, permissions) → retryable. */
export class StoreUnavailableError extends StoreError {
  override readonly name = "StoreUnavailableError";
  override readonly cause?: unknown;

  constructor(cause: unknown) {
    super("Store exists but could not be opened or read: " +
        (cause instanceof Error ? cause.message : String(cause)), {
      cause,
    });
    this.cause = cause;
  }
}

/** An opened, schema-gated research store. */
export interface OpenedStore {
  /** Absolute path the store was opened from. */
  readonly path: string;
  /** The gated schema version (always in SUPPORTED_SCHEMA_VERSIONS). */
  readonly schemaVersion: number;
  /**
   * The underlying read-only database handle. Scope: lib/store/* modules
   * only — they must issue SELECTs through it and nothing else.
   */
  readonly db: DatabaseSync;
  /** Close the handle. Idempotent per handle lifetime. */
  close(): void;
}

function readSchemaVersion(db: DatabaseSync): number | null {
  const row = db
    .prepare("SELECT MAX(version) AS v FROM schema_version")
    .get() as { v: number | null } | undefined;
  return row?.v ?? null;
}

/**
 * Open the research store read-only and gate it on the supported schema
 * versions. Throws StoreMissingError when `path` does not exist,
 * SchemaMismatchError when the store's MAX(schema_version) is unsupported,
 * and StoreUnavailableError for any other open/read failure.
 */
export function openStore(path: string): OpenedStore {
  let info;
  try {
    info = statSync(path);
  } catch {
    throw new StoreMissingError(
      `Research store not found at configured path: ${path}`
    );
  }
  if (info.isDirectory()) {
    // A directory is not a store file: transient open failure, not "missing".
    throw new StoreUnavailableError(new Error("path is a directory, not a file"));
  }

  let db: DatabaseSync;
  try {
    db = new DatabaseSync(path, { readOnly: true });
  } catch (err) {
    throw new StoreUnavailableError(err);
  }

  let version: number | null;
  try {
    version = readSchemaVersion(db);
  } catch (err) {
    db.close();
    // e.g. corrupt file: SQLite opened it but no schema_version table is
    // readable — we cannot verify the schema, so refuse rather than guess.
    throw new StoreUnavailableError(err);
  }

  if (version === null || !SUPPORTED_SCHEMA_VERSIONS.includes(version)) {
    db.close();
    throw new SchemaMismatchError(
      version ?? -1,
      SUPPORTED_SCHEMA_VERSIONS
    );
  }

  return { path, schemaVersion: version, db, close: () => db.close() };
}