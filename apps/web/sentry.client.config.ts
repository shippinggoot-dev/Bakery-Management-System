import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Only send errors from real deployments. Dev errors create noise and
  // confuse the signal when something genuinely breaks in production.
  enabled: process.env.NODE_ENV === "production",

  // Performance tracing disabled — adds load + cost, not currently useful.
  // Flip to a small number (e.g. 0.05) if we ever need request timing data.
  tracesSampleRate: 0,

  // Session replay disabled per privacy agreement. Will be enabled
  // opt-in via a workspace setting in a follow-up change.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
});
