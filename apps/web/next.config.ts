import type { NextConfig } from "next";

// Pre-/app routes, kept so old links and bookmarks still land somewhere.
const legacyRoutes: [string, string][] = [
  ["/dashboard", "/app"],
  ["/approvals", "/app/review"],
  ["/calendar", "/app/calendar"],
  ["/proposals/new", "/app/proposals/new"],
  ["/settings", "/app/constraints"],
];

// The calendar page loads Bryntum's obfuscated trial bundle, which can
// inject third-party analytics and call home. This policy confines that
// page to our own origin: scripts, connections and styles from 'self' only.
const calendarPolicy = [
  "default-src 'self'",
  // Next's inline bootstrap needs 'unsafe-inline'; dev refresh needs eval.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob:",
  // ws: for the dev server's hot reload.
  "connect-src 'self' ws: wss:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ["@finpal/backend", "@finpal/contracts", "@finpal/ui"],
  // The vendor route reads Bryntum's prebuilt files at runtime; include
  // them in the standalone output.
  outputFileTracingIncludes: {
    "/vendor/bryntum/**": [
      "./node_modules/@bryntum/calendar/{package.json,calendar.umd.js,calendar.css,svalbard-light.css}",
      "./node_modules/@bryntum/calendar/fontawesome/**/*",
    ],
  },
  async headers() {
    return [
      {
        source: "/app/calendar",
        headers: [{ key: "Content-Security-Policy", value: calendarPolicy }],
      },
    ];
  },
  async redirects() {
    return legacyRoutes.map(([source, destination]) => ({
      source,
      destination,
      permanent: true,
    }));
  },
};

export default nextConfig;
