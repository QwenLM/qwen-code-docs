import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('REST API indexes link to existing protocol sections in every locale', () => {
  const englishUrl =
    'https://qwenlm.github.io/qwen-code-docs/en/developers/qwen-serve-protocol/';
  const read = (lang, file) =>
    readFileSync(
      new URL(`../content/${lang}/developers/${file}`, import.meta.url),
      'utf8',
    );
  const spec = read('en', 'daemon-rest-api.openapi.json');
  const operations = new Set(
    Object.entries(JSON.parse(spec).paths).flatMap(([path, pathItem]) =>
      Object.keys(pathItem)
        .filter((method) =>
          /^(get|post|put|patch|delete|options|head|trace)$/.test(method),
        )
        .map(
          (method) =>
            `${method.toUpperCase()} ${path.replace(/\{([^}]+)\}/g, ':$1')}`,
        ),
    ),
  );
  for (const lang of ['en', 'zh', 'de', 'fr', 'ru', 'ja', 'pt-BR', 'ko']) {
    assert.match(read(lang, '_meta.ts'), /'daemon-rest-api-reference':/);
    assert.equal(read(lang, 'daemon-rest-api.openapi.json'), spec);
    const reference = read(lang, 'daemon-rest-api-reference.md');
    const links = [
      ...reference.matchAll(/\[`([^`]+)`\]\(([^)]+)\)/g),
    ].filter(([, operation]) => operations.has(operation));
    assert.deepEqual(
      new Set(links.map(([, operation]) => operation)),
      operations,
      lang,
    );
    assert.equal(links.length, operations.size, lang);
    for (const [, operation, href] of links) {
      const [page, anchor] = href.split('#');
      assert.ok(
        page === './qwen-serve-protocol.md' || page === englishUrl,
        href,
      );
      const protocol = read(
        page === englishUrl ? 'en' : lang,
        'qwen-serve-protocol.md',
      );
      const heading = protocol
        .split('\n')
        .find(
          (line) =>
            /^#{1,6} /.test(line) &&
            line.replace(/^#+ /, '').startsWith(`\`${operation}\``),
        );
      assert.ok(heading, `${lang}: ${operation} has no section at ${href}`);
      const id = heading
        .replace(/^#+ /, '')
        .toLowerCase()
        .replace(/[`/:(),.]/g, '')
        .replace(/ /g, '-');
      assert.equal(anchor, id, `${lang}: ${href}`);
    }
  }
});
