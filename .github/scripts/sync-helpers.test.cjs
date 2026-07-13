const assert = require("node:assert/strict");
const test = require("node:test");

const {
  parseDeletedDocFiles,
  partitionFilesByWeight,
} = require("../../translator/dist/sync.js");

test("treats deletions and rename sources as removed documents", () => {
  const status = [
    "D\tdocs/removed.md",
    "R100\tdocs/old-name.md\tdocs/new-name.md",
    "M\tdocs/changed.md",
    "D\tpackages/not-docs.md",
    "D\tdocs/image.png",
  ].join("\n");

  assert.deepEqual(parseDeletedDocFiles(status, "docs"), [
    "docs/removed.md",
    "docs/old-name.md",
  ]);
});

test("balances large files deterministically across shards", () => {
  const weighted = [
    { file: "small-b.md", size: 1 },
    { file: "large.md", size: 10 },
    { file: "medium.md", size: 6 },
    { file: "small-a.md", size: 1 },
  ];

  const shards = partitionFilesByWeight(weighted, 2);

  assert.deepEqual(shards, [
    { size: 10, files: ["large.md"] },
    { size: 8, files: ["medium.md", "small-a.md", "small-b.md"] },
  ]);
});
