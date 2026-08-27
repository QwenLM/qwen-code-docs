import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

const orchestrator = path.resolve(__dirname, "../orchestrator/orchestrator.mjs");

test("translation agent has no general tools and cannot write undeclared paths", () => {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "qwen-isolation-test-"))
  );
  const project = path.join(root, "project");
  const upstream = path.join(root, "upstream");
  const contentDir = path.join(project, "website", "content");
  const copiedOrchestrator = path.join(
    project,
    "translator",
    "orchestrator",
    "orchestrator.mjs"
  );
  const fakeBin = path.join(root, "bin");
  const fakeQwen = path.join(fakeBin, "qwen");
  const target = path.join(contentDir, "zh", "guide.md");
  const baseline = path.join(project, "website", "last-sync.json");

  try {
    fs.mkdirSync(path.join(upstream, "docs"), { recursive: true });
    fs.writeFileSync(path.join(upstream, "docs", "guide.md"), "# Guide\nNew text.\n");
    fs.writeFileSync(
      path.join(upstream, "docs", "big.md"),
      `# Big\n${"x".repeat(2_000)}\n`
    );
    execFileSync("git", ["init", "-q", "-b", "main"], { cwd: upstream });
    execFileSync("git", ["config", "user.email", "test@example.com"], {
      cwd: upstream,
    });
    execFileSync("git", ["config", "user.name", "Test"], { cwd: upstream });
    execFileSync("git", ["add", "."], { cwd: upstream });
    execFileSync("git", ["commit", "-qm", "fixture"], { cwd: upstream });

    fs.mkdirSync(path.join(path.dirname(copiedOrchestrator), "prompts"), {
      recursive: true,
    });
    fs.mkdirSync(path.join(contentDir, "en"), { recursive: true });
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(orchestrator, copiedOrchestrator);
    fs.copyFileSync(
      path.resolve(__dirname, "../orchestrator/prompts/translate.md"),
      path.join(path.dirname(copiedOrchestrator), "prompts", "translate.md")
    );
    for (const name of ["glossary.zh.md", "STYLE.md"])
      fs.copyFileSync(
        path.resolve(__dirname, "../orchestrator", name),
        path.join(path.dirname(copiedOrchestrator), name)
      );
    fs.writeFileSync(path.join(contentDir, "en", "guide.md"), "# Guide\nNew text.\n");
    fs.writeFileSync(
      path.join(contentDir, "en", "big.md"),
      `# Big\n${"x".repeat(2_000)}\n`
    );
    fs.writeFileSync(target, "# 指南\n旧内容。\n");

    fs.mkdirSync(fakeBin, { recursive: true });
    fs.writeFileSync(
      fakeQwen,
      `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
for (const flag of ["--auth-type", "--core-tools", "--json-schema", "--max-tool-calls", "--system-prompt"])
  if (!args.includes(flag)) process.exit(20);
if (args.includes("--approval-mode") || args[args.indexOf("--auth-type") + 1] !== "openai" || args[args.indexOf("--core-tools") + 1] !== "structured_output" || args[args.indexOf("--max-tool-calls") + 1] !== "1") process.exit(21);
const prompt = fs.readFileSync(0, "utf8");
if (!prompt.includes("# Guide") || prompt.includes("sentinel-secret")) process.exit(22);
if (process.cwd().includes(${JSON.stringify(project)}) || process.env.HOME === ${JSON.stringify(process.env.HOME)}) process.exit(23);
const path = process.env.FAKE_ESCAPE === "1" ? "../../outside.md" : "guide.md";
const payload = { translations: [{ path, replacements: [{ old: "旧内容。", new: "新内容。" }] }] };
process.stdout.write(JSON.stringify([{ type: "result", is_error: false, structured_result: payload }]));
`
    );
    fs.chmodSync(fakeQwen, 0o755);

    const args = [
      copiedOrchestrator,
      "translate",
      "--lang",
      "zh",
      "--limit",
      "1",
      "--repo",
      upstream,
      "--branch",
      "main",
      "--content-dir",
      contentDir,
      "--baseline",
      baseline,
      "--temp-dir",
      path.join(root, "source-clone"),
      "--manifest",
      path.join(root, "manifest.json"),
    ];
    const env = {
      ...process.env,
      PATH: `${fakeBin}${path.delimiter}${process.env.PATH}`,
      OPENAI_API_KEY: "sentinel-secret",
    };
    const success = spawnSync(process.execPath, args, { encoding: "utf8", env });
    assert.equal(success.status, 0, success.stdout || success.stderr);
    assert.equal(fs.readFileSync(target, "utf8"), "# 指南\n新内容。\n");

    const rejected = spawnSync(process.execPath, args, {
      encoding: "utf8",
      env: { ...env, FAKE_ESCAPE: "1" },
    });
    assert.equal(rejected.status, 1, rejected.stdout || rejected.stderr);
    assert.match(rejected.stderr, /unexpected or duplicate translation path/);
    assert.equal(fs.readFileSync(target, "utf8"), "# 指南\n新内容。\n");
    assert.equal(fs.existsSync(path.join(root, "outside.md")), false);

    const advance = spawnSync(
      process.execPath,
      [copiedOrchestrator, "advance", ...args.slice(2)],
      { encoding: "utf8", env }
    );
    assert.equal(advance.status, 0, advance.stdout || advance.stderr);
    assert.match(advance.stdout, /advanced 0\/1/);
    assert.equal(fs.existsSync(baseline), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
