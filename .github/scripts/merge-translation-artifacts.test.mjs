import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { mergeTranslationArtifacts } from "./merge-translation-artifacts.mjs";

test("merges language outputs and creates one combined sync entry", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "translation-merge-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const artifactsRoot = path.join(root, "artifacts");
  const websiteRoot = path.join(root, "website");
  const languages = ["zh", "de"];
  const shardCount = 2;
  const commit = "abc123";

  await fs.mkdir(websiteRoot, { recursive: true });
  await fs.writeFile(
    path.join(websiteRoot, "translation-changelog.json"),
    "[]\n",
  );
  for (const language of languages) {
    await fs.mkdir(path.join(websiteRoot, "content", language), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(websiteRoot, "content", language, "old.md"),
      "stale translation\n",
    );
  }

  for (const [languageIndex, language] of languages.entries()) {
    for (let shardIndex = 0; shardIndex < shardCount; shardIndex++) {
      const artifactRoot = path.join(
        artifactsRoot,
        `translation-${language}-${shardIndex}`,
      );
      const file = `guide-${shardIndex}.md`;
      const timestamp = `2026-07-13T00:00:0${languageIndex + shardIndex}Z`;
      await fs.mkdir(path.join(artifactRoot, "content", language), {
        recursive: true,
      });
      await fs.writeFile(
        path.join(artifactRoot, "content", language, file),
        `${language} shard ${shardIndex}\n`,
      );
      await fs.writeFile(
        path.join(artifactRoot, "last-sync.json"),
        `${JSON.stringify({ commit, timestamp, files: [] })}\n`,
      );
      await fs.writeFile(
        path.join(artifactRoot, "translation-changelog.json"),
        `${JSON.stringify([
          {
            timestamp,
            commit,
            sourceLanguage: "en",
            translatedFiles: {
              [language]: { success: [file], failed: [] },
            },
            stats: {
              totalFiles: 2,
              languages: 1,
              successCount: 1,
              failedCount: 0,
            },
            shard: { index: shardIndex, count: shardCount },
            deletedFiles: ["old.md"],
          },
        ])}\n`,
      );
    }
  }

  await mergeTranslationArtifacts(
    artifactsRoot,
    websiteRoot,
    languages,
    shardCount,
  );

  const changelog = JSON.parse(
    await fs.readFile(
      path.join(websiteRoot, "translation-changelog.json"),
      "utf8",
    ),
  );
  const syncRecord = JSON.parse(
    await fs.readFile(path.join(websiteRoot, "last-sync.json"), "utf8"),
  );

  assert.deepEqual(Object.keys(changelog[0].translatedFiles), languages);
  assert.deepEqual(changelog[0].stats, {
    totalFiles: 2,
    languages: 2,
    successCount: 4,
    failedCount: 0,
  });
  assert.equal(syncRecord.timestamp, "2026-07-13T00:00:02Z");
  assert.equal(
    await fs.readFile(
      path.join(websiteRoot, "content", "zh", "guide-1.md"),
      "utf8",
    ),
    "zh shard 1\n",
  );
  await assert.rejects(
    fs.access(path.join(websiteRoot, "content", "zh", "old.md")),
    { code: "ENOENT" },
  );
});

test("rejects artifacts that target different commits", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "translation-merge-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const artifactsRoot = path.join(root, "artifacts");
  const websiteRoot = path.join(root, "website");
  const languages = ["zh", "de"];
  const shardCount = 2;
  await fs.mkdir(websiteRoot, { recursive: true });
  await fs.writeFile(
    path.join(websiteRoot, "translation-changelog.json"),
    "[]\n",
  );

  for (const language of languages) {
    for (let shardIndex = 0; shardIndex < shardCount; shardIndex++) {
      const artifactRoot = path.join(
        artifactsRoot,
        `translation-${language}-${shardIndex}`,
      );
      const commit = language === "zh" ? "commit-a" : "commit-b";
      await fs.mkdir(path.join(artifactRoot, "content", language), {
        recursive: true,
      });
      await fs.writeFile(
        path.join(artifactRoot, "last-sync.json"),
        JSON.stringify({
          commit,
          timestamp: "2026-07-13T00:00:00Z",
          files: [],
        }),
      );
      await fs.writeFile(
        path.join(artifactRoot, "translation-changelog.json"),
        JSON.stringify([
          {
            timestamp: "2026-07-13T00:00:00Z",
            commit,
            sourceLanguage: "en",
            translatedFiles: {
              [language]: { success: [], failed: [] },
            },
            stats: {
              totalFiles: 0,
              languages: 1,
              successCount: 0,
              failedCount: 0,
            },
            shard: { index: shardIndex, count: shardCount },
            deletedFiles: [],
          },
        ]),
      );
    }
  }

  await assert.rejects(
    mergeTranslationArtifacts(
      artifactsRoot,
      websiteRoot,
      languages,
      shardCount,
    ),
    /different commits/,
  );
});
