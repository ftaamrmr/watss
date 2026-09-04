import Link from "next/link"
import { redirect } from "next/navigation"
import { cookies } from "next/headers"

import { createClient } from "@/lib/supabase/server"
import { dirOf, LOCALE_COOKIE, type Locale } from "@/i18n/shared"
import { APP_NAME } from "@/lib/branding"

// / — minimal SaaS landing for anonymous visitors; signed-in users go
// straight to their dashboard.
export const dynamic = "force-dynamic"

export default async function RootPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) {
    // First-run users (workspace profile never completed) go through
    // onboarding; everyone else lands on the dashboard.
    const { data: profile } = await supabase
      .from("profiles")
      .select("account_id")
      .eq("user_id", user.id)
      .maybeSingle()
    if (profile?.account_id) {
      const { data: account } = await supabase
        .from("accounts")
        .select("country")
        .eq("id", profile.account_id)
        .maybeSingle()
      if (account && account.country === null) redirect("/onboarding")
    }
    redirect("/dashboard")
  }

  const locale = ((await cookies()).get(LOCALE_COOKIE)?.value ?? "ar") as Locale
  const dir = dirOf(locale)
  const ar = locale === "ar"

  return (
    <div dir={dir} className="flex min-h-screen flex-col bg-background">
      <header className="flex items-center justify-between px-6 py-4">
        <span className="text-lg font-bold text-foreground">{APP_NAME}</span>
        <nav className="flex items-center gap-3">
          <Link href="/pricing" className="text-sm text-muted-foreground hover:text-foreground">
            {ar ? "الأسعار" : "Pricing"}
          </Link>
          <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground">
            {ar ? "تسجيل الدخول" : "Sign in"}
          </Link>
          <Link
            href="/signup"
            className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            {ar ? "ابدأ تجربتك المجانية" : "Start Free Trial"}
          </Link>
        </nav>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <h1 className="max-w-2xl text-4xl font-bold leading-tight text-foreground">
          {ar
            ? "منصة عربية لإدارة مبيعات وخدمة عملاء واتساب"
            : "The Arabic-first platform for WhatsApp sales & support"}
        </h1>
        <p className="mt-4 max-w-xl text-muted-foreground">
          {ar
            ? "صندوق وارد مشترك، جهات اتصال، مسارات مبيعات، حملات، أتمتة وذكاء اصطناعي — كلها في مكان واحد لفريقك."
            : "Shared inbox, contacts, pipelines, broadcasts, automations and AI — all in one place for your team."}
        </p>
        <div className="mt-8 flex gap-3">
          <Link
            href="/signup"
            className="inline-flex h-11 items-center rounded-lg bg-primary px-6 font-medium text-primary-foreground hover:bg-primary/90"
          >
            {ar ? "ابدأ تجربتك المجانية" : "Start Free Trial"}
          </Link>
          <Link
            href="/pricing"
            className="inline-flex h-11 items-center rounded-lg border border-border px-6 font-medium text-foreground hover:bg-muted"
          >
            {ar ? "الأسعار" : "Pricing"}
          </Link>
        </div>
      </main>

      <footer className="px-6 py-6 text-center text-xs text-muted-foreground">
        {APP_NAME} ·{" "}
        <Link href="/terms" className="hover:underline">
          {ar ? "الشروط" : "Terms"}
        </Link>{" "}
        ·{" "}
        <Link href="/privacy" className="hover:underline">
          {ar ? "الخصوصية" : "Privacy"}
        </Link>
      </footer>
    </div>
  )
}
