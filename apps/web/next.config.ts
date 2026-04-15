import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  transpilePackages: ["@bakery/api", "@bakery/db"],
  serverExternalPackages: ["postgres"],
};

export default withNextIntl(nextConfig);
