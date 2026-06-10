/**
 * Render an ISO YYYY-MM-DD date as DD-MM-YYYY for display.
 *
 * The database stores dates as ISO so they sort and compare correctly.
 * The UI shows DD-MM-YYYY because that matches the European reading
 * order the bakery's customers and staff expect.
 *
 * Non-ISO inputs (raw values left over from before the Shopify-import
 * parser was extended, manual entries that weren't normalised) pass
 * through untouched so a row we can't reformat is still visible rather
 * than blanked out.
 *
 * `null` / `undefined` / empty → empty string so the caller can render
 * with `{formatDate(x)}` without a guard.
 */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function formatDate(d: string | null | undefined): string {
  if (!d) return "";
  if (!ISO_DATE.test(d)) return d;
  const [y, mo, da] = d.split("-");
  return `${da}-${mo}-${y}`;
}
