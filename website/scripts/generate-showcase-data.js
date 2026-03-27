#!/usr/bin/env node
/**
 * Scans showcase MDX files and generates a JSON data file
 * from their frontmatter. Run before build to keep the
 * index page in sync with actual files.
 */

const fs = require("fs");
const path = require("path");

const SHOWCASE_DIR = path.join(__dirname, "..", "content", "zh", "showcase");
const OUTPUT_FILE = path.join(__dirname, "..", "src", "generated", "showcase-data.json");

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const raw = match[1];
  const result = {};
  let currentKey = null;
  let arrayItems = null;

  for (const line of raw.split("\n")) {
    const keyValueMatch = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (keyValueMatch) {
      if (arrayItems && currentKey) {
        result[currentKey] = arrayItems;
        arrayItems = null;
      }
      const [, key, value] = keyValueMatch;
      const trimmed = value.trim();
      if (trimmed === "") {
        currentKey = key;
      } else if (trimmed.startsWith('"') || trimmed.startsWith("'")) {
        result[key] = trimmed.replace(/^["']|["']$/g, "");
        currentKey = key;
      } else {
        result[key] = trimmed;
        currentKey = key;
      }
    } else if (line.match(/^\s+-\s+".*"$/) || line.match(/^\s+-\s+'.*'$/)) {
      const itemMatch = line.match(/^\s+-\s+["'](.*)["']$/);
      if (itemMatch) {
        if (!arrayItems) arrayItems = [];
        arrayItems.push(itemMatch[1]);
      }
    } else if (line.match(/^\s+-\s+.+$/)) {
      const itemMatch = line.match(/^\s+-\s+(.+)$/);
      if (itemMatch) {
        if (!arrayItems) arrayItems = [];
        arrayItems.push(itemMatch[1].trim());
      }
    }
  }

  if (arrayItems && currentKey) {
    result[currentKey] = arrayItems;
  }

  return result;
}

function generateShowcaseData() {
  const files = fs.readdirSync(SHOWCASE_DIR).filter(
    (f) => f.endsWith(".mdx") && f !== "index.mdx"
  );

  const items = [];

  for (const file of files) {
    const filePath = path.join(SHOWCASE_DIR, file);
    const content = fs.readFileSync(filePath, "utf-8");
    const frontmatter = parseFrontmatter(content);

    if (!frontmatter || !frontmatter.title) continue;

    const slug = file.replace(/\.mdx$/, "");

    items.push({
      id: slug,
      title: frontmatter.title,
      description: frontmatter.description || "",
      category: frontmatter.category || "",
      features: Array.isArray(frontmatter.features) ? frontmatter.features : [],
      thumbnail: frontmatter.thumbnail || "",
      videoUrl: frontmatter.videoUrl || null,
      model: frontmatter.model || "qwen3.5-plus",
    });
  }

  items.sort((a, b) => a.id.localeCompare(b.id));

  const outputDir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(items, null, 2), "utf-8");
  console.log(`Generated showcase data: ${items.length} items → ${OUTPUT_FILE}`);
}

generateShowcaseData();
