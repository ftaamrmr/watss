import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { isPlatformAdmin } from "@/lib/admin"

// /admin — platform-operator area. Server-side gate: non platform
// admins never see the shell. Every /api/admin/* route re-checks
// independently (defense in depth).
export const dynamic = "force-dynamic"

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  if (!(await isPlatformAdmin(user.id))) redirect("/dashboard")

  return <>{children}</>
}
