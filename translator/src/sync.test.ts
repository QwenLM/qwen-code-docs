import fs from "fs-extra";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { SyncManager } from "./sync";

describe("SyncManager translation changelog", () => {
  it("records failed filenames for each language", async () => {
    const projectRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "qwen-sync-test-")
    );
    const manager = new SyncManager({
      projectRoot,
      targetLanguages: ["de"],
    });

    try {
      await manager.saveTranslationChangelog("abc123", ["docs/guide.md"], {
        de: {
          success: 0,
          failed: 1,
          files: [],
          failedFiles: ["guide.md"],
        },
      });

      const changelog = await fs.readJson(
        path.join(projectRoot, "translation-changelog.json")
      );

      assert.deepEqual(changelog[0].translatedFiles.de.failed, ["guide.md"]);
    } finally {
      await fs.remove(projectRoot);
    }
  });
});
