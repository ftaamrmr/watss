# Upstream Strategy — ftaamrmr/watss

> Generated: 2026-07-07  
> Fork: `https://github.com/ftaamrmr/watss`  
> Upstream: `https://github.com/ArnasDon/wacrm`

---

## 1. Repository Relationship

| | URL |
|---|---|
| **origin (this fork)** | `https://github.com/ftaamrmr/watss` |
| **upstream (reference)** | `https://github.com/ArnasDon/wacrm` |

The fork is currently **2 commits ahead** of upstream at the time of this assessment:

```
88dcc57  Initial plan          ← local-only commit
274db1c  Merge pull request #334 from ArnasDon/feat/ai-agents-sidebar  ← last upstream merge
```

---

## 2. Configuring the Upstream Remote

The upstream remote is **not currently configured**. Add it once:

```bash
git remote add upstream https://github.com/ArnasDon/wacrm.git
git fetch upstream
```

Verify:
```bash
git remote -v
# origin    https://github.com/ftaamrmr/watss.git (fetch)
# origin    https://github.com/ftaamrmr/watss.git (push)
# upstream  https://github.com/ArnasDon/wacrm.git (fetch)
# upstream  https://github.com/ArnasDon/wacrm.git (push)
```

---

## 3. Fetching Upstream Updates

```bash
git fetch upstream
```

See what changed:
```bash
git log upstream/main --oneline --not origin/main | head -20
```

Or compare diffs:
```bash
git diff origin/main..upstream/main -- src/
```

---

## 4. Merge Strategy (Recommended)

Use **merge** (not rebase) to preserve this fork's history and avoid rewriting commits that have already been pushed:

```bash
git fetch upstream
git checkout main
git merge upstream/main --no-ff -m "chore: merge upstream ArnasDon/wacrm main"
```

**Why merge over rebase:**
- Rebasing rewrites public commit SHAs — breaks any open PRs or CI references.
- A merge commit makes the integration point explicit and auditable.
- Force-pushing a rebased `main` to `origin` is prohibited by our fork policy.

---

## 5. Conflict Strategy

### Files most likely to conflict with upstream

| File / Directory | Risk | Reason |
|---|---|---|
| `supabase/migrations/` | **High** | New upstream migrations will conflict with local SaaS additions (commerce, Groq, etc.) |
| `src/lib/ai/` | **High** | Upstream regularly extends AI features; local adds Groq/OpenRouter |
| `src/lib/whatsapp/` | **Medium** | Upstream may fix WhatsApp; local should not diverge core send/webhook logic |
| `src/app/api/whatsapp/` | **Medium** | Route changes can conflict |
| `src/app/(dashboard)/settings/` | **Medium** | AI/WhatsApp config UI may change upstream |
| `src/middleware.ts` | **Low** | Stable; local changes are minimal |
| `next.config.ts` | **Low** | Security headers are local additions; upstream may change config |
| `package.json` | **Low** | Dependency bumps — accept upstream version unless local pin is intentional |

### Conflict resolution rules

1. **Database migrations:** Never modify upstream migration files. Add new migrations with the next sequential number. If upstream adds `031_*.sql`, add ours as `032_*.sql`.
2. **Core WhatsApp lib:** Prefer upstream fixes for `meta-api.ts`, `webhook-signature.ts`, `encryption.ts`. Apply local extensions on top, not instead.
3. **AI providers:** `src/lib/ai/providers/openai.ts` and `anthropic.ts` — prefer upstream. Add `groq.ts` and `openrouter.ts` as new files.
4. **UI components:** Local additions (Commerce Sidebar, Contact 360) should be new files. Avoid editing upstream component internals unless fixing a bug.
5. **Routes:** Local SaaS routes (`/api/salla/`, `/api/commerce/`) are new files. Upstream webhook/send routes — prefer upstream, patch on top.

---

## 6. Rebase Policy

**Do not rebase `main` against upstream.** Rationale:

- Rebasing rewrites commit SHAs, breaking any open PRs and GitHub Actions runs referencing those commits.
- Our fork intentionally diverges (SaaS features, Rooz Commerce AI additions).
- A merge commit preserves the exact divergence point for future reference.

**Rebase is only acceptable** for local feature branches that have never been pushed, or where the branch is yours alone and no PR references it.

---

## 7. Fork Drift Prevention

### Practices that reduce drift

- **Extend, don't replace.** Add new provider files, new migration files, new route files. Edit upstream files only to fix bugs, not to restructure them.
- **Keep SaaS additions in their own modules:**
  - `src/lib/commerce/` — CommerceProvider + SallaProvider
  - `src/lib/ai/providers/groq.ts` — Groq provider (new file)
  - `src/lib/ai/providers/openrouter.ts` — OpenRouter provider (new file)
  - `src/app/api/salla/` — Salla OAuth routes
  - `src/app/api/commerce/` — Unified commerce routes
- **Watch upstream tags/releases.** Subscribe to ArnasDon/wacrm releases in GitHub to catch breaking changes early.
- **Run `git fetch upstream && git log upstream/main --oneline --not origin/main` monthly** to detect drift before it accumulates.
- **Avoid massive renames.** If upstream renames a file, apply the rename as a separate commit before adding your changes on top.

### Practices that increase drift (avoid)

- Editing migration files that came from upstream
- Restructuring `src/lib/whatsapp/` layout
- Moving `src/app/api/whatsapp/` to a different path
- Changing the Supabase client factory pattern
- Large-scale variable/function renames inside upstream files

---

## 8. Recommended Merge Checklist (Before Each Upstream Merge)

```bash
# 1. Fetch latest
git fetch upstream

# 2. Review what changed
git log upstream/main --oneline --not origin/main

# 3. Check for migration conflicts
git diff origin/main..upstream/main -- supabase/migrations/

# 4. Check for AI/WhatsApp changes
git diff origin/main..upstream/main -- src/lib/ai/ src/lib/whatsapp/

# 5. Merge (no rebase)
git merge upstream/main --no-ff

# 6. Resolve conflicts — follow rules in Section 5
# 7. Run tests
npm test

# 8. Run typecheck
npm run typecheck

# 9. Commit merge (if tests pass)
git commit -m "chore: merge upstream ArnasDon/wacrm YYYY-MM-DD"
```

---

## 9. Summary

| Aspect | Decision |
|---|---|
| Merge strategy | `git merge --no-ff` (no rebase of `main`) |
| Migration strategy | Sequential new files; never edit upstream migrations |
| Provider strategy | New files in `src/lib/ai/providers/` and `src/lib/commerce/` |
| Conflict resolution | Prefer upstream for core; local extensions on top |
| Force push policy | **Prohibited** on `main` |
| History rewrite policy | **Prohibited** on any pushed branch |
| Drift monitoring | Monthly `git fetch upstream` + diff review |
