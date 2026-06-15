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

      // Full document translation (leverage large context models like qwen3.6-plus)
      console.log(
        chalk.blue(
          `  ✓ Translating full document (${content.length} characters)`
        )
      );

      const translatedContent = await this.translateContent(
        parsedContent.originalContent,
        targetLang
      );

      console.log(chalk.green(`✓ Completed ${path.basename(filePath)}`));
      return translatedContent;
    } catch (error: any) {
      console.error(chalk.red(`✗ Translation failed: ${error.message}`));
      throw error;
    }
  }

  /**
   * Translate text content
   */
  async translateContent(
    content: string,
    targetLang: string
  ): Promise<string> {
    const cacheKey = `${content}-${targetLang}`;
    if (this.translationCache.has(cacheKey)) {
      console.log(chalk.gray(`    ✓ Cached translation`));
      return this.translationCache.get(cacheKey)!;
    }

    try {
      console.log(chalk.cyan(`    → Translating content (${targetLang})`));

      const prompt = this.buildTranslationPrompt(content, targetLang);
      const translatedContent = await this.callTranslationAPI(
        prompt,
        targetLang
      );

      // Cache translation result
      this.translationCache.set(cacheKey, translatedContent);

      return translatedContent;
    } catch (error: any) {
      console.error(chalk.red(`    ✗ Translation failed: ${error.message}`));
      throw error;
    }
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
  buildSystemPrompt(targetLang: string): string {
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
${terminology}
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
