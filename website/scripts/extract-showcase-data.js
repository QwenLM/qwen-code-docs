#!/usr/bin/env node

/**
 * extract-showcase-data.js
 *
 * Extracts showcase MDX content from content/{lang}/showcase/*.mdx files
 * and produces per-language JSON files under showcase-i18n/.
 *
 * Each JSON file maps showcase id → { frontmatter fields, body }.
 * The "body" is the raw MDX content after the frontmatter + import block,
 * so the generate script can reconstruct the full MDX file.
 *
 * Usage:
 *   node scripts/extract-showcase-data.js                  # extract from zh (main branch)
 *   node scripts/extract-showcase-data.js --from-git pr-87 # extract all langs from a git branch
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const CONTENT_DIR = path.resolve(__dirname, "../content");
const OUTPUT_DIR = path.resolve(__dirname, "../showcase-i18n");
const ALL_LANGS = ["zh", "en", "de", "fr", "ja", "pt-BR", "ru"];
const SKIP_FILES = new Set(["index.mdx"]);

// ── Frontmatter parser ──────────────────────────────────────────────

function parseFrontmatter(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: raw };

  const yamlBlock = match[1];
  const rest = match[2];
  const meta = {};

  let currentKey = null;
  let arrayValues = null;

  for (const line of yamlBlock.split("\n")) {
    const kvMatch = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (kvMatch) {
      // Flush previous array
      if (currentKey && arrayValues) {
        meta[currentKey] = arrayValues;
        arrayValues = null;
      }
      currentKey = kvMatch[1];
      let value = kvMatch[2].trim();
      if (value === "") {
        // Could be start of an array
        arrayValues = [];
      } else {
        // Remove surrounding quotes
        value = value.replace(/^["']|["']$/g, "");
        meta[currentKey] = value;
        currentKey = null;
      }
    } else if (arrayValues !== null) {
      const itemMatch = line.match(/^\s+-\s*["']?(.+?)["']?\s*$/);
      if (itemMatch) {
        arrayValues.push(itemMatch[1]);
      }
    }
  }
  // Flush last array
  if (currentKey && arrayValues) {
    meta[currentKey] = arrayValues;
  }

  return { meta, body: rest };
}

// ── Body cleaner: strip import block ────────────────────────────────

function stripImports(body) {
  // Remove all import lines at the top of the body
  const lines = body.split("\n");
  let startIndex = 0;

  // Skip leading empty lines
  while (startIndex < lines.length && lines[startIndex].trim() === "") {
    startIndex++;
  }

  // Skip import lines
  while (startIndex < lines.length && lines[startIndex].trim().startsWith("import ")) {
    startIndex++;
  }

  // Skip trailing empty lines after imports
  while (startIndex < lines.length && lines[startIndex].trim() === "") {
    startIndex++;
  }

  return lines.slice(startIndex).join("\n").trimEnd();
}

// ── Extract from filesystem ─────────────────────────────────────────

function extractFromFilesystem(lang) {
  const showcaseDir = path.join(CONTENT_DIR, lang, "showcase");
  if (!fs.existsSync(showcaseDir)) return null;

  const files = fs.readdirSync(showcaseDir)
    .filter((f) => f.endsWith(".mdx") && !SKIP_FILES.has(f));

  const data = {};
  for (const file of files) {
    const id = file.replace(/\.mdx$/, "");
    const raw = fs.readFileSync(path.join(showcaseDir, file), "utf-8");
    const { meta, body } = parseFrontmatter(raw);
    const cleanBody = stripImports(body);

    data[id] = {
      title: meta.title || "",
      description: meta.description || "",
      category: meta.category || "",
      features: meta.features || [],
      thumbnail: meta.thumbnail || "",
      videoUrl: meta.videoUrl || "",
      model: meta.model || "qwen3.5-plus",
      body: cleanBody,
    };
  }
  return data;
}

// ── Extract from git branch ─────────────────────────────────────────

function extractFromGit(branch, lang) {
  const treePath = `website/content/${lang}/showcase`;

  let fileList;
  try {
    fileList = execSync(`git ls-tree --name-only ${branch}:${treePath}`, {
      encoding: "utf-8",
      cwd: path.resolve(__dirname, "../.."),
    }).trim().split("\n");
  } catch {
    return null;
  }

  const mdxFiles = fileList.filter((f) => f.endsWith(".mdx") && !SKIP_FILES.has(f));
  const data = {};

  for (const file of mdxFiles) {
    const id = file.replace(/\.mdx$/, "");
    let raw;
    try {
      raw = execSync(`git show ${branch}:${treePath}/${file}`, {
        encoding: "utf-8",
        cwd: path.resolve(__dirname, "../.."),
      });
    } catch {
      continue;
    }

    const { meta, body } = parseFrontmatter(raw);
    const cleanBody = stripImports(body);

    data[id] = {
      title: meta.title || "",
      description: meta.description || "",
      category: meta.category || "",
      features: meta.features || [],
      thumbnail: meta.thumbnail || "",
      videoUrl: meta.videoUrl || "",
      model: meta.model || "qwen3.5-plus",
      body: cleanBody,
    };
  }
  return data;
}

// ── Main ────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const fromGitIndex = args.indexOf("--from-git");
  const gitBranch = fromGitIndex >= 0 ? args[fromGitIndex + 1] : null;

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const langsToExtract = gitBranch ? ALL_LANGS : ["zh"];

  console.log(`\n📦 Extracting showcase data${gitBranch ? ` from git branch "${gitBranch}"` : " from filesystem"}\n`);

  for (const lang of langsToExtract) {
    const data = gitBranch
      ? extractFromGit(gitBranch, lang)
      : extractFromFilesystem(lang);

    if (!data || Object.keys(data).length === 0) {
      console.log(`  [${lang}] ⚠️  No showcase files found, skipping`);
      continue;
    }

    const outputPath = path.join(OUTPUT_DIR, `${lang}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2) + "\n", "utf-8");
    console.log(`  [${lang}] ✅ Extracted ${Object.keys(data).length} showcases → showcase-i18n/${lang}.json`);
  }

  console.log("\n✅ Done!\n");
}

main();
