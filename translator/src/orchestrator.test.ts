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

test("self-heals closed target-only frontmatter without refreshing a stale file", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "qwen-orchestrator-test-"));
  const contentDir = path.join(root, "content");
  const manifest = path.join(root, "manifest.json");
  const target = path.join(contentDir, "zh", "commands.md");

  try {
    fs.mkdirSync(path.join(contentDir, "en"), { recursive: true });
    fs.mkdirSync(path.join(contentDir, "zh"), { recursive: true });
    fs.writeFileSync(path.join(contentDir, "en", "commands.md"), "# Commands\n");
    fs.writeFileSync(target, "---\ntitle: Commands\n---\n# 命令\n");
    const stale = new Date("2000-01-01T00:00:00Z");
    fs.utimesSync(target, stale, stale);
    fs.writeFileSync(
      manifest,
      JSON.stringify({ createdAt: Date.now(), files: ["docs/commands.md"] })
    );

    const verify = () =>
      spawnSync(
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

    for (let i = 0; i < 2; i++) {
      const result = verify();
      assert.equal(result.status, 1, result.stdout || result.stderr);
      assert.match(result.stdout, /target not touched this session/);
    }
    assert.equal(fs.readFileSync(target, "utf8"), "# 命令\n");
    assert.equal(fs.statSync(target).mtimeMs, stale.getTime());

    fs.utimesSync(target, new Date(), new Date());
    const result = verify();
    assert.equal(result.status, 0, result.stdout || result.stderr);
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

test("report writes a zero-work artifact on quiet runs", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "qwen-metrics-test-"));
  const summary = path.join(root, "summary.md");

  try {
    const result = spawnSync(
      process.execPath,
      [orchestrator, "report", "--baseline", path.join(root, "last-sync.json")],
      {
        encoding: "utf8",
        env: { ...process.env, GITHUB_STEP_SUMMARY: summary },
      }
    );

    assert.equal(result.status, 0, result.stdout || result.stderr);
    const metrics = JSON.parse(
      fs.readFileSync(path.join(root, "translation-metrics.json"), "utf8")
    );
    assert.equal(metrics.totals.dispatched, 0);
    assert.match(fs.readFileSync(summary, "utf8"), /\*\*0\*\*.*\*\*0\*\*/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("report only counts a zero-exit retry as recovered", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "qwen-retry-test-"));

  try {
    fs.writeFileSync(
      path.join(root, "orchestrator-manifest-zh.metrics.json"),
      JSON.stringify({
        lang: "zh",
        dispatchedAt: 1,
        completedAt: 2,
        dispatched: 5,
        verified: 0,
        failures: [],
      })
    );
    fs.writeFileSync(
      path.join(root, "orchestrator-agent-zh.log"),
      "Loop detection halted\n[orch] agent exit=1\n"
    );
    fs.writeFileSync(
      path.join(root, "orchestrator-agent-zh-retry1.log"),
      "another failure\n[orch] agent exit=1\n"
    );

    const result = spawnSync(
      process.execPath,
      [orchestrator, "report", "--baseline", path.join(root, "last-sync.json")],
      { encoding: "utf8" }
    );

    assert.equal(result.status, 0, result.stdout || result.stderr);
    const metrics = JSON.parse(
      fs.readFileSync(path.join(root, "translation-metrics.json"), "utf8")
    );
    assert.equal(metrics.totals.retriesAttempted, 1);
    assert.equal(metrics.totals.retriesRecovered, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("contamination parsing is source-aware and respects Markdown code", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "qwen-cjk-test-"));
  const contentDir = path.join(root, "content");
  const manifest = path.join(root, "manifest.json");

  try {
    fs.mkdirSync(path.join(contentDir, "en"), { recursive: true });
    fs.mkdirSync(path.join(contentDir, "ko"), { recursive: true });
    const files = {
      "generic.md": ["# Bot\n", "# 봇\n机器人模式\n"],
      "allowlist.md": ["# File\n", "# 파일\n文件\n"],
      "quoted.md": ["The UI says 文件.\n", "UI: 文件.\n"],
      "fenced.md": [
        "````md\n```\nexample\n```\n````\n",
        "````md\n```\n操作步骤\n```\n````\n",
      ],
      "inline.md": [
        "Use ``command `mode` `` here.\n",
        "Use ``机器人 `mode` `` here.\n",
      ],
    };
    for (const [name, [en, ko]] of Object.entries(files)) {
      fs.writeFileSync(path.join(contentDir, "en", name), en);
      fs.writeFileSync(path.join(contentDir, "ko", name), ko);
    }
    fs.writeFileSync(
      manifest,
      JSON.stringify({
        createdAt: 0,
        files: Object.keys(files).map((name) => `docs/${name}`),
      })
    );

    const result = spawnSync(
      process.execPath,
      [
        orchestrator,
        "verify",
        "--lang",
        "ko",
        "--content-dir",
        contentDir,
        "--manifest",
        manifest,
      ],
      { encoding: "utf8" }
    );

    assert.equal(result.status, 1, result.stdout || result.stderr);
    assert.match(result.stdout, /FAIL ko generic\.md.*source-language contamination/);
    assert.match(result.stdout, /FAIL ko allowlist\.md.*source-language contamination/);
    assert.match(result.stdout, /PASS ko quoted\.md/);
    assert.match(result.stdout, /PASS ko fenced\.md/);
    assert.match(result.stdout, /PASS ko inline\.md/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
