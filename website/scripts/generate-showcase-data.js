#!/usr/bin/env node
/**
 * Scans showcase MDX files and generates JSON data files
 * from their frontmatter for each locale. Run before build
 * to keep the index page in sync with actual files.
 */

const fs = require("fs");
const path = require("path");

const CONTENT_DIR = path.join(__dirname, "..", "content");
const OUTPUT_DIR = path.join(__dirname, "..", "src", "generated");
const LOCALES = ["zh", "en", "de", "fr", "ja", "pt-BR", "ru"];

// Category sort order per locale (mapped by the locale's own category names)
const CATEGORY_ORDER = {
  zh: { "入门指南": 1, "编程开发": 2, "创作者工具": 3, "日常任务": 4, "产品洞察": 5, "学习研究": 6 },
  en: { "Getting Started": 1, "Programming": 2, "Creator Tools": 3, "Daily Tasks": 4, "Product Insights": 5, "Learning & Research": 6 },
  de: { "Erste Schritte": 1, "Programmierung": 2, "Kreativ-Tools": 3, "Tägliche Aufgaben": 4, "Produkteinblicke": 5, "Lernen & Forschen": 6 },
  fr: { "Guide de démarrage": 1, "Programmation": 2, "Outils créatifs": 3, "Tâches quotidiennes": 4, "Aperçus produit": 5, "Apprentissage & Recherche": 6 },
  ja: { "入門ガイド": 1, "プログラミング": 2, "クリエイターツール": 3, "日常タスク": 4, "製品インサイト": 5, "学習・研究": 6 },
  "pt-BR": { "Guia de Início": 1, "Programação": 2, "Ferramentas de Criação": 3, "Tarefas Diárias": 4, "Insights de Produto": 5, "Aprendizado e Pesquisa": 6 },
  ru: { "Руководство по началу работы": 1, "Программирование": 2, "Инструменты для творчества": 3, "Ежедневные задачи": 4, "Аналитика продукта": 5, "Обучение и исследования": 6 },
};

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

function generateForLocale(locale) {
  const showcaseDir = path.join(CONTENT_DIR, locale, "showcase");
  if (!fs.existsSync(showcaseDir)) {
    console.log(`Skipping locale "${locale}": no showcase directory`);
    return;
  }

  const files = fs.readdirSync(showcaseDir).filter(
    (f) => f.endsWith(".mdx") && f !== "index.mdx"
  );

  const items = [];

  for (const file of files) {
    const filePath = path.join(showcaseDir, file);
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
      author: frontmatter.author || "",
      date: frontmatter.date || "",
    });
  }

  const categoryOrder = CATEGORY_ORDER[locale] || {};

  // Primary sort: date descending (newest first).
  // Secondary sort: category order ascending.
  // Tertiary sort: id alphabetically.
  items.sort((a, b) => {
    const dateA = a.date || "1970-01-01";
    const dateB = b.date || "1970-01-01";
    if (dateA !== dateB) {
      return dateB.localeCompare(dateA); // newest first
    }
    const orderA = categoryOrder[a.category] || 99;
    const orderB = categoryOrder[b.category] || 99;
    if (orderA !== orderB) {
      return orderA - orderB;
    }
    return a.id.localeCompare(b.id);
  });

  const outputFile = path.join(OUTPUT_DIR, `showcase-data-${locale}.json`);
  fs.writeFileSync(outputFile, JSON.stringify(items, null, 2), "utf-8");
  console.log(`[${locale}] Generated showcase data: ${items.length} items → ${outputFile}`);
}

function generateShowcaseData() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  for (const locale of LOCALES) {
    generateForLocale(locale);
  }

  // Keep backward-compatible default file (zh)
  const zhFile = path.join(OUTPUT_DIR, "showcase-data-zh.json");
  const defaultFile = path.join(OUTPUT_DIR, "showcase-data.json");
  if (fs.existsSync(zhFile)) {
    fs.copyFileSync(zhFile, defaultFile);
    console.log(`Copied zh data → ${defaultFile} (backward compat)`);
  }
}

generateShowcaseData();
