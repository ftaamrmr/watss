// ============================================================
// Centralized branding / product identity.
//
// Everything user-visible about "who is this product" reads from
// here — never hardcode the app name in components. Values come
// from env so a rebrand is a deploy-time change, not a code change.
//
// Open-source attribution (LICENSE,NOTICE) is separate and stays
// untouched — this module is commercial identity only.
// ============================================================

export const APP_NAME = process.env.APP_NAME ?? process.env.NEXT_PUBLIC_APP_NAME ?? "WATSS";
export const APP_SHORT_NAME = process.env.NEXT_PUBLIC_APP_SHORT_NAME ?? "WATSS";
export const APP_URL = (
  process.env.APP_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  process.env.NEXT_PUBLIC_SITE_URL ??
  ""
).replace(/\/+$/, "");
export const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL ?? "";
export const COMPANY_NAME = process.env.COMPANY_NAME ?? APP_NAME;
export const DEFAULT_LOCALE = (process.env.NEXT_PUBLIC_DEFAULT_LOCALE ?? "ar") as "ar" | "en";

/**
 * Resolve the canonical app base URL for links in emails/invites.
 *
 * Fail-safe by design: if no explicit APP_URL is configured we fall
 * back to the request's own host — NEVER to an external domain. An
 * unconfigured production deploy yields links pointing at the
 * request's own origin (harmless) rather than leaking users to a
 * domain we don't control.
 */
export function resolveAppUrl(request?: Request): string {
  const configured = (
    process.env.APP_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    ""
  ).replace(/\/+$/, "");
  if (configured) return configured;
  if (request) {
    const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
    const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    if (forwardedHost) return `${forwardedProto || "https"}://${forwardedHost}`;
    const host = request.headers.get("host")?.trim();
    if (host) {
      const proto = new URL(request.url).protocol.replace(":", "");
      return `${proto}://${host}`;
    }
  }
  if (process.env.NODE_ENV === "production") {
    // No URL anywhere in production = operator misconfiguration.
    // Surface it loudly instead of silently minting broken links.
    throw new Error(
      "APP_URL is not configured. Set APP_URL (or NEXT_PUBLIC_APP_URL) to your canonical domain.",
    );
  }
  return "http://localhost:3000";
}
