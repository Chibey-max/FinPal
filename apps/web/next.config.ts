import type { NextConfig } from "next";

// Pre-/app routes, kept so old links and bookmarks still land somewhere.
const legacyRoutes: [string, string][] = [
  ["/dashboard", "/app"],
  ["/approvals", "/app/purchases?view=needs"],
  ["/calendar", "/app/rules"],
  ["/proposals/new", "/app"],
  ["/settings", "/app/rules"],
];

// Screens merged into Agent, Purchases and Rules. Not permanent, so they can
// still change while the app settles.
const mergedRoutes: [string, string][] = [
  ["/app/agent", "/app"],
  ["/app/decisions", "/app/purchases"],
  ["/app/decisions/:id", "/app/purchases/:id"],
  ["/app/review", "/app/purchases?view=needs"],
  ["/app/payments", "/app/purchases?view=active"],
  ["/app/activity", "/app/purchases?view=log"],
  ["/app/constraints", "/app/rules"],
  ["/app/calendar", "/app/rules"],
];

// The Rules page loads Bryntum's obfuscated trial bundle, which can inject
// third-party analytics and call home. This policy confines the signed-in app
// to our own origin: scripts, connections and styles from 'self' only. It
// covers all of /app because in-app navigation keeps the first page's policy.
const appPolicy = [
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
        source: "/app/:path*",
        headers: [{ key: "Content-Security-Policy", value: appPolicy }],
      },
      // Lets apps/mobile's browser preview (another origin) read the API in
      // development. Native apps are not subject to CORS, and production
      // sends no such header.
      ...(process.env.NODE_ENV === "production"
        ? []
        : [
            {
              source: "/api/v1/:path*",
              headers: [{ key: "Access-Control-Allow-Origin", value: "*" }],
            },
          ]),
    ];
  },
  async redirects() {
    return [
      ...legacyRoutes.map(([source, destination]) => ({
        source,
        destination,
        permanent: true,
      })),
      ...mergedRoutes.map(([source, destination]) => ({
        source,
        destination,
        permanent: false,
      })),
    ];
  },
};

export default nextConfig;
