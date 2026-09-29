import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Builds a small self-contained server for the Docker image.
  // Calls to /api are passed on by src/app/api/[...path]/route.ts.
  output: "standalone",
  // On Vercel, proxy /api at the routing layer. The Route Handler above runs
  // as a Function there and cannot accept this app's 8 MB documents or
  // 20 MB Word imports. The browser still uses same-origin /api URLs, so its
  // session cookie continues to work.
  async rewrites() {
    if (process.env.VERCEL !== "1") return [];
    const apiUrl = process.env.API_URL?.trim().replace(/\/$/, "");
    if (!apiUrl || !apiUrl.startsWith("https://")) {
      throw new Error("Set API_URL to the public HTTPS Render API URL on Vercel.");
    }
    return {
      beforeFiles: [
        { source: "/api/:path*", destination: `${apiUrl}/api/:path*` },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
