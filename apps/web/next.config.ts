import type { NextConfig } from "next";

// Pre-/app routes, kept so old links and bookmarks still land somewhere.
const legacyRoutes: [string, string][] = [
  ["/dashboard", "/app"],
  ["/approvals", "/app/review"],
  ["/calendar", "/app/calendar"],
  ["/proposals/new", "/app/proposals/new"],
  ["/settings", "/app/constraints"],
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ["@finpal/backend", "@finpal/contracts", "@finpal/ui"],
  async redirects() {
    return legacyRoutes.map(([source, destination]) => ({
      source,
      destination,
      permanent: true,
    }));
  },
};

export default nextConfig;
