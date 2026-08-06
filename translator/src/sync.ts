import fs from "fs-extra";
import path from "path";
import { execSync } from "child_process";
import chalk from "chalk";
import { DocumentTranslator, TranslationBatchError } from "./translator";

/**
 * 并发池：以最多 concurrency 个并行任务处理 items 数组。
 * 保持结果顺序与 items 一致，单线程事件循环下对共享计数器的
 * 同步自增操作是安全的。
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await fn(items[index]);
    }
  }

  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

/**
 * 判断是否为 Nextra 导航文件（_meta.ts/js/json 等）。
 * 这类文件属于本库各语言包自行维护的导航定制，不应被上游同步覆盖或翻译。
 */
function isMetaFile(filePath: string): boolean {
  return /^_meta\.(ts|tsx|js|jsx|mjs|cjs|json)$/.test(path.basename(filePath));
}

/**
 * 上游文档可能包含未带 ./ 前缀的相对链接/图片引用(如 `](assets/foo.png)`),
 * 在 GitHub 上能正常渲染,但本站 Nextra/webpack 构建会将其当作模块请求
 * 直接报错(Module not found: Can't resolve 'assets/...')。
 * 复制源文档到 content/ 时,统一把 .md/.mdx 中这类相对链接改写为 ./ 形式。
 * 按行跟踪代码栅栏:围栏内是示例代码,改写会悄悄偏离上游,必须跳过。
 */
const RELATIVE_LINK =
  /\]\((?!\.|\/|#|[a-zA-Z][a-zA-Z0-9+.-]*:)([^)\s]+)(\s+"[^"]*")?\)/g;

function normalizeMarkdownRelativeLinks(text: string): string {
  let inFence = false;
  let fenceMark = "";
  return text
    .split("\n")
    .map((line) => {
      const fence = line.match(/^\s*(```|~~~)/);
      if (fence) {
        if (!inFence) {
          inFence = true;
          fenceMark = fence[1];
        } else if (fence[1] === fenceMark) {
          inFence = false;
        }
        return line;
      }
      if (inFence) return line;
      return line.replace(
        RELATIVE_LINK,
        (_m, target: string, title?: string) => `](./${target}${title ?? ""})`
      );
    })
    .join("\n");
}

/**
 * Asset extensions mirrored into every target-language directory by
 * updateBaseDocs() stage 3. Language-agnostic by nature; any other file
 * class upstream ships (.json/.ts/extensionless) stays EN-only.
 */
const ASSET_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".webp",
  ".avif",
  ".ico",
]);

/**
 * 版本同步管理器
 * 检测原仓库文档变更，自动同步和翻译更新
 */

interface SyncOptions {
  sourceRepo?: string;
  docsPath?: string;
  configPath?: string;
  outputBasePath?: string;
  sourceLanguage?: string; // 新增：源文档语言
  targetLanguages?: string[];
  projectRoot?: string; // 项目根目录
  outputDir?: string; // 输出目录
  branch?: string; // 新增：源仓库分支
  // 新增：从站点发布中排除的路径（目录前缀或精确文件名，相对 docsPath）。
  // 这些是内部文档：既不会翻译到目标语言，也不会作为源语言页面拷进
  // content/<sourceLanguage>，因此完全不出现在站点上。
  excludeFromTranslation?: string[];
}

interface SyncRecord {
  commit: string | null;
  timestamp: string | null;
  files: string[];
}

interface ChangeDetectionResult {
  files: string[];
  latestCommit: string;
  isFirstSync: boolean;
}

interface TranslationResult {
  success: number;
  failed: number;
  files: string[];
  failedFiles: string[];
}

interface TranslationChangelogEntry {
  timestamp: string;
  commit: string;
  sourceLanguage: string;
  translatedFiles: {
    [language: string]: {
      success: string[];
      failed: string[];
    };
  };
  stats: {
    totalFiles: number;
    languages: number;
    successCount: number;
    failedCount: number;
  };
}

interface SyncResult {
  success: boolean;
  changes: number;
  files: string[];
  translations?: Record<string, TranslationResult>;
}

export class SyncManager {
  private sourceRepo: string;
  private docsPath: string;
  private configPath: string;
  private outputBasePath: string;
  private sourceLanguage: string; // 新增：源文档语言
  private targetLanguages: string[];
  private branch: string; // 新增：源仓库分支
  private lastSyncFile: string;
  private changelogFile: string;
  private translator: DocumentTranslator | null = null; // 懒加载：仅在需要翻译时构造
  private projectRoot: string; // 新增：项目根目录
  private outputDir: string; // 新增：输出目录
  private excludeFromTranslation: string[]; // 新增：跳过翻译的路径

  constructor(options: SyncOptions = {}) {
    // 确定项目根目录
    this.projectRoot = options.projectRoot || process.cwd();

    // 配置文件路径优先级：
    // 1. 用户指定的configPath
    // 2. 项目根目录下的translation-config
    // 3. 包内部的默认配置
    this.configPath =
      options.configPath ||
      path.join(this.projectRoot, "translation-config") ||
      path.join(__dirname, "../../config");

    this.sourceRepo =
      options.sourceRepo || "https://github.com/QwenLM/qwen-code.git";
    this.docsPath = options.docsPath || "docs";
    this.outputBasePath = options.outputBasePath || this.projectRoot;
    this.sourceLanguage = options.sourceLanguage || "en";
    this.targetLanguages = options.targetLanguages || [
      "zh",
      "de",
      "fr",
      "ru",
      "pt-BR",
      "es",
    ];
    this.branch = options.branch || "main"; // 默认使用 main 分支
    this.excludeFromTranslation = options.excludeFromTranslation || [];

    // 设置输出目录
    this.outputDir = options.outputDir || "content";

    // last-sync.json 应该放在项目根目录下
    this.lastSyncFile = path.join(this.projectRoot, "last-sync.json");
    this.changelogFile = path.join(
      this.projectRoot,
      "translation-changelog.json"
    );
    // 翻译器改为懒加载（见 getTranslator）：构造期不再创建 DocumentTranslator，
    // 因此不会在此触发 OPENAI_API_KEY 校验。detect-only / 零变更等无需翻译的
    // 场景下，全程都不会构造翻译器，也就不需要配置 key。

    console.log(chalk.blue("🔄 同步管理器已初始化"));
    console.log(chalk.gray(`  项目根目录: ${this.projectRoot}`));
    console.log(chalk.gray(`  配置路径: ${this.configPath}`));
    console.log(chalk.gray(`  源仓库: ${this.sourceRepo}`));
    console.log(chalk.gray(`  文档路径: ${this.docsPath}`));
    console.log(chalk.gray(`  源语言: ${this.sourceLanguage}`));
    console.log(chalk.gray(`  输出目录: ${this.outputDir}`));
    console.log(chalk.gray(`  目标语言: ${this.targetLanguages.join(", ")}`));
    console.log(chalk.gray(`  同步记录: ${this.lastSyncFile}`));
  }

  /**
   * 懒加载翻译器
   * 仅在真正需要翻译时才构造 DocumentTranslator（构造时会校验 OPENAI_API_KEY）。
   */
  private getTranslator(): DocumentTranslator {
    if (!this.translator) {
      this.translator = new DocumentTranslator({
        projectRoot: this.projectRoot,
      });
    }
    return this.translator;
  }

  /**
   * 检测并同步文档变更
   */
  async syncDocuments(
    forceSync: boolean = false,
    options: { detectOnly?: boolean; sourceOnly?: boolean } = {}
  ): Promise<SyncResult> {
    try {
      console.log(chalk.yellow("🔍 检测文档变更..."));

      const changes = await this.detectChanges();

      // detect-only：只检测并返回变更文件清单。不复制源文档、不翻译、不更新
      // last-sync.json / changelog，也不构造翻译器，因此无需配置 OPENAI_API_KEY。
      // 注意：检测本身仍需克隆/更新源仓库（.temp-source-repo）用于比对。
      if (options.detectOnly) {
        if (forceSync) {
          console.log(
            chalk.yellow("⚠️  detect-only 模式下 --force 无效，已忽略")
          );
        }
        if (options.sourceOnly) {
          console.log(
            chalk.yellow(
              "⚠️  已同时指定 --source-only，被 --detect-only 覆盖（不写入任何文件）"
            )
          );
        }
        if (changes.isFirstSync && changes.files.length > 0) {
          console.log(
            chalk.blue(
              `📝 首次检测（缺少同步基线 last-sync.json）：列出全部 ${changes.files.length} 个文档`
            )
          );
        } else if (changes.files.length === 0) {
          console.log(chalk.green("✅ 没有检测到文档变更"));
        } else {
          console.log(
            chalk.blue(
              `📝 检测到 ${changes.files.length} 个文件变更（detect-only：不翻译、不更新 content/ 与同步记录）`
            )
          );
        }
        return {
          success: true,
          changes: changes.files.length,
          files: changes.files,
        };
      }

      if (!forceSync && changes.files.length === 0) {
        console.log(chalk.green("✅ 没有检测到文档变更"));
        return { success: true, changes: 0, files: [] };
      }

      console.log(chalk.blue(`📝 检测到 ${changes.files.length} 个文件变更`));

      // source-only：把上游源文档写入 content/<sourceLanguage> 与 .source-docs，
      // 但不翻译、不更新 last-sync.json / changelog，也不构造翻译器（无需 key）。
      // 刻意不推进同步基线：目标语言译文此时会落后于源文档，待配置 key 后再次运行
      // sync 即可补齐翻译（届时仍会检测到这些文件，可自愈）。
      if (options.sourceOnly) {
        await this.updateBaseDocs();
        console.log(
          chalk.green(
            "✅ 已更新源文档（source-only：未翻译；未推进 last-sync.json，配置 key 后再次 sync 可补齐翻译）"
          )
        );
        return {
          success: true,
          changes: changes.files.length,
          files: changes.files,
        };
      }

      // 正常 sync：在写入任何文件之前先构造翻译器以校验 OPENAI_API_KEY，
      // 恢复“缺 key 立即失败、不产生半写状态”的行为（懒加载后默认会等到翻译阶段
      // 才校验，导致 content/ 已被覆写后才报错）。
      // 作用域说明：detect-only 已在上方返回；未指定 --force 的零变更也已在上方
      // 返回——这两类无需 key。但 --force 会绕过零变更早返回，届时即使没有变更也会
      // 走到这里并要求 key（属 --force 的既有语义，不在本次改动范围）。
      // 此处丢弃返回值仅为提前校验；实例已被缓存，翻译阶段会复用同一实例。
      this.getTranslator();

      // 更新基础文档
      await this.updateBaseDocs();

      // 翻译更新的文件
      const translationResults = await this.translateChangedFiles(
        changes.files
      );

      // 记录翻译日志
      await this.saveTranslationChangelog(
        changes.latestCommit,
        changes.files,
        translationResults
      );

      const failedFiles = Object.entries(translationResults).flatMap(
        ([language, result]) =>
          result.failedFiles.map((file) => `${language}:${file}`)
      );
      if (failedFiles.length > 0) {
        throw new TranslationBatchError(failedFiles);
      }

      // 更新同步记录
      await this.updateSyncRecord(changes.latestCommit);

      console.log(chalk.green("✅ 文档同步完成"));

      return {
        success: true,
        changes: changes.files.length,
        files: changes.files,
        translations: translationResults,
      };
    } catch (error: any) {
      console.error(chalk.red(`❌ 同步失败: ${error.message}`));
      throw error;
    }
  }

  /**
   * 检测文档变更
   */
  async detectChanges(): Promise<ChangeDetectionResult> {
    // 将临时目录放在用户项目根目录下，避免多个项目冲突
    const tempDir = path.join(this.projectRoot, ".temp-source-repo");

    try {
      // 克隆或更新源仓库
      if (!(await fs.pathExists(tempDir))) {
        console.log(chalk.blue("📥 克隆源仓库..."));
        execSync(
          `git clone --depth 50 --branch ${this.branch} ${this.sourceRepo} ${tempDir}`,
          {
            stdio: "pipe",
          }
        );
      } else {
        console.log(chalk.blue("🔄 更新源仓库..."));
        execSync(
          `cd ${tempDir} && git fetch origin && git checkout ${this.branch} && git pull origin ${this.branch}`,
          { stdio: "pipe" }
        );
      }

      // 获取最新提交
      const latestCommit = execSync(`cd ${tempDir} && git rev-parse HEAD`, {
        encoding: "utf8",
      }).trim();

      // 读取上次同步记录
      const lastSync = await this.getLastSyncRecord();

      if (!lastSync.commit) {
        // 首次同步，获取所有文档文件
        const allFiles = await this.getAllDocFiles(tempDir);
        return {
          files: allFiles,
          latestCommit,
          isFirstSync: true,
        };
      }

      this.ensureCommitAvailable(tempDir, lastSync.commit);

      // 获取变更文件
      const changedFiles = execSync(
        `cd ${tempDir} && git diff --name-only ${lastSync.commit} HEAD -- ${this.docsPath}/`,
        { encoding: "utf8" }
      ).trim();

      const files = changedFiles
        ? changedFiles
            .split("\n")
            .filter(
              (file) => file.endsWith(".md") && file.startsWith(this.docsPath)
            )
        : [];

      return {
        files,
        latestCommit,
        isFirstSync: false,
      };
    } finally {
      // 清理临时目录在需要时取消注释
      // await fs.remove(tempDir);
    }
  }

  private ensureCommitAvailable(repoPath: string, commit: string): void {
    try {
      execSync(`cd ${repoPath} && git cat-file -e ${commit}^{commit}`, {
        stdio: "ignore",
      });
      return;
    } catch {
      console.log(
        chalk.yellow(
          `⚠️  同步基线 ${commit.slice(0, 8)} 不在浅克隆历史中，正在补全源仓库历史...`
        )
      );
    }

    const isShallow = execSync(
      `cd ${repoPath} && git rev-parse --is-shallow-repository`,
      { encoding: "utf8" }
    ).trim();

    if (isShallow === "true") {
      execSync(`cd ${repoPath} && git fetch --unshallow origin ${this.branch}`, {
        stdio: "inherit",
      });
    } else {
      execSync(`cd ${repoPath} && git fetch origin ${this.branch}`, {
        stdio: "inherit",
      });
    }

    try {
      execSync(`cd ${repoPath} && git cat-file -e ${commit}^{commit}`, {
        stdio: "ignore",
      });
    } catch {
      throw new Error(
        `同步基线 ${commit} 不存在于源仓库历史中，无法计算增量变更`
      );
    }
  }

  /**
   * 获取所有文档文件
   */
  async getAllDocFiles(repoPath: string): Promise<string[]> {
    const docsDir = path.join(repoPath, this.docsPath);

    if (!(await fs.pathExists(docsDir))) {
      console.log(chalk.yellow(`⚠️  文档目录不存在: ${this.docsPath}`));
      return [];
    }

    const files: string[] = [];

    async function walkDir(dir: string, basePath: string = ""): Promise<void> {
      const items = await fs.readdir(dir);

      for (const item of items) {
        const fullPath = path.join(dir, item);
        const relativePath = path.join(basePath, item).replace(/\\/g, "/");
        const stat = await fs.stat(fullPath);

        if (stat.isDirectory()) {
          await walkDir(fullPath, relativePath);
        } else if (item.endsWith(".md")) {
          files.push(path.join(basePath, item).replace(/\\/g, "/"));
        }
      }
    }

    await walkDir(docsDir);
    return files.map((file) => `${this.docsPath}/${file}`);
  }

  /**
   * 更新基础文档
   */
  async updateBaseDocs(): Promise<void> {
    // 使用项目根目录下的临时目录
    const tempDir = path.join(this.projectRoot, ".temp-source-repo");
    const sourceDocsDir = path.join(tempDir, this.docsPath);
    const sourceDocsTargetDir = path.join(this.outputBasePath, ".source-docs");
    const contentSourceDir = path.join(
      this.outputBasePath,
      "content",
      this.sourceLanguage
    );

    console.log(chalk.blue("📂 更新基础文档..."));

    // 1. 复制到 .source-docs 目录
    await fs.ensureDir(sourceDocsTargetDir);
    if (await fs.pathExists(sourceDocsDir)) {
      await fs.copy(sourceDocsDir, sourceDocsTargetDir, {
        overwrite: true,
        filter: (src) => {
          // 只复制markdown文件、JSON文件和资源文件
          const ext = path.extname(src);
          return (
            ext === ".md" ||
            ext === ".json" ||
            ext === ".ts" ||
            ext === ".png" ||
            ext === ".jpg" ||
            ext === ".gif" ||
            ext === ".svg" ||
            ext === "" ||
            path.basename(src).startsWith(".")
          );
        },
      });
      console.log(chalk.green(`✅ 源文档已保存到: ${sourceDocsTargetDir}`));
    } else {
      console.log(chalk.yellow(`⚠️  源文档目录不存在: ${sourceDocsDir}`));
      return;
    }

    // 2. 复制到 content/{sourceLanguage} 目录
    //    注意：
    //    - 排除上游的 _meta.* 导航文件，避免覆盖本库定制的导航
    //      （本库各语言包的 _meta 由站点自行维护，不应被上游同步覆盖）。
    //    - 排除 excludeFromTranslation 中的路径：这些是内部文档，既不翻译到
    //      目标语言，也不作为源语言页面发布，因此不拷进 content/<sourceLanguage>。
    await fs.ensureDir(contentSourceDir);
    // 箭头函数：递归拷贝需要访问 isExcludedFromTranslation（普通函数声明会丢 this）。
    const copyNormalized = async (dir: string): Promise<void> => {
      for (const item of await fs.readdir(dir)) {
        const src = path.join(dir, item);
        const relativePath = path
          .relative(sourceDocsTargetDir, src)
          .replace(/\\/g, "/");
        // 排除 excludeFromTranslation 中的内部文档：整棵子树跳过，
        // 与排除规则一致（这些路径不进 content/<sourceLanguage>）。
        if (this.isExcludedFromTranslation(relativePath)) continue;
        if ((await fs.stat(src)).isDirectory()) {
          await copyNormalized(src);
          continue;
        }
        if (isMetaFile(src)) continue;
        const dest = path.join(contentSourceDir, relativePath);
        await fs.ensureDir(path.dirname(dest));
        if (/\.(md|mdx)$/.test(item)) {
          await fs.writeFile(
            dest,
            normalizeMarkdownRelativeLinks(await fs.readFile(src, "utf8")),
            "utf8"
          );
        } else {
          await fs.copyFile(src, dest);
        }
      }
    };
    await copyNormalized(sourceDocsTargetDir);
    console.log(chalk.green(`✅ 源文档已复制到: ${contentSourceDir}`));

    // 3. Mirror language-agnostic assets (images etc.) into every
    //    target-language directory. Translation only produces .md; when a
    //    translated page references a relative asset (e.g. ./assets/*.png)
    //    that only exists under content/<sourceLanguage>, webpack fails
    //    with Module not found and the whole run's work is discarded
    //    (see #183). Assets are language-agnostic, so unconditional
    //    overwrite is safe. Mirror the stage-2 exclusions: skip _meta
    //    files and excludeFromTranslation paths.
    let mirroredAssets = 0;
    for (const lang of this.targetLanguages) {
      const targetDir = path.join(this.outputBasePath, "content", lang);
      await fs.ensureDir(targetDir);
      await fs.copy(sourceDocsTargetDir, targetDir, {
        overwrite: true,
        filter: (src) => {
          const relativePath = path
            .relative(sourceDocsTargetDir, src)
            .replace(/\\/g, "/");
          // Allow the root; never descend into excluded subtrees.
          if (!relativePath) return true;
          if (this.isExcludedFromTranslation(relativePath)) return false;
          if (isMetaFile(src)) return false;
          // fs-extra's copy only recurses into directories that pass the
          // filter. Use lstat, not stat: stat follows symlinks and throws
          // on broken ones, which would abort the whole run; fs-extra
          // copies symlinks as links regardless.
          const st = fs.lstatSync(src, { throwIfNoEntry: false });
          if (st?.isDirectory()) return true;
          // Mirror assets only. Never copy markdown (that would overwrite
          // translations with English) and no other file class either:
          // .json/.ts/extensionless files are not assets and could surface
          // as pages inside the site build.
          const ext = path.extname(src).toLowerCase();
          if (!ASSET_EXTENSIONS.has(ext)) return false;
          // Count once (first target language only) for the log line.
          if (lang === this.targetLanguages[0]) mirroredAssets++;
          return true;
        },
      });
    }
    if (mirroredAssets > 0) {
      console.log(
        chalk.green(
          `✅ 已镜像 ${mirroredAssets} 个资源文件到 ${this.targetLanguages.length} 个目标语言目录`
        )
      );
    }
  }

  /**
   * 翻译变更的文件
   */
  /**
   * 判断某文档（相对 docsPath 的路径）是否被配置排除翻译。
   * 规则：精确匹配文件名，或匹配某个目录前缀（pattern 或 pattern/...）。
   */
  private isExcludedFromTranslation(relativePath: string): boolean {
    return this.excludeFromTranslation.some((pattern) => {
      const p = pattern.replace(/\/+$/, ""); // 去掉末尾斜杠
      return relativePath === p || relativePath.startsWith(p + "/");
    });
  }

  async translateChangedFiles(
    changedFiles: string[]
  ): Promise<Record<string, TranslationResult>> {
    const languageConcurrency = Math.max(
      1,
      Math.min(
        this.targetLanguages.length,
        parseInt(process.env.QWEN_TRANSLATION_CONCURRENCY || "", 10) || 2
      )
    );
    // 文件级并发：每种语言内部同时翻译多少个文件。默认 6；设为 1 即
    // 退化为原来的串行行为。总并发 = languageConcurrency × fileConcurrency。
    const fileConcurrency = Math.max(
      1,
      parseInt(process.env.QWEN_FILE_CONCURRENCY || "", 10) || 6
    );
    console.log(
      chalk.yellow(
        `🌍 开始翻译 ${this.targetLanguages.length} 种语言（语言并发: ${languageConcurrency}, 文件并发: ${fileConcurrency}）...`
      )
    );

    // 在并行翻译前构造翻译器（此处会校验 OPENAI_API_KEY，缺失则尽早抛错）
    const translator = this.getTranslator();

    const translateLanguage = async (language: string) => {
      const result: TranslationResult = {
        success: 0,
        failed: 0,
        files: [],
        failedFiles: [],
      };

      console.log(chalk.blue(`🚀 启动 ${language} 翻译任务`));

      await mapWithConcurrency(changedFiles, fileConcurrency, async (file) => {
        try {
          const relativePath = file.replace(`${this.docsPath}/`, "");

          // 跳过上游导航文件：本库各语言包的 _meta 由站点自行维护，
          // 不应被上游同步翻译并覆盖。
          if (isMetaFile(relativePath)) {
            console.log(
              chalk.gray(`  ↪ 跳过导航文件（不覆盖本地 _meta）: ${relativePath}`)
            );
            return;
          }

          // 跳过配置中排除的内部文档：不翻译到目标语言。
          // 这些文档也已在 updateBaseDocs 中被排除，不会拷进
          // content/<sourceLanguage>，因此完全不在站点发布。
          if (this.isExcludedFromTranslation(relativePath)) {
            console.log(
              chalk.gray(`  ↪ 跳过翻译（excludeFromTranslation）: ${relativePath}`)
            );
            return;
          }
          const sourcePath = path.join(
            this.outputBasePath,
            "content",
            this.sourceLanguage,
            relativePath
          );
          // 翻译到 content/{targetLanguage} 目录
          const targetPath = path.join(
            this.outputBasePath,
            "content",
            language,
            relativePath
          );

          // 确保目标目录存在
          await fs.ensureDir(path.dirname(targetPath));

          // 检查源文件是否存在
          if (!(await fs.pathExists(sourcePath))) {
            console.log(chalk.yellow(`⚠️  源文件不存在: ${sourcePath}`));
            return;
          }

          // 翻译文件
          const translatedContent = await translator.translateDocument(
            sourcePath,
            language
          );
          await fs.writeFile(targetPath, translatedContent, "utf-8");

          console.log(chalk.green(`✅ ${language}: ${relativePath}`));

          result.success++;
          result.files.push(relativePath);
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(chalk.red(`❌ ${language}: ${file} - ${message}`));
          result.failed++;
          result.failedFiles.push(file.replace(`${this.docsPath}/`, ""));
        }
      });

      console.log(
        chalk.blue(
          `📊 ${language} 翻译完成: ${result.success} 成功, ${result.failed} 失败`
        )
      );

      return { language, result };
    };

    // 限制语言级并发，避免云端兼容接口在多路长输出请求下提前断流。
    const languageResults: {
      language: string;
      result: TranslationResult;
    }[] = [];
    for (let i = 0; i < this.targetLanguages.length; i += languageConcurrency) {
      const batch = this.targetLanguages.slice(i, i + languageConcurrency);
      const batchResults = await Promise.all(batch.map(translateLanguage));
      languageResults.push(...batchResults);
    }

    // 整理结果
    const results: Record<string, TranslationResult> = {};
    for (const { language, result } of languageResults) {
      results[language] = result;
    }

    return results;
  }

  /**
   * 获取上次同步记录
   */
  async getLastSyncRecord(): Promise<SyncRecord> {
    try {
      if (await fs.pathExists(this.lastSyncFile)) {
        return await fs.readJson(this.lastSyncFile);
      }
    } catch (error) {
      console.log(chalk.yellow("⚠️  无法读取同步记录，将执行完整同步"));
    }

    return {
      commit: null,
      timestamp: null,
      files: [],
    };
  }

  /**
   * 保存翻译日志
   */
  async saveTranslationChangelog(
    commitHash: string,
    changedFiles: string[],
    translationResults: Record<string, TranslationResult>
  ): Promise<void> {
    const entry: TranslationChangelogEntry = {
      timestamp: new Date().toISOString(),
      commit: commitHash,
      sourceLanguage: this.sourceLanguage,
      translatedFiles: {},
      stats: {
        totalFiles: changedFiles.length,
        languages: this.targetLanguages.length,
        successCount: 0,
        failedCount: 0,
      },
    };

    // 整理翻译结果
    for (const [language, result] of Object.entries(translationResults)) {
      entry.translatedFiles[language] = {
        success: result.files,
        failed: result.failedFiles,
      };
      entry.stats.successCount += result.success;
      entry.stats.failedCount += result.failed;
    }

    // 读取现有日志
    let changelog: TranslationChangelogEntry[] = [];
    try {
      if (await fs.pathExists(this.changelogFile)) {
        changelog = await fs.readJson(this.changelogFile);
      }
    } catch (error) {
      console.log(chalk.yellow("⚠️  无法读取翻译日志，创建新日志"));
    }

    // 添加新条目
    changelog.unshift(entry); // 新记录在前面

    // 保持最近100条记录
    changelog = changelog.slice(0, 100);

    // 保存日志
    await fs.ensureDir(path.dirname(this.changelogFile));
    await fs.writeJson(this.changelogFile, changelog, { spaces: 2 });

    console.log(chalk.blue(`📝 翻译日志已更新: ${commitHash.substring(0, 8)}`));
  }

  /**
   * 更新同步记录
   */
  async updateSyncRecord(commitHash: string): Promise<void> {
    const record: SyncRecord = {
      commit: commitHash,
      timestamp: new Date().toISOString(),
      files: [],
    };

    await fs.ensureDir(path.dirname(this.lastSyncFile));
    await fs.writeJson(this.lastSyncFile, record, { spaces: 2 });

    console.log(chalk.blue(`📝 同步记录已更新: ${commitHash.substring(0, 8)}`));
  }

  /**
   * 生成变更报告
   */
  generateChangeReport(results: SyncResult): string {
    const lines: string[] = [];
    lines.push("# 文档同步报告\n");
    lines.push(`**同步时间**: ${new Date().toLocaleString()}\n`);
    lines.push(`**变更文件数**: ${results.changes}\n`);

    if (results.files.length > 0) {
      lines.push("## 变更文件\n");
      for (const file of results.files) {
        lines.push(`- ${file}`);
      }
      lines.push("");
    }

    if (results.translations) {
      lines.push("## 翻译结果\n");
      for (const [lang, result] of Object.entries(results.translations)) {
        lines.push(`### ${lang.toUpperCase()}`);
        lines.push(`- 成功: ${result.success}`);
        lines.push(`- 失败: ${result.failed}`);
        lines.push("");
      }
    }

    return lines.join("\n");
  }

  /**
   * 清理临时文件
   */
  async cleanup(): Promise<void> {
    // 清理项目根目录下的临时目录
    const tempDir = path.join(this.projectRoot, ".temp-source-repo");
    if (await fs.pathExists(tempDir)) {
      await fs.remove(tempDir);
      console.log(chalk.blue("🧹 临时文件已清理"));
    }
  }
}

export default SyncManager;

// 如果直接运行此文件，执行同步
if (require.main === module) {
  async function main() {
    const syncManager = new SyncManager();
    try {
      const result = await syncManager.syncDocuments();
      console.log(chalk.green("🎉 同步完成！"));
      console.log(result);
    } catch (error: any) {
      console.error(chalk.red("❌ 同步失败："), error.message);
      process.exit(1);
    }
  }

  main();
}
