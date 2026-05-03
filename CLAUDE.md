# Bakery Management System — CLAUDE.md

## Stack

| Concern | Technology |
|---|---|
| Framework | Next.js 15 (App Router), React 19 |
| Monorepo | pnpm workspaces + Turborepo |
| Database | PostgreSQL via Supabase |
| ORM | Drizzle ORM (`drizzle-kit` for schema management) |
| API layer | tRPC v11 + Zod validation + superjson |
| Auth | Supabase Auth (`@supabase/ssr`, cookie-based sessions) |
| Data fetching | TanStack React Query v5 (client), tRPC server caller (RSC) |
| Styling | Tailwind CSS v3 + custom utility classes |
| i18n | next-intl v4 |
| Email | Resend |
| Deployment | Vercel |
| Runtime | Node ≥ 20, pnpm ≥ 9 |

## Monorepo Layout

```
apps/web/          Next.js application
packages/api/      tRPC router definitions (@bakery/api)
packages/db/       Drizzle schema, client, seed scripts (@bakery/db)
packages/scripts/  One-off utility scripts
```

## Data Fetching — Critical Rule

**Do not fetch data in async server components.** The tRPC server context calls `supabase.auth.getSession()` on every render. When Supabase auth is slow, server-side fetches block SSR and the page shows skeletons indefinitely.

**Always use client-side React Query instead:**

```tsx
// Correct — client component
"use client";
import { api } from "@/trpc/react";

export default function MyPage() {
  const { data = [], isLoading } = api.something.getAll.useQuery();
  if (isLoading) return <Skeleton />;
  return <>{data.map(...)}</>;
}
```

```tsx
// Broken — server component with async data fetch
import { api } from "@/trpc/server";

export default async function MyPage() {
  const data = await api.something.getAll(); // hangs if auth is slow
}
```

The Nutrition Labels page (`/nutrients/page.tsx`) is the canonical correct example. Pages that have been fixed: dashboard, ingredients, recipes.

## tRPC Conventions

- **Server caller** (`@/trpc/server`): use only in RSCs that genuinely need SSR. Context is cached per React render via `React.cache`.
- **Client hooks** (`@/trpc/react`): the default for all pages.
- **`publicProcedure`**: accessible to any user including anonymous; guard with `if (!ctx.user) return []`.
- **`protectedProcedure`**: throws `FORBIDDEN` if `ctx.user` is null or anonymous.
- Input validation uses Zod schemas defined at the top of each router file.

## Multi-tenancy Pattern

Every table has an `ownerId: uuid("owner_id")` column tied to `auth.users(id)`. Every query filters by `eq(table.ownerId, ctx.user.id)`. Never omit this filter — it is the only thing separating one bakery's data from another.

## Database Schema Changes — Do NOT Use `db:push` Blindly

`drizzle-kit push` will offer to drop columns it does not recognise (e.g. legacy columns). This is destructive in production.

**Safe workflow for schema changes:**
1. Update the Drizzle schema file in `packages/db/src/schema/`.
2. Apply only the specific change via raw SQL in the Supabase SQL Editor:
   ```sql
   ALTER TABLE my_table ADD COLUMN IF NOT EXISTS new_col uuid;
   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_name ON my_table(col);
   ```
3. Do not run `pnpm db:push` against the production database.

`db:generate` (produces migration SQL) and `db:studio` (local GUI) are safe.

## Auth Flow

- Middleware (`apps/web/src/middleware.ts`) runs on every request.
- Unauthenticated visitors are automatically signed in anonymously (demo mode).
- Real (non-anonymous) users must accept terms at `/consent` before accessing the app.
- Anonymous users are blocked from mutations by `protectedProcedure`.
- Session is read from cookies via `getSession()` — no Supabase network round-trip.

## Navigation — `prefetch={false}`

All `<Link>` components in the nav (`apps/web/src/components/nav.tsx`) have `prefetch={false}`. Without it, Next.js eagerly prefetches every visible nav link on page load, triggering parallel server-side auth calls and adding seconds to every page load. Apply the same to pages that render many links at once.

## Styling Conventions

Tailwind with a custom `brand-*` colour palette (rose/pink tones). Custom utility classes defined in `globals.css`:

| Class | Usage |
|---|---|
| `card` | White bordered rounded panel |
| `badge` | Small inline label chip |
| `page-title` | Main `<h2>` on a page |
| `section-title` | Secondary heading within a card |
| `form-input` | Styled `<input>`, `<select>`, `<textarea>` |
| `form-label` | Label above a form field |
| `table-header` | `<th>` in data tables |
| `btn-primary` | Primary action button |
| `btn-ghost` | Tertiary/cancel button |

Loading skeletons: `animate-pulse` wrapper with `bg-rose-100` placeholder divs.

## i18n

Translation keys live in `apps/web/src/messages/`. In server components use `getTranslations("namespace")` (async). In client components use `useTranslations("namespace")` (hook, import from `"next-intl"` not `"next-intl/server"`).

## Running Locally

```bash
pnpm dev          # start all apps (web on :3000)
pnpm build        # production build
pnpm db:studio    # Drizzle Studio GUI (local only)
pnpm db:generate  # generate migration SQL from schema changes
```

Required env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `DATABASE_URL`. Copy `.env.example` to `.env`.

## Route Map

| Route | Description |
|---|---|
| `/` | Dashboard (today summary + weekly KPIs) |
| `/ingredients` | Cost calculator / ingredient master |
| `/recipes` | Recipe book |
| `/recipes/[id]` | Recipe detail with cost breakdown |
| `/recipes/[id]/edit` | Edit recipe and ingredients |
| `/recipes/new` | Create recipe |
| `/nutrients` | Nutrition label generator |
| `/inventory` | Stock levels and receive deliveries |
| `/purchase-orders` | Supplier purchase orders |
| `/shopping-lists` | Generated shopping lists |
| `/suppliers` | Supplier directory |
| `/price-ingestion` | Import supplier price lists (CSV) |
| `/price-ingestion/invoice` | Import from invoice text / PDF |
| `/customers` | CRM / loyalty programme |
| `/production` | Production batch scheduling |
| `/planner` | Customer cake order planner |
| `/sales` | POS sales recording |
| `/social` | Instagram content planning |
| `/todos` | Task list |
| `/settings` | Workspace settings |
| `/library` | Manual nutrition label library (localStorage only) |
