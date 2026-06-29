import fs from "fs-extra";
import path from "path";
import OpenAI from "openai";
import chalk from "chalk";
import { createEnvLoader } from "./utils/env";
import {
  parseMarkdown,
  type ParsedContent,
} from "./utils/markdown-parser";

interface TranslatorConfig {
  model: string;
  maxTokens: number;
  temperature: number;
  // Max source characters per request when a document must be split to stay
  // under the model's output-token limit. Documents longer than this are
  // translated in code-fence-safe slices and reassembled.
  chunkChars: number;
}

interface TranslationOptions {
  model?: string;
  maxTokens?: number;
  projectRoot?: string;
}

export class DocumentTranslator {
  private openai: OpenAI;
  private apiConfig: TranslatorConfig;
  private translationCache: Map<string, string>;
  private projectRoot: string;
  private maxRetries: number;

  constructor(options: TranslationOptions = {}) {
    this.projectRoot = options.projectRoot || process.cwd();

    // 加载环境变量
    const envLoader = createEnvLoader(this.projectRoot);
    envLoader.loadEnv();

    // 获取API配置
    const apiConfig = envLoader.getApiConfig();

    // 初始化OpenAI客户端（兼容Qwen API）
    this.openai = new OpenAI({
      apiKey: apiConfig.apiKey,
      baseURL: apiConfig.baseURL,
    });

    // API configuration
    // Chunk size derives from the output-token cap: keep each slice's source
    // small enough that its translation comfortably fits under maxTokens
    // (≈0.6 chars/token worst case for CJK/Cyrillic). Override via QWEN_CHUNK_CHARS.
    const chunkChars =
      parseInt(process.env.QWEN_CHUNK_CHARS || "", 10) ||
      Math.max(3000, Math.floor(apiConfig.maxTokens * 0.6));

    this.apiConfig = {
      model: apiConfig.model,
      maxTokens: apiConfig.maxTokens,
      temperature: 0.1, // Low temperature for consistent translations
      chunkChars,
    };
    this.maxRetries =
      parseInt(process.env.QWEN_API_MAX_RETRIES || "", 10) || 4;

    // Translation cache
    this.translationCache = new Map<string, string>();

    console.log(chalk.blue("⚙️  Translator initialized"));
  }

  /**
   * Translate entire document.
   * Logs are buffered and flushed atomically so concurrent tasks never
   * interleave their output.
   */
  async translateDocument(
    filePath: string,
    targetLang: string
  ): Promise<string> {
    const logLines: string[] = [];
    const log = (msg: string) => { logLines.push(msg); };

    try {
      log(chalk.gray(`→ ${path.basename(filePath)} (${targetLang})`));

      const content = await fs.readFile(filePath, "utf-8");
      const parsedContent = parseMarkdown(content);

      // Full document translation (leverage large context models like deepseek-v4-flash)
      log(
        chalk.blue(
          `  ✓ Translating full document (${content.length} characters)`
        )
      );

      const translatedContent = await this.translateContent(
        parsedContent.originalContent,
        targetLang,
        path.basename(filePath),
        log
      );

      log(chalk.green(`✓ Completed ${path.basename(filePath)} (${targetLang})`));
      return translatedContent;
    } catch (error: any) {
      log(chalk.red(`✗ Translation failed: ${path.basename(filePath)} (${targetLang}): ${error.message}`));
      throw error;
    } finally {
      // Flush all collected logs in one atomic write so concurrent
      // translations never interleave their progress lines.
      if (logLines.length) {
        process.stdout.write(logLines.join('\n') + '\n');
      }
    }
  }

  /**
   * Translate text content
   * @param label Optional label (e.g. filename) included in progress logs to
   *              disambiguate output when multiple translations run concurrently.
   * @param log   Logger function; defaults to console.log. Pass a buffered
   *              logger to group output atomically.
   */
  async translateContent(
    content: string,
    targetLang: string,
    label?: string,
    log: (msg: string) => void = console.log
  ): Promise<string> {
    const cacheKey = `${content}-${targetLang}`;
    if (this.translationCache.has(cacheKey)) {
      log(chalk.gray(`    ✓ Cached translation`));
      return this.translationCache.get(cacheKey)!;
    }

    try {
      let translatedContent: string;

      const logPrefix = label ? `${label} (${targetLang})` : `(${targetLang})`;

      if (content.length <= this.apiConfig.chunkChars) {
        // Small enough: translate in a single request (original behavior).
        log(chalk.cyan(`    → Translating content ${logPrefix}`));
        translatedContent = await this.callTranslationAPI(
          this.buildTranslationPrompt(content, targetLang),
          targetLang
        );
      } else {
        // Large document: split into code-fence-safe slices, translate each,
        // and reassemble. Avoids silent truncation when the translation would
        // exceed the model's output-token limit.
        const slices = this.chunkMarkdown(content, this.apiConfig.chunkChars);
        log(
          chalk.cyan(
            `    → Translating content ${logPrefix} in ${slices.length} slices`
          )
        );
        const translatedSlices: string[] = [];
        for (let i = 0; i < slices.length; i++) {
          const out = await this.callTranslationAPI(
            this.buildTranslationPrompt(slices[i], targetLang),
            targetLang,
            0,
            true // sliceMode: tell the model this is a contiguous slice
          );
          // Guard against a slice coming back empty (which would silently drop
          // a section). callTranslationAPI already retries; if still empty for
          // non-trivial input, fail loudly instead of producing a broken doc.
          if (slices[i].trim().length > 200 && out.trim().length === 0) {
            throw new Error(
              `Empty translation for slice ${i + 1}/${slices.length}`
            );
          }
          translatedSlices.push(out);
          log(chalk.gray(`      ✓ slice ${i + 1}/${slices.length}`));
        }
        translatedContent = translatedSlices.join("\n");
      }

      // Cache translation result
      this.translationCache.set(cacheKey, translatedContent);

      return translatedContent;
    } catch (error: any) {
      log(chalk.red(`    ✗ Translation failed: ${error.message}`));
      throw error;
    }
  }

  /**
   * Split markdown into chunks no larger than maxChars, never breaking inside a
   * fenced code block, preferring to split at blank lines (section boundaries).
   */
  private chunkMarkdown(content: string, maxChars: number): string[] {
    const lines = content.split("\n");
    const chunks: string[] = [];
    let cur: string[] = [];
    let curLen = 0;
    let inFence = false;

    const flush = () => {
      if (cur.length) {
        chunks.push(cur.join("\n"));
        cur = [];
        curLen = 0;
      }
    };

    for (const line of lines) {
      if (/^\s*```/.test(line)) inFence = !inFence;
      cur.push(line);
      curLen += line.length + 1;
      if (curLen >= maxChars && !inFence && line.trim() === "") {
        flush();
      }
    }
    flush();

    return chunks.length ? chunks : [content];
  }

  /**
   * Load and format terminology from TERMINOLOGY.md
   */
  private loadTerminology(targetLang: string): string {
    try {
      const terminologyPath = path.join(
        this.projectRoot,
        "TERMINOLOGY.md"
      );
      if (fs.existsSync(terminologyPath)) {
        const terminologyContent = fs.readFileSync(terminologyPath, "utf-8");
        return `

---

**TERMINOLOGY GUIDELINES (from project's TERMINOLOGY.md):**
${terminologyContent}
---`;
      }
    } catch (error) {
      // Silently fail if terminology file is not found
    }
    return "";
  }

  /**
   * Build system prompt
   */
  /**
   * Build system prompt
   */
  buildSystemPrompt(targetLang: string, sliceMode = false): string {
    const languageNames: Record<string, string> = {
      zh: "Chinese",
      de: "German",
      fr: "French",
      ru: "Russian",
      ja: "Japanese",
      "pt-BR": "Portuguese (Brazil)",
      es: "Spanish",
    };

    const targetLanguageName = languageNames[targetLang] || targetLang;
    const terminology = this.loadTerminology(targetLang);

    // When the document is translated in slices, the model receives one
    // contiguous fragment at a time. Tell it (here, in the system prompt, so it
    // is never echoed into the output) to translate the fragment as-is.
    const sliceNote = sliceMode
      ? `\n\n**SLICE MODE:** The text you receive is ONE CONTIGUOUS SLICE of a larger document. It may begin or end mid-section or mid-code-block. Translate exactly what you are given, as-is. Do NOT add headings, do NOT complete cut-off code blocks, and do NOT mention that this is a slice. Output only the translated fragment.`
      : "";

    return `You are an expert technical documentation translator writing for software developers.

**CORE PRINCIPLE: Write for developers, by developers**
Prioritize clarity, technical accuracy, and naturalness for real-world developer docs in ${targetLanguageName}.

**OUTPUT RULES (STRICT):**
- Output ONLY the translated Markdown content. No explanations, no extra commentary, no surrounding quotes.
- Preserve the original structure and line breaks as much as possible.
- Do NOT add, remove, or reorder sections. Do NOT “improve” content beyond translation.

**PRESERVE MARKDOWN/STRUCTURE EXACTLY (DO NOT TRANSLATE OR ALTER):**
- Markdown syntax: headings (#), lists/numbering, blockquotes (>), tables (|---|), task lists, horizontal rules, callouts/admonitions.
- Code formatting: fenced code blocks (\`\`\`lang), inline code (\`code\`), indentation, and all code contents.
- Links and media: URLs, link targets, reference-style link keys, image paths, anchors/fragments.
- Frontmatter and templates: YAML/TOML frontmatter, placeholders (e.g. {name}, {{var}}, $VAR), HTML tags, JSX/MDX, and escape sequences.
- Technical identifiers: file paths, file names, extensions (.js/.md/.json/.yaml), config keys, env var names, CLI commands/flags, API endpoints, JSON/YAML keys, class/function/variable names.
- Product/brand/proper nouns: tool/library/framework names (e.g. Qwen, Qwen Code, Node.js, React, TypeScript, VS Code), company names, repository names. ALWAYS keep "Qwen" and "Qwen Code" in English, do NOT translate them (e.g., do not use "通义千问").

**TRANSLATE (NATURALLY):**
- Prose around code: explanations, instructions, concepts, UI text, and general workflow descriptions.
- Translate common words (e.g. “deploy/deployment”, “repository”) WHEN that is the normal convention in ${targetLanguageName} developer documentation.
- Keep well-known abbreviations/acronyms (API/SDK/CLI/IDE/Git) in English unless the target language strongly prefers a localized form.

**STYLE GUIDELINES:**
- Write like a native ${targetLanguageName} developer would write technical docs.
- Keep sentences concise and unambiguous; prefer active voice when natural.
- When mixing English technical terms with ${targetLanguageName}, follow the target language’s typical spacing/punctuation conventions.

**EXAMPLE (for Chinese style):**
Instead of: "配置你的应用程序编程接口密钥"
Write: "配置你的 API key"
Instead of: "使用通义千问代码模型"
Write: "使用 Qwen Code 模型"
${terminology}${sliceNote}
`;
  }

  /**
   * Build translation prompt
   */
  buildTranslationPrompt(content: string, targetLang: string): string {
    const languageNames: Record<string, string> = {
      zh: "Chinese",
      de: "German",
      fr: "French",
      ru: "Russian",
      ja: "Japanese",
      "pt-BR": "Portuguese (Brazil)",
      es: "Spanish",
    };

    const targetLanguageName = languageNames[targetLang] || targetLang;

    return `Translate the following Markdown content to ${targetLanguageName}.
Return ONLY the translated Markdown (no explanations).

CONTENT:
${content}`;
  }

  /**
   * Call translation API (using OpenAI SDK) with retry mechanism
   */
  async callTranslationAPI(
    prompt: string,
    targetLang: string,
    retryCount = 0,
    sliceMode = false
  ): Promise<string> {
    const baseDelay = 2000; // 2 second base delay

    try {
      const completion = await this.openai.chat.completions.create({
        model: this.apiConfig.model,
        messages: [
          {
            role: "system",
            content: this.buildSystemPrompt(targetLang, sliceMode),
          },
          { role: "user", content: prompt },
        ],
        max_tokens: this.apiConfig.maxTokens,
        temperature: this.apiConfig.temperature,
      });

      const result = completion.choices[0].message.content?.trim() || "";

      // An empty response on non-trivial input is almost always a transient
      // model hiccup; retry rather than silently dropping the content.
      if (
        result.length === 0 &&
        prompt.length > 200 &&
        retryCount < this.maxRetries
      ) {
        const delay = this.getRetryDelay(baseDelay, retryCount);
        console.log(
          chalk.yellow(
            `    ⏳ Empty response, retrying in ${Math.round(delay / 1000)}s (${retryCount + 1}/${this.maxRetries})`
          )
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.callTranslationAPI(
          prompt,
          targetLang,
          retryCount + 1,
          sliceMode
        );
      }

      return result;
    } catch (error: any) {
      if (this.isRetriableApiError(error) && retryCount < this.maxRetries) {
        const delay = this.getRetryDelay(baseDelay, retryCount);
        const details = this.formatApiErrorDetails(error);
        console.log(
          chalk.yellow(
            `    ⏳ Transient API error (${details}), retrying in ${Math.round(delay / 1000)}s (${retryCount + 1}/${this.maxRetries})`
          )
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.callTranslationAPI(
          prompt,
          targetLang,
          retryCount + 1,
          sliceMode
        );
      }

      // Other error handling
      if (error.status) {
        throw new Error(`API error: ${error.status} - ${error.message}`);
      } else if (error.code === "ECONNRESET" || error.code === "ENOTFOUND") {
        throw new Error("Network request failed, please check connection");
      } else {
        throw new Error(`Request configuration error: ${error.message}`);
      }
    }
  }

  private getRetryDelay(baseDelay: number, retryCount: number): number {
    const jitter = Math.floor(Math.random() * 1000);
    return baseDelay * Math.pow(2, retryCount) + jitter;
  }

  private isRetriableApiError(error: any): boolean {
    const status = Number(error?.status || error?.cause?.status);
    if (status === 408 || status === 429 || status >= 500) {
      return true;
    }

    const code = String(error?.code || error?.cause?.code || "");
    if (
      [
        "ECONNRESET",
        "ECONNREFUSED",
        "ETIMEDOUT",
        "EAI_AGAIN",
        "UND_ERR_SOCKET",
        "UND_ERR_HEADERS_TIMEOUT",
        "UND_ERR_BODY_TIMEOUT",
      ].includes(code)
    ) {
      return true;
    }

    const message = this.formatApiErrorDetails(error).toLowerCase();
    return [
      "connection error",
      "premature close",
      "fetch failed",
      "socket hang up",
      "terminated",
      "connection closed",
      "connection reset",
      "timeout",
    ].some((needle) => message.includes(needle));
  }

  private formatApiErrorDetails(error: any): string {
    const parts = [
      error?.name,
      error?.code,
      error?.message,
      error?.cause?.name,
      error?.cause?.code,
      error?.cause?.message,
    ]
      .filter(Boolean)
      .map(String);

    return parts.length > 0 ? parts.join(": ") : "unknown error";
  }

  /**
   * Batch translate all documents in directory
   */
  async translateDirectory(
    sourceDir: string,
    targetDir: string,
    targetLang: string
  ): Promise<void> {
    const files = await fs.readdir(sourceDir, { recursive: true });
    const markdownFiles = files.filter(
      (file: any) => typeof file === "string" && file.endsWith(".md")
    );

    console.log(chalk.blue(`📁 Found ${markdownFiles.length} Markdown files`));

    for (const file of markdownFiles) {
      // Ensure file is string type
      const fileName = typeof file === "string" ? file : file.toString();
      const sourcePath = path.join(sourceDir, fileName);
      const targetPath = path.join(targetDir, fileName);

      // Ensure target directory exists
      await fs.ensureDir(path.dirname(targetPath));

      try {
        const translatedContent = await this.translateDocument(
          sourcePath,
          targetLang
        );
        await fs.writeFile(targetPath, translatedContent, "utf-8");
        console.log(chalk.green(`✓ Saved: ${path.basename(targetPath)}`));
      } catch (error: any) {
        console.error(
          chalk.red(`✗ Failed to translate ${file}: ${error.message}`)
        );
      }
    }
  }
}

export default DocumentTranslator;
