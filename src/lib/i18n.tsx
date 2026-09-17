"use client";

import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import vi from "@/locales/vi.json";
import en from "@/locales/en.json";

type Dict = Record<string, unknown>;

const DICTS: Record<string, Dict> = { vi, en };

export type Locale = "vi" | "en";

interface I18nContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
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
  const [locale, setLocaleState] = useState<Locale>("vi");

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("ide.locale", l);
    }
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const dict = DICTS[locale] ?? DICTS.vi;
      let value = lookup(dict, key);
      if (value === undefined) value = lookup(DICTS.vi, key);
      if (typeof value !== "string") return key;
      if (vars) {
        return Object.entries(vars).reduce(
          (acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)),
          value,
        );
      }
      return value;
    },
    [locale],
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
