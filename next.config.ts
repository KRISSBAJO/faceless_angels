import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Builds a small self-contained server for the Docker image.
  // Calls to /api are passed on by src/app/api/[...path]/route.ts.
  output: "standalone",
};

export default nextConfig;
