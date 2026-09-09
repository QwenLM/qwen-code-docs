import { deepStrictEqual } from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import {
  DEFAULT_CONTENT_ROOT,
  findUnlistedEntries,
} from './check-nav-coverage.js';

function fixture(tree) {
  const root = mkdtempSync(path.join(tmpdir(), 'nav-coverage-'));
  for (const [relative, contents] of Object.entries(tree)) {
    const full = path.join(root, relative);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, contents);
  }
  return root;
}

test('every page and directory is listed in the sidebar', () => {
  // The real guard. Content synced from upstream without a nav entry renders
  // with a filename-derived title after the curated ones — which is how
  // `developers/daemon` sat at the bottom of the Developer Guide for three
  // months, and `users/qwen-serve` with it. Add the entry to the matching
  // `_meta.ts`, or add the directory to NON_PAGE_DIRS if it holds assets.
  deepStrictEqual(findUnlistedEntries(DEFAULT_CONTENT_ROOT), []);
});

test('reports a page its directory _meta.ts omits', () => {
  const root = fixture({
    '_meta.ts': "export default {\n  overview: 'Overview',\n};",
    'overview.md': '# Overview',
    'qwen-serve.md': '# Daemon mode',
  });
  deepStrictEqual(findUnlistedEntries(root), ['qwen-serve']);
});

test('exempts index pages, which the directory entry resolves', () => {
  const root = fixture({
    '_meta.ts': "export default {\n  daemon: 'Daemon',\n};",
    'daemon/_meta.ts': 'export default {};',
    'daemon/index.md': '# Daemon',
  });
  deepStrictEqual(findUnlistedEntries(root), []);
});

test('reports a directory its parent _meta.ts omits', () => {
  const root = fixture({
    '_meta.ts': "export default {\n  users: 'Users',\n};",
    'users/index.md': '# Users',
    'developers/index.md': '# Developers',
  });
  deepStrictEqual(findUnlistedEntries(root), ['developers']);
});

test('reports nested directories by their path', () => {
  const root = fixture({
    '_meta.ts': "export default {\n  developers: 'Developers',\n};",
    'developers/_meta.ts': "export default {\n  tools: 'Tools',\n};",
    'developers/tools/index.md': '# Tools',
    'developers/daemon/00-index.md': '# Daemon',
  });
  deepStrictEqual(findUnlistedEntries(root), ['developers/daemon']);
});

test('skips levels that have no _meta.ts, since nothing can drift there', () => {
  const root = fixture({
    'developers/daemon/00-index.md': '# Daemon',
  });
  deepStrictEqual(findUnlistedEntries(root), []);
});

test('ignores asset directories', () => {
  const root = fixture({
    '_meta.ts': 'export default {};',
    'images/logo.png': '',
    'assets/style.css': '',
  });
  deepStrictEqual(findUnlistedEntries(root), []);
});

test('accepts quoted keys, which hyphenated directory names require', () => {
  const root = fixture({
    '_meta.ts': "export default {\n  'daemon-ui': 'Daemon UI',\n};",
    'daemon-ui/index.md': '# Daemon UI',
  });
  deepStrictEqual(findUnlistedEntries(root), []);
});
