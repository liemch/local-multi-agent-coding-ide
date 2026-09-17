import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import vi from "@/locales/vi.json";
import en from "@/locales/en.json";

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(tree)) {
    const full = `${prefix}${key}`;
    if (typeof value === "string") out[full] = value;
    else Object.assign(out, flatten(value, `${full}.`));
  }
  return out;
}

const viFlat = flatten(vi as Tree);
const enFlat = flatten(en as Tree);

describe("locale files", () => {
  it("Vietnamese is the default and is fully populated", () => {
    expect(Object.keys(viFlat).length).toBeGreaterThan(200);
    for (const [key, value] of Object.entries(viFlat)) {
      expect(value.trim(), key).not.toBe("");
    }
  });

  it("English has exactly the same key set (no missing translations)", () => {
    const viKeys = new Set(Object.keys(viFlat));
    const enKeys = new Set(Object.keys(enFlat));
    const missingInEn = [...viKeys].filter((key) => !enKeys.has(key));
    const missingInVi = [...enKeys].filter((key) => !viKeys.has(key));
    expect(missingInEn).toEqual([]);
    expect(missingInVi).toEqual([]);
  });

  it("covers every UI surface required by the plan", () => {
    for (const prefix of [
      "nav.",
      "tasks.",
      "agents.",
      "git.",
      "settings.",
      "terminal.",
      "editor.",
      "explorer.",
      "console.",
      "usage.",
      "commandPalette.",
      "firstRun.",
      "dashboard.",
      "security.",
    ]) {
      expect(Object.keys(viFlat).some((key) => key.startsWith(prefix)), prefix).toBe(true);
    }
  });

  it("translates task statuses and usage statuses", () => {
    for (const status of ["draft", "running", "paused", "completed", "failed", "human_control"]) {
      expect(viFlat[`tasks.status.${status}`], status).toBeTruthy();
    }
    for (const status of ["available", "warning", "rate_limited", "quota_exhausted", "unknown"]) {
      expect(viFlat[`usage.status.${status}`], status).toBeTruthy();
    }
  });
});

describe("no hard-coded UI strings (plan §5, rule: i18n everywhere)", () => {
  const root = path.resolve(__dirname, "..", "src");

  function walk(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      return entry.name.endsWith(".tsx") ? [full] : [];
    });
  }

  it("every t() key used by a component exists in the Vietnamese locale", () => {
    const missing: string[] = [];

    for (const file of walk(root)) {
      const source = fs.readFileSync(file, "utf8");
      for (const match of source.matchAll(/\bt\(\s*"([a-zA-Z][\w.]*\.[\w.]+)"/g)) {
        const key = match[1];
        if (!(key in viFlat)) missing.push(`${key} (${path.relative(root, file)})`);
      }
    }

    expect(missing).toEqual([]);
  });
});
