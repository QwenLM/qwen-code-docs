#!/usr/bin/env node

/**
 * watch-showcase.js
 *
 * Watches showcase-i18n/*.json for changes and automatically
 * re-runs generate-showcase-mdx.js to regenerate MDX files.
 *
 * Usage:
 *   node scripts/watch-showcase.js
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const I18N_DIR = path.resolve(__dirname, "../showcase-i18n");
const GENERATE_SCRIPT = path.resolve(__dirname, "generate-showcase-mdx.js");

let debounceTimer = null;
const DEBOUNCE_MS = 500;

function regenerate() {
  console.log(`\n🔄 [${new Date().toLocaleTimeString()}] JSON changed, regenerating MDX...\n`);
  try {
    execSync(`node "${GENERATE_SCRIPT}"`, { stdio: "inherit" });
  } catch (error) {
    console.error("❌ Generation failed:", error.message);
  }
}

function onFileChange(eventType, filename) {
  if (!filename || !filename.endsWith(".json")) return;

  // Debounce: wait for writes to settle before regenerating
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    console.log(`📝 Detected change in ${filename}`);
    regenerate();
  }, DEBOUNCE_MS);
}

// Start watching
console.log("👀 Watching showcase-i18n/*.json for changes...");
console.log("   Press Ctrl+C to stop.\n");

fs.watch(I18N_DIR, { persistent: true }, onFileChange);
