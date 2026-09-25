/**
 * Homepage payload envelope — the one sanctioned JSON format for embedding
 * structured diagnostics in rendered failure states. JSON only, always an
 * object; arrays, scalars, and null are rejected on deserialize so a
 * malformed payload fails loudly instead of rendering half a state.
 */

export function serializeHomepageData(data: unknown): string {
  return JSON.stringify(data ?? null);
}

export function deserializeHomepageData(text: string): unknown {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("invalid homepage data payload: not JSON");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("invalid homepage data payload: expected an object");
  }
  return parsed;
}