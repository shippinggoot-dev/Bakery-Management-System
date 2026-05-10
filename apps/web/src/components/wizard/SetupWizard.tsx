"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";

// ── Public types ──────────────────────────────────────────────────────────────

export interface WizardStep {
  /** Stable id for analytics / keying */
  id: string;
  /** Optional inline title rendered above the body */
  title?: React.ReactNode;
  /** Step body */
  content: React.ReactNode;
  /** Forward action — defaults to "Next". Pass null to hide. */
  primaryAction?: {
    label: string;
    onClick?: () => void | Promise<void>;
    disabled?: boolean;
  } | null;
  /** Tertiary action shown next to primary — e.g. "Skip", "Maybe later" */
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  /** Don't render the back button on this step (e.g. outcome / done) */
  hideBack?: boolean;
  /** Don't render the X close button (e.g. mid-flow critical step) */
  hideClose?: boolean;
  /** Don't render the step counter for this step (e.g. outcome / done) */
  hideProgress?: boolean;
}

interface SetupWizardProps {
  open: boolean;
  onClose: () => void;
  /** Wizard title in header */
  title: string;
  steps: WizardStep[];
  /** Called when the wizard finishes its last step's primary action */
  onComplete?: () => void;
}

// ── Context for step content to drive navigation ─────────────────────────────

interface WizardCtx {
  current: number;
  total: number;
  advance: () => void;
  goBack: () => void;
  close: () => void;
}

const WizardContext = createContext<WizardCtx | null>(null);

export function useWizard() {
  const ctx = useContext(WizardContext);
  if (!ctx) throw new Error("useWizard must be used inside <SetupWizard>");
  return ctx;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SetupWizard({ open, onClose, title, steps, onComplete }: SetupWizardProps) {
  const t = useTranslations("wizard");
  const [current, setCurrent] = useState(0);
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Reset to first step every time the wizard opens
  useEffect(() => {
    if (open) setCurrent(0);
  }, [open]);

  // Portal mount flag — avoids SSR mismatch
  useEffect(() => { setMounted(true); }, []);

  // Esc to close
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Initial focus
  useEffect(() => {
    if (open && containerRef.current) {
      containerRef.current.focus();
    }
  }, [open, current]);

  const step = steps[current];

  const advance = useCallback(() => {
    if (current >= steps.length - 1) {
      onComplete?.();
      onClose();
      return;
    }
    setCurrent((c) => c + 1);
  }, [current, steps.length, onComplete, onClose]);

  const goBack = useCallback(() => {
    setCurrent((c) => Math.max(0, c - 1));
  }, []);

  const ctxValue = useMemo<WizardCtx>(() => ({
    current,
    total: steps.length,
    advance,
    goBack,
    close: onClose,
  }), [current, steps.length, advance, goBack, onClose]);

  if (!open || !mounted || !step) return null;

  const isFirst = current === 0;
  const isLast  = current === steps.length - 1;

  async function handlePrimary() {
    if (!step?.primaryAction) return;
    if (step.primaryAction.onClick) {
      await step.primaryAction.onClick();
    }
    advance();
  }

  return createPortal(
    <WizardContext.Provider value={ctxValue}>
      <div
        className="fixed inset-0 z-50 bg-black/50 flex items-stretch md:items-center justify-center md:p-4"
        onClick={(e) => { if (e.target === e.currentTarget && !step.hideClose) onClose(); }}
      >
        <div
          ref={containerRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby="wizard-title"
          className="bg-white w-full md:max-w-xl md:rounded-2xl md:shadow-2xl md:max-h-[90vh] flex flex-col outline-none"
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-rose-100 flex-shrink-0">
            <div className="flex-1 min-w-0">
              <p id="wizard-title" className="font-semibold text-gray-900 text-sm truncate">
                {title}
              </p>
              {!step.hideProgress && (
                <p className="text-xs text-gray-500 mt-0.5">
                  {t("stepProgress", { current: current + 1, total: steps.length })}
                </p>
              )}
            </div>
            {!step.hideClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label={t("close")}
                className="w-8 h-8 rounded-lg text-gray-400 hover:bg-rose-50 hover:text-gray-600 transition-colors flex items-center justify-center text-lg flex-shrink-0"
              >
                ✕
              </button>
            )}
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 py-5 md:px-6 md:py-6">
            {step.title && (
              <h3 className="text-lg font-semibold text-gray-900 mb-3">{step.title}</h3>
            )}
            <div className="text-gray-700 leading-relaxed">{step.content}</div>
          </div>

          {/* Footer */}
          {(step.primaryAction !== null) && (
            <div className="flex items-center gap-3 px-5 py-4 border-t border-rose-100 flex-shrink-0 bg-rose-50/30">
              {!isFirst && !step.hideBack && (
                <button
                  type="button"
                  onClick={goBack}
                  className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
                >
                  ← {t("back")}
                </button>
              )}

              {step.secondaryAction && (
                <button
                  type="button"
                  onClick={step.secondaryAction.onClick}
                  className="text-sm text-gray-500 hover:text-gray-700 underline underline-offset-2 transition-colors"
                >
                  {step.secondaryAction.label}
                </button>
              )}

              <button
                type="button"
                onClick={handlePrimary}
                disabled={step.primaryAction?.disabled}
                className="ml-auto px-5 py-2.5 rounded-xl bg-brand-500 text-white font-semibold text-sm hover:bg-brand-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {step.primaryAction?.label ?? (isLast ? t("done") : t("next"))}
              </button>
            </div>
          )}
        </div>
      </div>
    </WizardContext.Provider>,
    document.body
  );
}
