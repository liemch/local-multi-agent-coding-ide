import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";
import pkg from "../package.json";

const cli = path.resolve("bin/local-agent-ide.mjs");
describe("CLI", () => {
  it("prints help without starting the server", () => {
    const output = execFileSync(process.execPath, [cli, "--help"], { encoding: "utf8" });
    expect(output).toContain("--data-dir");
    expect(output).toContain("--no-open");
  });
  it("prints the package version", () => {
    expect(execFileSync(process.execPath, [cli, "--version"], { encoding: "utf8" }).trim()).toBe(pkg.version);
  });
});
