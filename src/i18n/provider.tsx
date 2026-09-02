"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import {
  DEFAULT_LOCALE,
  dirOf,
  translate,
  type Locale,
} from "./shared";

export {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  LOCALES,
  dirOf,
  isLocale,
  translate,
  type Locale,
} from "./shared";

type I18nContextValue = { locale: Locale };
const I18nContext = createContext<I18nContextValue>({ locale: DEFAULT_LOCALE });

export function I18nProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ locale }), [locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useLocale(): Locale {
  return useContext(I18nContext).locale;
}

export function useT() {
  const { locale } = useContext(I18nContext);
  return useMemo(
    () => ({
      t: (key: string, vars?: Record<string, string | number>) =>
        translate(locale, key, vars),
      locale,
      dir: dirOf(locale),
    }),
    [locale],
  );
}

/** Inline translation for JSX text nodes: <T k="key" vars={{ name }} /> */
export function T({
  k,
  vars,
}: {
  k: string;
  vars?: Record<string, string | number>;
}) {
  const { locale } = useContext(I18nContext);
  return <>{translate(locale, k, vars)}</>;
}
