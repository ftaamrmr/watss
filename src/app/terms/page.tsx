import { cookies } from "next/headers"
import { dirOf, LOCALE_COOKIE, type Locale } from "@/i18n/shared"
import { APP_NAME, COMPANY_NAME, SUPPORT_EMAIL } from "@/lib/branding"

// /terms — Terms of Service shell. Company legal details (registration,
// VAT, addresses) are PLACEHOLDERS the WATSS operator must fill before
// charging customers.
export default async function TermsPage() {
  const locale = ((await cookies()).get(LOCALE_COOKIE)?.value ?? "ar") as Locale
  const dir = dirOf(locale)
  const ar = locale === "ar"
  const title = (ar ? "شروط الخدمة" : "Terms of Service")

  return (
    <div dir={dir} className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-bold text-foreground">{title}</h1>
      <p className="mt-4 text-sm text-muted-foreground">
        {ar
          ? `هذه الصفحة مقدمة من ${APP_NAME}. يجب على مشغّل المنصة استكمال التفاصيل القانونية للشركة (اسم الكيان، السجل التجاري، الرقم الضريبي، العنوان) قبل تفعيل الاشتراكات المدفوعة.`
          : `This page is provided by ${APP_NAME}. The platform operator must complete the company legal details (entity name, commercial registration, VAT number, address) before enabling paid subscriptions.`}
      </p>
      <div className="mt-8 space-y-4 rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
        <p>[PLACEHOLDER] {ar ? "اسم الكيان القانوني" : "Legal entity name"}: {COMPANY_NAME}</p>
        <p>[PLACEHOLDER] {ar ? "السجل التجاري" : "Commercial registration"}: —</p>
        <p>[PLACEHOLDER] {ar ? "الرقم الضريبي (VAT)" : "VAT number"}: —</p>
        <p>[PLACEHOLDER] {ar ? "بريد الدعم" : "Support email"}: {SUPPORT_EMAIL || "—"}</p>
      </div>
    </div>
  )
}
