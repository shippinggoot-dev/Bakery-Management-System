-- =====================================================================
-- Catch-up baseline schema (Phase 1 prerequisite)
--
-- This is an idempotent rewrite of packages/db/drizzle/0000_pretty_nehzno.sql.
-- Run it ONCE in the Supabase SQL Editor to bring the database up to the baseline
-- the codebase already assumes. Safe to re-run: every statement is IF NOT EXISTS
-- or wrapped in a DO block that swallows duplicate_object errors.
--
-- After this completes, run 2026-05-08_workflow_integrations.sql.
-- =====================================================================

CREATE TABLE IF NOT EXISTS "allergens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "allergens_name_unique" UNIQUE("name")
);

CREATE TABLE IF NOT EXISTS "ingredient_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	CONSTRAINT "ingredient_categories_name_unique" UNIQUE("name")
);

CREATE TABLE IF NOT EXISTS "ingredients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid,
	"name" text NOT NULL,
	"unit" text NOT NULL,
	"category_id" uuid,
	"notes" text,
	"par_level" text,
	"reorder_point" text,
	"current_stock" text DEFAULT '0',
	"calories_kcal" text,
	"protein_g" text,
	"fat_total_g" text,
	"fat_saturated_g" text,
	"carbs_total_g" text,
	"carbs_sugars_g" text,
	"fiber_g" text,
	"sodium_mg" text,
	"grams_per_unit" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "ingredient_allergens" (
	"ingredient_id" uuid NOT NULL,
	"allergen_id" uuid NOT NULL,
	CONSTRAINT "ingredient_allergens_ingredient_id_allergen_id_pk" PRIMARY KEY("ingredient_id","allergen_id")
);

CREATE TABLE IF NOT EXISTS "ingredient_suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ingredient_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"is_preferred" boolean DEFAULT false NOT NULL,
	"sku" text,
	"moq" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid,
	"name" text NOT NULL,
	"contact_name" text,
	"email" text,
	"phone" text,
	"address" text,
	"lead_time_days" integer,
	"payment_terms" text,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "supplier_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" uuid NOT NULL,
	"ingredient_id" uuid NOT NULL,
	"price_per_unit" text NOT NULL,
	"unit" text NOT NULL,
	"min_order_qty" text,
	"lead_time_days" integer,
	"is_preferred" boolean DEFAULT false NOT NULL,
	"valid_from" text,
	"valid_to" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "price_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ingredient_supplier_id" uuid NOT NULL,
	"price_per_unit" text NOT NULL,
	"currency" text DEFAULT 'NOK' NOT NULL,
	"recorded_at" timestamp DEFAULT now() NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"notes" text
);

CREATE TABLE IF NOT EXISTS "lots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ingredient_id" uuid NOT NULL,
	"supplier_id" uuid,
	"lot_number" text,
	"quantity" text NOT NULL,
	"unit" text NOT NULL,
	"expiry_date" text,
	"received_at" timestamp DEFAULT now() NOT NULL,
	"status" text DEFAULT 'available' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "recipe_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	CONSTRAINT "recipe_categories_name_unique" UNIQUE("name")
);

CREATE TABLE IF NOT EXISTS "recipe_ingredients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_id" uuid NOT NULL,
	"ingredient_id" uuid NOT NULL,
	"quantity" text NOT NULL,
	"unit" text NOT NULL,
	"notes" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_optional" boolean DEFAULT false NOT NULL,
	"substitute_ingredient_id" uuid
);

CREATE TABLE IF NOT EXISTS "recipes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"category_id" uuid,
	"yield_amount" text NOT NULL,
	"yield_unit" text NOT NULL,
	"prep_time_minutes" integer,
	"bake_time_minutes" integer,
	"instructions" text,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"selling_price" text,
	"flavours" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "purchase_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"ingredient_id" uuid NOT NULL,
	"quantity" text NOT NULL,
	"unit" text NOT NULL,
	"unit_price" text,
	"total_price" text,
	"notes" text
);

CREATE TABLE IF NOT EXISTS "purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid,
	"supplier_id" uuid NOT NULL,
	"order_number" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"ordered_at" timestamp,
	"expected_delivery_at" timestamp,
	"delivered_at" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_orders_order_number_unique" UNIQUE("order_number")
);

CREATE TABLE IF NOT EXISTS "shopping_list_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shopping_list_id" uuid NOT NULL,
	"ingredient_id" uuid NOT NULL,
	"quantity_needed" text NOT NULL,
	"unit" text NOT NULL,
	"quantity_on_hand" text DEFAULT '0' NOT NULL,
	"quantity_to_purchase" text DEFAULT '0' NOT NULL,
	"is_purchased" boolean DEFAULT false NOT NULL,
	"notes" text
);

CREATE TABLE IF NOT EXISTS "shopping_lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"due_date" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "price_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ingredient_id" uuid NOT NULL,
	"ingredient_name" text NOT NULL,
	"old_price_nok" text NOT NULL,
	"new_price_nok" text NOT NULL,
	"old_store" text,
	"new_store" text NOT NULL,
	"detected_at" timestamp DEFAULT now() NOT NULL,
	"dismissed_at" timestamp
);

CREATE TABLE IF NOT EXISTS "price_ingestion_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"source" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"file_name" text,
	"item_count" integer DEFAULT 0,
	"matched_count" integer DEFAULT 0,
	"applied_count" integer DEFAULT 0,
	"error_message" text,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);

CREATE TABLE IF NOT EXISTS "price_ingestion_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"raw_name" text NOT NULL,
	"raw_price" text,
	"raw_unit" text,
	"raw_quantity" text,
	"ingredient_id" uuid,
	"supplier_id" uuid,
	"match_score" text,
	"price_per_unit" text,
	"unit" text,
	"applied" boolean DEFAULT false NOT NULL,
	"confirmed" boolean DEFAULT false NOT NULL,
	"rejected" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "margin_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"min_margin_pct" text DEFAULT '20' NOT NULL,
	"price_rise_threshold_pct" text DEFAULT '5' NOT NULL,
	"webhook_url" text,
	"webhook_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "margin_settings_owner_id_unique" UNIQUE("owner_id")
);

CREATE TABLE IF NOT EXISTS "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"payload" text,
	"read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "production_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"recipe_id" uuid NOT NULL,
	"scale_factor" text DEFAULT '1' NOT NULL,
	"yield_amount" text NOT NULL,
	"yield_unit" text NOT NULL,
	"produced_at" timestamp DEFAULT now() NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "waste_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"ingredient_id" uuid NOT NULL,
	"lot_id" uuid,
	"quantity" text NOT NULL,
	"unit" text NOT NULL,
	"reason" text DEFAULT 'other' NOT NULL,
	"notes" text,
	"logged_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"ingredient_id" uuid NOT NULL,
	"lot_id" uuid,
	"type" text NOT NULL,
	"quantity_delta" text NOT NULL,
	"stock_after" text NOT NULL,
	"unit" text NOT NULL,
	"reference_id" uuid,
	"reference_type" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"card_number" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"phone" text,
	"email" text,
	"birthday" text,
	"dietary_requirements" text,
	"favourite_category" text,
	"loyalty_opt_in" boolean DEFAULT false NOT NULL,
	"marketing_opt_in" boolean DEFAULT false NOT NULL,
	"consent_timestamp" timestamp,
	"points" integer DEFAULT 0 NOT NULL,
	"lifetime_points" integer DEFAULT 0 NOT NULL,
	"total_spend" text DEFAULT '0' NOT NULL,
	"tier" text DEFAULT 'bronze' NOT NULL,
	"last_visit_at" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "loyalty_tiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"min_points" integer DEFAULT 0 NOT NULL,
	"multiplier" text DEFAULT '1.0' NOT NULL,
	"color" text DEFAULT '#CD7F32' NOT NULL,
	"perks" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "loyalty_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"type" text NOT NULL,
	"points_delta" integer NOT NULL,
	"balance_after" integer NOT NULL,
	"reference_id" uuid,
	"reference_type" text,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "rewards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"type" text NOT NULL,
	"description" text NOT NULL,
	"discount_pct" integer,
	"free_item_description" text,
	"points_required" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"valid_from" timestamp DEFAULT now() NOT NULL,
	"valid_until" timestamp NOT NULL,
	"redeemed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "customer_segment_members" (
	"segment_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"added_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "customer_segment_members_segment_id_customer_id_pk" PRIMARY KEY("segment_id","customer_id")
);

CREATE TABLE IF NOT EXISTS "customer_segments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"criteria" text DEFAULT '{}' NOT NULL,
	"member_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "customer_sales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"customer_id" uuid,
	"amount" text NOT NULL,
	"currency" text DEFAULT 'NOK' NOT NULL,
	"items" text,
	"points_awarded" integer DEFAULT 0 NOT NULL,
	"reward_redeemed_id" uuid,
	"notes" text,
	"sold_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "shopify_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"shop_domain" text NOT NULL,
	"access_token" text NOT NULL,
	"shop_name" text,
	"shop_email" text,
	"is_connected" boolean DEFAULT false NOT NULL,
	"sync_products" boolean DEFAULT true NOT NULL,
	"sync_orders" boolean DEFAULT false NOT NULL,
	"webhook_secret" text,
	"last_sync_at" timestamp,
	"last_customer_import_at" timestamp,
	"last_order_import_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "shopify_settings_owner_id_unique" UNIQUE("owner_id")
);

CREATE TABLE IF NOT EXISTS "todos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"completed" boolean DEFAULT false NOT NULL,
	"due_date" text,
	"priority" text DEFAULT 'medium' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "cake_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"customer_name" text,
	"customer_email" text,
	"recipe_id" uuid,
	"quantity" text DEFAULT '1' NOT NULL,
	"due_date" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"payment_status" text DEFAULT 'pending' NOT NULL,
	"shopify_order_id" text,
	"shopify_order_number" text,
	"sale_price" text,
	"notes" text,
	"cake_style" text,
	"cake_format" text,
	"sponge_flavours" text,
	"frostings" text,
	"fillings" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "email_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"from_name" text,
	"from_email" text,
	"resend_api_key" text,
	"send_confirmations" boolean DEFAULT false NOT NULL,
	"send_status_updates" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "email_settings_owner_id_unique" UNIQUE("owner_id")
);

CREATE TABLE IF NOT EXISTS "production_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"recipe_id" uuid,
	"recipe_name" text,
	"scheduled_date" date NOT NULL,
	"shift" text DEFAULT 'morning' NOT NULL,
	"batch_count" numeric DEFAULT '1' NOT NULL,
	"notes" text,
	"status" text DEFAULT 'planned' NOT NULL,
	"assigned_to" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "other_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"supplier_id" uuid,
	"item_name" text NOT NULL,
	"quantity" text NOT NULL,
	"unit" text DEFAULT 'pcs' NOT NULL,
	"lot_number" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "instagram_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"ig_user_id" text NOT NULL,
	"ig_username" text,
	"page_id" text,
	"page_name" text,
	"access_token" text NOT NULL,
	"token_expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "instagram_connections_owner_id_unique" UNIQUE("owner_id")
);

CREATE TABLE IF NOT EXISTS "instagram_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"ig_media_id" text,
	"caption" text,
	"image_url" text,
	"status" text DEFAULT 'posted' NOT NULL,
	"error_message" text,
	"posted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "custom_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"field_key" text NOT NULL,
	"value" text NOT NULL,
	"use_count" integer DEFAULT 1 NOT NULL,
	"last_used_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "cake_addons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price_delta" text DEFAULT '0' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "flavours" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "premade_cake_addons" (
	"cake_id" uuid NOT NULL,
	"addon_id" uuid NOT NULL,
	CONSTRAINT "premade_cake_addons_cake_id_addon_id_pk" PRIMARY KEY("cake_id","addon_id")
);

CREATE TABLE IF NOT EXISTS "premade_cake_flavours" (
	"cake_id" uuid NOT NULL,
	"flavour_id" uuid NOT NULL,
	CONSTRAINT "premade_cake_flavours_cake_id_flavour_id_pk" PRIMARY KEY("cake_id","flavour_id")
);

CREATE TABLE IF NOT EXISTS "premade_cake_sizes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cake_id" uuid NOT NULL,
	"label" text NOT NULL,
	"diameter_cm" integer,
	"height_cm" integer,
	"serves" integer,
	"display_order" integer DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS "premade_cakes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"base_price" text NOT NULL,
	"lead_time_days" integer DEFAULT 0 NOT NULL,
	"recipe_id" uuid,
	"allergens" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_category_id_ingredient_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."ingredient_categories"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ingredient_allergens" ADD CONSTRAINT "ingredient_allergens_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ingredient_allergens" ADD CONSTRAINT "ingredient_allergens_allergen_id_allergens_id_fk" FOREIGN KEY ("allergen_id") REFERENCES "public"."allergens"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ingredient_suppliers" ADD CONSTRAINT "ingredient_suppliers_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ingredient_suppliers" ADD CONSTRAINT "ingredient_suppliers_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "supplier_prices" ADD CONSTRAINT "supplier_prices_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "supplier_prices" ADD CONSTRAINT "supplier_prices_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "price_history" ADD CONSTRAINT "price_history_ingredient_supplier_id_ingredient_suppliers_id_fk" FOREIGN KEY ("ingredient_supplier_id") REFERENCES "public"."ingredient_suppliers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "lots" ADD CONSTRAINT "lots_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "lots" ADD CONSTRAINT "lots_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_substitute_ingredient_id_ingredients_id_fk" FOREIGN KEY ("substitute_ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "recipes" ADD CONSTRAINT "recipes_category_id_recipe_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."recipe_categories"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "shopping_list_items" ADD CONSTRAINT "shopping_list_items_shopping_list_id_shopping_lists_id_fk" FOREIGN KEY ("shopping_list_id") REFERENCES "public"."shopping_lists"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "shopping_list_items" ADD CONSTRAINT "shopping_list_items_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "price_alerts" ADD CONSTRAINT "price_alerts_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "price_ingestion_items" ADD CONSTRAINT "price_ingestion_items_session_id_price_ingestion_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."price_ingestion_sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "price_ingestion_items" ADD CONSTRAINT "price_ingestion_items_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "price_ingestion_items" ADD CONSTRAINT "price_ingestion_items_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "production_batches" ADD CONSTRAINT "production_batches_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "waste_logs" ADD CONSTRAINT "waste_logs_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "waste_logs" ADD CONSTRAINT "waste_logs_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "rewards" ADD CONSTRAINT "rewards_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "customer_segment_members" ADD CONSTRAINT "customer_segment_members_segment_id_customer_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."customer_segments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "customer_segment_members" ADD CONSTRAINT "customer_segment_members_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "customer_sales" ADD CONSTRAINT "customer_sales_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "cake_orders" ADD CONSTRAINT "cake_orders_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "production_schedules" ADD CONSTRAINT "production_schedules_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "premade_cake_addons" ADD CONSTRAINT "premade_cake_addons_cake_id_premade_cakes_id_fk" FOREIGN KEY ("cake_id") REFERENCES "public"."premade_cakes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "premade_cake_addons" ADD CONSTRAINT "premade_cake_addons_addon_id_cake_addons_id_fk" FOREIGN KEY ("addon_id") REFERENCES "public"."cake_addons"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "premade_cake_flavours" ADD CONSTRAINT "premade_cake_flavours_cake_id_premade_cakes_id_fk" FOREIGN KEY ("cake_id") REFERENCES "public"."premade_cakes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "premade_cake_flavours" ADD CONSTRAINT "premade_cake_flavours_flavour_id_flavours_id_fk" FOREIGN KEY ("flavour_id") REFERENCES "public"."flavours"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "premade_cake_sizes" ADD CONSTRAINT "premade_cake_sizes_cake_id_premade_cakes_id_fk" FOREIGN KEY ("cake_id") REFERENCES "public"."premade_cakes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "premade_cakes" ADD CONSTRAINT "premade_cakes_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "idx_ingredients_owner_id" ON "ingredients" USING btree ("owner_id");

CREATE INDEX IF NOT EXISTS "idx_ingredients_category_id" ON "ingredients" USING btree ("category_id");

CREATE INDEX IF NOT EXISTS "idx_ingredients_name" ON "ingredients" USING btree ("name");

CREATE INDEX IF NOT EXISTS "idx_ingredient_suppliers_ingredient_id" ON "ingredient_suppliers" USING btree ("ingredient_id");

CREATE INDEX IF NOT EXISTS "idx_ingredient_suppliers_supplier_id" ON "ingredient_suppliers" USING btree ("supplier_id");

CREATE INDEX IF NOT EXISTS "idx_ingredient_suppliers_is_preferred" ON "ingredient_suppliers" USING btree ("is_preferred");

CREATE INDEX IF NOT EXISTS "idx_suppliers_name" ON "suppliers" USING btree ("name");

CREATE INDEX IF NOT EXISTS "idx_suppliers_is_active" ON "suppliers" USING btree ("is_active");

CREATE INDEX IF NOT EXISTS "idx_supplier_prices_supplier_id" ON "supplier_prices" USING btree ("supplier_id");

CREATE INDEX IF NOT EXISTS "idx_supplier_prices_ingredient_id" ON "supplier_prices" USING btree ("ingredient_id");

CREATE INDEX IF NOT EXISTS "idx_supplier_prices_is_preferred" ON "supplier_prices" USING btree ("is_preferred");

CREATE INDEX IF NOT EXISTS "idx_price_history_ingredient_supplier_id" ON "price_history" USING btree ("ingredient_supplier_id");

CREATE INDEX IF NOT EXISTS "idx_price_history_recorded_at" ON "price_history" USING btree ("recorded_at");

CREATE INDEX IF NOT EXISTS "idx_price_history_source" ON "price_history" USING btree ("source");

CREATE INDEX IF NOT EXISTS "idx_lots_ingredient_id" ON "lots" USING btree ("ingredient_id");

CREATE INDEX IF NOT EXISTS "idx_lots_supplier_id" ON "lots" USING btree ("supplier_id");

CREATE INDEX IF NOT EXISTS "idx_lots_status" ON "lots" USING btree ("status");

CREATE INDEX IF NOT EXISTS "idx_lots_expiry_date" ON "lots" USING btree ("expiry_date");

CREATE INDEX IF NOT EXISTS "idx_lots_received_at" ON "lots" USING btree ("received_at");

CREATE INDEX IF NOT EXISTS "idx_recipe_ingredients_recipe_id" ON "recipe_ingredients" USING btree ("recipe_id");

CREATE INDEX IF NOT EXISTS "idx_recipe_ingredients_ingredient_id" ON "recipe_ingredients" USING btree ("ingredient_id");

CREATE INDEX IF NOT EXISTS "idx_recipes_owner_active" ON "recipes" USING btree ("owner_id","is_active");

CREATE INDEX IF NOT EXISTS "idx_recipes_category_id" ON "recipes" USING btree ("category_id");

CREATE INDEX IF NOT EXISTS "idx_recipes_is_active" ON "recipes" USING btree ("is_active");

CREATE INDEX IF NOT EXISTS "idx_recipes_name" ON "recipes" USING btree ("name");

CREATE INDEX IF NOT EXISTS "idx_price_ingestion_sessions_owner_id" ON "price_ingestion_sessions" USING btree ("owner_id");

CREATE INDEX IF NOT EXISTS "idx_price_ingestion_sessions_status" ON "price_ingestion_sessions" USING btree ("status");

CREATE INDEX IF NOT EXISTS "idx_price_ingestion_sessions_started_at" ON "price_ingestion_sessions" USING btree ("started_at");

CREATE INDEX IF NOT EXISTS "idx_price_ingestion_items_session_id" ON "price_ingestion_items" USING btree ("session_id");

CREATE INDEX IF NOT EXISTS "idx_price_ingestion_items_ingredient_id" ON "price_ingestion_items" USING btree ("ingredient_id");

CREATE INDEX IF NOT EXISTS "idx_margin_settings_owner_id" ON "margin_settings" USING btree ("owner_id");

CREATE INDEX IF NOT EXISTS "idx_notifications_owner_id" ON "notifications" USING btree ("owner_id");

CREATE INDEX IF NOT EXISTS "idx_notifications_read" ON "notifications" USING btree ("read");

CREATE INDEX IF NOT EXISTS "idx_notifications_created_at" ON "notifications" USING btree ("created_at");

CREATE INDEX IF NOT EXISTS "idx_production_batches_owner_id" ON "production_batches" USING btree ("owner_id");

CREATE INDEX IF NOT EXISTS "idx_production_batches_recipe_id" ON "production_batches" USING btree ("recipe_id");

CREATE INDEX IF NOT EXISTS "idx_production_batches_produced_at" ON "production_batches" USING btree ("produced_at");

CREATE INDEX IF NOT EXISTS "idx_waste_logs_owner_id" ON "waste_logs" USING btree ("owner_id");

CREATE INDEX IF NOT EXISTS "idx_waste_logs_ingredient_id" ON "waste_logs" USING btree ("ingredient_id");

CREATE INDEX IF NOT EXISTS "idx_waste_logs_logged_at" ON "waste_logs" USING btree ("logged_at");

CREATE INDEX IF NOT EXISTS "idx_waste_logs_reason" ON "waste_logs" USING btree ("reason");

CREATE INDEX IF NOT EXISTS "idx_stock_movements_owner_id" ON "stock_movements" USING btree ("owner_id");

CREATE INDEX IF NOT EXISTS "idx_stock_movements_ingredient_id" ON "stock_movements" USING btree ("ingredient_id");

CREATE INDEX IF NOT EXISTS "idx_stock_movements_type" ON "stock_movements" USING btree ("type");

CREATE INDEX IF NOT EXISTS "idx_stock_movements_created_at" ON "stock_movements" USING btree ("created_at");

CREATE INDEX IF NOT EXISTS "idx_customers_owner_id" ON "customers" USING btree ("owner_id");

CREATE INDEX IF NOT EXISTS "idx_customers_phone" ON "customers" USING btree ("phone");

CREATE INDEX IF NOT EXISTS "idx_customers_email" ON "customers" USING btree ("email");

CREATE INDEX IF NOT EXISTS "idx_customers_tier" ON "customers" USING btree ("tier");

CREATE INDEX IF NOT EXISTS "idx_customers_last_visit_at" ON "customers" USING btree ("last_visit_at");

CREATE UNIQUE INDEX IF NOT EXISTS "idx_customers_card_number" ON "customers" USING btree ("card_number");

CREATE INDEX IF NOT EXISTS "idx_loyalty_tiers_owner_id" ON "loyalty_tiers" USING btree ("owner_id");

CREATE INDEX IF NOT EXISTS "idx_loyalty_transactions_customer_id" ON "loyalty_transactions" USING btree ("customer_id");

CREATE INDEX IF NOT EXISTS "idx_loyalty_transactions_owner_id" ON "loyalty_transactions" USING btree ("owner_id");

CREATE INDEX IF NOT EXISTS "idx_loyalty_transactions_type" ON "loyalty_transactions" USING btree ("type");

CREATE INDEX IF NOT EXISTS "idx_loyalty_transactions_created_at" ON "loyalty_transactions" USING btree ("created_at");

CREATE INDEX IF NOT EXISTS "idx_rewards_customer_id" ON "rewards" USING btree ("customer_id");

CREATE INDEX IF NOT EXISTS "idx_rewards_owner_id" ON "rewards" USING btree ("owner_id");

CREATE INDEX IF NOT EXISTS "idx_rewards_status" ON "rewards" USING btree ("status");

CREATE INDEX IF NOT EXISTS "idx_rewards_valid_until" ON "rewards" USING btree ("valid_until");

CREATE INDEX IF NOT EXISTS "idx_csm_segment_id" ON "customer_segment_members" USING btree ("segment_id");

CREATE INDEX IF NOT EXISTS "idx_csm_customer_id" ON "customer_segment_members" USING btree ("customer_id");

CREATE INDEX IF NOT EXISTS "idx_customer_segments_owner_id" ON "customer_segments" USING btree ("owner_id");

CREATE INDEX IF NOT EXISTS "idx_customer_sales_customer_id" ON "customer_sales" USING btree ("customer_id");

CREATE INDEX IF NOT EXISTS "idx_customer_sales_owner_id" ON "customer_sales" USING btree ("owner_id");

CREATE INDEX IF NOT EXISTS "idx_customer_sales_sold_at" ON "customer_sales" USING btree ("sold_at");

CREATE INDEX IF NOT EXISTS "idx_todos_owner_id" ON "todos" USING btree ("owner_id");

CREATE INDEX IF NOT EXISTS "idx_todos_completed" ON "todos" USING btree ("completed");

CREATE INDEX IF NOT EXISTS "idx_cake_orders_owner_id" ON "cake_orders" USING btree ("owner_id");

CREATE INDEX IF NOT EXISTS "idx_cake_orders_due_date" ON "cake_orders" USING btree ("due_date");

CREATE INDEX IF NOT EXISTS "idx_cake_orders_status" ON "cake_orders" USING btree ("status");

CREATE INDEX IF NOT EXISTS "idx_cake_orders_shopify_order_id" ON "cake_orders" USING btree ("shopify_order_id");

CREATE INDEX IF NOT EXISTS "idx_production_schedules_owner_date" ON "production_schedules" USING btree ("owner_id","scheduled_date");

CREATE INDEX IF NOT EXISTS "idx_other_deliveries_owner_id" ON "other_deliveries" USING btree ("owner_id");

CREATE INDEX IF NOT EXISTS "idx_instagram_connections_owner" ON "instagram_connections" USING btree ("owner_id");

CREATE INDEX IF NOT EXISTS "idx_instagram_posts_owner" ON "instagram_posts" USING btree ("owner_id");

CREATE INDEX IF NOT EXISTS "idx_custom_options_owner_field" ON "custom_options" USING btree ("owner_id","field_key");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_custom_options" ON "custom_options" USING btree ("owner_id","field_key","value");

CREATE INDEX IF NOT EXISTS "idx_cake_addons_owner_active" ON "cake_addons" USING btree ("owner_id","is_active");

CREATE INDEX IF NOT EXISTS "idx_flavours_owner_active" ON "flavours" USING btree ("owner_id","is_active");

CREATE INDEX IF NOT EXISTS "idx_premade_cake_addons_addon_id" ON "premade_cake_addons" USING btree ("addon_id");

CREATE INDEX IF NOT EXISTS "idx_premade_cake_flavours_flavour_id" ON "premade_cake_flavours" USING btree ("flavour_id");

CREATE INDEX IF NOT EXISTS "idx_premade_cake_sizes_cake_id" ON "premade_cake_sizes" USING btree ("cake_id");

CREATE INDEX IF NOT EXISTS "idx_premade_cakes_owner_active" ON "premade_cakes" USING btree ("owner_id","is_active");

CREATE INDEX IF NOT EXISTS "idx_premade_cakes_recipe_id" ON "premade_cakes" USING btree ("recipe_id");
