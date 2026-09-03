import en from "./messages/en.json";
import ar from "./messages/ar.json";

export type Locale = "ar" | "en";
export const LOCALES: Locale[] = ["ar", "en"];
export const DEFAULT_LOCALE: Locale = "ar";
export const LOCALE_COOKIE = "locale";

const dicts: Record<Locale, Record<string, string>> = {
  en: en as Record<string, string>,
  ar: ar as Record<string, string>,
};

export function isLocale(value: string | undefined | null): value is Locale {
  return value === "ar" || value === "en";
}

export function dirOf(locale: Locale): "rtl" | "ltr" {
  return locale === "ar" ? "rtl" : "ltr";
}

export function translate(
  locale: Locale,
  key: string,
  vars?: Record<string, string | number>,
): string {
  let s = dicts[locale]?.[key] ?? dicts.en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replaceAll(`{${k}}`, String(v));
    }
  }
  return s;
}
