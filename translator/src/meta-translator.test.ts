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
});
