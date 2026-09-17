"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import vi from "@/locales/vi.json";
import en from "@/locales/en.json";

type Dict = Record<string, unknown>;

const DICTS: Record<string, Dict> = { vi, en };

export type Locale = "vi" | "en";

/** Vietnamese is the default UI language — plan §3, rule #15. */
export const DEFAULT_LOCALE: Locale = "vi";

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function lookup(dict: Dict, key: string): unknown {
  return key.split(".").reduce<unknown>((acc, part) => {
    if (acc && typeof acc === "object" && part in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, dict);
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  // Read the saved locale after mount rather than during render: the server
  // has no localStorage, so reading it eagerly would cause a hydration
  // mismatch. Vietnamese renders first, then we switch if the user chose English.
  useEffect(() => {
    const stored = window.localStorage.getItem("ide.locale");
    if (stored === "vi" || stored === "en") {
      setLocaleState(stored);
      document.documentElement.lang = stored;
    }
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    window.localStorage.setItem("ide.locale", next);
    document.documentElement.lang = next;
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const dict = DICTS[locale] ?? DICTS[DEFAULT_LOCALE];
      let value = lookup(dict, key);
      if (value === undefined) value = lookup(DICTS[DEFAULT_LOCALE], key);
      if (typeof value !== "string") return key;
      if (!vars) return value;
      return Object.entries(vars).reduce((acc, [name, val]) => acc.replaceAll(`{${name}}`, String(val)), value);
    },
    [locale],
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
