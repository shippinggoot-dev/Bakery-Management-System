"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { api } from "@/trpc/react";
import { SetupWizard, useWizard, type WizardStep } from "./SetupWizard";
import { JargonHint } from "./JargonHint";
import { CopyField } from "./CopyField";
import { TestPoll } from "./TestPoll";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ShopifyWebhookWizard({ open, onClose }: Props) {
  const t       = useTranslations("wizard.shopifyWebhook");
  const tCommon = useTranslations("wizard");
  const router  = useRouter();
  const utils   = api.useUtils();

  const [secret, setSecret]   = useState("");
  const [showSecret, setShow] = useState(false);

  const { data: settings } = api.shopify.getSettings.useQuery();
  const configured = settings?.webhookConfigured ?? false;

  const webhookUrl = typeof window !== "undefined"
    ? `${window.location.origin}/api/webhooks/shopify`
    : "/api/webhooks/shopify";

  const saveSecret = api.shopify.updateWebhookSecret.useMutation({
    onSuccess: () => utils.shopify.getSettings.invalidate(),
  });

  // ── Steps ──────────────────────────────────────────────────────────────────

  const steps: WizardStep[] = [
    // Outcome screen
    {
      id: "outcome",
      content: <OutcomeScreen configured={configured} />,
      primaryAction: {
        label: configured ? t("outcome.reRunStart") : t("outcome.start"),
      },
      secondaryAction: { label: t("outcome.maybeLater"), onClick: onClose },
      hideBack: true,
      hideProgress: true,
    },

    // Step 1: Open Shopify
    {
      id: "open-shopify",
      title: t("openShopify.title"),
      content: (
        <div className="space-y-3">
          <p>{t.rich("openShopify.body", {
            settings: (chunks) => <strong className="text-gray-900">{chunks}</strong>,
            notifications: (chunks) => <strong className="text-gray-900">{chunks}</strong>,
          })}</p>
          <a
            href="https://admin.shopify.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700 font-medium"
          >
            {t("openShopify.link")} ↗
          </a>
        </div>
      ),
      primaryAction: { label: t("openShopify.next") },
    },

    // Step 2: Create webhook
    {
      id: "create-webhook",
      title: t("createWebhook.title"),
      content: (
        <ol className="space-y-3 list-decimal list-inside marker:text-brand-500 marker:font-semibold">
          <li>{t.rich("createWebhook.step1", {
            create: (chunks) => <strong className="text-gray-900">{chunks}</strong>,
          })}</li>
          <li>{t.rich("createWebhook.step2", {
            event: (chunks) => <strong className="text-gray-900">{chunks}</strong>,
            order: (chunks) => <strong className="text-gray-900">{chunks}</strong>,
          })}</li>
          <li>{t.rich("createWebhook.step3", {
            format: (chunks) => <strong className="text-gray-900">{chunks}</strong>,
            json: (chunks) => <strong className="text-gray-900">{chunks}</strong>,
          })}</li>
        </ol>
      ),
      primaryAction: { label: t("createWebhook.next") },
    },

    // Step 3: Paste URL
    {
      id: "paste-url",
      title: t("pasteUrl.title"),
      content: (
        <div className="space-y-4">
          <p>
            {t.rich("pasteUrl.body", {
              webhook: (chunks) => (
                <JargonHint term={chunks}>
                  {t("pasteUrl.webhookHint")}
                </JargonHint>
              ),
              url: (chunks) => <strong className="text-gray-900">{chunks}</strong>,
              save: (chunks) => <strong className="text-gray-900">{chunks}</strong>,
            })}
          </p>
          <CopyField value={webhookUrl} />
        </div>
      ),
      primaryAction: { label: t("pasteUrl.next") },
    },

    // Step 4: Paste secret
    {
      id: "paste-secret",
      title: t("pasteSecret.title"),
      content: (
        <div className="space-y-4">
          <p>
            {t.rich("pasteSecret.body", {
              secret: (chunks) => (
                <JargonHint term={chunks}>
                  {t("pasteSecret.secretHint")}
                </JargonHint>
              ),
              once: (chunks) => <strong className="text-gray-900">{chunks}</strong>,
            })}
          </p>
          <div>
            <p className="text-xs font-medium text-gray-600 mb-1.5">
              {t("pasteSecret.fieldLabel")}
            </p>
            <div className="flex gap-2">
              <input
                className="flex-1 form-input font-mono text-sm"
                type={showSecret ? "text" : "password"}
                placeholder="whsec_•••••••••••••••••••••••"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                className="px-3 rounded-xl bg-gray-100 border border-rose-200 text-gray-600 hover:text-gray-800 text-xs transition-colors"
              >
                {showSecret ? tCommon("hide") : tCommon("show")}
              </button>
            </div>
          </div>
          {saveSecret.error && (
            <p className="text-sm text-red-600">{saveSecret.error.message}</p>
          )}
        </div>
      ),
      primaryAction: {
        label: saveSecret.isPending ? tCommon("saving") : t("pasteSecret.next"),
        disabled: !secret.trim() || saveSecret.isPending,
        onClick: async () => {
          await saveSecret.mutateAsync({ webhookSecret: secret.trim() });
        },
      },
    },

    // Step 5: Test (firm-soft) — TestPoll auto-advances on detection.
    // Skip link is rendered inside the step body so it can use the wizard
    // context to advance to the done screen.
    {
      id: "test",
      title: t("test.title"),
      content: <TestStepContent />,
      primaryAction: null,
    },

    // Done
    {
      id: "done",
      content: <DoneScreen />,
      primaryAction: {
        label: t("done.primary"),
        onClick: () => router.push("/planner"),
      },
      secondaryAction: { label: tCommon("done"), onClick: onClose },
      hideBack: true,
      hideProgress: true,
    },
  ];

  return (
    <SetupWizard
      open={open}
      onClose={onClose}
      title={t("wizardTitle")}
      steps={steps}
    />
  );
}

// ── Step bodies ─────────────────────────────────────────────────────────────

function OutcomeScreen({ configured }: { configured: boolean }) {
  const t = useTranslations("wizard.shopifyWebhook.outcome");

  // Re-run mode: the user already knows what this does. Skip the "what changes
  // day-to-day" bullets and just say what re-running means.
  if (configured) {
    return (
      <div className="space-y-4">
        <p className="text-base text-gray-800 leading-relaxed">{t("reRunIntro")}</p>
        <p className="text-sm text-gray-600">{t("reRunRequirements")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-base text-gray-800 leading-relaxed">{t("intro")}</p>

      <div>
        <p className="font-semibold text-gray-900 text-sm mb-2">{t("changesHeading")}</p>
        <ul className="space-y-1.5 text-sm text-gray-700">
          <li className="flex gap-2"><span className="text-brand-500 flex-shrink-0">•</span><span>{t("change1")}</span></li>
          <li className="flex gap-2"><span className="text-brand-500 flex-shrink-0">•</span><span>{t("change2")}</span></li>
          <li className="flex gap-2"><span className="text-brand-500 flex-shrink-0">•</span><span>{t("change3")}</span></li>
        </ul>
      </div>

      <p className="text-sm text-gray-600">{t("requirements")}</p>
    </div>
  );
}

function TestStepContent() {
  const { advance } = useWizard();
  const t = useTranslations("wizard.shopifyWebhook.test");

  return (
    <div className="space-y-4">
      <p>{t("intro")}</p>
      <TestPoll onDetected={advance} />
      <div className="text-center pt-2">
        <button
          type="button"
          onClick={advance}
          className="text-sm text-gray-500 hover:text-gray-700 underline underline-offset-2"
        >
          {t("skip")}
        </button>
      </div>
    </div>
  );
}

function DoneScreen() {
  const t = useTranslations("wizard.shopifyWebhook.done");
  return (
    <div className="space-y-5">
      <div className="text-center">
        <p className="text-4xl mb-2">✓</p>
        <p className="text-lg font-semibold text-gray-900">{t("title")}</p>
      </div>

      <p className="text-base text-gray-800 leading-relaxed">{t("intro")}</p>

      <div className="rounded-xl bg-rose-50 border border-rose-100 px-4 py-3.5">
        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">
          {t("worthKnowingHeading")}
        </p>
        <ul className="space-y-1.5 text-sm text-gray-700">
          <li className="flex gap-2"><span className="text-gray-400 flex-shrink-0">•</span><span>{t("worthKnowing1")}</span></li>
          <li className="flex gap-2"><span className="text-gray-400 flex-shrink-0">•</span><span>{t("worthKnowing2")}</span></li>
          <li className="flex gap-2"><span className="text-gray-400 flex-shrink-0">•</span><span>{t("worthKnowing3")}</span></li>
        </ul>
      </div>
    </div>
  );
}
