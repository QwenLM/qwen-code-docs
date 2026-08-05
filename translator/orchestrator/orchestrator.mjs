#!/usr/bin/env node
/**
 * Thin orchestrator for agent-driven docs translation.
 *
 * The deterministic parts (upstream diff, EN mirror, backlog, structural
 * verification, baseline advance) live here; the linguistic part is
 * delegated to a `qwen -p` agent session per language (see prompts/).
 *
 * Baseline model (per-file, resumable):
 *   { "commit": <upstream HEAD>, "timestamp": ...,
 *     "files": { "docs/foo.md": { "langs": { "zh": <sha256 of upstream
 *     content at translation time> } } } }
 * A (file, lang) pair is up-to-date iff langs[lang] equals the current
 * upstream content hash. Upstream files gone from the tree are deleted
 * across EN + every translated language by `sync-en`.
 *
 * Subcommands:
 *   detect                 list per-language backlog (no writes)
 *   sync-en                mirror upstream docs into <content-dir>/en,
 *                          delete targets of removed upstream files
 *   translate --lang L     dispatch a qwen -p agent for a backlog batch
 *   verify    --lang L     structural gate over the dispatched manifest
 *   advance   --lang L     verify + record hashes of passing files
 *
 * Flags (all optional): --repo --branch --docs-path --content-dir
 *   --baseline --temp-dir --langs csv --limit N --manifest --model
 * Zero dependencies: node builtins + git CLI only.
 */
import { execSync, spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");

const { positional, flags } = parseFlags(process.argv.slice(2));
const cmd = positional[0];

const OPTS = {
  repo: flags.repo || "https://github.com/QwenLM/qwen-code.git",
  branch: flags.branch || "main",
  docsPath: flags["docs-path"] || "docs",
  contentDir: path.resolve(ROOT, flags["content-dir"] || "website/content"),
  baseline: path.resolve(ROOT, flags.baseline || "website/last-sync.json"),
  tempDir: path.resolve(ROOT, flags["temp-dir"] || ".temp-source-repo"),
  langs: String(flags.langs || "zh,de,fr,ja,ru,pt-BR").split(","),
  limit: flags.limit ? parseInt(flags.limit, 10) : Infinity,
  model: flags.model || null,
};

function parseFlags(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const k = a.slice(2);
      if (argv[i + 1] === undefined || argv[i + 1].startsWith("--")) {
        flags[k] = true;
      } else {
        flags[k] = argv[++i];
      }
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const q = (s) => `'${String(s).replace(/'/g, "'\\''")}'`;

function manifestPath(lang) {
  return flags.manifest
    ? path.resolve(ROOT, flags.manifest)
    : path.join(
        path.dirname(OPTS.baseline),
        `orchestrator-manifest-${lang}.json`
      );
}

// ---------- upstream ----------

function gitRetry(cmd, label) {
  // Transient network failures (HTTP2 framing, RPC errors) are common on
  // large clones; retry once over HTTP/1.1 before giving up. `-c` keeps the
  // fallback scoped to this command instead of touching global git config.
  const http11 = (s) => s.replace(/^git /, "git -c http.version=HTTP/1.1 ");
  for (let attempt = 1; ; attempt++) {
    try {
      return execSync(cmd, { stdio: "inherit" });
    } catch (err) {
      if (attempt >= 2) throw err;
      console.log(
        `[orch] ${label} failed (attempt ${attempt}); retrying with http/1.1...`
      );
      cmd = cmd.split(" && ").map(http11).join(" && ");
    }
  }
}

/**
 * Serialize access to the shared upstream clone (OPTS.tempDir). Parallel
 * per-language `translate` dispatches each ensure+hash the same working
 * tree; concurrent `git fetch/reset` trips git's lock files and a reset
 * racing upstreamDocs() would hash a half-updated tree. O_EXCL lock file
 * with stale-lock recovery; no extra deps.
 */
function withUpstreamLock(fn) {
  const lockFile = `${OPTS.tempDir}.lock`;
  const staleMs = 10 * 60 * 1000;
  const start = Date.now();
  for (;;) {
    try {
      fs.closeSync(
        fs.openSync(
          lockFile,
          fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL
        )
      );
      break;
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
      try {
        if (Date.now() - fs.statSync(lockFile).mtimeMs > staleMs) {
          fs.rmSync(lockFile, { force: true });
          continue;
        }
      } catch {}
      if (Date.now() - start > staleMs)
        throw new Error(`timed out waiting for ${lockFile}`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
    }
  }
  try {
    return fn();
  } finally {
    fs.rmSync(lockFile, { force: true });
  }
}

function ensureUpstream() {
  if (!fs.existsSync(OPTS.tempDir)) {
    console.log(`[orch] cloning ${OPTS.repo} (${OPTS.branch})...`);
    try {
      gitRetry(
        `git clone --depth 1 --branch ${OPTS.branch} ${q(OPTS.repo)} ${q(
          OPTS.tempDir
        )}`,
        "clone"
      );
    } catch (err) {
      // A half-finished clone would make the next run take the broken
      // "update" path; remove it so we re-clone from scratch.
      fs.rmSync(OPTS.tempDir, { recursive: true, force: true });
      throw err;
    }
  } else {
    gitRetry(
      `git -C ${q(OPTS.tempDir)} fetch --depth 1 origin ${OPTS.branch} && ` +
        `git -C ${q(OPTS.tempDir)} checkout -q ${OPTS.branch} && ` +
        `git -C ${q(OPTS.tempDir)} reset -q --hard origin/${OPTS.branch}`,
      "fetch"
    );
  }
  return execSync(`git -C ${q(OPTS.tempDir)} rev-parse HEAD`, {
    encoding: "utf8",
  }).trim();
}

/** Map of "docs/<rel>" -> sha256(upstream content), mirroring sync.ts rules. */
function upstreamDocs() {
  const docsDir = path.join(OPTS.tempDir, OPTS.docsPath);
  const out = new Map();
  if (!fs.existsSync(docsDir)) return out;
  (function walk(dir, base) {
    for (const item of fs.readdirSync(dir)) {
      const full = path.join(dir, item);
      const rel = base ? `${base}/${item}` : item;
      const st = fs.statSync(full);
      if (st.isDirectory()) walk(full, rel);
      else if (item.endsWith(".md"))
        out.set(`${OPTS.docsPath}/${rel}`, sha256(fs.readFileSync(full)));
    }
  })(docsDir, "");
  return out;
}

const relInContent = (f) => f.slice(OPTS.docsPath.length + 1);

// ---------- baseline ----------

function loadBaseline() {
  try {
    const raw = JSON.parse(fs.readFileSync(OPTS.baseline, "utf8"));
    if (raw && typeof raw === "object" && !Array.isArray(raw.files)) {
      return { commit: raw.commit ?? null, files: raw.files ?? {} };
    }
    return { commit: raw?.commit ?? null, files: {} }; // legacy array format
  } catch {
    return { commit: null, files: {} };
  }
}

function saveBaseline(base, commit) {
  fs.mkdirSync(path.dirname(OPTS.baseline), { recursive: true });
  fs.writeFileSync(
    OPTS.baseline,
    JSON.stringify(
      { commit, timestamp: new Date().toISOString(), files: base.files },
      null,
      2
    ) + "\n"
  );
}

function backlogFor(base, upstream, lang) {
  const bl = [];
  for (const [f, hash] of upstream) {
    if (base.files[f]?.langs?.[lang] !== hash) bl.push({ file: f, hash });
  }
  return bl;
}

// ---------- commands ----------

function cmdDetect() {
  const commit = ensureUpstream();
  const upstream = upstreamDocs();
  const base = loadBaseline();
  const perLang = {};
  for (const lang of OPTS.langs) {
    perLang[lang] = backlogFor(base, upstream, lang).map((b) => b.file);
  }
  console.log(`[orch] upstream HEAD: ${commit}`);
  console.log(`[orch] upstream docs: ${upstream.size}`);
  for (const lang of OPTS.langs) {
    const list = perLang[lang];
    console.log(`[orch] backlog ${lang}: ${list.length}`);
    for (const f of list.slice(0, 10)) console.log(`    - ${f}`);
    if (list.length > 10) console.log(`    ... ${list.length - 10} more`);
  }
}
/**
 * Migration helper: record every (file, lang) whose translated target
 * already exists on disk as up-to-date, so the first agent-driven run only
 * sees the true incremental backlog instead of the whole corpus.
 */
function cmdSeed() {
  const commit = ensureUpstream();
  const upstream = upstreamDocs();
  const base = loadBaseline();
  let seeded = 0;
  for (const [f, hash] of upstream) {
    for (const lang of OPTS.langs) {
      if (base.files[f]?.langs?.[lang] === hash) continue;
      if (!fs.existsSync(path.join(OPTS.contentDir, lang, relInContent(f))))
        continue;
      ((base.files[f] ??= { langs: {} }).langs ??= {})[lang] = hash;
      seeded++;
    }
  }
  saveBaseline(base, commit);
  console.log(`[orch] seeded ${seeded} (file, lang) pairs as up-to-date`);
}

function cmdSyncEn() {
  const commit = ensureUpstream();
  const upstream = upstreamDocs();
  const base = loadBaseline();
  const enDir = path.join(OPTS.contentDir, "en");
  let copied = 0;
  for (const [f, hash] of upstream) {
    const dest = path.join(enDir, relInContent(f));
    if (fs.existsSync(dest) && sha256(fs.readFileSync(dest)) === hash) continue;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(OPTS.tempDir, f), dest);
    copied++;
  }
  // Deletions: recorded upstream files that are gone now.
  let deleted = 0;
  for (const f of Object.keys(base.files)) {
    if (upstream.has(f)) continue;
    const rel = relInContent(f);
    for (const lang of ["en", ...OPTS.langs]) {
      const p = path.join(OPTS.contentDir, lang, rel);
      if (fs.existsSync(p)) {
        fs.rmSync(p);
        deleted++;
      }
    }
    delete base.files[f];
  }
  if (deleted > 0) saveBaseline(base, commit);
  console.log(`[orch] sync-en: copied=${copied} deleted=${deleted}`);
}

function renderPrompt(lang, batch) {
  const tpl = fs.readFileSync(
    path.join(HERE, "prompts", "translate.md"),
    "utf8"
  );
  const files = batch
    .map((b) => `- ${relInContent(b.file)}`)
    .join("\n");
  return tpl
    .replaceAll("{{LANG}}", lang)
    .replaceAll("{{CONTENT_DIR}}", OPTS.contentDir)
    .replaceAll("{{GLOSSARY}}", path.join(HERE, `glossary.${lang}.md`))
    .replaceAll("{{STYLE}}", path.join(HERE, "STYLE.md"))
    .replaceAll("{{FILES}}", files);
}

async function cmdTranslate(lang) {
  // Parallel per-language dispatches share .temp-source-repo; serialize
  // ensure+hash so concurrent fetch/reset cannot trip git locks or hash a
  // half-updated tree.
  const upstream = withUpstreamLock(() => {
    ensureUpstream();
    return upstreamDocs();
  });
  const base = loadBaseline();
  const batch = backlogFor(base, upstream, lang).slice(0, OPTS.limit);
  if (batch.length === 0) {
    console.log(`[orch] ${lang}: backlog empty, nothing to dispatch`);
    return;
  }
  const manifest = {
    lang,
    createdAt: Date.now(),
    files: batch.map((b) => b.file),
  };
  fs.writeFileSync(manifestPath(lang), JSON.stringify(manifest, null, 2));
  const prompt = renderPrompt(lang, batch);
  console.log(
    `[orch] ${lang}: dispatching agent for ${batch.length} file(s)...`
  );
  // --safe-mode is read-only (no write/edit tools), so the agent could never
  // write translations. auto-edit approves read/write/edit (shell stays
  // gated), which matches the prompt's "do not run builds or commands".
  const args = ["--approval-mode", "auto-edit", "-p", prompt, "-o", "text"];
  if (OPTS.model) args.push("--model", OPTS.model);
  const log = path.join(
    path.dirname(manifestPath(lang)),
    `orchestrator-agent-${lang}.log`
  );
  // Stream agent output live (CI step log + runner-side log file) instead
  // of capturing it: a 20-file batch ran tens of minutes silent otherwise.
  const fd = fs.openSync(log, "w");
  const child = spawn("qwen", args, {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (c) => {
    process.stdout.write(c);
    fs.writeSync(fd, c);
  });
  child.stderr.on("data", (c) => {
    process.stderr.write(c);
    fs.writeSync(fd, c);
  });
  const status = await new Promise((resolve) => child.on("close", resolve));
  fs.closeSync(fd);
  console.log(`[orch] ${lang}: agent exit=${status} (log: ${log})`);
  if (status !== 0) process.exitCode = 1;
}

// ---------- structural gate ----------

function fenceCount(text) {
  return (text.match(/^\s*(```|~~~)/gm) || []).length;
}

function hasFrontmatter(text) {
  return text.startsWith("---\n");
}

function frontmatterClosed(text) {
  const lines = text.split("\n");
  if (lines[0].trim() !== "---") return false;
  return lines
    .slice(1, 60)
    .some((l) => l.trim() === "---" || l.trim() === "...");
}

function verifyFile(lang, f, manifest) {
  const rel = relInContent(f);
  const enPath = path.join(OPTS.contentDir, "en", rel);
  const target = path.join(OPTS.contentDir, lang, rel);
  const problems = [];
  if (!fs.existsSync(enPath)) return { ok: false, problems: ["missing EN source"] };
  if (!fs.existsSync(target)) return { ok: false, problems: ["missing target"] };
  const en = fs.readFileSync(enPath, "utf8");
  const tg = fs.readFileSync(target, "utf8");
  if (tg.trim().length === 0) problems.push("empty target");
  if (fs.statSync(target).mtimeMs < manifest.createdAt)
    problems.push("target not touched this session");
  if (fenceCount(en) !== fenceCount(tg))
    problems.push(
      `code fence mismatch (en=${fenceCount(en)} ${lang}=${fenceCount(tg)})`
    );
  if (hasFrontmatter(en) && (!hasFrontmatter(tg) || !frontmatterClosed(tg)))
    problems.push("frontmatter missing/unclosed");
  const linksEn = (en.match(/\]\(/g) || []).length;
  const linksTg = (tg.match(/\]\(/g) || []).length;
  if (linksEn !== linksTg)
    problems.push(`WARN link count differs (en=${linksEn} ${lang}=${linksTg})`);
  const hard = problems.filter((p) => !p.startsWith("WARN"));
  return { ok: hard.length === 0, problems };
}

function readManifest(lang) {
  try {
    return JSON.parse(fs.readFileSync(manifestPath(lang), "utf8"));
  } catch {
    return null;
  }
}

function cmdVerify(lang) {
  const manifest = readManifest(lang);
  if (!manifest) {
    console.log(`[orch] ${lang}: no manifest (run translate first)`);
    process.exitCode = 1;
    return;
  }
  let fail = 0;
  for (const f of manifest.files) {
    const { ok, problems } = verifyFile(lang, f, manifest);
    if (!ok) fail++;
    console.log(
      `${ok ? "PASS" : "FAIL"} ${lang} ${relInContent(f)}` +
        (problems.length ? `  [${problems.join("; ")}]` : "")
    );
  }
  console.log(
    `[orch] ${lang}: verify ${manifest.files.length - fail}/${manifest.files.length} passed`
  );
  if (fail > 0) process.exitCode = 1;
}

function cmdAdvance(lang) {
  const manifest = readManifest(lang);
  if (!manifest) {
    console.log(`[orch] ${lang}: no manifest (run translate first)`);
    process.exitCode = 1;
    return;
  }
  const commit = ensureUpstream();
  const upstream = upstreamDocs();
  const base = loadBaseline();
  let advanced = 0;
  for (const f of manifest.files) {
    const { ok, problems } = verifyFile(lang, f, manifest);
    if (!ok) {
      console.log(`SKIP ${lang} ${relInContent(f)}  [${problems.join("; ")}]`);
      continue;
    }
    const rec = (base.files[f] ??= { langs: {} });
    (rec.langs ??= {})[lang] = upstream.get(f);
    advanced++;
  }
  saveBaseline(base, commit);
  console.log(`[orch] ${lang}: advanced ${advanced}/${manifest.files.length}`);
}

// ---------- main ----------

switch (cmd) {
  case "detect":
    cmdDetect();
    break;
  case "sync-en":
    cmdSyncEn();
    break;
  case "translate":
    await cmdTranslate(flags.lang);
    break;
  case "verify":
    cmdVerify(flags.lang);
    break;
  case "advance":
    cmdAdvance(flags.lang);
    break;
  case "seed":
    cmdSeed();
    break;
  default:
    console.log(
      "usage: orchestrator.mjs <detect|sync-en|seed|translate|verify|advance> [--lang L] [--limit N] [--content-dir D] [--baseline B] [--manifest M] [--langs csv]"
    );
    process.exitCode = cmd ? 1 : 0;
}
