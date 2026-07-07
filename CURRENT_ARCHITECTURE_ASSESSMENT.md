# Current Architecture Assessment — ftaamrmr/watss

> Generated: 2026-07-07  
> Auditor: Copilot Coding Agent  
> Commands run: `npm install`, `npm run typecheck`, `npm run test`, `npm run lint`, `npm run build`

---

## 1. Existing Architecture

### Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.2.6 (App Router, Turbopack) |
| Runtime | Node.js ≥ 20 |
| Database | Supabase (PostgreSQL + RLS + Edge Functions) |
| Auth | Supabase Auth (SSR cookie-based) |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Testing | Vitest |
| CI/CD | GitHub Actions (`.github/`) |
| Deployment | Docker / Coolify / self-hosted VPS |

### Directory Layout

```
src/
  app/
    (auth)/         – login, signup, forgot-password
    (dashboard)/    – inbox, contacts, pipelines, broadcasts,
                      automations, flows, settings, agents,
                      notifications, dashboard
    api/
      account/      – account CRUD, invitations, members
      ai/           – draft, auto-reply, knowledge base
      automations/  – CRUD + cron trigger
      flows/        – CRUD, run, media upload
      invitations/  – invite accept / list
      v1/           – public REST API (auth via API keys)
      whatsapp/     – config, send, templates, webhook
  lib/
    ai/             – OpenAI/Anthropic providers, config, knowledge
    api-keys/       – hashing, scopes, creation
    auth/           – requireRole(), roles, invitations, account ctx
    automations/    – engine, admin-client, meta-send
    contacts/       – dedupe, CSV parse
    dashboard/      – date utils
    flows/          – engine, layout, fallback
    inbox/          – conversation helpers
    rate-limit/     – in-memory rate limiter
    storage/        – media upload
    supabase/       – client.ts + server.ts
    webhooks/       – SSRF guard, signing, delivery, endpoints
    whatsapp/       – encryption (AES-256-GCM), meta-api, phone-utils,
                      send-message, broadcast-core, templates, webhook-signature
  components/       – UI components (inbox, contacts, flows, settings …)
  types/            – shared TypeScript types
  middleware.ts     – Supabase session refresh + route protection
supabase/
  migrations/       – 30 numbered SQL migrations (001–030)
```

### Database Schema (from migrations)

| Table | Purpose |
|---|---|
| `profiles` | User profiles, linked to `auth.users`, carries `account_id` + `account_role` |
| `accounts` | Multi-tenant accounts; one per user by default |
| `account_invitations` | Invite tokens for workspace sharing |
| `contacts` | CRM contacts (phone, name, email, company) |
| `tags` / `contact_tags` | Contact tags (many-to-many) |
| `conversations` | WhatsApp conversations per contact |
| `messages` | Individual messages (inbound + outbound) |
| `pipelines` / `deals` | Kanban sales pipeline |
| `broadcasts` | Broadcast campaigns with template selection |
| `broadcast_recipients` | Per-contact broadcast tracking with WAMID |
| `automations` / `automation_steps` / `automation_logs` | No-code automation engine |
| `flows` / `flow_nodes` / `flow_runs` | Visual flow builder |
| `whatsapp_config` | Encrypted WhatsApp credentials per account |
| `message_templates` | Synced Meta message templates |
| `api_keys` | Hashed public API keys (scoped) |
| `webhook_endpoints` | Outbound webhooks |
| `notifications` | In-app notifications |
| `ai_configs` | Per-account AI provider keys (encrypted) |
| `ai_knowledge` | Knowledge base entries for AI assistant |

---

## 2. Existing Features

| Feature | Status |
|---|---|
| Auth (login/signup/forgot-password) | ✅ Complete |
| Multi-tenant accounts (account_sharing) | ✅ Complete (migration 017+) |
| RBAC (owner/admin/agent/viewer) | ✅ Complete |
| Account invitations | ✅ Complete |
| Shared Inbox | ✅ Complete (conversation list, thread, assignment) |
| Contacts CRM | ✅ Complete (dedupe, CSV import, tags, custom fields) |
| Sales Pipelines (Kanban) | ✅ Complete |
| WhatsApp Cloud API integration | ✅ Complete (official Meta API) |
| Webhook signature verification (HMAC-SHA256) | ✅ Complete, fail-closed |
| Token encryption (AES-256-GCM) | ✅ Complete (CBC legacy decrypt support) |
| Inbound media handling | ✅ Complete (image, video, audio, sticker, document) |
| Outbound messages (text + templates + media) | ✅ Complete |
| Message templates (Meta sync) | ✅ Complete |
| Broadcast campaigns | ✅ Complete |
| No-code Automation Engine | ✅ Complete (keyword, tag, pipeline triggers) |
| Visual Flow Builder | ✅ Complete (node-based with @xyflow/react) |
| AI Draft Reply | ✅ Complete (OpenAI + Anthropic, bring-your-own-key) |
| AI Auto-Reply | ✅ Complete |
| AI Knowledge Base | ✅ Complete (full-text + optional pgvector embeddings) |
| Public REST API (v1) | ✅ Complete (API keys, scopes, messages/contacts/conversations/broadcasts) |
| Outbound webhooks | ✅ Complete (SSRF guard, HMAC signing) |
| Rate limiting | ✅ Complete (in-memory) |
| Security headers (HSTS, CSP, X-Frame, etc.) | ✅ Complete (CSP in report-only mode) |
| Member presence (online indicator) | ✅ Complete |
| Notification system | ✅ Complete |
| Phone number normalization | ✅ Complete |
| Cron endpoint for automation Wait steps | ✅ Complete (secret-protected) |

---

## 3. Reusable Components

- **`src/lib/whatsapp/`** — complete WhatsApp Cloud API abstraction (send, broadcast, templates, webhook verification, encryption, phone normalization). Reusable as a `MessagingProvider` base.
- **`src/lib/auth/`** — `requireRole()` pattern, typed errors (UnauthorizedError/ForbiddenError), role hierarchy. Solid foundation for RBAC extensions.
- **`src/lib/ai/`** — provider-agnostic AI layer (OpenAI + Anthropic). Extensible to Groq/OpenRouter by adding new provider files.
- **`src/lib/automations/engine.ts`** — trigger-driven automation runner; can be extended with commerce triggers.
- **`src/lib/webhooks/`** — SSRF-guarded, HMAC-signed outbound webhook delivery.
- **`src/lib/api-keys/`** — hashed API key auth with scopes.
- **`supabase/migrations/`** — 30 idempotent migrations, well-structured with comments.

---

## 4. Missing Components (P0 Gaps)

| Component | Gap |
|---|---|
| **CommerceProvider abstraction** | No commerce integration layer exists |
| **SallaProvider** | No Salla OAuth / API integration |
| **Commerce Sidebar in inbox** | No customer/order lookup in conversation UI |
| **Contact 360 view** | No order history / spend on contact profile |
| **Groq / OpenRouter AI providers** | Only OpenAI + Anthropic configured |
| **AI Agent Tools (tool-calling)** | No structured tool-calling implementation |
| **Human Handoff** | No AI pause / handoff trigger mechanism |
| **Usage tracking** | No AI token / message usage aggregation |
| **Super Admin Panel** | No cross-account admin view |
| **Health / ready endpoints** | `/health` and `/ready` routes not present |
| **DEPLOYMENT.md / COOLIFY_DEPLOYMENT.md** | Deployment guides absent |
| **SECURITY_AUDIT.md** | Security audit document absent |

---

## 5. Broken Components

| Component | Issue |
|---|---|
| **`middleware.ts` — `options` param** | Lint warning: `options` in `setAll` callback is unused (harmless but noisy) |
| **`contact-form.tsx`** | Unused import `Badge` |
| **`contact-sidebar.tsx`** | Unused imports `cn`, `User` |
| **`conversation-list.tsx` / `message-bubble.tsx`** | `<img>` instead of Next.js `<Image>` |
| **`message-thread.tsx`** | Unused import `ScrollArea` |
| **`settings-overview.tsx` / `whatsapp-config.tsx`** | `useEffect` missing `user` dependency |
| **`contact-form.tsx`** | `useEffect` missing `contactTags` / `fetchTags` deps |
| **Google Fonts build** | Build fails in network-restricted environments (sandbox/offline CI) because Next.js tries to fetch `fonts.googleapis.com`. Needs `export const NEXT_FONT_GOOGLE_MOCKED_RESPONSES` or `localFont` fallback. Not a runtime issue on a connected server. |
| **CSP in report-only** | `Content-Security-Policy-Report-Only` is intentionally report-only but should be enforced before production. |

---

## 6. Security Risks

| Risk | Severity | Notes |
|---|---|---|
| **CSP not enforced** | Medium | `Content-Security-Policy-Report-Only` — flip to `Content-Security-Policy` once verified |
| **ENCRYPTION_KEY unchecked at startup** | Medium | App boots without the key; `encrypt()` throws at runtime on first use. A startup check would surface misconfiguration immediately |
| **Unused `options` in middleware `setAll`** | Low | Cosmetic; no security impact |
| **`<img>` tags** | Low | LCP / bandwidth; not a security risk |
| **Rate limiter is in-memory** | Low | Resets on restart; fine for single-instance, not for horizontal scale |
| **Cron endpoint** | Low | Protected by `AUTOMATION_CRON_SECRET`; documented clearly |

No critical security issues found. Existing implementations include:
- Timing-safe HMAC comparison (`timingSafeEqual`) in webhook verification
- Fail-closed behavior when `META_APP_SECRET` is missing
- AES-256-GCM encryption for provider credentials
- Hashed (not plaintext) API key storage
- SSRF guard on outbound webhooks
- RLS on all domain tables
- `requireRole()` enforced in all sensitive API routes

---

## 7. Multi-Tenancy Risks

The multi-tenant foundation (migration 017+) is solid:
- `account_id` on all domain tables
- `is_account_member()` SECURITY DEFINER RLS helper
- `requireRole()` server-side enforcement
- Role hierarchy: owner > admin > agent > viewer

**Remaining risks:**
- `profiles.role TEXT` (legacy column) is still present — note for future cleanup
- Storage buckets (avatars) are still user-scoped, not account-scoped
- `flow-media` bucket is noted in migration 017 as needing account-path rescoping in a later migration

---

## 8. Deployment Risks

| Risk | Notes |
|---|---|
| **Google Fonts network dependency** | Build fails offline; affects CI/CD in restricted environments. Mitigable with `NEXT_FONT_GOOGLE_MOCKED_RESPONSES=1` in CI or switching to `next/font/local` |
| **No `/health` or `/ready` endpoint** | Container orchestrators (Coolify, Docker Swarm, K8s) need these |
| **ENCRYPTION_KEY rotation** | Rotating the key orphans all stored encrypted tokens; no migration tooling exists yet |
| **No persistent storage docs** | Media upload paths need documentation for volume mounts |

---

## 9. Upstream Compatibility Risks

| Risk | Notes |
|---|---|
| **Fork is 2 commits ahead of upstream** | `88dcc57 Initial plan` is a local-only commit; upstream is at `274db1c` (merged PR #334) |
| **No upstream remote configured** | `git remote -v` shows only `origin`; upstream must be added manually |
| **Commerce additions will conflict with upstream** | New tables, routes, and provider layers should stay modular |
| **AI provider changes** | Adding Groq/OpenRouter should extend `src/lib/ai/providers/` without replacing existing OpenAI/Anthropic files |

---

## 10. Recommended P0 Plan

### Immediate (safe, low-risk fixes — this PR)
1. ✅ Create this assessment document
2. ✅ Create UPSTREAM_STRATEGY.md
3. Fix lint warnings in `middleware.ts`, unused imports, `useEffect` deps
4. Add `/api/health` route (simple JSON response)
5. Document build workaround for Google Fonts in offline CI

### Short-term (next PRs)
6. Enforce CSP (flip `Report-Only` → `Content-Security-Policy`) after verification
7. Add startup environment validation (check `ENCRYPTION_KEY`, `META_APP_SECRET`)
8. Add Groq + OpenRouter to `src/lib/ai/providers/`
9. Create `CommerceProvider` abstraction + `SallaProvider` skeleton
10. Add Commerce Sidebar in inbox conversation view
11. Add Contact 360 (orders/spend on contact profile)
12. Implement AI Agent tool-calling (search_customer, get_order_status, etc.)
13. Implement Human Handoff (pause AI, handoff summary, assign agent)
14. Add `/api/ready` route with DB connectivity check
15. Add DEPLOYMENT.md and COOLIFY_DEPLOYMENT.md

### Actual Build/Test Results

```
npm install   → 676 packages, 0 vulnerabilities
npm typecheck → 0 errors ✅
npm test      → 59 files, 593 tests, all passed ✅
npm lint      → 0 errors, 19 warnings (unused vars, img tags, useEffect deps)
npm build     → BLOCKED by Google Fonts fetch in sandbox (network restricted)
               → Not a code error; expected to succeed on connected server
```
