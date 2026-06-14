import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle (.next/standalone) for the Docker image.
  output: "standalone",
  // better-sqlite3 is a native module; keep it external so Next doesn't try to
  // bundle the .node binary into the server build.
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
