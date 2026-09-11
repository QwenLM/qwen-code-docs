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
      "es",
      "ko",
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
      const sourceContent = await fs.readFile(sourcePath, "utf-8");
      const source = this.parseEntries(sourceContent);
      const existing = (await fs.pathExists(targetPath))
        ? this.parseEntries(await fs.readFile(targetPath, "utf-8"))
        : null;

      // Additive. Re-translating a key that already has a value rewrites a
      // human-reviewed string for no reason, and the rewrite drifts toward
      // English: one regeneration turned de `Fähigkeiten` into `Skills`, ja
      // `LSP（言語サーバープロトコル）` into `LSP (Language Server Protocol)`,
      // and zh `频道` into `通道` -- a mistranslation, in a section about
      // Telegram and WeChat. 33 values were rewritten that way in a single
      // run and had to be restored by hand (#278). Only what is missing is
      // sent to the model.
      // Most keys are route segments and read identically in every locale, so
      // they match by key. `separator`, `menu` and `href` entries are the
      // exception: their key can BE the display text, so a translated file may
      // key them in the target language -- `'Erste Schritte'` where English
      // has `'Getting started'`. Matching those by key alone missed, which
      // sent the localized separator to be "filled in" from English and
      // replaced the German heading with the English one. When the key misses
      // they are anchored to the first route key that follows them. Position
      // alone carries no identity: it
      // binds a heading to the wrong section the moment English inserts or
      // moves one, and route keys are never translated, so they survive
      // insertion, deletion and reorder. A `type: 'page'` entry without
      // `href` keys a route and stays on the key path.
      const isLabelKeyed = (text: string) =>
        /\btype\s*:\s*['"](?:separator|menu)['"]/.test(text) ||
        /\bhref\s*:/.test(text);

      // Anchor id per label-keyed entry, undefined for route-keyed ones.
      // Inside a run of consecutive label-keyed entries there is no identity
      // to match on -- an offset is just position again, and position binds
      // the wrong heading as soon as English inserts into the run. The run
      // length is part of the id so runs of different length never match:
      // the entries fall through and are re-translated instead of guessed.
      const anchors = (entries: ReadonlyArray<[string, string]>) => {
        const ids: Array<string | undefined> = entries.map(() => undefined);
        let run: number[] = [];
        const bind = (anchor: string) => {
          const size = run.length;
          run.forEach((at, offset) => (ids[at] = `${anchor}#${size}#${offset}`));
          run = [];
        };
        entries.forEach(([key, text], at) => {
          if (isLabelKeyed(text)) run.push(at);
          else bind(key);
        });
        bind("");
        return ids;
      };

      // Exact key matches are taken first, across the whole file, and the
      // entry one consumes is off the table for the anchor pass. Both
      // separator conventions are in use: `users/_meta.ts` translates the
      // separator key, so only the anchor can identify it, while
      // `developers/_meta.ts` keys it in English and localizes `title`, where
      // the key IS exact evidence of identity. Anchors are inference -- they
      // shift when English grows a run and vanish when dropKeysWithoutPages
      // removes the route key behind them because that page is untranslated
      // in this locale. Letting inference outrank exact evidence bound one
      // heading to another heading's entry and then matched that same entry
      // again by key, emitting its key twice. A duplicate key in a `_meta.ts`
      // collapses silently at require() time, so nothing catches it. Anything
      // left unresolved goes back to the model instead of being guessed.
      const match = (
        target: ReadonlyArray<[string, string]>,
        wanted: ReadonlyArray<[string, string]>
      ) => {
        const targetAnchors = anchors(target);
        const byKey = new Map<string, number>();
        const byAnchor = new Map<string, number>();
        target.forEach(([key], i) => {
          byKey.set(key, i);
          const id = targetAnchors[i];
          if (id !== undefined) byAnchor.set(id, i);
        });

        const taken = new Set<number>();
        const found: Array<number | undefined> = wanted.map(([key]) => {
          const i = byKey.get(key);
          if (i === undefined) return undefined;
          taken.add(i);
          return i;
        });
        const wantedAnchors = anchors(wanted);
        wanted.forEach((_, j) => {
          const id = wantedAnchors[j];
          if (found[j] !== undefined || id === undefined) return;
          const i = byAnchor.get(id);
          if (i === undefined || taken.has(i)) return;
          taken.add(i);
          found[j] = i;
        });
        return found.map((i) => (i === undefined ? undefined : target[i][1]));
      };

      const resolved = match(existing?.entries ?? [], source.entries);
      const missingAt = source.entries
        .map((_, i) => i)
        .filter((i) => resolved[i] === undefined);

      if (existing && !missingAt.length) {
        console.log(chalk.gray(`  = ${targetLanguage}: already complete`));
        return;
      }

      const missing = missingAt.map((i) => source.entries[i]);
      const partial = [
        ...source.head,
        ...missing.map(([, text]) => text),
        ...source.tail
      ].join("\n");
      const translated = this.parseEntries(
        await this.translateMetaFileContent(partial, targetLanguage)
      );

      // The model only sees the missing entries, so anchors are resolved
      // within that reduced list on both sides.
      const fresh = match(translated.entries, missing);
      const filled = new Map<number, string>();
      fresh.forEach((text, j) => {
        if (text !== undefined) filled.set(missingAt[j], text);
      });

      // English order, existing values preserved, new values filled in.
      const merged = source.entries
        .map((_, i) => resolved[i] ?? filled.get(i))
        .filter((text): text is string => text !== undefined);

      await fs.writeFile(
        targetPath,
        this.dropKeysWithoutPages(
          [...source.head, ...merged, ...source.tail].join("\n"),
          path.dirname(targetPath)
        ),
        "utf-8"
      );
      if (existing)
        console.log(
          chalk.gray(`  + ${targetLanguage}: ${missing.length} new key(s)`)
        );
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

  /**
   * Remove entries whose key has no page in the target locale.
   *
   * The translation copies every key from English, including pages that
   * locale does not have yet -- and Nextra refuses to build a `_meta` key
   * with no page behind it, which takes the whole site down rather than
   * degrading one entry. `ko/developers/_meta.ts` did exactly that on
   * 2026-09-11: generated from nothing, it listed `extensions`, and the
   * deploy failed with "refers to a page that cannot be found".
   *
   * The CI guard catches this now, but catching it leaves a human to delete
   * a line every time a locale runs behind English. Dropping it at the
   * source is the fix; the key comes back on its own once the page is
   * translated and navigation is regenerated.
   *
   * Separator entries are kept regardless: their key is a display label,
   * not a route.
   */

  /**
   * Split a `_meta.ts` into its preamble, one text block per top-level entry,
   * and its tail, preserving the original formatting of every block.
   *
   * Shares its brace handling with dropKeysWithoutPages: string literals are
   * blanked before counting, because a value carrying a `}` would otherwise
   * close the object early.
   */
  private parseEntries(content: string): {
    head: string[];
    entries: Array<[string, string]>;
    tail: string[];
  } {
    const bare = (line: string): string =>
      line.replace(/'[^']*'|"[^"]*"|`[^`]*`/g, (m) => " ".repeat(m.length));

    const head: string[] = [];
    const tail: string[] = [];
    const entries: Array<[string, string]> = [];
    let current: string[] = [];
    let key: string | null = null;
    let depth = 0;
    let started = false;

    const flush = () => {
      const k = key;
      key = null;
      if (!current.length || k === null) {
        current = [];
        return;
      }
      entries.push([k, current.join("\n")]);
      current = [];
    };

    for (const line of content.split("\n")) {
      const clean = bare(line);
      if (!started) {
        head.push(line);
        if (clean.includes("{")) {
          started = true;
          depth = 1;
        }
        continue;
      }
      if (depth === 1) {
        const match = line.match(
          /^\s*(?:'([^']+)'|"([^"]+)"|([A-Za-z0-9_$-]+))\s*:/
        );
        if (match) {
          flush();
          key = match[1] ?? match[2] ?? match[3] ?? null;
        }
      }
      const opening = (clean.match(/{/g) || []).length;
      const closing = (clean.match(/}/g) || []).length;
      if (depth === 1 && closing > opening) {
        flush();
        depth = 0;
        tail.push(line);
        continue;
      }
      depth += opening - closing;
      if (key !== null) current.push(line);
      else if (depth === 0) tail.push(line);
      else head.push(line);
    }
    flush();
    return { head, entries, tail };
  }

  private dropKeysWithoutPages(content: string, targetDir: string): string {
    if (!content.includes("export default")) return content;

    // Brace depth has to ignore braces inside string literals, or a value
    // like `'Beta } soon'` closes the object early and takes every entry
    // after it away with the closing brace. Blank the literals, count on the
    // copy, keep the original line.
    const bare = (line: string): string =>
      line.replace(/'[^']*'|"[^"]*"|`[^`]*`/g, (m) => " ".repeat(m.length));

    const lines = content.split("\n");
    const kept: string[] = [];
    let depth = 0;
    let entry: string[] = [];
    let entryKey: string | null = null;
    let started = false;

    const flush = () => {
      const key = entryKey;
      // Cleared before any early return. Leaving a stale key set makes every
      // later line fail the key match and fall into `entry` instead of
      // `kept` -- which is how the closing brace went missing.
      entryKey = null;
      if (!entry.length) return;
      const text = entry.join("\n");
      entry = [];
      // `separator` is not the only entry with nothing behind it: a `menu`,
      // or a `page` backed by an `href`, has no file either, and
      // translateMetaFileContent already preserves display/type/href verbatim.
      const isStructural = /\b(?:type|href)\s*:/.test(text);
      const hasPage =
        key !== null &&
        [".md", ".mdx", ""].some((ext) =>
          fs.existsSync(path.join(targetDir, key + ext))
        );
      if (isStructural || key === null || hasPage) {
        kept.push(text);
        return;
      }
      console.log(
        chalk.yellow(
          `  drop "${key}": no page for it in ${path.basename(targetDir)}`
        )
      );
    };

    for (const line of lines) {
      const clean = bare(line);
      if (!started) {
        kept.push(line);
        if (clean.includes("{")) {
          started = true;
          depth = 1;
        }
        continue;
      }
      if (depth === 1) {
        const match = line.match(
          /^\s*(?:'([^']+)'|"([^"]+)"|([A-Za-z0-9_$-]+))\s*:/
        );
        if (match) {
          flush();
          entryKey = match[1] ?? match[2] ?? match[3] ?? null;
        }
      }
      const opening = (clean.match(/{/g) || []).length;
      const closing = (clean.match(/}/g) || []).length;
      if (depth === 1 && closing > opening) {
        flush();
        depth = 0;
        kept.push(line);
        continue;
      }
      depth += opening - closing;
      if (entryKey !== null) entry.push(line);
      else kept.push(line);
    }
    flush();
    return kept.join("\n");
  }

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
      // 直接翻译全文内容
      const translatedContent = await this.translator.translateContent(
        sourceContent,
        targetLanguage
      );

      // 清理可能存在的代码块标记
      let content = translatedContent;

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
