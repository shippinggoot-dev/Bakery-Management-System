import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@bakery/api", "@bakery/db"],
  serverExternalPackages: ["postgres"],
};

export default nextConfig;
