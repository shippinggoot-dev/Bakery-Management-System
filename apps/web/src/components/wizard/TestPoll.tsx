"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";

interface TestPollProps {
  /** Called when the wizard should advance to the done screen */
  onDetected: () => void;
  /** Total time we'll watch before showing the timeout state. Default 2 min. */
  timeoutMs?: number;
}

type Phase = "watching" | "detected" | "timeout";

/**
 * Polls the Shopify webhook timestamp once every 2 seconds. If a new webhook
 * lands after the user enters this step, we show a brief success state and
 * call onDetected. After the timeout we show a gentle nudge with a retry.
 */
export function TestPoll({ onDetected, timeoutMs = 120_000 }: TestPollProps) {
  const t = useTranslations("wizard");
  const startedAtRef = useRef<Date>(new Date());
  const [phase, setPhase]     = useState<Phase>("watching");
  const [elapsed, setElapsed] = useState(0);

  const { data } = api.shopify.checkRecentWebhook.useQuery(undefined, {
    refetchInterval: phase === "watching" ? 2000 : false,
    refetchOnWindowFocus: false,
  });

  // Detect a webhook arriving after we started watching
  useEffect(() => {
    if (phase !== "watching") return;
    if (!data?.lastReceivedAt) return;
    const received = new Date(data.lastReceivedAt);
    if (received > startedAtRef.current) {
      setPhase("detected");
    }
  }, [data, phase]);

  // Brief celebration delay before advancing the wizard. Lives in its own
  // effect so the cleanup from the detection effect doesn't cancel the timer.
  useEffect(() => {
    if (phase !== "detected") return;
    const handle = setTimeout(onDetected, 1800);
    return () => clearTimeout(handle);
  }, [phase, onDetected]);

  // Tick elapsed time + flip to timeout
  useEffect(() => {
    if (phase !== "watching") return;
    const interval = setInterval(() => {
      const ms = Date.now() - startedAtRef.current.getTime();
      setElapsed(ms);
      if (ms >= timeoutMs) {
        setPhase("timeout");
        clearInterval(interval);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [phase, timeoutMs]);

  function restart() {
    startedAtRef.current = new Date();
    setElapsed(0);
    setPhase("watching");
  }

  if (phase === "detected") {
    return (
      <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-5 py-8 text-center">
        <p className="text-4xl mb-3">✓</p>
        <p className="font-semibold text-emerald-800">{t("testDetectedTitle")}</p>
        <p className="text-sm text-emerald-700 mt-1.5">{t("testDetectedBody")}</p>
      </div>
    );
  }

  if (phase === "timeout") {
    return (
      <div className="rounded-xl bg-amber-50 border border-amber-200 px-5 py-5">
        <p className="font-semibold text-amber-900">{t("testTimeoutTitle")}</p>
        <p className="text-sm text-amber-800 mt-2 leading-relaxed">{t("testTimeoutBody")}</p>
        <button
          type="button"
          onClick={restart}
          className="mt-3 text-sm font-medium text-amber-900 underline underline-offset-2 hover:text-amber-700"
        >
          {t("testTimeoutRetry")}
        </button>
      </div>
    );
  }

  const remainingSec = Math.max(0, Math.ceil((timeoutMs - elapsed) / 1000));
  return (
    <div className="rounded-xl bg-rose-50 border border-rose-100 px-5 py-8 text-center">
      <div className="inline-block animate-spin rounded-full h-10 w-10 border-2 border-brand-200 border-t-brand-500 mb-4" />
      <p className="font-semibold text-gray-800">{t("testWatchingTitle")}</p>
      <p className="text-sm text-gray-600 mt-1.5 leading-relaxed">{t("testWatchingBody")}</p>
      <p className="text-xs text-gray-500 mt-4 font-mono">
        {t("testWatchingTimeLeft", { seconds: remainingSec })}
      </p>
    </div>
  );
}
