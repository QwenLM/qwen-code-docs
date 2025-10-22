import fs from "fs-extra";
import path from "path";
import OpenAI from "openai";
import chalk from "chalk";
import { createEnvLoader } from "./utils/env";
import {
  parseMarkdown,
  reconstructDocument,
  type ParsedContent,
  type DocumentSection,
} from "./utils/markdown-parser";

interface TranslatorConfig {
  model: string;
  maxTokens: number;
  temperature: number;
}

interface TranslationOptions {
  model?: string;
  maxTokens?: number;
  projectRoot?: string; // 新增：项目根目录
}

interface TranslationChunk extends DocumentSection {
  index?: number;
}

export class DocumentTranslator {
  private openai: OpenAI;
  private apiConfig: TranslatorConfig;
  private translationCache: Map<string, string>;
  private projectRoot: string;

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
    this.apiConfig = {
      model: apiConfig.model,
      maxTokens: apiConfig.maxTokens,
      temperature: 0.1, // Low temperature for consistent translations
    };

    // Translation cache
    this.translationCache = new Map<string, string>();

    console.log(chalk.blue("⚙️  Translator initialized"));
  }

  /**
   * Translate entire document
   */
  async translateDocument(
    filePath: string,
    targetLang: string
  ): Promise<string> {
    try {
      console.log(chalk.gray(`→ ${path.basename(filePath)} (${targetLang})`));

      const content = await fs.readFile(filePath, "utf-8");
      const parsedContent = parseMarkdown(content);

      // Segment for translation
      const chunks = this.segmentContent(parsedContent);
      console.log(chalk.blue(`  ✓ Segmented into ${chunks.length} chunks`));

      // Merge small chunks to reduce API calls
      const mergedChunks = this.mergeSmallChunks(chunks);
      console.log(chalk.blue(`  ✓ Merged into ${mergedChunks.length} blocks`));

      // Parallel translation processing
      const translations = await Promise.all(
        mergedChunks.map((chunk, index) =>
          this.translateChunk(chunk, targetLang, index)
        )
      );

      const translatedDocument = reconstructDocument(
        translations,
        parsedContent.structure
      );

      console.log(chalk.green(`✓ Completed ${path.basename(filePath)}`));
      return translatedDocument;
    } catch (error: any) {
      console.error(chalk.red(`✗ Translation failed: ${error.message}`));
      throw error;
    }
  }

  /**
   * Translate single text chunk
   */
  async translateChunk(
    chunk: TranslationChunk,
    targetLang: string,
    index: number
  ): Promise<TranslationChunk> {
    // Skip code blocks and links (all code blocks are skipped, including markdown)
    if (chunk.type === "code" || chunk.type === "link") {
      // Add special logging for markdown code blocks
      if (chunk.type === "code" && chunk.metadata?.language === "markdown") {
        console.log(chalk.gray(`    ✓ Skipped markdown code block`));
      }
      return chunk;
    }

    const cacheKey = `${chunk.content}-${targetLang}`;
    if (this.translationCache.has(cacheKey)) {
      console.log(chalk.gray(`    ✓ Cached chunk ${index + 1}`));
      return { ...chunk, content: this.translationCache.get(cacheKey)! };
    }

    try {
      console.log(chalk.cyan(`    → Chunk ${index + 1} (${targetLang})`));

      const prompt = this.buildTranslationPrompt(chunk.content, targetLang);
      const translatedContent = await this.callTranslationAPI(
        prompt,
        targetLang
      );

      // Cache translation result
      this.translationCache.set(cacheKey, translatedContent);

      return { ...chunk, content: translatedContent };
    } catch (error: any) {
      console.error(
        chalk.red(`    ✗ Chunk ${index + 1} failed: ${error.message}`)
      );
      return chunk; // Return original content as fallback
    }
  }

  /**
   * Build system prompt
   */
  buildSystemPrompt(targetLang: string): string {
    const languageNames: Record<string, string> = {
      zh: "Chinese",
      de: "German",
      fr: "French",
      ru: "Russian",
      ja: "Japanese",
      "pt-BR": "Portuguese (Brazil)",
    };

    const targetLanguageName = languageNames[targetLang] || targetLang;

    return `You are an expert technical documentation translator writing for software developers.

**CORE PRINCIPLE: Write for developers, by developers**
Translate from a programmer's perspective - keep it natural and technically accurate.

**KEEP UNTRANSLATED (developers prefer English):**
- ALL technical terms: API, SDK, CLI, IDE, Git, GitHub, Docker, etc.
- Programming concepts: callback, middleware, endpoint, repository, deployment, etc.  
- Tool names: Node.js, React, TypeScript, VS Code, etc.
- File extensions: .js, .md, .json, .yaml, etc.
- Command names: npm, git, curl, etc.
- Code blocks, variable names, function names (especially \`\`\`markdown blocks)
- URLs, file paths, configuration keys

**TRANSLATE NATURALLY:**
- Instructions and explanations 
- Conceptual descriptions
- User-facing messages
- General workflow descriptions

**STYLE GUIDELINES:**
- Write as a native ${targetLanguageName} developer would
- Mix English technical terms with ${targetLanguageName} naturally (like real developer docs)
- Keep sentences clear and concise
- Maintain professional but friendly tone
- Preserve all Markdown formatting exactly

**EXAMPLE APPROACH:**
Instead of: "配置你的应用程序编程接口密钥"
Write: "配置你的 API key"

Think like a developer reading technical docs - what feels most natural and clear?`;
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
    };

    const targetLanguageName = languageNames[targetLang] || targetLang;

    return `Translate the following content to ${targetLanguageName}:

${content}`;
  }

  /**
   * Call translation API (using OpenAI SDK) with retry mechanism
   */
  async callTranslationAPI(
    prompt: string,
    targetLang: string,
    retryCount = 0
  ): Promise<string> {
    const maxRetries = 3;
    const baseDelay = 1000; // 1 second base delay

    try {
      const completion = await this.openai.chat.completions.create({
        model: this.apiConfig.model,
        messages: [
          {
            role: "system",
            content: this.buildSystemPrompt(targetLang),
          },
          { role: "user", content: prompt },
        ],
        max_tokens: this.apiConfig.maxTokens,
        temperature: this.apiConfig.temperature,
      });

      return completion.choices[0].message.content?.trim() || "";
    } catch (error: any) {
      // Special handling for 429 errors
      if (error.status === 429 && retryCount < maxRetries) {
        const delay = baseDelay * Math.pow(2, retryCount); // Exponential backoff
        console.log(
          chalk.yellow(
            `    ⏳ Rate limited, retrying in ${delay / 1000}s (${retryCount + 1}/${maxRetries})`
          )
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.callTranslationAPI(prompt, targetLang, retryCount + 1);
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

  /**
   * Segment document content into translatable chunks - by heading strategy
   */
  segmentContent(parsedContent: ParsedContent): TranslationChunk[] {
    const content = parsedContent.originalContent;

    // Split by headings (match # ## ### etc.)
    const chunks = content
      .split(/(?=^#{1,6}\s)/m)
      .filter((chunk) => chunk.trim());

    return chunks.map((chunk, index) => ({
      type: "paragraph" as const,
      content: chunk.trim(),
      metadata: { chunkIndex: index },
      startLine: 0,
      endLine: 0,
    }));
  }

  /**
   * Merge small chunks to reduce API call count
   */
  private mergeSmallChunks(chunks: TranslationChunk[]): TranslationChunk[] {
    const maxMergedSize = 1000; // Maximum size after merging
    const merged: TranslationChunk[] = [];
    let currentMerged: TranslationChunk | null = null;

    for (const chunk of chunks) {
      if (!currentMerged) {
        currentMerged = { ...chunk };
      } else if (
        currentMerged.content.length + chunk.content.length <
        maxMergedSize
      ) {
        // Merge into current chunk
        currentMerged.content += "\n\n" + chunk.content;
      } else {
        // Current chunk is full, save and start new chunk
        merged.push(currentMerged);
        currentMerged = { ...chunk };
      }
    }

    if (currentMerged) {
      merged.push(currentMerged);
    }

    return merged;
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
