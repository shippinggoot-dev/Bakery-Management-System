import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/**
 * Content-Security-Policy — shipped in Report-Only mode first.
 *
 * Browsers will report violations to the console but NOT block anything,
 * so we can monitor a week or two for genuine breakages (a third-party
 * script we forgot, an inline handler somewhere) before flipping to
 * enforcement by renaming the header to `Content-Security-Policy`.
 *
 * Directives:
 *   default-src 'self'          — same-origin by default
 *   script-src  'self' 'unsafe-inline'
 *                               — Next.js inlines bootstrap scripts; tighten
 *                                 with nonces later
 *   style-src   'self' 'unsafe-inline'
 *                               — Tailwind + Next.js inline styles
 *   img-src     'self' https: data: blob:
 *                               — user-uploaded images come from arbitrary
 *                                 https hosts (Supabase Storage, Instagram CDN);
 *                                 data: covers QR codes, blob: covers previews
 *   connect-src                 — XHR/WebSocket targets: Supabase REST + Realtime,
 *                                 Meta Graph (Instagram publish), Shopify Admin
 *   font-src    'self' data:
 *   frame-ancestors 'none'      — equivalent to X-Frame-Options: DENY
 */
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' https: data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://graph.facebook.com https://graph.instagram.com https://*.myshopify.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const SECURITY_HEADERS = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Frame-Options",        value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy",        value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  // Report-Only — switch to "Content-Security-Policy" after a monitoring
  // window confirms no real violations.
  { key: "Content-Security-Policy-Report-Only", value: CSP_REPORT_ONLY },
];

const nextConfig: NextConfig = {
  transpilePackages: ["@bakery/api", "@bakery/db"],
  serverExternalPackages: ["postgres"],

  // Allowlist of remote image hosts permitted by next/image. Keeps an
  // attacker from using the optimizer as an open image proxy.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "scontent.cdninstagram.com" },
      { protocol: "https", hostname: "*.cdninstagram.com" },
      { protocol: "https", hostname: "*.fbcdn.net" },
    ],
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
