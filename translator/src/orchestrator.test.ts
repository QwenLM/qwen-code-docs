import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

const orchestrator = path.resolve(__dirname, "../orchestrator/orchestrator.mjs");

test("rejects target-only frontmatter", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "qwen-orchestrator-test-"));
  const contentDir = path.join(root, "content");
  const manifest = path.join(root, "manifest.json");

  try {
    fs.mkdirSync(path.join(contentDir, "en"), { recursive: true });
    fs.mkdirSync(path.join(contentDir, "zh"), { recursive: true });
    fs.writeFileSync(path.join(contentDir, "en", "commands.md"), "# Commands\n");
    fs.writeFileSync(
      path.join(contentDir, "zh", "commands.md"),
      "---\n\n# 命令\n"
    );
    fs.writeFileSync(
      manifest,
      JSON.stringify({ createdAt: 0, files: ["docs/commands.md"] })
    );

    const result = spawnSync(
      process.execPath,
      [
        orchestrator,
        "verify",
        "--lang",
        "zh",
        "--content-dir",
        contentDir,
        "--manifest",
        manifest,
      ],
      { encoding: "utf8" }
    );

    assert.equal(result.status, 1, result.stdout || result.stderr);
    assert.match(result.stdout, /FAIL zh commands\.md.*frontmatter mismatch/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
