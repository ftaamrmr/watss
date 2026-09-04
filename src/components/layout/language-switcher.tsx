"use client";

import { useRouter } from "next/navigation";
import { Languages } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

import {
  LOCALE_COOKIE,
  dirOf,
  useLocale,
  useT,
  type Locale,
} from "@/i18n/provider";
const LABELS: Record<Locale, string> = {
  ar: "العربية",
  en: "English",
};

/** Persist the locale cookie + flip <html> lang/dir. Event-handler use only. */
function applyLocaleSideEffects(next: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
  document.documentElement.lang = next;
  document.documentElement.dir = dirOf(next);
}

export function LanguageSwitcher() {
  const { t } = useT();
  const router = useRouter();
  const locale = useLocale();

  // DOM/cookie mutations happen in a plain module-scope helper (event-
  // handler territory) so the React Compiler doesn't mistake them for
  // render-time writes.
  function switchTo(next: Locale) {
    if (next === locale) return;
    applyLocaleSideEffects(next);
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="sm" aria-label={t("layout_language_switcher.001")} />
        }
      >
        <Languages className="h-4 w-4" />
        <span className="text-xs">{LABELS[locale]}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {(Object.keys(LABELS) as Locale[]).map((l) => (
          <DropdownMenuItem
            key={l}
            onClick={() => switchTo(l)}
            className={l === locale ? "font-semibold" : undefined}
          >
            {LABELS[l]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
