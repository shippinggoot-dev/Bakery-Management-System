import { notFound } from "next/navigation";
import { DiagnosticsClient } from "./DiagnosticsClient";

export const dynamic = "force-dynamic";

/**
 * Diagnostics page — gated by:
 *   1. DIAGNOSTICS_ENABLED=true env var (server-side, set in Vercel)
 *   2. ?debug=1 query parameter (URL gate)
 * Both must be true. Otherwise the route returns a standard 404.
 */
export default async function DiagnosticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const debugFlag = Array.isArray(params.debug) ? params.debug[0] : params.debug;

  if (process.env.DIAGNOSTICS_ENABLED !== "true" || debugFlag !== "1") {
    notFound();
  }

  return <DiagnosticsClient />;
}
