export const dynamic = "force-dynamic";

export async function GET() {
  const url = process.env.DATABASE_URL;
  return Response.json({
    hasDbUrl:    !!url,
    length:      url?.length ?? 0,
    startsWith:  url?.slice(0, 30) ?? null,
    endsWith:    url?.slice(-15) ?? null,
    region:      process.env.VERCEL_REGION ?? "local",
    nodeEnv:     process.env.NODE_ENV,
  });
}
