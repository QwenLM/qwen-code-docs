import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
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

test("quarantine keeps a sound replacement over corrupt HEAD", () => {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "qwen-quarantine-test-"))
  );
  const contentDir = path.join(root, "website", "content");
  const copiedOrchestrator = path.join(
    root,
    "translator",
    "orchestrator",
    "orchestrator.mjs"
  );

  try {
    fs.mkdirSync(path.dirname(copiedOrchestrator), { recursive: true });
    fs.mkdirSync(path.join(contentDir, "en"), { recursive: true });
    fs.mkdirSync(path.join(contentDir, "zh"), { recursive: true });
    fs.copyFileSync(orchestrator, copiedOrchestrator);
    fs.writeFileSync(path.join(contentDir, "en", "repaired.md"), "# Repaired\n");
    fs.writeFileSync(path.join(contentDir, "zh", "repaired.md"), "---\n\n# 损坏\n");
    fs.writeFileSync(path.join(contentDir, "en", "restored.md"), "# Restored\n");
    fs.writeFileSync(path.join(contentDir, "zh", "restored.md"), "# 原版本\n");

    execFileSync("git", ["init", "-q"], { cwd: root });
    execFileSync("git", ["config", "user.email", "test@example.com"], {
      cwd: root,
    });
    execFileSync("git", ["config", "user.name", "Test"], { cwd: root });
    execFileSync("git", ["add", "."], { cwd: root });
    execFileSync("git", ["commit", "-qm", "fixture"], { cwd: root });

    fs.writeFileSync(path.join(contentDir, "zh", "repaired.md"), "# 已修复\n");
    fs.writeFileSync(path.join(contentDir, "zh", "restored.md"), "```\n# 损坏\n");
    fs.writeFileSync(
      path.join(root, "website", "orchestrator-manifest-zh.failed.txt"),
      "zh/repaired.md\nzh/restored.md\n"
    );

    const result = spawnSync(
      process.execPath,
      [
        copiedOrchestrator,
        "quarantine",
        "--content-dir",
        contentDir,
        "--baseline",
        path.join(root, "website", "last-sync.json"),
      ],
      { encoding: "utf8" }
    );

    assert.equal(result.status, 0, result.stdout || result.stderr);
    assert.ok(
      fs.existsSync(path.join(contentDir, "zh", "repaired.md")),
      result.stdout || result.stderr
    );
    assert.equal(
      fs.readFileSync(path.join(contentDir, "zh", "repaired.md"), "utf8"),
      "# 已修复\n"
    );
    assert.equal(
      fs.readFileSync(path.join(contentDir, "zh", "restored.md"), "utf8"),
      "# 原版本\n"
    );
    assert.match(result.stdout, /1 restored from HEAD, 1 kept over a corrupt HEAD/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("report-batch counts dispatches that never reach verify", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "qwen-report-test-"));
  const summary = path.join(root, "summary.md");

  try {
    fs.writeFileSync(
      path.join(root, "orch-out-zh.log"),
      "dispatching agent for 5 file(s)\nverify 5/5 passed\n"
    );
    fs.writeFileSync(
      path.join(root, "orch-out-ja.log"),
      "dispatching agent for 5 file(s)\nagent exited before verify\n"
    );

    const result = spawnSync(
      process.execPath,
      [orchestrator, "report-batch", "--log-dir", root],
      {
        encoding: "utf8",
        env: { ...process.env, GITHUB_STEP_SUMMARY: summary },
      }
    );

    assert.equal(result.status, 0, result.stdout || result.stderr);
    assert.match(result.stdout, /Verified 5\/10.*\(50%\)/);
    assert.match(result.stdout, /5 dispatched file-translations had no verify result/);
    assert.match(fs.readFileSync(summary, "utf8"), /Verified 5\/10/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
