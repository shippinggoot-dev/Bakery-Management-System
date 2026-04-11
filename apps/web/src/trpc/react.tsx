"use client";

import { createTRPCReact, type CreateTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "@bakery/api";

/** Client-side tRPC hooks — use inside "use client" components */
export const api: CreateTRPCReact<AppRouter, unknown> = createTRPCReact<AppRouter>();
