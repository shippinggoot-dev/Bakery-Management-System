"use client";

import { useEffect } from "react";
import posthog from "posthog-js";
import { api } from "@/trpc/react";

/**
 * Reads the user's recording preference from tRPC and starts/stops PostHog
 * session recording to match. Lives inside the tRPC provider in the root
 * layout. Returns null — no UI, only side effect.
 */
export function PostHogRecordingSwitch() {
  const { data: prefs } = api.preferences.get.useQuery();
  const enabled = prefs?.sessionRecordingEnabled ?? false;

  useEffect(() => {
    if (enabled) {
      posthog.startSessionRecording();
    } else {
      posthog.stopSessionRecording();
    }
  }, [enabled]);

  return null;
}
