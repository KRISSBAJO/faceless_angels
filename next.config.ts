import type { NextConfig } from "next";

let output: "standalone" | undefined;
if (!process.env.VERCEL) output = "standalone";

const nextConfig: NextConfig = {
  // Docker needs a self-contained server; Vercel packages Next.js itself.
  output,
  // On Vercel, proxy /api at the routing layer. The Route Handler above runs
  // as a Function there and cannot accept this app's 8 MB documents or
  // 20 MB Word imports. The browser still uses same-origin /api URLs, so its
  // session cookie continues to work.
  async rewrites() {
    if (!process.env.VERCEL) return [];
    const apiUrl = process.env.API_URL?.trim().replace(/\/$/, "");
    if (!apiUrl) {
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
