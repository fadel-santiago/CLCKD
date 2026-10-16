import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Starting the app must not rewrite the repository's maintained AGENTS.md.
  agentRules: false,
};

export default nextConfig;
