import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Single-process standalone server (spec: FR-019 deployment shape; no Docker in MVP).
  output: "standalone",
  // Pin outputFileTracingRoot to this workspace so Next's trace step picks the
  // correct lockfile under worktrees. Next.js infers the wrong root when a
  // sibling worktree carries its own package-lock.json (CI runs from the
  // main checkout, dev worktrees fork the lockfile). See README "Worktree
  // notes" for the why.
  outputFileTracingRoot: path.join(process.cwd()),
};

export default nextConfig;
