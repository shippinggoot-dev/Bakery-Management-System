# Phase 2 — Shopify Product Variants

**Status:** Approved 2026-06-06. Option B chosen. Open questions resolved in §6.
**Audience:** project decision-makers. **Author:** engineering (Claude).
**Date written:** 2026-06-06.

---

## 1. Problem in one paragraph

A single Sucre Shopify product like `Custom-Kake — Razzle Dazzle / 40+ / Bryllup` encodes three axes inside Shopify's `variant_title`:

| Axis | Example | Meaning | Affects |
|---|---|---|---|
| Flavour | `Razzle Dazzle` | The sponge / filling style | Possibly ingredients |
| Size | `40+` | Serves 40 or more | **Price** |
| Occasion | `Bryllup` | Wedding | Decoration / addons |

Phase 1 (commits `692cccb` + `ea0528e`) added `recipes.shopify_titles[]` so one recipe can match many Shopify variant strings. That stops the "one recipe per variant" duplication, but it also flattens every variant into a single recipe — we lose the price differences, the per-variant ingredient changes, and the per-variant Shopify variant ID needed for accurate two-way sync. Phase 2 is about **modelling the variants properly** without throwing away the work in Phase 1.

---

## 2. What we have today (relevant parts)

| Table | What it is | Relevant columns |
|---|---|---|
| `recipes` | The thing the bakery makes. Has an ingredient list, a yield, an optional `sellingPrice`, and `shopifyTitles[]`. | `id`, `name`, `sellingPrice`, `shopifyTitles[]`, `shopifyVariantId` |
| `premade_cakes` | A parallel customer-facing catalog with a fixed price and an optional FK to a recipe (for margin calc). Already has variant-shaped helper tables but **no per-variant pricing**. | `id`, `basePrice`, `recipeId`, `shopifyVariantId` |
| `premade_cake_sizes` | Per-cake size labels. **Descriptive only** — schema comment says "Sucre's pricing model is one flat price per SKU regardless of size." No price column. | `cakeId`, `label`, `serves` |
| `flavours` + `premade_cake_flavours` | Shared lookup of flavour profiles + M:N to cakes. | |
| `cake_addons` + `premade_cake_addons` | Shared lookup of paid addons + M:N to cakes. | |
| `cake_orders` | Incoming customer orders. **Recipe is the only fulfillment link.** | `recipeId` (nullable), `shopifyLineItemTitle` |
| `production_schedules` | Baking calendar. **Recipe is the only production link.** | `recipeId` |

Two important facts that constrain the redesign:

1. `production_schedules.recipeId` is the unit the bakery actually bakes from. Whatever we do, an order must dereference to a recipe so it can be scheduled and costed.
2. `premade_cake_sizes` exists but has no price column. It cannot, today, represent "40+ = 2400 NOK, 25+ = 1800 NOK." Any solution involving premade cakes must add per-variant pricing.

---

## 3. The three options (re-stated and assessed)

### Option A — Extend recipes with variant junction tables

Add `recipe_sizes`, `recipe_flavours`, `recipe_occasions` (or one combined `recipe_variants` table). Make `cake_orders.recipeVariantId` the new fulfillment FK. Keep recipes as the canonical fulfillment unit.

| Pros | Cons |
|---|---|
| One model for "stuff we make." | Recipes become two different things at once: a cost-engineering construct (ingredients × yield) AND a customer catalog construct (variants × prices). That's the same conflation we already split into `recipes` + `premade_cakes`. |
| `production_schedules.recipeId` doesn't have to change. | Throws away the variant scaffolding already in `premade_cakes` — we'd be building it twice. |
| | The "Razzle Dazzle wedding cake" already feels more like a *catalog item* than a *recipe*. A recipe is the underlying sponge formula. |

**Verdict:** rejected. We already concluded once that catalog ≠ recipe by introducing premade cakes. Recreating variants on the recipe side undoes that.

---

### Option B — Make premade cakes the variant home (recommended)

When a Shopify import sees a product with variants in `variant_title`, create a `premade_cake` row with a new `premade_cake_variants` table underneath it. Each variant carries its own price, its own Shopify variant ID, and its own optional ingredient-recipe link for cost. `cake_orders` gains a nullable `premadeCakeVariantId` alongside `recipeId`; an order points at exactly one of them.

| Pros | Cons |
|---|---|
| Premade cakes already exist as the customer-catalog primitive. We're filling in a gap, not inventing a new table. | `cake_orders` ends up with a "one of two FKs" constraint — a bit ugly. |
| Recipes stay focused on cost + production. Premade cakes own price + Shopify variants. | We still need the existing `premade_cake_sizes`/`flavours`/`addons` story to make sense alongside the new variants table. Likely we deprecate `premade_cake_sizes` (it has no price column anyway) and let `premade_cake_variants` replace it. |
| Production scheduling barely changes — a variant points at a recipe, the recipe is what we bake. | Two flows in the planner: "create recipe" (simple Shopify product) vs "create premade cake with variants" (variant product). The user has to pick. |
| Phase 1's `recipes.shopify_titles[]` keeps working untouched for simple products. | |

**Verdict:** recommended. See §4 for details.

---

### Option C — Unify recipes and premade cakes

Collapse the two tables into one "product" table; variants on top; cost from optional ingredient list; production from optional recipe relationship.

| Pros | Cons |
|---|---|
| Conceptually the cleanest end state. | Touches every page that reads recipes or premade cakes (recipe book, planner, production calendar, nutrition labels, premade cake catalog, customers' favourite cakes, sales). |
| One source of truth for "things the bakery sells." | Real migration cost: every existing row, every existing FK, every existing UI page. Probably 2–3 weeks of work and a large surface area for regressions. |
| | Doesn't actually solve Phase 2 any faster than Option B does — variants are still net new schema either way. |

**Verdict:** parked. Worth revisiting in 6–12 months if the recipe / premade-cake split becomes painful. Not now.

---

## 4. Recommendation: Option B — full proposal

### 4.1 Schema changes

**New table — `premade_cake_variants`** (replaces `premade_cake_sizes` over time):

```ts
premade_cake_variants {
  id                     uuid PK
  cakeId                 uuid FK → premade_cakes.id  (CASCADE)
  /** Display label assembled from the Shopify variant, e.g. "Razzle Dazzle / 40+ / Bryllup" */
  label                  text NOT NULL
  /** Per-variant axes. NULL = the cake doesn't use that axis. */
  flavourId              uuid FK → flavours.id           (SET NULL, nullable)
  sizeLabel              text                            (e.g. "40+", "20cm — 18 servings")
  serves                 integer                         (when known)
  occasion               text                            (e.g. "Bryllup", "Bursdag")
  /** Per-variant price in NOK as text. */
  price                  text NOT NULL
  /** NOTE: there is no per-variant recipe override. Decided 2026-06-06:
   *  flavour swaps don't change the underlying recipe enough to justify
   *  maintaining N recipes per cake. Cost flows through the parent
   *  premade_cake.recipeId. A fondant / filling swap is modelled via
   *  the existing cake_addons mechanism, not via a different recipe. */
  /** Shopify two-way sync IDs for THIS variant. */
  shopifyVariantId       text
  shopifyInventoryItemId text
  /** Match key — the lowercase concatenation of the Shopify line-item
   *  title + " — " + variant_title we should match against on import. */
  shopifyMatchTitle      text
  isActive               boolean NOT NULL DEFAULT true
  displayOrder           integer NOT NULL DEFAULT 0
  createdAt              timestamp
  updatedAt              timestamp
}
INDEX (cakeId)
INDEX (shopifyVariantId)
INDEX (shopifyMatchTitle)        -- case-insensitive lookup during import
```

**Modify `cake_orders`:**

```sql
ALTER TABLE cake_orders
  ADD COLUMN premade_cake_variant_id uuid
    REFERENCES premade_cake_variants(id) ON DELETE SET NULL;

CREATE INDEX idx_cake_orders_premade_cake_variant_id
  ON cake_orders(premade_cake_variant_id);
```

`cake_orders.recipeId` stays. The rule (enforced in application code, not at DB level — Drizzle doesn't generate CHECK constraints cleanly and we want the flexibility): an order with a `premade_cake_variant_id` doesn't need a `recipeId`; the variant dereferences to one.

**Deprecate, do NOT drop yet, `premade_cake_sizes`.** It's read by the existing premade cake editor UI. We migrate by:
1. Adding `premade_cake_variants`.
2. Copying each existing `premade_cake_sizes` row into a one-axis variant (`label`, `sizeLabel`, `serves`) with `price = parent cake's basePrice`. No data loss.
3. Updating the editor UI to manage variants instead of sizes.
4. Dropping `premade_cake_sizes` in a follow-up PR once nothing reads it.

This staged drop keeps the schema migration reversible.

### 4.2 What the matcher needs to do

Today (`buildRecipeTitleLookup` in `shopify-order-mapping.ts`):

```
lowercase(item.title) → recipe.id
```

New behaviour:

```
1. Compute matchKey = lowercase(item.title + " — " + variant_title) if variant_title set,
                      otherwise lowercase(item.title)
2. Look up matchKey in a combined map that includes:
     a. premade_cake_variants.shopifyMatchTitle  → { kind: "variant",  id }
     b. recipes.name                              → { kind: "recipe",   id }
     c. recipes.shopifyTitles[]                   → { kind: "recipe",   id }
3. If hit kind=variant: order.premadeCakeVariantId = id, recipeId = null
   If hit kind=recipe:  order.recipeId = id (existing behaviour)
   If miss:             order is unlinked (existing behaviour)
```

`mapShopifyOrderToCakeOrderRows` grows a second optional lookup parameter and returns variantId or recipeId per row. The webhook and bulk import both construct the combined lookup once per request.

### 4.3 Planner "Create recipe from order" → "Create product from order"

Today the planner shows one button: **+ Create recipe**. It opens a modal pre-filled with the Shopify line-item title.

After Phase 2 the button becomes a chooser. Two paths from the same modal entry point:

**Path 1 — Simple product (no `variant_title` on the order's line items):**
- Same as today's flow. Creates a recipe, seeds `shopifyTitles[]`, auto-links sibling pending orders. No change.

**Path 2 — Variant product (the order had a `variant_title`):**
- The modal asks: "This Shopify product has variants. Create a premade cake with variants?"
- If yes: opens a richer form. User names the cake (e.g. "Razzle Dazzle Wedding Cake"), sets a description, optionally picks a base recipe (so cost flows through). Then the form lists every Shopify variant that's been seen on pending orders for this product, pre-fills `label` / `sizeLabel` / `serves` / `occasion` from the variant_title, asks the user to confirm a price per variant (pre-filled from the order's `salePrice`).
- On save: creates the premade cake, the variants, and updates every pending unlinked order whose `shopifyLineItemTitle + variant_title` matches one of the new variants.

We hold off on rebuilding the modal's UI as a chooser until after schema work is in place — the schema is the load-bearing decision; the modal is a follow-up.

### 4.4 Production scheduler

`production_schedules.recipeId` stays. When a premade-cake-variant-linked order is scheduled, the scheduler reads `variant.recipeId ?? variant.parentCake.recipeId` and uses that as the production recipe. If neither is set, the order can't be scheduled (UI shows "Link a recipe to this cake first").

This is the smallest possible change to the production side.

### 4.5 We need to extend `cake_orders` rows preserved on Shopify import

Right now `cake_orders.shopifyLineItemTitle` stores the **base product title only** (not + variant_title — see [shopify-order-mapping.ts:266](packages/api/src/lib/shopify-order-mapping.ts#L266) where this is intentional, so the recipe sibling-matcher works on base product).

For Phase 2 we add a sibling column:

```sql
ALTER TABLE cake_orders ADD COLUMN shopify_variant_title text;
```

The webhook + bulk import set both columns. Existing recipe-side sibling matching still uses `shopifyLineItemTitle`. The new variant-side matching uses both. No backfill required — old rows just won't have variant titles, which is fine.

---

## 5. Migration plan

Five PRs, each independently shippable, each behind no feature flag (this is pre-production scale; rollback = revert).

| PR | What | Schema? | Effort |
|---|---|---|---|
| 1 | Add `premade_cake_variants`, `cake_orders.premade_cake_variant_id`, `cake_orders.shopify_variant_title`. Drizzle schema + idempotent raw SQL migration in `packages/db/migrations/manual/`. NO behaviour change yet — empty tables, unused column. | Yes (additive only) | 0.5 day |
| 2 | Update the Shopify matcher (`shopify-order-mapping.ts`) to do combined lookup. Backend and webhook only. Bulk import endpoint updated. Existing recipe matches keep working. | No | 0.5 day |
| 3 | Update the planner modal to be a chooser: "simple recipe" vs "variant product." The variant flow creates a premade cake + variants and auto-links siblings. | No | 1.5 days |
| 4 | Update the premade cake editor UI (`/premade-cakes/[id]/edit`) to manage variants instead of sizes. Migrate existing `premade_cake_sizes` rows into one-axis variants. | No (data migration script only) | 1 day |
| 5 | Drop `premade_cake_sizes` (it has no readers left). Clean up. | Yes (destructive — `DROP TABLE`) | 0.5 day |

**Total honest estimate:** ~4 days of focused work, realistically 5 with i18n (every modal needs EN + NB keys per [CLAUDE.md](CLAUDE.md)), regression-testing all existing Bakeskole / Custom-Kake imports, and unblock-as-you-go bug fixing. Multi-day work. Don't compress.

PR 1 is the only one that has to land before any others. PRs 2–4 can be reviewed in series; PR 5 waits until PR 4 has been live long enough to confirm nothing else reads `premade_cake_sizes`.

---

## 6. Resolved decisions (2026-06-06)

1. **Per-variant ingredient changes — Resolved: shared recipe (a).** A flavour swap doesn't change the underlying recipe drastically enough to justify a different recipe per variant. Fondant / filling changes are handled as **paid addons** on top of a single base recipe (the existing `cake_addons` model). Consequence: dropped the `recipeId` override column from the `premade_cake_variants` schema in §4.1.
2. **`premade_cake_sizes` data migration — Resolved: nothing to preserve.** The catalog will be filled in once the system is complete, so the existing `premade_cake_sizes` rows are throwaway. PR 4's migration script becomes trivial (no row copy needed) and PR 5 can drop the table cleanly.
3. **Variant naming convention — Resolved: keep Shopify default.** Auto-generated labels read `flavour / size / occasion` to match what Sucre sees in Shopify.
4. **Bryllup (occasion) — Resolved: cake-level variant axis.** Occasion sits alongside size and flavour on the variant row, not in `cake_addons`. The wedding setup work is part of the variant's price; addons remain for true paid extras (gluten-free, extra topper, etc.).

---

## 7. What we are NOT doing in Phase 2

- We are **not** unifying recipes and premade cakes (Option C).
- We are **not** changing how production schedules work — recipes still drive baking.
- We are **not** adding inventory tracking per variant. The `shopifyInventoryItemId` column is there for future two-way sync but won't be wired up in Phase 2.
- We are **not** changing how orders without Shopify variants behave. Phase 1's flow is untouched.

These are deliberate cuts to keep Phase 2 shippable. Each can be its own phase later.
