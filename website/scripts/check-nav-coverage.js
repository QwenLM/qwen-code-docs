// Navigation for this site is hand-maintained: `translator/src/sync.ts` skips
// every `_meta.*` file when copying upstream docs in, because we carry tabs
// (showcase, blog) that upstream does not have. Nothing checks that the mirror
// keeps up, and it did not — upstream added the whole `developers/daemon`
// section in June 2026 and the sidebar here never learned about it, so Nextra
// appended it after the curated entries with a filename-derived title. That
// went unnoticed for three months.
//
// This catches the same shape early: a documentation directory that exists
// under `content/en` but has no entry in its parent `_meta.ts`.
//
// Scope notes:
//   - Directories, not pages. A section silently falling off the sidebar is the
//     failure that actually happened and the one that looks worst; requiring an
//     entry for all ~250 pages would need a large "known unlisted" baseline for
//     no extra protection.
//   - `content/en` only. The other locales are regenerated from it by
//     `qwen-translator meta`, so checking them would just report the same gap
//     seven more times.

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

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
 * Find documentation directories with no entry in their parent `_meta.ts`.
 *
 * A directory whose parent has no `_meta.ts` at all is skipped: Nextra orders
 * that level automatically and there is no mirror to fall behind.
 *
 * @param {string} contentRoot e.g. `website/content/en`
 * @returns {string[]} paths relative to `contentRoot`, sorted
 */
export function findUnlistedDirectories(contentRoot) {
  const unlisted = [];

  const walk = (dir, relative) => {
    const keys = metaKeys(path.join(dir, '_meta.ts'));
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (NON_PAGE_DIRS.has(entry.name)) continue;
      const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
      if (keys && !keys.has(entry.name)) unlisted.push(childRelative);
      walk(path.join(dir, entry.name), childRelative);
    }
  };

  walk(contentRoot, '');
  return unlisted.sort();
}

export const DEFAULT_CONTENT_ROOT = path.join(
  path.dirname(new URL(import.meta.url).pathname),
  '..',
  'content',
  'en',
);
