#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const CONTENT_DIR = path.join(__dirname, "..", "content");
const OUTPUT_FILE = path.join(__dirname, "..", "public", "blog-dates.json");
const BLOG_DIR = "blog";

function extractDate(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const match = content.match(/^---\n[\s\S]*?\ndate:\s*["']?([^"'\n]+)["']?/m);
  return match ? match[1].trim() : null;
}

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(full));
    } else if (entry.name.endsWith(".mdx") || entry.name.endsWith(".md")) {
      files.push(full);
    }
  }
  return files;
}

function generateBlogDates() {
  const result = {};
  const locales = fs
    .readdirSync(CONTENT_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);

  for (const locale of locales) {
    const blogPath = path.join(CONTENT_DIR, locale, BLOG_DIR);
    if (!fs.existsSync(blogPath)) continue;

    for (const file of walk(blogPath)) {
      if (file.endsWith("index.mdx") || file.endsWith("index.md")) continue;
      const date = extractDate(file);
      if (!date) continue;

      const relPath = path.relative(path.join(CONTENT_DIR, locale), file);
      const route = "/" + relPath.replace(/\.mdx?$/, "").replace(/\\/g, "/");
      result[`/${locale}${route}`] = date;
    }
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2), "utf8");
  console.log(`Generated blog dates: ${Object.keys(result).length} entries -> ${OUTPUT_FILE}`);
}

generateBlogDates();
