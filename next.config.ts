import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The API sets the session cookie, so the browser must reach it on this origin.
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.API_URL ?? "http://localhost:4010"}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
