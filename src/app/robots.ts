import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Private pages. They need sign-in anyway; this keeps them out of results.
      disallow: [
        "/admin",
        "/review",
        "/account",
        "/requests",
        "/giving",
        "/prayer/mine",
        "/prayer/team",
        "/journal/studio",
        "/journal/library",
        "/api/",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
