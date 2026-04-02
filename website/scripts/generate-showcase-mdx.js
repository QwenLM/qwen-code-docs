#!/usr/bin/env node

/**
 * generate-showcase-mdx.js
 *
 * Reads per-language structured JSON files from showcase-i18n/ and generates
 * MDX files under content/{lang}/showcase/.
 *
 * The source of truth is zh.json — only showcase ids present in zh.json
 * are generated. For each target language, if a translation exists in
 * {lang}.json it is used; otherwise the zh content is used as fallback.
 *
 * Supports both structured format (overview/steps/callouts) and legacy
 * format (body). Structured format is preferred.
 *
 * Usage:
 *   node scripts/generate-showcase-mdx.js          # generate all languages
 *   node scripts/generate-showcase-mdx.js en ja    # generate only en and ja
 */

const fs = require("fs");
const path = require("path");

const I18N_DIR = path.resolve(__dirname, "../showcase-i18n");
const CONTENT_DIR = path.resolve(__dirname, "../content");
const ALL_LANGS = ["zh", "en", "de", "fr", "ja", "pt-BR", "ru"];
const SKIP_FILES = new Set(["index"]);

// ── Section headers per language ────────────────────────────────────

const SECTION_HEADERS = {
  zh: { overview: "概述", steps: "操作步骤", related: "相关推荐" },
  en: { overview: "Overview", steps: "Steps", related: "Related" },
  de: { overview: "Übersicht", steps: "Schritte", related: "Verwandte Empfehlungen" },
  fr: { overview: "Vue d'ensemble", steps: "Étapes", related: "Recommandations connexes" },
  ja: { overview: "概要", steps: "操作手順", related: "関連コンテンツ" },
  "pt-BR": { overview: "Visão geral", steps: "Passos", related: "Recomendações relacionadas" },
  ru: { overview: "Обзор", steps: "Шаги", related: "Связанные рекомендации" },
};

// ── Imports block (shared across all generated MDX files) ───────────

const IMPORTS_BLOCK = `import { Steps, Callout } from 'nextra/components'
import { ShowcaseDetailMeta, ShowcaseDetailCta } from '@/components/showcase-detail-meta'
import Link from 'next/link'`;

// ── Load JSON data ──────────────────────────────────────────────────

function loadLangData(lang) {
  const filePath = path.join(I18N_DIR, `${lang}.json`);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

// ── Render inline callout markers back to <Callout> tags ────────────

function renderInlineCallouts(content) {
  return content.replace(
    /:::callout\{type="(\w+)"\}\n([\s\S]*?)\n:::/g,
    (_, type, text) => `<Callout type="${type}">\n${text.trim()}\n</Callout>`
  );
}

// ── Render blocks array to MDX string ───────────────────────────────

const IMAGE_STYLE = `style={{width: '70%', borderRadius: '12px', marginTop: '32px', marginBottom: '32px', display: 'block', marginLeft: 'auto', marginRight: 'auto'}}`;

function renderBlocks(blocks) {
  const parts = [];

  for (const block of blocks) {
    switch (block.type) {
      case "text":
        parts.push(block.value);
        break;
      case "code":
        parts.push(`\`\`\`${block.lang || ""}\n${block.value}\n\`\`\``);
        break;
      case "image":
        parts.push(
          `<img src="${block.src}" alt="${block.alt || ""}" ${IMAGE_STYLE} />`
        );
        break;
      case "callout":
        parts.push(
          `<Callout type="${block.calloutType}">\n${block.value}\n</Callout>`
        );
        break;
      default:
        // Unknown block type, output value as-is
        if (block.value) parts.push(block.value);
        break;
    }
  }

  return parts.join("\n\n");
}

// ── Render step content (blocks or legacy content) ──────────────────

function renderStepContent(step) {
  if (step.blocks && Array.isArray(step.blocks) && step.blocks.length > 0) {
    return renderBlocks(step.blocks);
  }
  if (step.content) {
    return renderInlineCallouts(step.content);
  }
  return "";
}

// ── Build the media block (video or image) ──────────────────────────

function buildMediaBlock(item) {
  const mediaStyle = `style={{width: '70%', borderRadius: '12px', marginTop: '32px', marginBottom: '32px', display: 'block', marginLeft: 'auto', marginRight: 'auto'}}`;

  if (item.videoUrl) {
    return `<video src="${item.videoUrl}" poster="${item.thumbnail}" controls ${mediaStyle} />`;
  }
  // No video — show thumbnail as static image
  return `<img src="${item.thumbnail}" alt="${escapeYamlString(item.title)}" ${mediaStyle} />`;
}

// ── Build the ShowcaseDetailMeta component call ─────────────────────

function buildMetaComponent(item) {
  const featuresArray = (item.features || []).map((f) => `"${f}"`).join(", ");
  const author = item.author || "Qwen Code Team";
  return `<ShowcaseDetailMeta category="${escapeAttr(item.category)}" features={[${featuresArray}]} model="${item.model || "qwen3.5-plus"}" author="${escapeAttr(author)}" />`;
}

// ── Generate a single MDX file (structured format) ──────────────────

function generateMDX(item, lang) {
  const headers = SECTION_HEADERS[lang] || SECTION_HEADERS.zh;

  // Frontmatter
  const featuresYaml = (item.features || [])
    .map((f) => `  - "${f}"`)
    .join("\n");

  const frontmatter = [
    "---",
    `title: "${escapeYamlString(item.title)}"`,
    `description: "${escapeYamlString(item.description)}"`,
    `category: "${escapeYamlString(item.category)}"`,
    "features:",
    featuresYaml,
    `thumbnail: "${item.thumbnail}"`,
    item.videoUrl ? `videoUrl: "${item.videoUrl}"` : null,
    `model: "${item.model || "qwen3.5-plus"}"`,
    `author: "${escapeYamlString(item.author || "Qwen Code Team")}"`,
    item.date ? `date: "${item.date}"` : null,
    "---",
  ]
    .filter(Boolean)
    .join("\n");

  // If legacy body format, use it directly
  if (item.body !== undefined) {
    return `${frontmatter}\n${IMPORTS_BLOCK}\n\n${item.body}\n`;
  }

  // Build structured MDX body
  const sections = [];

  // 1. Overview
  sections.push(`## ${headers.overview}`);
  sections.push("");
  sections.push(item.overview || "");
  sections.push("");

  // 2. Meta component
  sections.push(buildMetaComponent(item));
  sections.push("");

  // 3. Media (video or image)
  sections.push(buildMediaBlock(item));
  sections.push("");

  // 4. Steps
  const steps = item.steps || [];
  if (steps.length > 0) {
    sections.push(`## ${headers.steps}`);
    sections.push("");
    sections.push("<Steps>");
    sections.push("");

    for (const step of steps) {
      if (step.title) {
        sections.push(`### ${step.title}`);
        sections.push("");
      }
      const stepBody = renderStepContent(step);
      if (stepBody) {
        sections.push(stepBody);
        sections.push("");
      }
    }

    sections.push("</Steps>");
    sections.push("");
  }

  // 5. Callouts (after Steps)
  const callouts = item.callouts || [];
  for (const callout of callouts) {
    sections.push(`<Callout type="${callout.type}">`);
    sections.push(callout.content);
    sections.push("</Callout>");
    sections.push("");
  }

  // 6. Related links
  const relatedLinks = item.relatedLinks || [];
  if (relatedLinks.length > 0) {
    sections.push(`## ${headers.related}`);
    sections.push("");
    for (const link of relatedLinks) {
      sections.push(`- <Link href="${link.href}">${link.title}</Link>`);
    }
    sections.push("");
  }

  // 7. CTA
  sections.push("<ShowcaseDetailCta />");

  const body = sections.join("\n");
  return `${frontmatter}\n${IMPORTS_BLOCK}\n\n${body}\n`;
}

function escapeYamlString(str) {
  if (!str) return "";
  return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function escapeAttr(str) {
  if (!str) return "";
  return str.replace(/"/g, '\\"');
}

// ── Main ────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const targetLangs = args.length > 0 ? args : ALL_LANGS;

  // Validate target languages
  const invalid = targetLangs.filter((l) => !ALL_LANGS.includes(l));
  if (invalid.length > 0) {
    console.error(`Unknown language(s): ${invalid.join(", ")}`);
    console.error(`Valid targets: ${ALL_LANGS.join(", ")}`);
    process.exit(1);
  }

  // Load zh as the source of truth
  const zhData = loadLangData("zh");
  if (!zhData) {
    console.error("❌ zh.json not found in showcase-i18n/. Run extract-showcase-data.js first.");
    process.exit(1);
  }

  const showcaseIds = Object.keys(zhData).filter((id) => !SKIP_FILES.has(id));
  console.log(`\n📦 Generating MDX for ${showcaseIds.length} showcases × ${targetLangs.length} language(s)\n`);

  let totalCreated = 0;
  let totalUpdated = 0;
  let totalFallback = 0;

  for (const lang of targetLangs) {
    const langData = loadLangData(lang);
    const targetDir = path.join(CONTENT_DIR, lang, "showcase");

    // Ensure target directory exists
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    let created = 0;
    let updated = 0;
    let fallback = 0;

    for (const id of showcaseIds) {
      // Use lang-specific data if available, otherwise fallback to zh
      const item = langData?.[id] || zhData[id];
      if (!langData?.[id] && lang !== "zh") {
        fallback++;
      }

      const mdxContent = generateMDX(item, lang);
      const targetPath = path.join(targetDir, `${id}.mdx`);

      if (fs.existsSync(targetPath)) {
        const existing = fs.readFileSync(targetPath, "utf-8");
        if (existing === mdxContent) continue; // unchanged
        updated++;
        totalUpdated++;
      } else {
        created++;
        totalCreated++;
      }

      fs.writeFileSync(targetPath, mdxContent, "utf-8");
    }

    const langLabel = `[${lang}]`.padEnd(8);
    const parts = [];
    if (created > 0) parts.push(`+${created} created`);
    if (updated > 0) parts.push(`~${updated} updated`);
    if (fallback > 0) parts.push(`${fallback} fallback→zh`);
    if (parts.length === 0) parts.push("(all up to date)");
    console.log(`  ${langLabel} ${parts.join(", ")}`);

    totalFallback += fallback;
  }

  console.log(`\n✅ Done! Created: ${totalCreated}, Updated: ${totalUpdated}, Fallback: ${totalFallback}\n`);
}

main();
