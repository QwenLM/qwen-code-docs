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
 *   quarantine             resolve failed translations against HEAD
 *   report-batch           report dispatched/verified totals from run logs
 *   report                 publish per-language translation metrics
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

/**
 * Target languages come from website/translation.config.json — the same
 * source the legacy sync pipeline and the website itself read — so adding
 * a locale there (e.g. ko via #181) reaches the orchestrator too. The old
 * hardcoded default silently kept ko out of every detect/translate run:
 * the baseline never gained ko entries and the backlog never listed them.
 */
function configTargetLangs(contentDir) {
  try {
    const cfg = JSON.parse(
      fs.readFileSync(
        path.join(contentDir, "..", "translation.config.json"),
        "utf8"
      )
    );
    if (Array.isArray(cfg.targetLanguages) && cfg.targetLanguages.length)
      return cfg.targetLanguages.map(String);
  } catch {
    // Missing/unreadable config: fall back to the historical list.
  }
  return ["zh", "de", "fr", "ja", "ru", "pt-BR"];
}

const CONTENT_DIR = path.resolve(
  ROOT,
  flags["content-dir"] || "website/content"
);

const OPTS = {
  repo: flags.repo || "https://github.com/QwenLM/qwen-code.git",
  branch: flags.branch || "main",
  docsPath: flags["docs-path"] || "docs",
  contentDir: CONTENT_DIR,
  baseline: path.resolve(ROOT, flags.baseline || "website/last-sync.json"),
  tempDir: path.resolve(ROOT, flags["temp-dir"] || ".temp-source-repo"),
  langs: flags.langs
    ? String(flags.langs).split(",")
    : configTargetLangs(CONTENT_DIR),
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

// ---------- excludes ----------

/**
 * The orchestrator must honor the same excludeFromTranslation list the
 * legacy pipeline enforces (website/translation.config.json): without it,
 * sync-en/detect/translate/advance would mirror, translate, and publish
 * the internal docs that #146 removed from the site.
 */
function loadExcludes() {
  try {
    const cfgPath = path.join(
      path.dirname(OPTS.contentDir),
      "translation.config.json"
    );
    const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
    return (cfg.excludeFromTranslation || []).map((p) =>
      String(p).replace(/\/+$/, "")
    );
  } catch {
    return [];
  }
}
const EXCLUDES = loadExcludes();

/** rel is relative to docsPath, e.g. "design/foo.md". */
function isExcluded(rel) {
  return EXCLUDES.some((p) => rel === p || rel.startsWith(p + "/"));
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
      if (isExcluded(rel)) continue; // internal docs: never index, mirror, or translate
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

// 上游文档可能带未加 ./ 的相对链接(`](assets/x.png)`):GitHub 上能渲染,
// 但 Nextra/webpack 构建会当作模块请求报错。同步 EN 镜像时统一改写为 ./ 形式。
// 按行跟踪代码栅栏:围栏内的内容是示例代码,改写会悄悄偏离上游,必须跳过。
const RELATIVE_LINK =
  /\]\((?!\.|\/|#|[a-zA-Z][a-zA-Z0-9+.-]*:)([^)\s]+)(\s+"[^"]*")?\)/g;

function normalizeRelativeLinks(text) {
  let inFence = false;
  let fenceMark = "";
  return text
    .split("\n")
    .map((line) => {
      const fence = line.match(/^\s*(```|~~~)/);
      if (fence) {
        if (!inFence) {
          inFence = true;
          fenceMark = fence[1];
        } else if (fence[1] === fenceMark) {
          inFence = false;
        }
        return line;
      }
      if (inFence) return line;
      return line.replace(
        RELATIVE_LINK,
        (_m, target, title) => `](./${target}${title ?? ""})`
      );
    })
    .join("\n");
}

function mirrorAssets() {
  const docsDir = path.join(OPTS.tempDir, OPTS.docsPath);
  if (!fs.existsSync(docsDir)) return 0;
  // Assets are language-agnostic: mirror into EN *and* every target locale.
  // Translated pages reference them with relative paths and webpack resolves
  // those relative to the page, so each locale needs its own copy (same
  // capability #195 added to the legacy pipeline).
  const targets = ["en", ...OPTS.langs].map((l) =>
    path.join(OPTS.contentDir, l)
  );
  let copied = 0;
  (function walk(dir, base) {
    for (const item of fs.readdirSync(dir)) {
      const full = path.join(dir, item);
      const rel = base ? `${base}/${item}` : item;
      if (isExcluded(rel)) continue;
      const st = fs.lstatSync(full);
      if (st.isSymbolicLink()) continue; // never follow links out of the docs tree
      if (st.isDirectory()) {
        walk(full, rel);
        continue;
      }
      // Markdown is handled by the doc loop (and gets translated); _meta is
      // site-maintained navigation. Everything else is an asset.
      if (/\.(md|mdx)$/.test(item)) continue;
      if (/^_meta\.(ts|tsx|js|jsx|mjs|cjs|json)$/.test(item)) continue;
      const srcHash = sha256(fs.readFileSync(full));
      for (const t of targets) {
        const dest = path.join(t, rel);
        if (fs.existsSync(dest) && sha256(fs.readFileSync(dest)) === srcHash)
          continue;
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(full, dest);
        copied++;
      }
    }
  })(docsDir, "");
  return copied;
}

function cmdSyncEn() {
  const commit = ensureUpstream();
  const upstream = upstreamDocs();
  const base = loadBaseline();
  const enDir = path.join(OPTS.contentDir, "en");
  let copied = 0;
  for (const [f] of upstream) {
    // upstreamDocs() indexes .md only; assets are mirrored below.
    const dest = path.join(enDir, relInContent(f));
    const srcPath = path.join(OPTS.tempDir, f);
    const normalized = normalizeRelativeLinks(
      fs.readFileSync(srcPath, "utf8")
    );
    if (fs.existsSync(dest) && fs.readFileSync(dest, "utf8") === normalized)
      continue;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, normalized);
    // Reaching here means a write happened. The workflow's `changed` gate
    // greps this counter, so it must reflect reality.
    copied++;
  }
  copied += mirrorAssets();
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

// Bound one failed agent session to five files instead of a whole language.
const TRANSLATE_CHUNK = 5;

// Retry once; repeated failures stay in the next run's backlog.
const TRANSLATE_ATTEMPTS = 2;

// --safe-mode is read-only (no write/edit tools), so the agent could never
// write translations. auto-edit approves read/write/edit (shell stays
// gated), which matches the prompt's "do not run builds or commands".
async function runAgent(lang, prompt, logSuffix) {
  const args = ["--approval-mode", "auto-edit", "-p", prompt, "-o", "text"];
  if (OPTS.model) args.push("--model", OPTS.model);
  const log = path.join(
    path.dirname(manifestPath(lang)),
    `orchestrator-agent-${lang}${logSuffix}.log`
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
  fs.writeSync(fd, `\n[orch] agent exit=${status}\n`);
  fs.closeSync(fd);
  return { status, log };
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
  // Record the upstream hash each file carried *at dispatch time*. advance
  // records these rather than re-reading upstream, so an upstream change
  // during the run cannot mark a stale translation as up-to-date.
  const manifest = {
    lang,
    createdAt: Date.now(),
    files: batch.map((b) => ({ file: b.file, hash: b.hash })),
  };
  fs.writeFileSync(manifestPath(lang), JSON.stringify(manifest, null, 2));
  const chunks = [];
  for (let i = 0; i < batch.length; i += TRANSLATE_CHUNK)
    chunks.push(batch.slice(i, i + TRANSLATE_CHUNK));
  let part = 0;
  for (const chunk of chunks) {
    part++;
    const suffix = chunks.length > 1 ? `-part${part}` : "";
    console.log(
      `[orch] ${lang}: dispatching agent for ${chunk.length} file(s)` +
        (chunks.length > 1 ? ` (part ${part}/${chunks.length})...` : "...")
    );
    let status;
    let log;
    for (let attempt = 1; attempt <= TRANSLATE_ATTEMPTS; attempt++) {
      // Distinct log suffix per attempt: runAgent opens the log with "w",
      // so a retry would otherwise overwrite the halted attempt's log —
      // exactly the log needed to tell a loop-detection halt from a real
      // failure.
      ({ status, log } = await runAgent(
        lang,
        renderPrompt(lang, chunk),
        attempt === 1 ? suffix : `${suffix}-retry${attempt - 1}`
      ));
      console.log(
        `[orch] ${lang}: agent exit=${status}` +
          (attempt > 1 ? ` on retry ${attempt - 1}` : "") +
          ` (log: ${log})`
      );
      if (status === 0) break;
      if (attempt < TRANSLATE_ATTEMPTS) {
        // Re-dispatches the whole chunk, including any file the halted
        // attempt already translated. That redundancy is what keeps this
        // simple, and at TRANSLATE_CHUNK=5 it is cheap; verify's "touched
        // this session" check is satisfied by the rewrite either way.
        console.log(
          `[orch] ${lang}: part ${part}/${chunks.length} failed; retrying once...`
        );
      }
    }
    if (status !== 0) {
      // The workflow's `|| true` keeps the step alive; surface the failure
      // in the run summary anyway, and leave the chunk's files in the
      // backlog (verify fails them; they are retried next run).
      console.log(
        `::warning::${lang}: agent exited ${status} on part ${part}/${chunks.length} after ${TRANSLATE_ATTEMPTS} attempts; its files stay in the backlog`
      );
      process.exitCode = 1;
    }
  }
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
  // No line cap: a doc with long frontmatter must not fail the gate
  // forever (retried daily, never advancing). Scanning the whole file
  // is cheap next to the translation that produced it.
  return lines
    .slice(1)
    .some((l) => l.trim() === "---" || l.trim() === "...");
}

/**
 * Cheap structural sanity check of the frontmatter YAML, without a YAML
 * parser: every non-empty, non-indented line must open a mapping entry
 * (`key:`) or a list item (`- `). An unindented bare-text line (typically
 * a wrapped description) is exactly what fails the site build with
 * "YAMLParseError: Unexpected scalar token" — run 31115350719. Indented
 * continuation lines are left alone. False positives are safe: the file
 * just stays in the backlog and gets retried.
 */
function frontmatterYamlish(text) {
  const lines = text.split("\n");
  if (lines[0].trim() !== "---") return false;
  for (let i = 1; i < lines.length; i++) {
    const l = lines[i];
    const t = l.trim();
    if (t === "---" || t === "...") return true;
    if (t === "") continue;
    if (/^\s/.test(l)) continue; // indented continuation
    if (/^[^\s:][^:]*:(\s|$)/.test(l)) continue; // key: value
    if (/^-(\s|$)/.test(l)) continue; // list item
    return false;
  }
  return false; // no closing delimiter
}

function structuralProblems(en, target, lang) {
  const problems = [];
  if (target.trim().length === 0) problems.push("empty target");
  if (fenceCount(en) !== fenceCount(target))
    problems.push(
      `code fence mismatch (en=${fenceCount(en)} ${lang}=${fenceCount(target)})`
    );
  const enHasFrontmatter = hasFrontmatter(en);
  const targetHasFrontmatter = hasFrontmatter(target);
  if (enHasFrontmatter !== targetHasFrontmatter) {
    problems.push("frontmatter mismatch");
  } else if (enHasFrontmatter) {
    if (!frontmatterClosed(target)) problems.push("frontmatter unclosed");
    else if (!frontmatterYamlish(target))
      problems.push("frontmatter not parseable YAML");
  }
  return problems;
}

function verifyFile(lang, f, manifest) {
  const rel = relInContent(f);
  const enPath = path.join(OPTS.contentDir, "en", rel);
  const target = path.join(OPTS.contentDir, lang, rel);
  const problems = [];
  if (!fs.existsSync(enPath)) return { ok: false, problems: ["missing EN source"] };
  if (!fs.existsSync(target)) return { ok: false, problems: ["missing target"] };
  const en = fs.readFileSync(enPath, "utf8");
  let tg = fs.readFileSync(target, "utf8");
  // The mtime gate must see the file as the agent left it: stat BEFORE the
  // self-heal below, whose write would otherwise refresh mtime and let a
  // stale (pre-session) translation pass as "touched this session".
  const touchedThisSession =
    fs.statSync(target).mtimeMs >= manifest.createdAt;
  // Self-heal: translation agents sometimes drop the "./" on relative links
  // (GitHub renders bare paths; webpack resolves them as modules and fails).
  // Repair at the gate so stale on-disk files never break the build.
  const healed = normalizeRelativeLinks(tg);
  if (healed !== tg) {
    fs.writeFileSync(target, healed);
    tg = healed;
  }
  if (!touchedThisSession) problems.push("target not touched this session");
  problems.push(...structuralProblems(en, tg, lang));
  const linksEn = (en.match(/\]\(/g) || []).length;
  const linksTg = (tg.match(/\]\(/g) || []).length;
  if (linksEn !== linksTg)
    problems.push(`WARN link count differs (en=${linksEn} ${lang}=${linksTg})`);
  const hard = problems.filter((p) => !p.startsWith("WARN"));
  return { ok: hard.length === 0, problems };
}

function readManifest(lang) {
  let raw;
  try {
    raw = fs.readFileSync(manifestPath(lang), "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return null; // nothing dispatched: legitimate no-op
    throw err;
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    // A corrupt manifest is NOT "no manifest": treating it as empty would
    // silently drop a day of recorded translation work (redone tomorrow,
    // no warning anywhere). Fail loudly instead.
    console.error(
      `::error::manifest for ${lang} is corrupt (${err.message}); refusing to treat it as empty`
    );
    throw err;
  }
}

/** Quarantine list for the commit step: files the verify gate rejected. */
function failedListPath(lang) {
  return manifestPath(lang).replace(/\.json$/, ".failed.txt");
}

/** Per-language run metrics, aggregated by `report`. */
function metricsPath(lang) {
  return manifestPath(lang).replace(/\.json$/, ".metrics.json");
}

/**
 * Manifest entries normalized to { file, hash }. Manifests written before
 * dispatch-time hashes were recorded stored bare path strings; treat those
 * as "no recorded hash" so an older manifest still verifies and advances.
 */
function manifestFiles(manifest) {
  return (manifest.files || []).map((e) =>
    typeof e === "string" ? { file: e, hash: undefined } : e
  );
}

function cmdVerify(lang) {
  const manifest = readManifest(lang);
  if (!manifest) {
    console.log(`[orch] ${lang}: no manifest (run translate first)`);
    process.exitCode = 1;
    return;
  }
  const entries = manifestFiles(manifest);
  let fail = 0;
  for (const { file: f } of entries) {
    const { ok, problems } = verifyFile(lang, f, manifest);
    if (!ok) fail++;
    console.log(
      `${ok ? "PASS" : "FAIL"} ${lang} ${relInContent(f)}` +
        (problems.length ? `  [${problems.join("; ")}]` : "")
    );
  }
  console.log(
    `[orch] ${lang}: verify ${entries.length - fail}/${entries.length} passed`
  );
  if (fail > 0) process.exitCode = 1;
}

function cmdAdvance(lang) {
  const manifest = readManifest(lang);
  if (!manifest) {
    // No manifest means nothing was dispatched for this language this run
    // (empty backlog is the common case). That is a no-op, not a failure:
    // exiting non-zero here fails the workflow's serial advance loop under
    // `bash -e`, which skips build/commit/deploy for *every* language and
    // never self-heals once backlogs diverge.
    console.log(`[orch] ${lang}: no manifest, nothing to advance`);
    return;
  }
  const commit = ensureUpstream();
  const upstream = upstreamDocs();
  const base = loadBaseline();
  const entries = manifestFiles(manifest);
  let advanced = 0;
  let requeued = 0;
  const failed = [];
  const failures = [];
  for (const { file: f, hash } of entries) {
    const { ok, problems } = verifyFile(lang, f, manifest);
    if (!ok) {
      console.log(`SKIP ${lang} ${relInContent(f)}  [${problems.join("; ")}]`);
      failed.push(`${lang}/${relInContent(f)}`);
      failures.push({ file: relInContent(f), problems });
      continue;
    }
    const current = upstream.get(f);
    if (current === undefined) {
      // Deleted upstream mid-run. Recording `undefined` would be dropped by
      // JSON.stringify while still counting as advanced; leave it alone and
      // let the next sync-en handle the deletion.
      console.log(`SKIP ${lang} ${relInContent(f)}  [gone from upstream]`);
      continue;
    }
    if (hash !== undefined && current !== hash) {
      // Upstream moved between dispatch and now; the agent translated the
      // old content. Leave it in the backlog rather than marking a stale
      // translation up-to-date against content nobody translated.
      console.log(
        `SKIP ${lang} ${relInContent(f)}  [upstream changed mid-run; re-queued]`
      );
      requeued++;
      continue;
    }
    const rec = (base.files[f] ??= { langs: {} });
    (rec.langs ??= {})[lang] = hash ?? current;
    advanced++;
  }
  saveBaseline(base, commit);
  // Quarantine list for the workflow's commit step: verify-failed files must
  // be restored/removed before staging, or broken output gets deployed.
  fs.writeFileSync(failedListPath(lang), failed.length ? failed.join("\n") + "\n" : "");
  // Machine-readable counterpart to the log lines above. `report` aggregates
  // these; without them the only record of a run's outcome is the step log,
  // which cannot be compared across runs without scraping it.
  fs.writeFileSync(
    metricsPath(lang),
    JSON.stringify(
      {
        lang,
        dispatchedAt: manifest.createdAt,
        completedAt: Date.now(),
        dispatched: entries.length,
        verified: entries.length - failed.length,
        failed: failed.length,
        advanced,
        requeued,
        failures,
      },
      null,
      2
    ) + "\n"
  );
  console.log(
    `[orch] ${lang}: advanced ${advanced}/${entries.length}` +
      (requeued ? ` (${requeued} re-queued: upstream moved mid-run)` : "") +
      (failed.length ? ` (${failed.length} quarantined)` : "")
  );
}

// ---------- report ----------

/**
 * A verify problem that means the document that exists on disk is itself
 * unsound — as opposed to never having been produced.
 *
 * "missing target" and "target not touched this session" are deliberately
 * NOT structural: they say the agent did not write the file, which is a
 * session-death symptom (#217's territory), not a stuck document. Counting
 * them here would conflate the two failure modes the metrics exist to tell
 * apart.
 */
function isStructural(problem) {
  return (
    problem.startsWith("code fence mismatch") ||
    problem.startsWith("frontmatter ") ||
    problem === "empty target"
  );
}

/**
 * Halt/retry counts for one language, read from the agent logs the run just
 * wrote (`orchestrator-agent-<lang>[-partN][-retryN].log`).
 *
 * Retry logs only exist once the halted-chunk retry from #217 is in place;
 * until then `attempted` is simply 0 and the retry columns read as "-".
 * `runAgent` records the exit status in each log, so a non-halt failure is
 * not misreported as a recovered retry.
 */
function agentLogStats(lang, dir) {
  const prefix = `orchestrator-agent-${lang}`;
  const logs = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && f.endsWith(".log"));
  let halted = 0;
  let attempted = 0;
  let recovered = 0;
  for (const name of logs) {
    let text = "";
    try {
      text = fs.readFileSync(path.join(dir, name), "utf8");
    } catch {
      continue;
    }
    const thisHalted = text.includes("Loop detection halted");
    if (thisHalted) halted++;
    if (/-retry\d+\.log$/.test(name)) {
      attempted++;
      if (text.includes("[orch] agent exit=0")) recovered++;
    }
  }
  return { halted, retriesAttempted: attempted, retriesRecovered: recovered };
}

function pct(ok, total) {
  return total === 0 ? "-" : `${Math.round((100 * ok) / total)}%`;
}

/**
 * Aggregate this run's per-language metrics into a step summary table and a
 * machine-readable artifact.
 *
 * Every loss this pipeline has had so far happened inside a GREEN run, and
 * the only record was the step log — which cannot be compared across runs
 * without scraping it after the fact. This makes dispatched/verified/ratio,
 * halts, retry recovery, runtime and stuck-file counts first-class output.
 */
function cmdReport() {
  const dir = path.dirname(OPTS.baseline);
  const files = fs
    .readdirSync(dir)
    .filter((f) => /^orchestrator-manifest-.*\.metrics\.json$/.test(f));
  const langs = [];
  for (const name of files) {
    try {
      langs.push(JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")));
    } catch {
      console.log(`::warning::unreadable metrics file ${name}; skipping`);
    }
  }
  if (langs.length === 0) {
    console.log("[orch] report: no per-language metrics this run");
  }
  langs.sort((a, b) => a.lang.localeCompare(b.lang));
  const stuck = [];
  let tDispatched = 0;
  let tVerified = 0;
  let tHalted = 0;
  let tAtt = 0;
  let tRec = 0;
  const rows = [];
  for (const m of langs) {
    const s = agentLogStats(m.lang, dir);
    const structural = (m.failures || []).filter((f) =>
      (f.problems || []).some(isStructural)
    );
    for (const f of structural)
      stuck.push({
        lang: m.lang,
        file: f.file,
        problems: f.problems.filter(isStructural),
      });
    tDispatched += m.dispatched;
    tVerified += m.verified;
    tHalted += s.halted;
    tAtt += s.retriesAttempted;
    tRec += s.retriesRecovered;
    const mins = Math.round((m.completedAt - m.dispatchedAt) / 60000);
    rows.push(
      `| ${m.lang} | ${m.dispatched} | ${m.verified} | ${pct(
        m.verified,
        m.dispatched
      )} | ${s.halted} | ${
        s.retriesAttempted ? `${s.retriesRecovered}/${s.retriesAttempted}` : "-"
      } | ${structural.length} | ${mins}m |`
    );
  }
  const now = Date.now();
  const started = langs.length
    ? Math.min(...langs.map((m) => m.dispatchedAt))
    : now;
  const finished = langs.length
    ? Math.max(...langs.map((m) => m.completedAt))
    : now;
  const wallMins = Math.round((finished - started) / 60000);
  const lines = [
    "### Translation run metrics",
    "",
    "| Lang | Dispatched | Verified | Ratio | Halts | Retry rec./att. | Stuck | Duration |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...rows,
    `| **total** | **${tDispatched}** | **${tVerified}** | **${pct(
      tVerified,
      tDispatched
    )}** | **${tHalted}** | **${tAtt ? `${tRec}/${tAtt}` : "-"}** | **${
      stuck.length
    }** | **${wallMins}m** |`,
  ];
  if (stuck.length) {
    lines.push(
      "",
      `<details><summary>${stuck.length} file(s) failed the structural gate</summary>`,
      ""
    );
    for (const s of stuck)
      lines.push(`- \`${s.lang}/${s.file}\` — ${s.problems.join("; ")}`);
    lines.push("", "</details>");
  }
  const md = lines.join("\n") + "\n";
  console.log(md);
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) fs.appendFileSync(summary, md);
  const out = path.join(dir, "translation-metrics.json");
  fs.writeFileSync(
    out,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        startedAt: new Date(started).toISOString(),
        finishedAt: new Date(finished).toISOString(),
        wallMinutes: wallMins,
        totals: {
          dispatched: tDispatched,
          verified: tVerified,
          failed: tDispatched - tVerified,
          halts: tHalted,
          retriesAttempted: tAtt,
          retriesRecovered: tRec,
          stuck: stuck.length,
        },
        langs: langs.map((m) => ({
          ...m,
          ...agentLogStats(m.lang, dir),
        })),
        stuck,
      },
      null,
      2
    ) + "\n"
  );
  console.log(`[orch] report: wrote ${out}`);
}

function readFromHead(repoRel) {
  try {
    return execSync(`git show HEAD:${q(repoRel)}`, {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 1 << 28,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
}

function cmdQuarantine() {
  const dir = path.dirname(OPTS.baseline);
  const lists = fs
    .readdirSync(dir)
    .filter((f) => /^orchestrator-manifest-.*\.failed\.txt$/.test(f));
  let restored = 0;
  let kept = 0;
  let removed = 0;
  const unrepairable = [];
  for (const listName of lists) {
    const entries = fs
      .readFileSync(path.join(dir, listName), "utf8")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const entry of entries) {
      const slash = entry.indexOf("/");
      if (slash < 0) continue;
      const lang = entry.slice(0, slash);
      const rel = entry.slice(slash + 1);
      const target = path.join(OPTS.contentDir, lang, rel);
      const repoRel = path.relative(ROOT, target).split(path.sep).join("/");
      const head = readFromHead(repoRel);
      if (head === null) {
        fs.rmSync(target, { force: true });
        removed++;
        continue;
      }
      const enPath = path.join(OPTS.contentDir, "en", rel);
      if (!fs.existsSync(enPath)) {
        fs.writeFileSync(target, head);
        restored++;
        continue;
      }
      const en = fs.readFileSync(enPath, "utf8");
      const headBad = structuralProblems(en, head, lang);
      const current = fs.existsSync(target)
        ? fs.readFileSync(target, "utf8")
        : null;
      const newBad =
        current === null ? ["missing target"] : structuralProblems(en, current, lang);
      if (headBad.length === 0) {
        fs.writeFileSync(target, head);
        restored++;
      } else if (newBad.length === 0) {
        console.log(
          `::warning::${entry}: HEAD is structurally corrupt [${headBad.join(
            "; "
          )}]; keeping this run's structurally sound translation`
        );
        kept++;
      } else {
        fs.writeFileSync(target, head);
        restored++;
        unrepairable.push({ entry, headBad, newBad });
        console.log(
          `::warning::${entry}: HEAD and this run's output are structurally corrupt; restoring HEAD`
        );
      }
    }
  }
  console.log(
    `[orch] quarantine: ${restored} restored from HEAD, ${kept} kept over a corrupt HEAD, ` +
      `${removed} removed, ${unrepairable.length} unrepairable`
  );
  if (unrepairable.length) {
    const report = path.join(dir, "quarantine-unrepairable.json");
    fs.writeFileSync(report, JSON.stringify(unrepairable, null, 2) + "\n");
    console.log(`[orch] quarantine: wrote ${report}`);
  }
}

function cmdReportBatch() {
  const logDir = path.resolve(flags["log-dir"] || "/tmp");
  const logs = fs.existsSync(logDir)
    ? fs.readdirSync(logDir).filter((f) => /^orch-out-.*\.log$/.test(f))
    : [];
  let dispatched = 0;
  let reported = 0;
  let passed = 0;
  for (const log of logs) {
    const text = fs.readFileSync(path.join(logDir, log), "utf8");
    for (const match of text.matchAll(/dispatching agent for (\d+) file/g))
      dispatched += Number(match[1]);
    for (const match of text.matchAll(/verify (\d+)\/(\d+) passed/g)) {
      passed += Number(match[1]);
      reported += Number(match[2]);
    }
  }
  if (dispatched === 0) {
    console.log("::warning::no translation dispatch results found");
    return;
  }
  const pct = (100 * passed) / dispatched;
  const line = `Verified ${passed}/${dispatched} dispatched file-translations (${pct.toFixed(0)}%)`;
  console.log(line);
  if (process.env.GITHUB_STEP_SUMMARY)
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `- ${line}\n`);
  if (reported < dispatched)
    console.log(
      `::warning::${dispatched - reported} dispatched file-translations had no verify result`
    );
  if (pct < 80)
    console.log(
      `::warning::only ${passed} of ${dispatched} dispatched file-translations verified (${pct.toFixed(0)}%) — check the per-language logs above for halted agent sessions`
    );
}

// ---------- preflight ----------

/**
 * Validate the translation credential in seconds, before hours of agent
 * work: a dead key used to surface as thousands of per-file translation
 * errors at the end of the run (#189). One minimal completion request;
 * any non-2xx or network failure exits non-zero so the workflow step
 * fails fast.
 */
async function cmdPreflight() {
  const base = (
    process.env.OPENAI_BASE_URL || "https://coding.dashscope.aliyuncs.com/v1"
  ).replace(/\/+$/, "");
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    console.log("::error::preflight: OPENAI_API_KEY is not set.");
    process.exit(1);
  }
  const model = OPTS.model || process.env.QWEN_MODEL || "qwen3.7-plus";
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 1,
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.log(
        `::error::preflight: HTTP ${res.status} from ${base}: ${text.slice(0, 300)}`
      );
      process.exit(1);
    }
    console.log(`[orch] preflight: credentials OK (${model} @ ${base})`);
  } catch (err) {
    console.log(`::error::preflight: ${err.message}`);
    process.exit(1);
  }
}

// ---------- main ----------

switch (cmd) {
  case "detect":
    cmdDetect();
    break;
  case "preflight":
    await cmdPreflight();
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
  case "report":
    cmdReport();
    break;
  case "quarantine":
    cmdQuarantine();
    break;
  case "report-batch":
    cmdReportBatch();
    break;
  case "seed":
    cmdSeed();
    break;
  default:
    console.log(
      "usage: orchestrator.mjs <detect|preflight|sync-en|seed|translate|verify|advance|quarantine|report-batch|report> [--lang L] [--limit N] [--content-dir D] [--baseline B] [--manifest M] [--langs csv]"
    );
    process.exitCode = cmd ? 1 : 0;
}
