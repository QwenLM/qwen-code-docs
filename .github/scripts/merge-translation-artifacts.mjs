#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function writeJson(file, value) {
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function mergeTranslationArtifacts(
  artifactsRoot,
  websiteRoot,
  languages,
  shardCount,
) {
  if (!Array.isArray(languages) || languages.length === 0) {
    throw new Error("At least one target language is required");
  }
  if (!Number.isInteger(shardCount) || shardCount < 1) {
    throw new Error(`Invalid shard count: ${shardCount}`);
  }
  let commit;
  let sourceLanguage;
  let totalFiles;
  let deletedFiles;
  let newestTimestamp = "";
  let syncRecord;
  const translatedFiles = {};
  let successCount = 0;
  let failedCount = 0;

  for (const language of languages) {
    const languageResult = { success: [], failed: [] };
    const seenFiles = new Set();

    for (let shardIndex = 0; shardIndex < shardCount; shardIndex++) {
      const label = `${language} shard ${shardIndex + 1}/${shardCount}`;
      const artifactRoot = path.join(
        artifactsRoot,
        `translation-${language}-${shardIndex}`,
      );
      const record = await readJson(path.join(artifactRoot, "last-sync.json"));
      const changelog = await readJson(
        path.join(artifactRoot, "translation-changelog.json"),
      );
      const entry = changelog[0];
      const result = entry?.translatedFiles?.[language];

      if (!entry || !result) {
        throw new Error(`Artifact for ${label} has no matching sync result`);
      }
      if (
        entry.shard?.index !== shardIndex ||
        entry.shard?.count !== shardCount
      ) {
        throw new Error(`Artifact for ${label} has invalid shard metadata`);
      }
      if (entry.commit !== record.commit) {
        throw new Error(`Artifact for ${label} has inconsistent commits`);
      }
      if (commit && commit !== entry.commit) {
        throw new Error(
          `Translation artifacts target different commits: ${commit} and ${entry.commit}`,
        );
      }
      if (sourceLanguage && sourceLanguage !== entry.sourceLanguage) {
        throw new Error(
          `Artifact for ${label} has a different source language`,
        );
      }
      if (totalFiles !== undefined && totalFiles !== entry.stats.totalFiles) {
        throw new Error(`Artifact for ${label} has a different file count`);
      }
      const artifactDeletedFiles = [...(entry.deletedFiles || [])].sort();
      if (
        artifactDeletedFiles.some(
          (file) =>
            typeof file !== "string" ||
            path.isAbsolute(file) ||
            file.split(/[\\/]/).includes(".."),
        )
      ) {
        throw new Error(`Artifact for ${label} has an unsafe deleted path`);
      }
      if (
        deletedFiles &&
        JSON.stringify(deletedFiles) !== JSON.stringify(artifactDeletedFiles)
      ) {
        throw new Error(`Artifact for ${label} has a different deletion list`);
      }
      if (
        entry.stats.languages !== 1 ||
        entry.stats.successCount !== result.success.length ||
        entry.stats.failedCount !== result.failed.length
      ) {
        throw new Error(`Artifact for ${label} has inconsistent statistics`);
      }
      if (result.failed.length !== 0) {
        throw new Error(`Artifact for ${label} contains failed translations`);
      }
      for (const file of result.success) {
        if (seenFiles.has(file)) {
          throw new Error(`Artifact for ${label} repeats ${file}`);
        }
        seenFiles.add(file);
        languageResult.success.push(file);
      }

      commit = entry.commit;
      sourceLanguage = entry.sourceLanguage;
      totalFiles = entry.stats.totalFiles;
      deletedFiles = artifactDeletedFiles;
      newestTimestamp = [newestTimestamp, entry.timestamp].sort().at(-1);
      syncRecord =
        !syncRecord || record.timestamp > syncRecord.timestamp
          ? record
          : syncRecord;

      const contentRoot = path.join(artifactRoot, "content", language);
      try {
        await fs.access(contentRoot);
        await fs.cp(contentRoot, path.join(websiteRoot, "content", language), {
          recursive: true,
          force: true,
        });
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }

    translatedFiles[language] = languageResult;
    successCount += languageResult.success.length;
    failedCount += languageResult.failed.length;
    for (const file of deletedFiles || []) {
      await fs.rm(path.join(websiteRoot, "content", language, file), {
        force: true,
      });
    }
  }

  const changelogPath = path.join(websiteRoot, "translation-changelog.json");
  const changelog = await readJson(changelogPath);
  changelog.unshift({
    timestamp: newestTimestamp,
    commit,
    sourceLanguage,
    translatedFiles,
    deletedFiles: deletedFiles || [],
    stats: {
      totalFiles,
      languages: languages.length,
      successCount,
      failedCount,
    },
  });

  await writeJson(changelogPath, changelog.slice(0, 100));
  await writeJson(path.join(websiteRoot, "last-sync.json"), syncRecord);
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const artifactsRoot = path.resolve(
    process.argv[2] || ".translation-artifacts",
  );
  const websiteRoot = path.resolve(process.argv[3] || "website");
  const config = await readJson(
    path.join(websiteRoot, "translation.config.json"),
  );
  const shardCount = Number(process.argv[4]);
  await mergeTranslationArtifacts(
    artifactsRoot,
    websiteRoot,
    config.targetLanguages,
    shardCount,
  );
  console.log(
    `Merged ${config.targetLanguages.length * shardCount} translation artifacts`,
  );
}
