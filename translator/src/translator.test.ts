import fs from "fs-extra";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { DocumentTranslator } from "./translator";

class RecordingTranslator extends DocumentTranslator {
  constructor(projectRoot: string) {
    super({ projectRoot });
  }

  override async translateDocument(
    filePath: string,
    targetLang: string
  ): Promise<string> {
    if (path.basename(filePath) === "broken.md") {
      throw new Error("translation unavailable");
    }

    return `${targetLang}:${await fs.readFile(filePath, "utf8")}`;
  }
}

describe("DocumentTranslator.translateDirectory", () => {
  it("rejects with the failed filenames after preserving successful output", async () => {
    const projectRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "qwen-translator-test-")
    );
    const sourceDir = path.join(projectRoot, "source");
    const targetDir = path.join(projectRoot, "target");
    await fs.outputFile(path.join(sourceDir, "working.md"), "working");
    await fs.outputFile(path.join(sourceDir, "broken.md"), "broken");

    const previousApiKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "test-key";

    try {
      const translator = new RecordingTranslator(projectRoot);

      await assert.rejects(
        translator.translateDirectory(sourceDir, targetDir, "de"),
        (error: unknown) => {
          assert.match(String(error), /broken\.md/);
          return true;
        }
      );
      assert.equal(
        await fs.readFile(path.join(targetDir, "working.md"), "utf8"),
        "de:working"
      );
      assert.equal(await fs.pathExists(path.join(targetDir, "broken.md")), false);
    } finally {
      if (previousApiKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = previousApiKey;
      }
      await fs.remove(projectRoot);
    }
  });
});
