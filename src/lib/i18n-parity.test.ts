import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"

// i18n parity: ar.json and en.json must carry identical key sets, and
// every non-empty key must exist in both. Catches "added the English
// string, forgot the Arabic one" at CI time.
const dir = join(__dirname, "..", "i18n", "messages")
const en = JSON.parse(readFileSync(join(dir, "en.json"), "utf8")) as Record<string, string>
const ar = JSON.parse(readFileSync(join(dir, "ar.json"), "utf8")) as Record<string, string>

describe("i18n dictionaries", () => {
  it("have identical key sets", () => {
    const enOnly = Object.keys(en).filter((k) => !(k in ar))
    const arOnly = Object.keys(ar).filter((k) => !(k in en))
    expect(enOnly).toEqual([])
    expect(arOnly).toEqual([])
  })

  it("have no empty translations", () => {
    for (const [k, v] of Object.entries(en)) {
      expect(v.trim(), `en:${k}`).not.toBe("")
    }
    for (const [k, v] of Object.entries(ar)) {
      expect(v.trim(), `ar:${k}`).not.toBe("")
    }
  })

  it("keeps {placeholders} consistent across locales", () => {
    const vars = (s: string) => (s.match(/\{[^}]+\}/g) ?? []).sort()
    for (const k of Object.keys(en)) {
      expect(vars(ar[k]), `placeholders for ${k}`).toEqual(vars(en[k]))
    }
  })
})
