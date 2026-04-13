import { NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { registerSSEClient } from "@bakery/api/services/inventory";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }
  const ownerId = user.id;

  let cleanup: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      const send = (data: string) => {
        try {
          controller.enqueue(encoder.encode(data));
        } catch {
          // controller already closed
        }
      };

      // Send an initial ping so the client knows the connection is open
      send(`: connected\n\n`);

      cleanup = registerSSEClient(ownerId, send);

      // Heartbeat every 25 s to keep the connection alive through proxies
      const heartbeat = setInterval(() => {
        try {
          send(`: heartbeat\n\n`);
        } catch {
          clearInterval(heartbeat);
        }
      }, 25_000);

      req.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        cleanup?.();
      });
    },
    cancel() {
      cleanup?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // disable nginx buffering
    },
  });
}
