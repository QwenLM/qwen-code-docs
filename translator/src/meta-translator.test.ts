import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { MetaTranslator } from "./meta-translator";

// dropKeysWithoutPages is private, and reaching it through the prototype is
// deliberate: the alternative is a live model call, and this is the function
// that stands between a locale running behind English and a failed deploy.
const drop = (content: string, dir: string): string =>
  (MetaTranslator.prototype as any)["dropKeysWithoutPages"].call(
    Object.create(MetaTranslator.prototype),
    content,
    dir
  );

function tree(spec: {
  en: string;
  zh?: string;
  pages: string[];
}): { dir: string; meta: any } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "meta-add-"));
  temps.push(dir);
  for (const lang of ["en", "zh", "ko"]) fs.mkdirSync(path.join(dir, lang));
  fs.writeFileSync(path.join(dir, "en", "_meta.ts"), spec.en);
  if (spec.zh) fs.writeFileSync(path.join(dir, "zh", "_meta.ts"), spec.zh);
  for (const lang of ["zh", "ko"])
    for (const page of spec.pages)
      fs.writeFileSync(path.join(dir, lang, page), "# x\n");
  const meta: any = Object.create(MetaTranslator.prototype);
  meta.projectRoot = dir;
  meta.outputDir = ".";
  meta.sourceLanguage = "en";
  return { dir, meta };
}

const temps: string[] = [];
after(() => {
  for (const dir of temps) fs.rmSync(dir, { recursive: true, force: true });
});

function fixture(pages: string[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "meta-drop-"));
  temps.push(dir);
  for (const page of pages) {
    if (page.endsWith(".md")) fs.writeFileSync(path.join(dir, page), "# x\n");
    else fs.mkdirSync(path.join(dir, page));
  }
  return dir;
}

describe("dropKeysWithoutPages", () => {
  it("drops a string entry whose page is missing", () => {
    const dir = fixture(["architecture.md"]);
    const out = drop(
      `export default {\n  architecture: 'Architecture',\n  extensions: 'Extensions',\n};\n`,
      dir
    );
    assert.match(out, /architecture/);
    assert.doesNotMatch(out, /extensions/);
  });

  it("drops an object entry whose page is missing", () => {
    const dir = fixture(["goals.md"]);
    const out = drop(
      `export default {\n  goals: 'Goals',\n  checkpointing: {\n    display: 'hidden',\n  },\n};\n`,
      dir
    );
    assert.match(out, /goals/);
    assert.doesNotMatch(out, /checkpointing/);
    assert.doesNotMatch(out, /hidden/);
  });

  it("keeps a separator, whose key is a label rather than a route", () => {
    const dir = fixture([]);
    const out = drop(
      `export default {\n  'Qwen Code SDK': {\n    title: 'Agent SDK',\n    type: 'separator',\n  },\n};\n`,
      dir
    );
    assert.match(out, /Qwen Code SDK/);
  });

  it("keeps a key backed by a directory rather than a file", () => {
    const dir = fixture(["daemon"]);
    const out = drop(`export default {\n  daemon: 'Daemon Mode',\n};\n`, dir);
    assert.match(out, /daemon/);
  });

  it("leaves a file alone when every key has a page", () => {
    const dir = fixture(["a.md", "b.md"]);
    const input = `export default {\n  a: 'A',\n  b: 'B',\n};\n`;
    assert.equal(drop(input, dir), input);
  });

  it("survives a brace inside a value", () => {
    // A literal `}` used to close the object early: the pageless key
    // survived, every later entry was swallowed, and the result did not
    // parse -- the inverse of this function's purpose, twice over.
    const dir = fixture(["b.md", "c.md"]);
    const out = drop(
      `export default {\n  gone: 'Beta } soon',\n  b: 'B',\n  c: 'C',\n};\n`,
      dir
    );
    assert.doesNotMatch(out, /gone/);
    assert.match(out, /b: 'B'/);
    assert.match(out, /c: 'C'/);
    assert.match(out, /};/);
  });

  it("keeps a menu entry, which has no file behind it either", () => {
    const dir = fixture([]);
    const out = drop(
      `export default {\n  community: {\n    title: 'Community',\n    type: 'menu',\n  },\n};\n`,
      dir
    );
    assert.match(out, /community/);
  });

  it("keeps an href-backed page entry", () => {
    const dir = fixture([]);
    const out = drop(
      `export default {\n  changelog: {\n    title: 'Changelog',\n    href: 'https://example.com',\n  },\n};\n`,
      dir
    );
    assert.match(out, /changelog/);
  });

  it("leaves a file with no default export alone", () => {
    const dir = fixture([]);
    const input = `module.exports = {\n  gone: 'Gone',\n};\n`;
    assert.equal(drop(input, dir), input);
  });

  it("keeps the file byte-identical when nothing is missing", async () => {
    const { dir, meta } = tree({
      en: `export default {\n  a: 'A',\n  b: 'B',\n};\n`,
      zh: `export default {\n  a: '甲',\n  b: '乙',\n};\n`,
      pages: ["a.md", "b.md"]
    });
    let called = false;
    meta.translateMetaFileContent = async () => {
      called = true;
      return "";
    };
    await meta.translateMetaFile("_meta.ts", "zh");
    assert.equal(called, false, "should not call the model at all");
    assert.equal(
      fs.readFileSync(path.join(dir, "zh", "_meta.ts"), "utf8"),
      `export default {\n  a: '甲',\n  b: '乙',\n};\n`
    );
  });

  it("translates only the missing keys and preserves the rest", async () => {
    const { dir, meta } = tree({
      en: `export default {\n  a: 'A',\n  c: 'C',\n  b: 'B',\n};\n`,
      zh: `export default {\n  a: '甲',\n  b: '乙',\n};\n`,
      pages: ["a.md", "b.md", "c.md"]
    });
    let seen = "";
    meta.translateMetaFileContent = async (partial: string) => {
      seen = partial;
      return `export default {\n  c: '丙',\n};\n`;
    };
    await meta.translateMetaFile("_meta.ts", "zh");
    // Only the missing key reaches the model.
    assert.match(seen, /c: 'C'/);
    assert.doesNotMatch(seen, /a: 'A'/);
    assert.doesNotMatch(seen, /b: 'B'/);
    // Existing values survive, and English order decides placement.
    const out = fs.readFileSync(path.join(dir, "zh", "_meta.ts"), "utf8");
    assert.equal(out, `export default {\n  a: '甲',\n  c: '丙',\n  b: '乙',\n};\n`);
  });

  it("translates everything when the target does not exist", async () => {
    const { dir, meta } = tree({
      en: `export default {\n  a: 'A',\n};\n`,
      pages: ["a.md"]
    });
    meta.translateMetaFileContent = async () =>
      `export default {\n  a: '甲',\n};\n`;
    await meta.translateMetaFile("_meta.ts", "ko");
    assert.match(
      fs.readFileSync(path.join(dir, "ko", "_meta.ts"), "utf8"),
      /a: '甲'/
    );
  });

  it("keeps a localized separator instead of replacing it with English", async () => {
    // A separator's key is its display text, so the target keys it in its own
    // language and matching by key misses. That sent the localized heading
    // to be "filled in" from English and replaced it -- the whole point of
    // the additive path, defeated through the one entry keyed by its label.
    const { dir, meta } = tree({
      en:
        `export default {\n  'Getting started': {\n    title: 'Getting started',\n    type: 'separator',\n  },\n  a: 'A',\n  b: 'B',\n};\n`,
      zh:
        `export default {\n  '入门指南': {\n    title: '入门指南',\n    type: 'separator',\n  },\n  a: '甲',\n};\n`,
      pages: ["a.md", "b.md"]
    });
    let seen = "";
    meta.translateMetaFileContent = async (partial: string) => {
      seen = partial;
      return `export default {\n  b: '乙',\n};\n`;
    };
    await meta.translateMetaFile("_meta.ts", "zh");
    const out = fs.readFileSync(path.join(dir, "zh", "_meta.ts"), "utf8");
    assert.match(out, /入门指南/, "the localized separator must survive");
    assert.doesNotMatch(out, /Getting started/, "English must not replace it");
    assert.match(out, /a: '甲'/);
    assert.match(out, /b: '乙'/);
    // Only the genuinely missing key is sent.
    assert.doesNotMatch(seen, /separator/);
    assert.match(seen, /b: 'B'/);
  });

  it("does not call the model when only a localized separator differs", async () => {
    const { dir, meta } = tree({
      en: `export default {\n  'Getting started': {\n    type: 'separator',\n  },\n  a: 'A',\n};\n`,
      zh: `export default {\n  '入门': {\n    type: 'separator',\n  },\n  a: '甲',\n};\n`,
      pages: ["a.md"]
    });
    let called = false;
    meta.translateMetaFileContent = async () => {
      called = true;
      return "";
    };
    await meta.translateMetaFile("_meta.ts", "zh");
    assert.equal(called, false);
    assert.match(
      fs.readFileSync(path.join(dir, "zh", "_meta.ts"), "utf8"),
      /入门/
    );
  });

  it("translates a separator English has newly added", async () => {
    const { dir, meta } = tree({
      en:
        `export default {\n  '入门': {\n    type: 'separator',\n  },\n  a: 'A',\n  'Advanced': {\n    type: 'separator',\n  },\n  b: 'B',\n};\n`,
      zh: `export default {\n  '入门': {\n    type: 'separator',\n  },\n  a: '甲',\n};\n`,
      pages: ["a.md", "b.md"]
    });
    meta.translateMetaFileContent = async () =>
      `export default {\n  '进阶': {\n    type: 'separator',\n  },\n  b: '乙',\n};\n`;
    await meta.translateMetaFile("_meta.ts", "zh");
    const out = fs.readFileSync(path.join(dir, "zh", "_meta.ts"), "utf8");
    assert.match(out, /入门/);
    assert.match(out, /进阶/);
    assert.doesNotMatch(out, /Advanced/);
  });

  it("translates a separator English has inserted mid-file", async () => {
    // Matching headings by position only lines up when the new one is last.
    // Insert in the middle and slot 1 on the English side is `Deploying`
    // while slot 1 in the target is the reviewed `参考`, which then binds to
    // the wrong section and renders `入门 / 参考 / 部署`.
    const { dir, meta } = tree({
      en:
        `export default {\n  'Getting started': {\n    type: 'separator',\n  },\n  a: 'A',\n  'Deploying': {\n    type: 'separator',\n  },\n  b: 'B',\n  'Reference': {\n    type: 'separator',\n  },\n  c: 'C',\n};\n`,
      zh:
        `export default {\n  '入门': {\n    type: 'separator',\n  },\n  a: '甲',\n  '参考': {\n    type: 'separator',\n  },\n  c: '丙',\n};\n`,
      pages: ["a.md", "b.md", "c.md"]
    });
    let seen = "";
    meta.translateMetaFileContent = async (partial: string) => {
      seen = partial;
      return `export default {\n  '部署': {\n    type: 'separator',\n  },\n  b: '乙',\n};\n`;
    };
    await meta.translateMetaFile("_meta.ts", "zh");
    const out = fs.readFileSync(path.join(dir, "zh", "_meta.ts"), "utf8");
    assert.deepEqual(
      [...out.matchAll(/'([^']+)': \{/g)].map((m) => m[1]),
      ["入门", "部署", "参考"]
    );
    assert.match(seen, /Deploying/);
    assert.doesNotMatch(seen, /Getting started|Reference/);
  });

  it("keeps a page tab on the key path when English inserts one mid-list", async () => {
    // The root _meta.ts is all `type: 'page'`: those keys are routes, so they
    // are never translated and the localized title lives in `title`. Treating
    // them as label-keyed sent the already-translated `blog` to the model,
    // wrote `blog` twice and dropped `community` -- a key with no page behind
    // it fails the whole site build.
    const { dir, meta } = tree({
      en:
        `export default {\n  users: {\n    type: 'page',\n    title: 'Users',\n  },\n  community: {\n    type: 'page',\n    title: 'Community',\n  },\n  blog: {\n    type: 'page',\n    title: 'Blog',\n  },\n};\n`,
      zh:
        `export default {\n  users: {\n    type: 'page',\n    title: '用户指南',\n  },\n  blog: {\n    type: 'page',\n    title: '博客',\n  },\n};\n`,
      pages: ["users.md", "community.md", "blog.md"]
    });
    let seen = "";
    meta.translateMetaFileContent = async (partial: string) => {
      seen = partial;
      return partial.replace("'Community'", "'社区'");
    };
    await meta.translateMetaFile("_meta.ts", "zh");
    const out = fs.readFileSync(path.join(dir, "zh", "_meta.ts"), "utf8");
    assert.deepEqual(
      [...out.matchAll(/^  ([A-Za-z0-9_$-]+): \{/gm)].map((m) => m[1]),
      ["users", "community", "blog"]
    );
    assert.match(out, /title: '博客'/);
    assert.match(out, /title: '社区'/);
    assert.doesNotMatch(seen, /Blog|Users/);
  });

  it("re-translates a run of adjacent links when English grows it", async () => {
    // Adjacent label-keyed entries have no identity between them, so an
    // offset inside the run is position again: inserting `Discord` in front
    // bound it to the reviewed `GitHub 仓库`, dropped Discord and emitted
    // `GitHub` a second time -- a duplicate key. A run whose length changed
    // is ambiguous, so the whole run goes back to the model.
    const { dir, meta } = tree({
      en:
        `export default {\n  a: 'A',\n  'Discord': {\n    type: 'page',\n    href: 'https://discord.gg/x',\n  },\n  'GitHub': {\n    type: 'page',\n    href: 'https://github.com/x',\n  },\n};\n`,
      zh:
        `export default {\n  a: '甲',\n  'GitHub 仓库': {\n    type: 'page',\n    href: 'https://github.com/x',\n  },\n};\n`,
      pages: ["a.md"]
    });
    let seen = "";
    meta.translateMetaFileContent = async (partial: string) => {
      seen = partial;
      return partial
        .replace("'Discord'", "'Discord 社区'")
        .replace("'GitHub'", "'GitHub 仓库'");
    };
    await meta.translateMetaFile("_meta.ts", "zh");
    const out = fs.readFileSync(path.join(dir, "zh", "_meta.ts"), "utf8");
    assert.deepEqual(
      [...out.matchAll(/'([^']+)': \{/g)].map((m) => m[1]),
      ["Discord 社区", "GitHub 仓库"]
    );
    assert.match(seen, /Discord/);
    assert.match(seen, /GitHub/);
  });

  it("keeps an English-keyed heading when the locale lags on its anchor page", async () => {
    // developers/_meta.ts keys its separators in English and localizes
    // `title`, so the key is exact evidence of identity. The anchor is not:
    // zh has no `architecture` key because that page is untranslated and
    // dropKeysWithoutPages removed it, which leaves the two headings adjacent
    // on the zh side and anchored to `sdk-typescript` as a run of two, while
    // English anchors them separately. Anchor-only matching missed both and
    // sent the reviewed `深入了解` back to the model.
    const { dir, meta } = tree({
      en:
        `export default {\n  'Dive In': {\n    title: 'Dive In',\n    type: 'separator',\n  },\n  architecture: 'Architecture',\n  'Agent SDK': {\n    title: 'Agent SDK',\n    type: 'separator',\n  },\n  'sdk-typescript': 'TypeScript SDK',\n};\n`,
      zh:
        `export default {\n  'Dive In': {\n    title: '深入了解',\n    type: 'separator',\n  },\n  'Agent SDK': {\n    title: 'Agent SDK',\n    type: 'separator',\n  },\n  'sdk-typescript': 'TypeScript SDK',\n};\n`,
      pages: ["sdk-typescript.md"]
    });
    let seen = "";
    meta.translateMetaFileContent = async (partial: string) => {
      seen = partial;
      return partial.replace("'Dive In'", "'深入'");
    };
    await meta.translateMetaFile("_meta.ts", "zh");
    const out = fs.readFileSync(path.join(dir, "zh", "_meta.ts"), "utf8");
    assert.match(out, /title: '深入了解'/);
    assert.doesNotMatch(seen, /Dive In|Agent SDK/);
    assert.match(seen, /architecture/);
  });

  it("never binds one existing entry to two English entries", async () => {
    // An exact key match and an anchor match can point at the same entry:
    // zh keys `GitHub` like English but sits where English has `Discord`, so
    // the anchor `a#1#0` and the key `GitHub` both resolve to it. Emitting it
    // for both slots writes `'GitHub'` twice, and a duplicate key in a
    // `_meta.ts` collapses at require() time without a word from Nextra or
    // from the nav guard. The key wins, and `Discord` goes to the model.
    const { dir, meta } = tree({
      en:
        `export default {\n  'Discord': {\n    type: 'page',\n    href: 'https://discord.gg/x',\n  },\n  a: 'A',\n  'GitHub': {\n    type: 'page',\n    href: 'https://github.com/x',\n  },\n  b: 'B',\n};\n`,
      zh:
        `export default {\n  'GitHub': {\n    type: 'page',\n    href: 'https://github.com/x',\n  },\n  a: '甲',\n};\n`,
      pages: ["a.md", "b.md"]
    });
    let seen = "";
    meta.translateMetaFileContent = async (partial: string) => {
      seen = partial;
      return partial.replace("'Discord'", "'Discord 社区'");
    };
    await meta.translateMetaFile("_meta.ts", "zh");
    const out = fs.readFileSync(path.join(dir, "zh", "_meta.ts"), "utf8");
    assert.deepEqual(
      [...out.matchAll(/^  (?:'([^']+)'|([A-Za-z0-9_$-]+)):/gm)].map(
        (m) => m[1] ?? m[2]
      ),
      ["Discord 社区", "a", "GitHub", "b"]
    );
    assert.match(seen, /Discord/);
    assert.doesNotMatch(seen, /GitHub/);
  });
});
