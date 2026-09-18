import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  getCurrentBranch,
  getHead,
  gitCommit,
  gitCreateBranch,
  gitDiff,
  gitInit,
  gitLog,
  gitStatus,
  isGitRepository,
} from "@/lib/git";

const run = promisify(execFile);
let repo = "";
let plain = "";

beforeAll(async () => {
  repo = await fs.mkdtemp(path.join(os.tmpdir(), "ide-git-"));
  plain = await fs.mkdtemp(path.join(os.tmpdir(), "ide-plain-"));

  await gitInit(repo);
  await run("git", ["config", "user.email", "test@example.com"], { cwd: repo });
  await run("git", ["config", "user.name", "Test"], { cwd: repo });

  await fs.writeFile(path.join(repo, "README.md"), "# demo\n");
  await run("git", ["add", "."], { cwd: repo });
  await run("git", ["commit", "-m", "initial commit"], { cwd: repo });
});

afterAll(async () => {
  await fs.rm(repo, { recursive: true, force: true });
  await fs.rm(plain, { recursive: true, force: true });
});

describe("repository detection", () => {
  it("recognises a git repository", async () => {
    expect(await isGitRepository(repo)).toBe(true);
  });

  it("recognises a plain folder", async () => {
    expect(await isGitRepository(plain)).toBe(false);
  });

  it("returns a branch and a HEAD", async () => {
    expect(await getCurrentBranch(repo)).toBeTruthy();
    expect((await getHead(repo))?.length).toBeGreaterThanOrEqual(7);
  });

  it("returns null for branch/HEAD outside a repository", async () => {
    expect(await getCurrentBranch(plain)).toBeNull();
    expect(await getHead(plain)).toBeNull();
  });
});

describe("gitStatus", () => {
  it("reports a clean tree", async () => {
    const status = await gitStatus(repo);
    expect(status.dirty).toBe(false);
    expect(status.files).toHaveLength(0);
  });

  it("reports untracked and modified files with status codes", async () => {
    await fs.writeFile(path.join(repo, "new.txt"), "hello\n");
    await fs.appendFile(path.join(repo, "README.md"), "changed\n");

    const status = await gitStatus(repo);
    expect(status.dirty).toBe(true);

    const byPath = Object.fromEntries(status.files.map((file) => [file.path, file]));
    expect(byPath["new.txt"].code).toBe("?");
    expect(byPath["README.md"].code).toBe("M");
  });
});

describe("gitDiff", () => {
  it("returns a real unified diff for a modified file", async () => {
    const diff = await gitDiff(repo, "README.md");
    expect(diff).toContain("README.md");
    expect(diff).toContain("+changed");
  });

  it("returns the whole-tree diff when no path is given", async () => {
    expect(await gitDiff(repo)).toContain("README.md");
  });

  it("returns an empty string rather than throwing outside a repo", async () => {
    expect(await gitDiff(plain)).toBe("");
  });
});

describe("gitCommit", () => {
  it("commits staged and unstaged changes and appears in the log", async () => {
    const result = await gitCommit(repo, "feat: second commit");
    expect(result.ok).toBe(true);

    const log = await gitLog(repo);
    expect(log[0].message).toBe("feat: second commit");
    expect(log[0].hash).toBeTruthy();
    expect(log[0].author).toBe("Test");
    expect(new Date(log[0].date).toString()).not.toBe("Invalid Date");
    expect(log).toHaveLength(2);

    const status = await gitStatus(repo);
    expect(status.dirty).toBe(false);
  });

  it("fails cleanly when there is nothing to commit", async () => {
    const result = await gitCommit(repo, "empty");
    expect(result.ok).toBe(false);
    expect(result.output).toBeTruthy();
  });
});

describe("gitCreateBranch", () => {
  it("creates and switches to a task branch (plan §43)", async () => {
    const result = await gitCreateBranch(repo, "task/TASK-001-demo");
    expect(result.ok).toBe(true);
    expect(await getCurrentBranch(repo)).toBe("task/TASK-001-demo");
  });

  it("reports failure for an invalid branch name", async () => {
    const result = await gitCreateBranch(repo, "bad branch name!!");
    expect(result.ok).toBe(false);
  });
});
