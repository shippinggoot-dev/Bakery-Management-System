"use client";

import { createContext, useContext, useEffect, useState } from "react";

export type ThemeId = "rose" | "slate" | "stone" | "sage" | "lavender" | "peach";

export const THEMES: Record<ThemeId, {
  label: string;
  desc: string;
  bg: string;
  accent: string;
  category: "current" | "neutral" | "feminine";
}> = {
  rose:     { label: "Rose",     desc: "Warm & inviting",       bg: "#fdf0f0", accent: "#9d6569", category: "current"  },
  slate:    { label: "Slate",    desc: "Clean & professional",  bg: "#f8fafc", accent: "#334155", category: "neutral"  },
  stone:    { label: "Stone",    desc: "Earthy & minimal",      bg: "#fafaf9", accent: "#44403c", category: "neutral"  },
  sage:     { label: "Sage",     desc: "Natural & calm",        bg: "#f4f8f4", accent: "#3a6b3a", category: "neutral"  },
  lavender: { label: "Lavender", desc: "Creative & soft",       bg: "#faf5ff", accent: "#9333ea", category: "feminine" },
  peach:    { label: "Peach",    desc: "Bright & cheerful",     bg: "#fff8f3", accent: "#c2622a", category: "feminine" },
};

interface Ctx {
  theme: ThemeId;
  setTheme: (t: ThemeId) => void;
  bakeryName: string;
  setBakeryName: (n: string) => void;
}

const PersonalizationCtx = createContext<Ctx>({
  theme: "rose", setTheme: () => {},
  bakeryName: "My Bakery", setBakeryName: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme,      setThemeState]     = useState<ThemeId>("rose");
  const [bakeryName, setBakeryNameState] = useState("My Bakery");

  useEffect(() => {
    const t = localStorage.getItem("bms-theme") as ThemeId | null;
    const n = localStorage.getItem("bms-bakery-name");
    if (t && t in THEMES) {
      setThemeState(t);
      document.documentElement.setAttribute("data-theme", t);
    }
    if (n) setBakeryNameState(n);
  }, []);

  function setTheme(t: ThemeId) {
    setThemeState(t);
    localStorage.setItem("bms-theme", t);
    document.documentElement.setAttribute("data-theme", t);
  }

  function setBakeryName(n: string) {
    setBakeryNameState(n);
    localStorage.setItem("bms-bakery-name", n);
  }

  return (
    <PersonalizationCtx.Provider value={{ theme, setTheme, bakeryName, setBakeryName }}>
      {children}
    </PersonalizationCtx.Provider>
  );
}

export function usePersonalization() {
  return useContext(PersonalizationCtx);
}
