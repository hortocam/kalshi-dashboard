import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Single-process standalone server (spec: FR-019 deployment shape; no Docker in MVP).
  output: "standalone",
};

export default nextConfig;