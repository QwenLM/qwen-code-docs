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
});
