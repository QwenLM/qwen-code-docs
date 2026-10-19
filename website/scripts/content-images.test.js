import { deepStrictEqual } from 'node:assert';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const WEBSITE = fileURLToPath(new URL('..', import.meta.url));
const CONTENT = path.join(WEBSITE, 'content');

function* pages(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* pages(full);
    else if (/\.mdx?$/.test(entry.name)) yield full;
  }
}

test('every local image a page embeds exists', () => {
  // next build imports every local Markdown image, and CI only builds after merge.
  const missing = [];
  for (const page of pages(CONTENT)) {
    let fence = null;
    readFileSync(page, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        const mark = line.match(/^\s*(```|~~~)/)?.[1];
        if (mark) {
          if (!fence) fence = mark;
          else if (mark === fence) fence = null;
          return;
        }
        if (fence) return;
        const prose = line.replace(/`[^`]*`/g, '');
        for (const [, url] of prose.matchAll(/!\[[^\]]*\]\(([^)\s]+)/g)) {
          const target = decodeURI(url).replace(/[?#].*/, '');
          if (/^https?:\/\//.test(target)) continue;
          const file = target.startsWith('/')
            ? path.join(WEBSITE, 'public', target)
            : path.resolve(path.dirname(page), target);
          if (!existsSync(file)) {
            missing.push(`${path.relative(CONTENT, page)}:${i + 1} ${url}`);
          }
        }
      });
  }
  deepStrictEqual(missing, []);
});
