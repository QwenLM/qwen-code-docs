// Navigation for this site is hand-maintained: `translator/src/sync.ts` skips
// every `_meta.*` file when copying upstream docs in, because we carry tabs
// (showcase, blog) that upstream does not have. Nothing checks that the mirror
// keeps up, and it did not — upstream added the whole `developers/daemon`
// section in June 2026 and the sidebar here never learned about it, so Nextra
// appended it after the curated entries with a filename-derived title. That
// went unnoticed for three months.
//
// This catches the same shape early: a page or directory that exists under
// `content/en` but has no entry in its parent `_meta.ts`.
//
// Scope notes:
//   - Pages as well as directories. Sections are the loudest failure, but the
//     same drift hits individual pages — `users/qwen-serve`, the daemon user
//     guide, was itself unlisted. Checking both needs no baseline: with the
//     entries this landed alongside, `content/en` is fully covered.
//   - `index` files are exempt; they are a directory's landing page and Nextra
//     resolves them from the directory entry.
//   - `content/en` only. The other locales are regenerated from it by
//     `qwen-translator meta`, so checking them would just report the same gap
//     seven more times.

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Directories that hold assets rather than pages. They have no sidebar entry
 * by design.
 */
const NON_PAGE_DIRS = new Set(['assets', 'images', 'public']);

/** Top-level keys declared in a `_meta.ts`, or null when there is no file. */
function metaKeys(metaPath) {
  if (!existsSync(metaPath)) return null;
  const source = readFileSync(metaPath, 'utf8');
  return new Set(
    [...source.matchAll(/^ {2}'?([A-Za-z0-9_.-]+)'?\s*:/gm)].map((m) => m[1]),
  );
}

/**
 * Find pages and directories with no entry in their parent `_meta.ts`.
 *
 * A level whose directory has no `_meta.ts` at all is skipped: Nextra orders it
 * automatically and there is no mirror to fall behind.
 *
 * @param {string} contentRoot e.g. `website/content/en`
 * @returns {string[]} paths relative to `contentRoot`, sorted
 */
export function findUnlistedEntries(contentRoot) {
  const unlisted = [];

  const walk = (dir, relative) => {
    const keys = metaKeys(path.join(dir, '_meta.ts'));
    const child = (name) => (relative ? `${relative}/${name}` : name);

    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (NON_PAGE_DIRS.has(entry.name)) continue;
        if (keys && !keys.has(entry.name)) unlisted.push(child(entry.name));
        walk(path.join(dir, entry.name), child(entry.name));
        continue;
      }
      const page = entry.name.match(/^(.+)\.mdx?$/);
      if (!page || page[1] === 'index') continue;
      if (keys && !keys.has(page[1])) unlisted.push(child(page[1]));
    }
  };

  walk(contentRoot, '');
  return unlisted.sort();
}

export const DEFAULT_CONTENT_ROOT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'content',
  'en',
);
