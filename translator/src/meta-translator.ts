import fs from "fs-extra";
import path from "path";
import chalk from "chalk";
import { DocumentTranslator } from "./translator";

/**
 * Meta 文件翻译器
 * 专门处理 _meta.ts 文件的翻译
 */
export class MetaTranslator {
  private translator: DocumentTranslator;
  private projectRoot: string;
  private sourceLanguage: string;
  private targetLanguages: string[];
  private outputDir: string;

  constructor(options: {
    projectRoot: string;
    sourceLanguage?: string;
    targetLanguages?: string[];
    outputDir?: string;
  }) {
    this.projectRoot = options.projectRoot;
    this.sourceLanguage = options.sourceLanguage || "en";
    this.targetLanguages = options.targetLanguages || [
      "zh",
      "de",
      "fr",
      "ru",
      "pt-BR",
    ];
    this.outputDir = options.outputDir || "content";
    this.translator = new DocumentTranslator({
      projectRoot: this.projectRoot,
    });

    console.log(chalk.blue("🔧 Meta 翻译器已初始化"));
    console.log(chalk.gray(`  项目根目录: ${this.projectRoot}`));
    console.log(chalk.gray(`  源语言: ${this.sourceLanguage}`));
    console.log(chalk.gray(`  目标语言: ${this.targetLanguages.join(", ")}`));
    console.log(chalk.gray(`  输出目录: ${this.outputDir}`));
  }

  /**
   * 翻译所有 _meta.ts 文件
   */
  async translateAllMetaFiles(): Promise<{
    success: number;
    failed: number;
    results: Record<string, { success: string[]; failed: string[] }>;
  }> {
    console.log(chalk.yellow("🔍 搜索 _meta.ts 文件..."));

    // 获取所有 _meta.ts 文件
    const metaFiles = await this.findAllMetaFiles();

    if (metaFiles.length === 0) {
      console.log(chalk.yellow("⚠️  未找到任何 _meta.ts 文件"));
      return { success: 0, failed: 0, results: {} };
    }

    console.log(chalk.blue(`📝 找到 ${metaFiles.length} 个 _meta.ts 文件`));

    // 并行翻译所有语言
    const languagePromises = this.targetLanguages.map(async (language) => {
      const result: { success: string[]; failed: string[] } = {
        success: [],
        failed: [],
      };

      console.log(chalk.blue(`🚀 开始翻译到 ${language}...`));

      for (const metaFile of metaFiles) {
        try {
          await this.translateMetaFile(metaFile, language);
          result.success.push(metaFile);
          console.log(chalk.green(`✅ ${language}: ${metaFile}`));
        } catch (error: any) {
          result.failed.push(metaFile);
          console.error(
            chalk.red(`❌ ${language}: ${metaFile} - ${error.message}`)
          );
        }
      }

      return { language, result };
    });

    // 等待所有语言翻译完成
    const languageResults = await Promise.all(languagePromises);

    // 整理结果
    const results: Record<string, { success: string[]; failed: string[] }> = {};
    let totalSuccess = 0;
    let totalFailed = 0;

    for (const { language, result } of languageResults) {
      results[language] = result;
      totalSuccess += result.success.length;
      totalFailed += result.failed.length;
    }

    console.log(
      chalk.green(
        `🎉 Meta 文件翻译完成！总计: ${totalSuccess} 成功, ${totalFailed} 失败`
      )
    );

    return { success: totalSuccess, failed: totalFailed, results };
  }

  /**
   * 翻译单个 _meta.ts 文件
   */
  async translateMetaFile(
    metaFilePath: string,
    targetLanguage: string
  ): Promise<void> {
    const sourcePath = path.join(
      this.projectRoot,
      this.outputDir,
      this.sourceLanguage,
      metaFilePath
    );

    const targetPath = path.join(
      this.projectRoot,
      this.outputDir,
      targetLanguage,
      metaFilePath
    );

    // 检查源文件是否存在
    if (!(await fs.pathExists(sourcePath))) {
      throw new Error(`源文件不存在: ${sourcePath}`);
    }

    // 确保目标目录存在
    await fs.ensureDir(path.dirname(targetPath));

    try {
      // 读取源文件内容
      const sourceContent = await fs.readFile(sourcePath, "utf-8");

      // 直接使用 LLM 翻译整个文件内容
      const translatedContent = await this.translateMetaFileContent(
        sourceContent,
        targetLanguage
      );

      // 写入目标文件
      await fs.writeFile(targetPath, translatedContent, "utf-8");
    } catch (error: any) {
      console.error(
        chalk.red(`❌ 翻译文件失败 ${metaFilePath}: ${error.message}`)
      );
      throw error;
    }
  }

  /**
   * 查找所有 _meta.ts 文件
   */
  private async findAllMetaFiles(): Promise<string[]> {
    const sourceDir = path.join(
      this.projectRoot,
      this.outputDir,
      this.sourceLanguage
    );
    const metaFiles: string[] = [];

    if (!(await fs.pathExists(sourceDir))) {
      return metaFiles;
    }

    await this.walkDirectory(sourceDir, "", metaFiles);
    return metaFiles;
  }

  /**
   * 递归遍历目录查找 _meta.ts 文件
   */
  private async walkDirectory(
    dir: string,
    relativePath: string,
    metaFiles: string[]
  ): Promise<void> {
    const items = await fs.readdir(dir);

    for (const item of items) {
      const fullPath = path.join(dir, item);
      const itemRelativePath = path
        .join(relativePath, item)
        .replace(/\\/g, "/");
      const stat = await fs.stat(fullPath);

      if (stat.isDirectory()) {
        await this.walkDirectory(fullPath, itemRelativePath, metaFiles);
      } else if (item === "_meta.ts") {
        metaFiles.push(itemRelativePath);
      }
    }
  }

  /**
   * 使用 LLM 直接翻译 _meta.ts 文件内容
   */
  private async translateMetaFileContent(
    sourceContent: string,
    targetLanguage: string
  ): Promise<string> {
    const prompt = `请将以下 TypeScript _meta.ts 文件翻译成 ${targetLanguage} 语言。

要求：
1. 保持文件结构和格式不变
2. 只翻译键值对中的值（value），不要翻译键（key）
3. 保持 TypeScript 语法正确
4. 保持引号类型一致（单引号、双引号或反引号）
5. 如果值包含多行内容，保持换行格式
6. 不要添加任何代码块标记（如 \`\`\`typescript 或 \`\`\`javascript）
7. 【非常重要】以下字段的 value 属于程序枚举/URL，绝对不能翻译（必须保持原样）：
   - display: 只能是 'hidden' | 'normal' | 'children'（例如 display: 'hidden' 不能翻译成“隐藏/masqué/versteckt”等）
   - type: 只能是 'page' | 'doc' | 'separator' | 'menu'
   - href: URL/路径必须保持原样，不要翻译/改写

原始文件内容：
${sourceContent}

请直接返回翻译后的完整 TypeScript 代码，不要包含任何解释、代码块标记或额外内容。`;

    const preserveKeyedStringValues = (
      src: string,
      out: string,
      key: string
    ) => {
      const re = new RegExp(
        `(^|[\\s{,])${key}\\s*:\\s*(['"\`])([^'"\`]*?)\\2`,
        "gm"
      );
      const srcValues: string[] = [];
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) srcValues.push(m[3]);
      if (!srcValues.length) return out;

      let i = 0;
      return out.replace(re, (full, prefix, quote) => {
        const v = srcValues[i++];
        if (v === undefined) return full;
        return `${prefix}${key}: ${quote}${v}${quote}`;
      });
    };

    try {
      // 创建一个简单的文档结构来使用现有的翻译器
      const mockDocument = {
        type: "paragraph" as const,
        content: sourceContent,
        metadata: {},
        startLine: 1,
        endLine: 1,
      };

      const translatedChunk = await this.translator.translateChunk(
        mockDocument,
        targetLanguage,
        0
      );

      // 清理可能存在的代码块标记
      let content = translatedChunk.content;

      // 移除开头的代码块标记
      content = content.replace(
        /^```(?:typescript|javascript|ts|js)?\s*\n?/i,
        ""
      );

      // 移除结尾的代码块标记
      content = content.replace(/\n?```\s*$/i, "");

      // 移除多余的空行
      content = content.trim();

      // 强制保护 _meta.ts 中不能被翻译的枚举/URL 字段，避免出现 display='隐藏' 等导致 Nextra 校验失败
      content = preserveKeyedStringValues(sourceContent, content, "display");
      content = preserveKeyedStringValues(sourceContent, content, "type");
      content = preserveKeyedStringValues(sourceContent, content, "href");

      return content;
    } catch (error: any) {
      console.error(chalk.red(`❌ LLM 翻译失败: ${error.message}`));
      throw error;
    }
  }

  /**
   * 翻译单个 _meta.ts 文件到指定语言
   */
  async translateSingleMetaFile(
    metaFilePath: string,
    targetLanguage: string
  ): Promise<void> {
    console.log(chalk.blue(`🔧 翻译 ${metaFilePath} 到 ${targetLanguage}...`));
    await this.translateMetaFile(metaFilePath, targetLanguage);
    console.log(
      chalk.green(`✅ 翻译完成: ${metaFilePath} -> ${targetLanguage}`)
    );
  }
}

export default MetaTranslator;
