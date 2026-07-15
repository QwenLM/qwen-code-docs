import fs from "fs-extra";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { DocumentTranslator } from "./translator";

class OutputTranslator extends DocumentTranslator {
  readonly requestedContents: string[] = [];
  response: (content: string) => string = (content) => content;

  override async callTranslationAPI(prompt: string): Promise<string> {
    const content = prompt.slice(prompt.indexOf("CONTENT:\n") + 9);
    this.requestedContents.push(content);
    return this.response(content);
  }
}

async function createTranslator(chunkChars: number): Promise<{
  translator: OutputTranslator;
  cleanup: () => Promise<void>;
}> {
  const projectRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "qwen-output-test-")
  );
  const previousApiKey = process.env.OPENAI_API_KEY;
  const previousChunkChars = process.env.QWEN_CHUNK_CHARS;
  process.env.OPENAI_API_KEY = "test-key";
  process.env.QWEN_CHUNK_CHARS = String(chunkChars);

  return {
    translator: new OutputTranslator({ projectRoot }),
    cleanup: async () => {
      if (previousApiKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previousApiKey;
      if (previousChunkChars === undefined) delete process.env.QWEN_CHUNK_CHARS;
      else process.env.QWEN_CHUNK_CHARS = previousChunkChars;
      await fs.remove(projectRoot);
    },
  };
}

describe("DocumentTranslator output safeguards", { concurrency: false }, () => {
  let context: Awaited<ReturnType<typeof createTranslator>> | undefined;

  before(async () => {
    context = await createTranslator(48);
  });

  after(async () => {
    await context?.cleanup();
  });

  const getTranslator = (): OutputTranslator => {
    if (!context) throw new Error("Test translator has not been initialized");
    context.translator.requestedContents.length = 0;
    context.translator.response = (content) => content;
    return context.translator;
  };

  it("rejects translated Markdown with an unclosed code fence", async () => {
    const translator = getTranslator();
    translator.response = () => "## Überschrift\n\n```ts\nconst broken = true;";

    await assert.rejects(
      translator.translateContent("## Heading", "de"),
      /未闭合的代码块/
    );
  });

  it("splits an oversized paragraph into bounded requests", async () => {
    const maxChars = 48;
    const translator = getTranslator();
    const content =
      "First sentence contains several words. Second sentence also contains several words. Third sentence finishes the paragraph.";

    await translator.translateContent(content, "de");

    assert.ok(translator.requestedContents.length > 1);
    assert.ok(
      translator.requestedContents.every((slice) => slice.length <= maxChars)
    );
  });

  it("keeps an oversized fenced block in one request", async () => {
    const translator = getTranslator();
    const fencedBlock = `\`\`\`ts\n${"const value = 1;\n".repeat(5)}\`\`\``;

    await translator.translateContent(`${fencedBlock}\n\nAfter the block.`, "de");

    assert.equal(translator.requestedContents[0], fencedBlock);
  });

  it("does not split an oversized unbroken token", async () => {
    const translator = getTranslator();
    const url = `https://example.com/${"long-path-segment".repeat(5)}`;

    await translator.translateContent(url, "de");

    assert.deepEqual(translator.requestedContents, [url]);
  });
});
