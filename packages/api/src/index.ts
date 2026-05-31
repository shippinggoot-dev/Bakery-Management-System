export { appRouter, type AppRouter } from "./root";
export { createTRPCContext, createCallerFactory, type TRPCUser } from "./trpc";
// Re-export AI tier types so consumers (apps/web) can resolve them without
// reaching into ./src/lib/. Required because tRPC infers return types
// across the package boundary and TS needs a portable path.
export type { TierId, AiFeature, TierQuota } from "./lib/ai-tiers";
