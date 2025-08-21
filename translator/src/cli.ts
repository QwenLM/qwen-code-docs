#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import inquirer from "inquirer";
import fs from "fs-extra";
import path from "path";
import { SyncManager } from "./sync";
import { DocumentTranslator } from "./translator";

/**
 * CLI project configuration interface
 */
interface ProjectConfig {
  name: string;
  sourceRepo: string;
  docsPath: string;
  sourceLanguage: string; // Source document language
  targetLanguages: string[];
  outputDir: string;
}

/**
 * Translation CLI application
 */
class TranslationCLI {
  private projectConfigPath: string;
  private globalConfigDir: string;

  constructor() {
    this.projectConfigPath = path.resolve(
      process.cwd(),
      "translation.config.json"
    );
    this.globalConfigDir = path.join(
      require("os").homedir(),
      ".qwen-translation"
    );
  }

  /**
   * Initialize new translation project
   */
  async initProject(): Promise<void> {
    console.log(chalk.blue("🚀 Initializing document translation project"));
    console.log(chalk.gray("Please provide the following project configuration:\n"));

    const answers = await inquirer.prompt([
      {
        type: "input",
        name: "name",
        message: "Project name:",
        default: path.basename(process.cwd()),
        validate: (input: string) =>
          input.trim().length > 0 || "Project name cannot be empty",
      },
      {
        type: "input",
        name: "sourceRepo",
        message: "Source repository URL:",
        default: "https://github.com/QwenLM/qwen-code.git",
        validate: (input: string) => {
          const urlPattern = /^https?:\/\/.+\.git$/;
          return (
            urlPattern.test(input) || "Please enter a valid Git repository URL (ending with .git)"
          );
        },
      },
      {
        type: "input",
        name: "docsPath",
        message: "Documentation path in repository:",
        default: "docs",
        validate: (input: string) =>
          input.trim().length > 0 || "Documentation path cannot be empty",
      },
      {
        type: "list",
        name: "sourceLanguage",
        message: "Select source document language:",
        choices: [
          { name: "English (en)", value: "en" },
          { name: "Chinese (zh)", value: "zh" },
          { name: "German (de)", value: "de" },
          { name: "French (fr)", value: "fr" },
          { name: "Russian (ru)", value: "ru" },
          { name: "Japanese (ja)", value: "ja" },
        ],
        default: "en",
      },
      {
        type: "checkbox",
        name: "targetLanguages",
        message: "Select target languages for translation:",
        choices: [
          { name: "Chinese (zh)", value: "zh", checked: true },
          { name: "German (de)", value: "de", checked: true },
          { name: "French (fr)", value: "fr", checked: true },
          { name: "Russian (ru)", value: "ru", checked: true },
          { name: "Japanese (ja)", value: "ja", checked: false },
        ],
        validate: (choices: string[]) =>
          choices.length > 0 || "Please select at least one target language",
      },
      {
        type: "input",
        name: "outputDir",
        message: "Translation output directory:",
        default: "content",
        validate: (input: string) =>
          input.trim().length > 0 || "Output directory cannot be empty",
      },
    ]);

    const projectConfig: ProjectConfig = {
      name: answers.name,
      sourceRepo: answers.sourceRepo,
      docsPath: answers.docsPath,
      sourceLanguage: answers.sourceLanguage,
      targetLanguages: answers.targetLanguages,
      outputDir: answers.outputDir,
    };

    // Copy nextra-template to target location
    await this.copyNextraTemplate();

    // Save project configuration
    await this.saveProjectConfig(projectConfig);

    // Update .gitignore file
    await this.updateGitignore();

    // Copy .env example file
    await this.copyEnvExample();

    console.log(chalk.green("\n✅ Project initialization completed!"));
    console.log(chalk.yellow(`📝 Project configuration saved to: ${this.projectConfigPath}`));
    console.log(chalk.blue("\n📋 Next steps:"));
    console.log(chalk.gray("1. Configure environment variables:"));
    console.log(chalk.gray("   cp .env.example .env"));
    console.log(chalk.gray("   # Edit .env file and add your API keys"));
    console.log(chalk.gray("2. Run commands:"));
    console.log(chalk.gray("   qwen-translation sync     # Sync source repository docs"));
    console.log(chalk.gray("   qwen-translation translate # Translate documents"));
    console.log(chalk.gray("   qwen-translation config    # View/modify configuration"));
    console.log(chalk.gray("   npm install               # Install dependencies"));
    console.log(chalk.gray("   npm run dev               # Start development server"));
  }

  /**
   * Copy nextra-template to target location
   */
  async copyNextraTemplate(): Promise<void> {
    console.log(chalk.blue("📦 Copying Nextra template..."));

    // Get template path (relative to current execution location)
    const templatePath = path.resolve(__dirname, "../nextra-template");
    const targetPath = process.cwd();

    try {
      // Check if template exists
      if (!(await fs.pathExists(templatePath))) {
        throw new Error(`Template path does not exist: ${templatePath}`);
      }

      // Copy template files to target location
      await fs.copy(templatePath, targetPath, {
        overwrite: false, // Don't overwrite existing files
        filter: (src) => {
          // Exclude files/directories that don't need to be copied
          const excludePatterns = [
            ".next",
            "node_modules",
            ".git",
            "package-lock.json",
            "pnpm-lock.yaml",
            "yarn.lock",
          ];

          const relativePath = path.relative(templatePath, src);
          return !excludePatterns.some((pattern) =>
            relativePath.includes(pattern)
          );
        },
      });

      // Update project name in package.json
      const packageJsonPath = path.join(targetPath, "package.json");
      if (await fs.pathExists(packageJsonPath)) {
        const packageJson = await fs.readJson(packageJsonPath);
        packageJson.name = path.basename(targetPath);
        await fs.writeJson(packageJsonPath, packageJson, { spaces: 2 });
      }

      console.log(chalk.green("✅ Nextra template copied successfully"));
    } catch (error: any) {
      if (error.code === "EEXIST") {
        console.log(chalk.yellow("⚠️  Target directory already contains files, skipping copy"));
      } else {
        throw new Error(`Failed to copy template: ${error.message}`);
      }
    }
  }



  /**
   * Update .gitignore file, add translation-related ignore rules
   */
  async updateGitignore(): Promise<void> {
    console.log(chalk.blue("📝 Updating .gitignore file..."));

    const gitignorePath = path.join(process.cwd(), ".gitignore");
    const translationIgnoreRules = [
      "",
      "# Translation tool generated files",
      ".temp-source-repo/",
      ".source-docs/",
      "last-sync.json",
      "",
    ];

    try {
      let gitignoreContent = "";

      // Read existing .gitignore file
      if (await fs.pathExists(gitignorePath)) {
        gitignoreContent = await fs.readFile(gitignorePath, "utf8");
      }

      // Check if translation-related ignore rules are already included
      const hasTranslationRules = translationIgnoreRules.some(
        (rule) => rule.trim() && gitignoreContent.includes(rule.trim())
      );

      if (!hasTranslationRules) {
        // Add translation-related ignore rules
        const updatedContent =
          gitignoreContent + translationIgnoreRules.join("\n");
        await fs.writeFile(gitignorePath, updatedContent);
        console.log(chalk.green("✅ .gitignore file updated successfully"));
      } else {
        console.log(
          chalk.yellow("⚠️  .gitignore file already contains translation rules, skipping update")
        );
      }
    } catch (error: any) {
      console.log(
        chalk.yellow(`⚠️  Failed to update .gitignore file: ${error.message}`)
      );
    }
  }

  /**
   * Copy .env example file
   */
  async copyEnvExample(): Promise<void> {
    console.log(chalk.blue("📄 Copying .env example file..."));

    const examplePath = path.join(__dirname, "../env.example");
    const targetPath = path.join(process.cwd(), ".env.example");

    try {
      if (await fs.pathExists(examplePath)) {
        await fs.copy(examplePath, targetPath);
        console.log(chalk.green("✅ .env example file copied successfully"));
        console.log(
          chalk.yellow("💡 Please copy .env.example to .env and add your API keys")
        );
      } else {
        console.log(chalk.yellow("⚠️  .env example file does not exist, skipping copy"));
      }
    } catch (error: any) {
      console.log(chalk.yellow(`⚠️  Failed to copy .env example file: ${error.message}`));
    }
  }

  /**
   * Sync source repository documents
   */
  async syncDocuments(force: boolean = false): Promise<void> {
    const projectConfig = await this.loadProjectConfig();
    if (!projectConfig) {
      console.error(
        chalk.red("❌ Project not initialized, please run 'qwen-translation init' first")
      );
      return;
    }

    console.log(chalk.blue("🔄 Starting document synchronization..."));

    const syncManager = new SyncManager({
      sourceRepo: projectConfig.sourceRepo,
      docsPath: projectConfig.docsPath,
      sourceLanguage: projectConfig.sourceLanguage, // 传递源语言
      projectRoot: process.cwd(), // 传递项目根目录
      targetLanguages: projectConfig.targetLanguages, // 传递目标语言
      outputDir: projectConfig.outputDir, // 传递输出目录
    });

    try {
      const result = await syncManager.syncDocuments(force);

      if (result.success) {
        console.log(chalk.green(`✅ Sync completed! Changed files: ${result.changes}`));

        if (result.files.length > 0) {
          console.log(chalk.blue("\n📄 Changed files:"));
          result.files.forEach((file) => {
            console.log(chalk.gray(`  - ${file}`));
          });
        }

        if (result.translations) {
          console.log(chalk.blue("\n🌍 Translation results:"));
          Object.entries(result.translations).forEach(([lang, stats]) => {
            console.log(
              chalk.gray(
                `  ${lang}: ${stats.success} successful, ${stats.failed} failed`
              )
            );
          });
        }
      }
    } catch (error: any) {
      console.error(chalk.red(`❌ Sync failed: ${error.message}`));
      process.exit(1);
    }
  }

  /**
   * Translate documents
   */
  async translateDocuments(options: {
    language?: string;
    file?: string;
  }): Promise<void> {
    const projectConfig = await this.loadProjectConfig();
    if (!projectConfig) {
      console.error(
        chalk.red("❌ Project not initialized, please run 'qwen-translation init' first")
      );
      return;
    }

    const translator = new DocumentTranslator({
      projectRoot: process.cwd(),
    });
    const languages = options.language
      ? [options.language]
      : projectConfig.targetLanguages;

    console.log(chalk.blue(`🌍 Starting document translation (${languages.join(", ")})...`));

    try {
      for (const lang of languages) {
        console.log(chalk.yellow(`\n📝 Translating to ${lang}...`));

        const sourceDir = path.resolve(
          process.cwd(),
          "content",
          projectConfig.sourceLanguage
        );
        const targetDir = path.resolve(process.cwd(), "content", lang);

        if (options.file) {
          // Translate single file
          const sourcePath = path.join(sourceDir, options.file);
          const targetPath = path.join(targetDir, options.file);

          await fs.ensureDir(path.dirname(targetPath));
          const translatedContent = await translator.translateDocument(
            sourcePath,
            lang
          );
          await fs.writeFile(targetPath, translatedContent, "utf-8");

          console.log(chalk.green(`✅ ${options.file} -> ${lang}`));
        } else {
          // Translate entire directory
          await translator.translateDirectory(sourceDir, targetDir, lang);
        }
      }

      console.log(chalk.green("\n🎉 Document translation completed!"));
    } catch (error: any) {
      console.error(chalk.red(`❌ Translation failed: ${error.message}`));
      process.exit(1);
    }
  }

  /**
   * Display and modify configuration
   */
  async manageConfig(): Promise<void> {
    const projectConfig = await this.loadProjectConfig();
    if (!projectConfig) {
      console.error(
        chalk.red("❌ Project not initialized, please run 'qwen-translation init' first")
      );
      return;
    }

    const { action } = await inquirer.prompt([
      {
        type: "list",
        name: "action",
        message: "Select configuration action:",
        choices: [
          { name: "View project configuration", value: "view-project" },
          { name: "Edit project configuration", value: "edit-project" },
        ],
      },
    ]);

    switch (action) {
      case "view-project":
        console.log(chalk.blue("\n📋 Project configuration:"));
        console.log(JSON.stringify(projectConfig, null, 2));
        break;

      case "edit-project":
        await this.editProjectConfig(projectConfig);
        break;
    }
  }

  /**
   * Edit project configuration
   */
  async editProjectConfig(currentConfig: ProjectConfig): Promise<void> {
    const answers = await inquirer.prompt([
      {
        type: "input",
        name: "sourceRepo",
        message: "Source repository URL:",
        default: currentConfig.sourceRepo,
      },
      {
        type: "input",
        name: "docsPath",
        message: "Documentation path:",
        default: currentConfig.docsPath,
      },
      {
        type: "checkbox",
        name: "targetLanguages",
        message: "Target languages:",
        choices: [
          { name: "Chinese (zh)", value: "zh" },
          { name: "German (de)", value: "de" },
          { name: "French (fr)", value: "fr" },
          { name: "Russian (ru)", value: "ru" },
          { name: "Japanese (ja)", value: "ja" },
        ],
        default: currentConfig.targetLanguages,
      },
    ]);

    const updatedConfig = { ...currentConfig, ...answers };
    await this.saveProjectConfig(updatedConfig);
    console.log(chalk.green("✅ Project configuration updated successfully"));
  }


  /**
   * Save project configuration
   */
  async saveProjectConfig(config: ProjectConfig): Promise<void> {
    await fs.writeFile(
      this.projectConfigPath,
      JSON.stringify(config, null, 2),
      "utf-8"
    );
  }

  /**
   * Load project configuration
   */
  async loadProjectConfig(): Promise<ProjectConfig | null> {
    try {
      if (await fs.pathExists(this.projectConfigPath)) {
        const content = await fs.readFile(this.projectConfigPath, "utf-8");
        return JSON.parse(content) as ProjectConfig;
      }
    } catch (error) {
      console.error(chalk.yellow("⚠️  Unable to load project configuration"));
    }
    return null;
  }

  /**
   * Show status information
   */
  async showStatus(): Promise<void> {
    const projectConfig = await this.loadProjectConfig();

    console.log(chalk.blue("📊 Project Status"));

    if (!projectConfig) {
      console.log(chalk.red("❌ Project not initialized"));
      console.log(chalk.gray("💡 Run 'qwen-translation init' to initialize project"));
      return;
    }

    console.log(chalk.green("✅ Project initialized"));
    console.log(chalk.gray(`  Project name: ${projectConfig.name}`));
    console.log(chalk.gray(`  Source repository: ${projectConfig.sourceRepo}`));
    console.log(chalk.gray(`  Documentation path: ${projectConfig.docsPath}`));
    console.log(chalk.gray(`  Source language: ${projectConfig.sourceLanguage}`));
    console.log(
      chalk.gray(`  Target languages: ${projectConfig.targetLanguages.join(", ")}`)
    );
    console.log(chalk.gray(`  Output directory: ${projectConfig.outputDir}`));

    // Check environment variables
    console.log(chalk.blue("\n🔑 Environment Configuration"));
    const requiredEnvVars = ["OPENAI_API_KEY"];
    const optionalEnvVars = ["OPENAI_BASE_URL", "QWEN_MODEL"];

    for (const envVar of requiredEnvVars) {
      if (process.env[envVar]) {
        console.log(chalk.green(`✅ ${envVar}: Configured`));
      } else {
        console.log(chalk.red(`❌ ${envVar}: Not configured`));
      }
    }

    for (const envVar of optionalEnvVars) {
      if (process.env[envVar]) {
        console.log(chalk.blue(`💡 ${envVar}: ${process.env[envVar]}`));
      }
    }
  }
}

/**
 * Main function - Setup CLI commands
 */
async function main() {
  const cli = new TranslationCLI();
  const program = new Command();

  program
    .name("qwen-translation")
    .description("AI-powered document translation tool")
    .version("1.0.0");

  // init command
  program
    .command("init")
    .description("Initialize new translation project")
    .action(async () => {
      await cli.initProject();
    });

  // sync command
  program
    .command("sync")
    .description("Sync source repository documents")
    .option("-f, --force", "Force sync all documents")
    .action(async (options) => {
      await cli.syncDocuments(options.force);
    });

  // translate command
  program
    .command("translate")
    .description("Translate documents")
    .option("-l, --language <lang>", "Specify target language")
    .option("-f, --file <file>", "Specify file to translate")
    .action(async (options) => {
      await cli.translateDocuments(options);
    });

  // config command
  program
    .command("config")
    .description("Manage configuration")
    .action(async () => {
      await cli.manageConfig();
    });

  // status command
  program
    .command("status")
    .description("Show project status")
    .action(async () => {
      await cli.showStatus();
    });

  // Parse command line arguments
  await program.parseAsync(process.argv);
}

// Run main function
if (require.main === module) {
  main().catch((error) => {
    console.error(chalk.red("❌ Program execution failed:"), error.message);
    process.exit(1);
  });
}

export { TranslationCLI };
