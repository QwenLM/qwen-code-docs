#!/usr/bin/env node

/**
 * restructure-steps-to-blocks.js
 *
 * Converts step "content" strings into structured "blocks" arrays.
 * Each block has a type (text, code, image, callout) and relevant fields.
 *
 * Usage:
 *   node scripts/restructure-steps-to-blocks.js           # convert all languages
 *   node scripts/restructure-steps-to-blocks.js zh en      # convert specific languages
 */

const fs = require("fs");
const path = require("path");

const I18N_DIR = path.resolve(__dirname, "../showcase-i18n");
const ALL_LANGS = ["zh", "en", "de", "fr", "ja", "pt-BR", "ru"];

/**
 * Parse a step's content string into an array of typed blocks.
 *
 * Recognized patterns (in order of priority):
 *   1. ```lang\n...\n```        → { type: "code", lang, value }
 *   2. <img src="..." ... />    → { type: "image", src, alt }
 *   3. :::callout{type="xxx"}   → { type: "callout", calloutType, value }
 *   4. remaining text           → { type: "text", value }
 */
function parseContentToBlocks(content) {
  if (!content || !content.trim()) return [];

  const blocks = [];
  let remaining = content;

  // Tokenize by splitting on code blocks, images, and callouts
  // We process the string sequentially, extracting special blocks
  // and collecting text in between.

  const TOKEN_REGEX =
    /(?:```(\w*)\n([\s\S]*?)\n```)|(?:<img\s+([\s\S]*?)\/>)|(?:::callout\{type="(\w+)"\}\n([\s\S]*?)\n:::)/g;

  let lastIndex = 0;
  let match;

  while ((match = TOKEN_REGEX.exec(remaining)) !== null) {
    // Collect text before this match
    if (match.index > lastIndex) {
      const textBefore = remaining.substring(lastIndex, match.index).trim();
      if (textBefore) {
        blocks.push({ type: "text", value: textBefore });
      }
    }

    if (match[1] !== undefined || match[2] !== undefined) {
      // Code block: ```lang\n...\n```
      blocks.push({
        type: "code",
        lang: match[1] || "",
        value: match[2],
      });
    } else if (match[3] !== undefined) {
      // Image: <img ... />
      const attrs = match[3];
      const srcMatch = attrs.match(/src="([^"]+)"/);
      const altMatch = attrs.match(/alt="([^"]*)"/);
      blocks.push({
        type: "image",
        src: srcMatch ? srcMatch[1] : "",
        alt: altMatch ? altMatch[1] : "",
      });
    } else if (match[4] !== undefined) {
      // Callout: :::callout{type="xxx"}\n...\n:::
      blocks.push({
        type: "callout",
        calloutType: match[4],
        value: match[5].trim(),
      });
    }

    lastIndex = match.index + match[0].length;
  }

  // Collect trailing text
  if (lastIndex < remaining.length) {
    const textAfter = remaining.substring(lastIndex).trim();
    if (textAfter) {
      blocks.push({ type: "text", value: textAfter });
    }
  }

  return blocks;
}

function main() {
  const args = process.argv.slice(2);
  const targetLangs = args.length > 0 ? args : ALL_LANGS;

  console.log(
    `\n🔧 Restructuring step content → blocks for ${targetLangs.length} language(s)\n`
  );

  for (const lang of targetLangs) {
    const filePath = path.join(I18N_DIR, `${lang}.json`);
    if (!fs.existsSync(filePath)) {
      console.log(`  [${lang}] ⚠️  File not found, skipping`);
      continue;
    }

    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    let convertedSteps = 0;

    for (const [id, item] of Object.entries(data)) {
      const steps = item.steps;
      if (!steps || !Array.isArray(steps)) continue;

      for (const step of steps) {
        // Skip if already has blocks
        if (step.blocks) continue;
        // Skip if no content to convert
        if (!step.content) continue;

        step.blocks = parseContentToBlocks(step.content);
        delete step.content;
        convertedSteps++;
      }
    }

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
    console.log(`  [${lang}] ✅ Converted ${convertedSteps} steps`);
  }

  console.log("\n✅ Done!\n");
}

main();
