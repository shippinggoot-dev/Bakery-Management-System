"use client";

import { useState, useRef } from "react";
import { api } from "@/trpc/react";

interface TagComboboxProps {
  fieldKey:    string;
  values:      string[];
  onChange:    (values: string[]) => void;
  placeholder?: string;
  multi?:      boolean;
  className?:  string;
}

export function TagCombobox({
  fieldKey,
  values,
  onChange,
  placeholder = "Type to add…",
  multi = true,
  className = "",
}: TagComboboxProps) {
  const [input, setInput] = useState("");
  const [open,  setOpen]  = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: options = [] } = api.customOptions.getOptions.useQuery({ fieldKey });

  const trimmed  = input.trim();
  const filtered = options
    .map((o) => o.value)
    .filter((v) => !values.includes(v))
    .filter((v) => v.toLowerCase().includes(trimmed.toLowerCase()));

  const canCreate =
    trimmed.length > 0 &&
    !options.some((o) => o.value.toLowerCase() === trimmed.toLowerCase()) &&
    !values.includes(trimmed);

  function add(value: string) {
    const v = value.trim();
    if (!v || values.includes(v)) return;
    onChange(multi ? [...values, v] : [v]);
    setInput("");
    if (!multi) setOpen(false);
  }

  function remove(value: string) {
    onChange(values.filter((v) => v !== value));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") { e.preventDefault(); if (trimmed) add(trimmed); }
    if (e.key === "Backspace" && !input && values.length > 0) remove(values[values.length - 1]!);
    if (e.key === "Escape") setOpen(false);
  }

  return (
    <div className={`relative ${className}`}>
      <div
        className={`flex flex-wrap gap-1.5 min-h-[40px] cursor-text rounded-xl border border-rose-200 bg-white px-2 py-1.5 transition-colors focus-within:border-brand-300 focus-within:ring-2 focus-within:ring-brand-100`}
        onClick={() => { inputRef.current?.focus(); setOpen(true); }}
      >
        {values.map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-0.5 rounded-md border border-brand-200 bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700"
          >
            {v}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); remove(v); }}
              className="ml-0.5 text-brand-400 hover:text-brand-700 leading-none text-sm"
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          className="flex-1 min-w-[80px] bg-transparent outline-none text-sm text-gray-700 placeholder-gray-400 py-0.5"
          placeholder={values.length === 0 ? placeholder : ""}
          value={input}
          onChange={(e) => { setInput(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={handleKeyDown}
        />
      </div>

      {open && (filtered.length > 0 || canCreate) && (
        <ul className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-rose-100 rounded-xl shadow-lg max-h-52 overflow-y-auto">
          {filtered.map((v) => (
            <li key={v}>
              <button
                type="button"
                className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-rose-50 transition-colors first:rounded-t-xl"
                onMouseDown={(e) => { e.preventDefault(); add(v); }}
              >
                {v}
              </button>
            </li>
          ))}
          {canCreate && (
            <li>
              <button
                type="button"
                className="w-full text-left px-3 py-2 text-sm text-brand-600 hover:bg-brand-50 border-t border-rose-50 transition-colors last:rounded-b-xl"
                onMouseDown={(e) => { e.preventDefault(); add(trimmed); }}
              >
                + Add "{trimmed}"
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
