import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // generateBuildId: explicitly set to satisfy Next.js 16.x config schema.
  // Without this, builds run in the GSD task runner environment (which sets
  // __NEXT_PRIVATE_STANDALONE_CONFIG from a parent project) would use that
  // JSON-serialized config which strips functions. This is a safety net.
  generateBuildId: () => null,
};

export default nextConfig;
