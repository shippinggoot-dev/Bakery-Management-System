"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { api } from "@/trpc/react";
import { createClientSupabase } from "@/lib/supabase/client";

export type ThemeId = "rose" | "slate" | "stone" | "sage" | "lavender" | "peach";

export const THEMES: Record<ThemeId, {
  label: string;
  desc: string;
  bg: string;
  accent: string;
  category: "current" | "neutral" | "feminine";
}> = {
  rose:     { label: "Rose",     desc: "Warm & inviting",      bg: "#fdf0f0", accent: "#9d6569", category: "current"  },
  slate:    { label: "Slate",    desc: "Clean & professional", bg: "#f8fafc", accent: "#334155", category: "neutral"  },
  stone:    { label: "Stone",    desc: "Earthy & minimal",     bg: "#fafaf9", accent: "#44403c", category: "neutral"  },
  sage:     { label: "Sage",     desc: "Natural & calm",       bg: "#f4f8f4", accent: "#3a6b3a", category: "neutral"  },
  lavender: { label: "Lavender", desc: "Creative & soft",      bg: "#faf5ff", accent: "#9333ea", category: "feminine" },
  peach:    { label: "Peach",    desc: "Bright & cheerful",    bg: "#fff8f3", accent: "#c2622a", category: "feminine" },
};

interface Ctx {
  theme: ThemeId;
  setTheme: (t: ThemeId) => void;
  dark: boolean;
  setDark: (d: boolean) => void;
  bakeryName: string;
  setBakeryName: (n: string) => void;
  logoUrl: string | null;
  setLogoUrl: (url: string | null) => void;
}

const PersonalizationCtx = createContext<Ctx>({
  theme: "rose",      setTheme: () => {},
  dark: false,        setDark: () => {},
  bakeryName: "Your bakery", setBakeryName: () => {},
  logoUrl: null,      setLogoUrl: () => {},
});

// Sentinel values that mean "user hasn't picked a name yet" — never migrated to DB.
const DEFAULT_NAMES = new Set(["Your bakery", "My Bakery"]);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme,      setThemeState]     = useState<ThemeId>("rose");
  const [dark,       setDarkState]      = useState<boolean>(false);
  const [bakeryName, setBakeryNameState] = useState("Your bakery");
  const [logoUrl,    setLogoUrlState]   = useState<string | null>(null);
  const [isAuthed,   setIsAuthed]       = useState(false);

  const utils      = api.useUtils();
  const updatePref = api.preferences.update.useMutation({
    onSuccess: () => utils.preferences.get.invalidate(),
    // Anonymous (demo-mode) users hit protectedProcedure's FORBIDDEN — silent.
    onError:   () => {},
  });
  const { data: prefs } = api.preferences.get.useQuery();

  // Restore device-local preferences from localStorage on first paint.
  useEffect(() => {
    const t = localStorage.getItem("bms-theme") as ThemeId | null;
    const n = localStorage.getItem("bms-bakery-name");
    const l = localStorage.getItem("bms-logo");
    const d = localStorage.getItem("bms-dark");
    if (t && t in THEMES) {
      setThemeState(t);
      document.documentElement.setAttribute("data-theme", t);
    }
    if (n) setBakeryNameState(n);
    if (l) setLogoUrlState(l);
    const initialDark = d === "1";
    setDarkState(initialDark);
    document.documentElement.classList.toggle("dark", initialDark);
  }, []);

  // Track auth state so we know whether to sync bakeryName to the server.
  useEffect(() => {
    const supabase = createClientSupabase();
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsAuthed(!!session?.user && !session.user.is_anonymous);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setIsAuthed(!!session?.user && !session.user.is_anonymous);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Reconcile server state for real users. If the server already holds a name,
  // mirror it locally — this is what makes the setting follow them across
  // devices. If the server is empty but localStorage has a real value, push it
  // up once so existing personalisation isn't lost on the device-to-account move.
  useEffect(() => {
    if (!prefs || !isAuthed) return;
    if (prefs.bakeryName) {
      setBakeryNameState(prefs.bakeryName);
      localStorage.setItem("bms-bakery-name", prefs.bakeryName);
    } else {
      const local = localStorage.getItem("bms-bakery-name");
      if (local && local.trim() && !DEFAULT_NAMES.has(local)) {
        updatePref.mutate({ bakeryName: local });
      }
    }
    // updatePref is stable via useMutation; reacting to it would re-fire migration.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs, isAuthed]);

  const setTheme = (t: ThemeId) => {
    setThemeState(t);
    localStorage.setItem("bms-theme", t);
    document.documentElement.setAttribute("data-theme", t);
  };

  const setDark = (d: boolean) => {
    setDarkState(d);
    localStorage.setItem("bms-dark", d ? "1" : "0");
    document.documentElement.classList.toggle("dark", d);
  };

  const setBakeryName = (n: string) => {
    setBakeryNameState(n);
    localStorage.setItem("bms-bakery-name", n);
    if (isAuthed) {
      updatePref.mutate({ bakeryName: n.trim() || null });
    }
  };

  const setLogoUrl = (url: string | null) => {
    setLogoUrlState(url);
    if (url) localStorage.setItem("bms-logo", url);
    else     localStorage.removeItem("bms-logo");
  };

  return (
    <PersonalizationCtx.Provider value={{ theme, setTheme, dark, setDark, bakeryName, setBakeryName, logoUrl, setLogoUrl }}>
      {children}
    </PersonalizationCtx.Provider>
  );
}

export function usePersonalization() {
  return useContext(PersonalizationCtx);
}
