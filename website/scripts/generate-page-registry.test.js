const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { generatePageRegistry } = require("./generate-page-registry");

test("keeps missing localized pages routable through the English loader", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "page-registry-test-"));
  const contentDir = path.join(root, "content");
  const outputFile = path.join(root, "generated", "page-registry.js");

  try {
    for (const file of ["en/index.md", "en/guide.md", "zh/index.md"]) {
      const filePath = path.join(contentDir, file);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, `# ${file}\n`);
    }

    const result = generatePageRegistry({ contentDir, outputFile });
    assert.equal(result.fallbackCount, 1);
    assert.deepEqual(
      result.staticParams.filter((param) => param.lang === "zh"),
      [
        { lang: "zh", mdxPath: [] },
        { lang: "zh", mdxPath: ["guide"] },
      ]
    );

    const generated = fs.readFileSync(outputFile, "utf8");
    assert.doesNotMatch(generated, /"zh\/guide": \(\) => import/);
    assert.match(
      generated,
      /localizedLoader \|\| \(lang === "en" \? null : pageLoaders\[`en\/\$\{route\}`\]\)/
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
