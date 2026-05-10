"use client";

import { useEffect, useId, useRef, useState } from "react";

interface JargonHintProps {
  /** The technical word(s) to wrap, e.g. "webhook" */
  term: React.ReactNode;
  /** Plain-language explanation rendered in the popover */
  children: React.ReactNode;
}

/**
 * Inline info-circle that wraps a piece of jargon. Clicking the icon (or the
 * underlined term) reveals a small popover with a plain-language explanation.
 *
 * Design rule: only ever explain *what something is*, never reassure that
 * something is *safe*. Reassurances against threats users haven't imagined
 * tend to plant the doubt rather than calm it.
 */
export function JargonHint({ term, children }: JargonHintProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const id = useId();

  // Click outside closes
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span ref={wrapperRef} className="relative inline">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        className="inline-flex items-baseline gap-1 underline decoration-dotted decoration-gray-400 underline-offset-2 hover:decoration-gray-700 cursor-help"
      >
        <span>{term}</span>
        <span
          aria-hidden="true"
          className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-gray-400 text-[9px] text-gray-500 leading-none -translate-y-px"
        >
          i
        </span>
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className="absolute left-0 top-full mt-2 z-10 w-64 rounded-lg bg-gray-900 text-white text-xs px-3 py-2.5 shadow-lg leading-relaxed normal-case"
        >
          {children}
        </span>
      )}
    </span>
  );
}
