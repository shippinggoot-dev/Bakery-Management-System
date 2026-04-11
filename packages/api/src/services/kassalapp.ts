const BASE_URL = "https://kassal.app/api/v1";

// Fana, Bergen — centre coordinates and search radius
const FANA_LAT = 60.3055;
const FANA_LNG = 5.3344;
const RADIUS_KM = 8;

export interface KassalStore {
  id: number;
  name: string;
  address: string;
  lat: number;
  lng: number;
  group: string; // e.g. "MENY_NO", "KIWI", "REMA_1000"
}

export interface KassalProduct {
  id: number;
  name: string;
  vendor: string;
  brand: string;
  ean: string;
  current_price: number | null;
  current_unit_price: number | null;
  weight: number | null;
  weight_unit: string | null;
  store: { name: string; code: string };
  image: string | null;
}

async function apiFetch<T>(path: string, apiKey: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    next: { revalidate: 0 },
  });
  if (!res.ok) {
    throw new Error(`Kassal.app API error ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

/** Returns all physical stores within 8 km of Fana */
export async function getLocalStores(apiKey: string): Promise<KassalStore[]> {
  const data = await apiFetch<{ data: KassalStore[] }>(
    `/physical-stores?lat=${FANA_LAT}&lng=${FANA_LNG}&km=${RADIUS_KM}&size=100`,
    apiKey
  );
  return data.data;
}

/** Returns the store group codes (chain identifiers) present within 8 km of Fana */
export async function getLocalStoreGroups(apiKey: string): Promise<string[]> {
  const stores = await getLocalStores(apiKey);
  return [...new Set(stores.map((s) => s.group))];
}

/**
 * Searches Kassal.app for products matching the given EAN barcode,
 * filters results to the provided local store group codes,
 * and returns the cheapest available price with its store name.
 */
export async function getCheapestLocalPrice(
  apiKey: string,
  ean: string,
  localGroups: string[]
): Promise<{ price: number; store: string; sizePer: string | null } | null> {
  const data = await apiFetch<{ data: KassalProduct[] }>(
    `/products?search=${encodeURIComponent(ean)}&size=100`,
    apiKey
  );

  const local = data.data.filter((p) =>
    localGroups.includes(p.store?.code)
  );

  if (local.length === 0) return null;

  const withPrice = local.filter((p) => p.current_price != null);
  if (withPrice.length === 0) return null;

  const cheapest = withPrice.reduce((min, p) =>
    p.current_price! < min.current_price! ? p : min
  );

  const sizePer =
    cheapest.weight && cheapest.weight_unit
      ? `${cheapest.weight}${cheapest.weight_unit}`
      : null;

  return {
    price: cheapest.current_price!,
    store: cheapest.store.name,
    sizePer,
  };
}

/**
 * Searches Kassal.app by name — used in the ingredient-linking UI
 * so the user can find and attach the right grocery product.
 */
export async function searchKassalProducts(
  apiKey: string,
  query: string
): Promise<KassalProduct[]> {
  const data = await apiFetch<{ data: KassalProduct[] }>(
    `/products?search=${encodeURIComponent(query)}&size=20`,
    apiKey
  );
  return data.data;
}
