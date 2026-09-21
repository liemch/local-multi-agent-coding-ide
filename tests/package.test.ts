import fs from "node:fs";
import { describe, expect, it } from "vitest";
import pkg from "../package.json";

describe("npm package metadata", () => {
  it("publishes only runtime files with a supported CLI", () => {
    expect(pkg.name).toBe("@liemch/local-agent-ide");
    expect(pkg.bin["local-agent-ide"]).toBe("bin/local-agent-ide.mjs");
    expect(pkg.engines.node).toBe(">=22.5");
    expect(pkg.files).not.toContain("src/");
    expect(pkg.files).not.toContain("tests/");
  });
  it("has an executable shebang", () => {
    const cli = fs.readFileSync("bin/local-agent-ide.mjs", "utf8");
    expect(cli.startsWith("#!/usr/bin/env node")).toBe(true);
    if (process.platform !== "win32") expect(fs.statSync("bin/local-agent-ide.mjs").mode & 0o111).not.toBe(0);
  });
});
