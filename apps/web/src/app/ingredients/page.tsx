import IngredientsClient from "./_client";

// Data fetched client-side via React Query to avoid blocking SSR on the auth round-trip
export default function IngredientsPage() {
  return <IngredientsClient />;
}
