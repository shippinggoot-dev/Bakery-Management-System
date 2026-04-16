"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SEGMENT_LABELS: Record<string, string> = {
  "purchase-orders":  "Purchase Orders",
  "shopping-lists":   "Shopping Lists",
  "ingredients":      "Ingredients",
  "planner":          "Customer Orders",
  "recipes":          "Recipes",
  "nutrients":        "Nutrition Labels",
  "library":          "My Library",
  "inventory":        "Inventory",
  "suppliers":        "Suppliers",
  "price-ingestion":  "Price Sync",
  "price-alerts":     "Price Alerts",
  "customers":        "Customers",
  "settings":         "Settings",
  "todos":            "Tasks",
  "new":              "New",
  "receive":          "Receive",
  "produce":          "Produce",
  "waste":            "Log Waste",
  "report":           "Report",
  "register":         "Register",
  "lookup":           "POS Lookup",
  "segments":         "Segments",
  "tiers":            "Tiers",
  "csv":              "CSV Import",
  "invoice":          "Invoice OCR",
  "consent":          "Terms",
  "login":            "Sign In",
  "production":       "Production Schedule",
  "sales":            "Sales Dashboard",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function segmentLabel(seg: string): string {
  if (UUID_RE.test(seg)) return "Details";
  return SEGMENT_LABELS[seg] ?? seg.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function Breadcrumb() {
  const pathname = usePathname();

  if (pathname === "/") return null;

  const segments = pathname.split("/").filter(Boolean);

  return (
    <nav className="flex items-center gap-1 text-xs text-gray-400 mb-4 -mt-2 flex-wrap">
      <Link href="/" className="hover:text-brand-600 transition-colors">
        Home
      </Link>
      {segments.map((seg, i) => {
        const href    = "/" + segments.slice(0, i + 1).join("/");
        const label   = segmentLabel(seg);
        const isLast  = i === segments.length - 1;
        return (
          <span key={href} className="flex items-center gap-1">
            <span className="text-gray-300">/</span>
            {isLast ? (
              <span className="text-gray-600 font-medium">{label}</span>
            ) : (
              <Link href={href} className="hover:text-brand-600 transition-colors">
                {label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
