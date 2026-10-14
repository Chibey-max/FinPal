import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ["@finpal/backend", "@finpal/contracts", "@finpal/ui"],
};

export default nextConfig;
