import { api } from "@/trpc/server";
import { SegmentsClient } from "./SegmentsClient";

export default async function SegmentsPage() {
  const initialData = await api.customers.getSegments({ limit: 25, offset: 0 });
  return <SegmentsClient initialData={initialData} />;
}
