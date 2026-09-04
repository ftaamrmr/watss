import Link from "next/link"
import { cookies } from "next/headers"
import { Check } from "lucide-react"

import { billingAdmin } from "@/lib/billing/admin-client"
import { translate, dirOf, LOCALE_COOKIE, type Locale } from "@/i18n/shared"
import { APP_NAME } from "@/lib/branding"

// /pricing — public SaaS pricing. Plans come from the database
// (server-side read), never a hardcoded copy.
export const dynamic = "force-dynamic"

const FEATURE_ROWS: { key: string; ar: string; en: string }[] = [
  { key: "team_members", ar: "أعضاء الفريق", en: "Team members" },
  { key: "whatsapp_accounts", ar: "أرقام واتساب", en: "WhatsApp numbers" },
  { key: "contacts", ar: "جهات الاتصال", en: "Contacts" },
  { key: "monthly_messages", ar: "رسائل شهرية", en: "Monthly messages" },
  { key: "broadcasts_per_month", ar: "حملات شهرية", en: "Broadcasts / month" },
  { key: "automations", ar: "أتمتة", en: "Automations" },
  { key: "ai_requests_per_month", ar: "طلبات ذكاء اصطناعي", en: "AI requests / month" },
]

export default async function PricingPage() {
  const locale = ((await cookies()).get(LOCALE_COOKIE)?.value ?? "ar") as Locale
  const dir = dirOf(locale)
  const ar = locale === "ar"

  const { data: plans } = await billingAdmin()
    .from("plans")
    .select("*")
    .eq("is_active", true)
    .eq("is_public", true)
    .order("sort_order", { ascending: true })

  const fmt = (amount: number, currency: string) =>
    new Intl.NumberFormat(ar ? "ar-SA" : "en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount)

  return (
    <div dir={dir} className="min-h-screen bg-background px-4 py-16">
      <div className="mx-auto max-w-5xl">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-foreground">
            {ar ? "أسعار بسيطة وواضحة" : "Simple, transparent pricing"}
          </h1>
          <p className="mt-2 text-muted-foreground">
            {ar
              ? "ابدأ بتجربة مجانية — بدون بطاقة ائتمانية"
              : "Start with a free trial — no credit card required"}
          </p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {(plans ?? []).map((p) => (
            <div
              key={p.id}
              className={`flex flex-col rounded-2xl border p-6 ${
                p.is_default ? "border-primary shadow-lg" : "border-border bg-card"
              }`}
            >
              <h2 className="text-lg font-semibold text-foreground">
                {ar ? p.name_ar : p.name_en}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {ar ? p.description_ar : p.description_en}
              </p>
              <div className="mt-4">
                <span className="text-3xl font-bold text-foreground">
                  {fmt(p.price_monthly, p.currency)}
                </span>
                <span className="text-sm text-muted-foreground">
                  {ar ? " / شهريًا" : " / month"}
                </span>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {fmt(p.price_yearly, p.currency)} {ar ? "/ سنويًا" : "/ year"}
              </div>
              <ul className="mt-6 flex-1 space-y-2 text-sm">
                {FEATURE_ROWS.map((row) => {
                  const v = p.limits?.[row.key]
                  if (v === undefined) return null
                  return (
                    <li key={row.key} className="flex items-center gap-2 text-foreground">
                      <Check className="h-4 w-4 text-primary" />
                      <span>
                        {ar ? row.ar : row.en}:{" "}
                        <b dir="ltr">{v < 0 ? (ar ? "غير محدود" : "Unlimited") : v.toLocaleString(ar ? "ar-SA" : "en-US")}</b>
                      </span>
                    </li>
                  )
                })}
              </ul>
              <Link
                href="/signup"
                className="mt-6 inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                {ar ? "ابدأ تجربتك المجانية" : "Start Free Trial"}
              </Link>
              <p className="mt-2 text-center text-xs text-muted-foreground">
                {p.trial_days} {ar ? "يوم تجريبي" : "days free trial"}
              </p>
            </div>
          ))}
        </div>

        <p className="mt-10 text-center text-sm text-muted-foreground">
          {ar ? "لديك حساب بالفعل؟" : "Already have an account?"}{" "}
          <Link href="/login" className="text-primary hover:underline">
            {translate(locale, "auth_login_page.001")}
          </Link>
        </p>
        <p className="mt-2 text-center text-xs text-muted-foreground">{APP_NAME}</p>
      </div>
    </div>
  )
}
