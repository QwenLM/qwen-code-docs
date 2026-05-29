import type { MetadataRoute } from "next";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const LOCALES = ["en", "zh", "de", "fr", "ru", "ja", "pt-BR"] as const;

export function generateStaticParams() {
  return [{ __metadata_id__: [] }];
}

function getSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");

  const ghRepo = process.env.GITHUB_REPOSITORY; // e.g. owner/repo
  if (ghRepo && ghRepo.includes("/")) {
    const [owner, repo] = ghRepo.split("/");
    if (owner && repo) return `https://${owner}.github.io/${repo}`;
  }

  return "https://qwenlm.github.io/qwen-code-docs";
}

function walkDir(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const results: string[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;

    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkDir(full));
      continue;
    }

    if (!entry.isFile()) continue;
    if (!/\.(md|mdx)$/i.test(entry.name)) continue;

    results.push(full);
  }

  return results;
}

function toDocPath(locale: string, markdownFile: string): string {
  const localeRoot = path.join(process.cwd(), "content", locale);
  const rel = path
    .relative(localeRoot, markdownFile)
    .replace(/\\/g, "/")
    .replace(/\.(md|mdx)$/i, "");

  // index.md maps to directory root
  if (rel === "index") return `/${locale}/`;
  if (rel.endsWith("/index"))
    return `/${locale}/${rel.slice(0, -"/index".length)}/`;

  return `/${locale}/${rel}/`;
}

function safeExists(p: string): boolean {
  try {
    fs.accessSync(p, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function buildGitLastModifiedMap(
  repoRoot: string,
  contentRoot: string
): Map<string, Date> {
  const map = new Map<string, Date>();
  try {
    const contentPath = path
      .relative(repoRoot, contentRoot)
      .replace(/\\/g, "/");
    const output = execSync(
      `git log --format="%ai" --name-only -- "${contentPath}/"`,
      { cwd: repoRoot, encoding: "utf-8", maxBuffer: 50 * 1024 * 1024 }
    );

    const lines = output.split("\n");
    let currentDate: Date | null = null;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // 日期行格式：2026-05-28 10:30:00 +0800
      if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
        currentDate = new Date(trimmed);
        continue;
      }

      // 文件名行
      if (currentDate) {
        const fullPath = path.resolve(repoRoot, trimmed);
        if (!map.has(fullPath)) {
          map.set(fullPath, currentDate);
        }
      }
    }
  } catch {
    // 非 git 环境或命令失败，返回空 Map，调用方会 fallback
  }

  return map;
}

function getGitLastModified(
  filePath: string,
  gitMap: Map<string, Date>
): Date {
  const gitDate = gitMap.get(filePath);
  if (gitDate) return gitDate;

  try {
    return fs.statSync(filePath).mtime;
  } catch {
    return new Date(0);
  }
}

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = getSiteUrl();
  const repoRoot = path.resolve(process.cwd(), "..");
  const contentRoot = path.join(process.cwd(), "content");
  const gitMap = buildGitLastModifiedMap(repoRoot, contentRoot);
  const items: MetadataRoute.Sitemap = [];

  for (const locale of LOCALES) {
    const localeDir = path.join(process.cwd(), "content", locale);
    if (!safeExists(localeDir)) continue;

    const markdownFiles = walkDir(localeDir);
    for (const f of markdownFiles) {
      const docPath = toDocPath(locale, f);
      items.push({
        url: `${siteUrl}${docPath}`,
        lastModified: getGitLastModified(f, gitMap),
        changeFrequency: "weekly",
        priority: docPath === `/${locale}/` ? 0.8 : 0.6,
      });
    }
  }

  // Deduplicate (can happen if content has redundant index files)
  const seen = new Set<string>();
  return items.filter((i) => {
    if (seen.has(i.url)) return false;
    seen.add(i.url);
    return true;
  });
}
