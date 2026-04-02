#!/usr/bin/env node

/**
 * restructure-showcase-json.js
 *
 * Converts existing showcase JSON files from the "body" format
 * to a structured format with overview, steps, callouts, etc.
 *
 * Usage:
 *   node scripts/restructure-showcase-json.js           # convert all languages
 *   node scripts/restructure-showcase-json.js zh en      # convert specific languages
 */

const fs = require("fs");
const path = require("path");

const I18N_DIR = path.resolve(__dirname, "../showcase-i18n");
const ALL_LANGS = ["zh", "en", "de", "fr", "ja", "pt-BR", "ru"];

// ── Parse body into structured fields ───────────────────────────────

function parseBody(body) {
  const result = {
    overview: "",
    steps: [],
    callouts: [],
  };

  // 1. Extract overview: text before <ShowcaseDetailMeta
  const metaIndex = body.indexOf("<ShowcaseDetailMeta");
  if (metaIndex >= 0) {
    let overviewRaw = body.substring(0, metaIndex).trim();
    // Remove the ## header line (概述 / Overview / etc.)
    overviewRaw = overviewRaw.replace(/^##\s+.+\n+/, "").trim();
    result.overview = overviewRaw;
  }

  // 2. Extract Steps section
  const stepsMatch = body.match(/<Steps>([\s\S]*?)<\/Steps>/);
  if (stepsMatch) {
    const stepsContent = stepsMatch[1];
    result.steps = parseSteps(stepsContent);
  }

  // 3. Extract Callouts that are AFTER </Steps>
  const stepsEndIndex = body.indexOf("</Steps>");
  if (stepsEndIndex >= 0) {
    const afterSteps = body.substring(stepsEndIndex);
    const calloutRegex = /<Callout type="(\w+)">\n([\s\S]*?)\n<\/Callout>/g;
    let calloutMatch;
    while ((calloutMatch = calloutRegex.exec(afterSteps)) !== null) {
      result.callouts.push({
        type: calloutMatch[1],
        content: calloutMatch[2].trim(),
      });
    }
  }

  return result;
}

function parseSteps(stepsContent) {
  // Split by step headers (### or ##)
  // We need to handle both ### and ## step headers
  const stepRegex = /^(#{2,3})\s+(.+)$/gm;
  const headers = [];
  let match;

  while ((match = stepRegex.exec(stepsContent)) !== null) {
    headers.push({
      index: match.index,
      endIndex: match.index + match[0].length,
      title: match[2].trim(),
    });
  }

  if (headers.length === 0) {
    // No step headers found, treat entire content as one step
    const content = stepsContent.trim();
    if (content) {
      return [{ title: "", content }];
    }
    return [];
  }

  const steps = [];
  for (let i = 0; i < headers.length; i++) {
    const startIdx = headers[i].endIndex;
    const endIdx = i + 1 < headers.length ? headers[i + 1].index : stepsContent.length;
    let content = stepsContent.substring(startIdx, endIdx).trim();

    // Process inline Callouts within step content
    content = convertInlineCallouts(content);

    steps.push({
      title: headers[i].title,
      content,
    });
  }

  return steps;
}

function convertInlineCallouts(content) {
  // Convert <Callout type="xxx">...\n</Callout> to :::callout{type="xxx"}\n...\n:::
  return content.replace(
    /<Callout type="(\w+)">\n([\s\S]*?)\n<\/Callout>/g,
    (_, type, text) => `:::callout{type="${type}"}\n${text.trim()}\n:::`
  );
}

// ── Main ────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const targetLangs = args.length > 0 ? args : ALL_LANGS;

  console.log(`\n🔧 Restructuring showcase JSON for ${targetLangs.length} language(s)\n`);

  for (const lang of targetLangs) {
    const filePath = path.join(I18N_DIR, `${lang}.json`);
    if (!fs.existsSync(filePath)) {
      console.log(`  [${lang}] ⚠️  File not found, skipping`);
      continue;
    }

    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    let converted = 0;

    for (const [id, item] of Object.entries(data)) {
      if (!item.body) continue; // Already structured or empty
      if (item.overview !== undefined) continue; // Already converted

      const parsed = parseBody(item.body);

      // Replace body with structured fields
      delete item.body;
      item.overview = parsed.overview;
      item.steps = parsed.steps;
      item.callouts = parsed.callouts;
      converted++;
    }

    // Write back
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
    console.log(`  [${lang}] ✅ Converted ${converted} showcases`);
  }

  console.log("\n✅ Done!\n");
}

main();
