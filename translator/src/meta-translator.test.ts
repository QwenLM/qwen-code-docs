import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
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

function fixture(pages: string[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "meta-drop-"));
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
});
