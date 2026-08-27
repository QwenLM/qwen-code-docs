import fs from "fs-extra";
import path from "path";
import dotenv from "dotenv";

/**
 * 环境变量加载器
 * 支持从项目根目录的.env文件或系统环境变量中读取配置
 */
export class EnvLoader {
  private projectRoot: string;
  private envLoaded: boolean = false;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  /**
   * 加载环境变量
   * 优先级：系统环境变量 > .env文件
   */
  loadEnv(): void {
    if (this.envLoaded) {
      return;
    }

    // 尝试从项目根目录加载.env文件
    const envPath = path.join(this.projectRoot, ".env");

    if (fs.pathExistsSync(envPath)) {
      console.log(`📄 从项目根目录加载环境变量: ${envPath}`);
      dotenv.config({ path: envPath });
    } else {
      console.log("⚠️  项目根目录未找到.env文件，使用系统环境变量");
    }

    // 验证必要的环境变量
    this.validateRequiredEnvVars();

    this.envLoaded = true;
  }

  /**
   * 验证必要的环境变量
   */
  private validateRequiredEnvVars(): void {
    const requiredVars = ["OPENAI_API_KEY"];
    const missingVars: string[] = [];

    for (const varName of requiredVars) {
      if (!process.env[varName]) {
        missingVars.push(varName);
      }
    }

    if (missingVars.length > 0) {
      throw new Error(
        `缺少必要的环境变量: ${missingVars.join(", ")}\n` +
          `请在项目根目录创建.env文件或设置系统环境变量:\n` +
          `OPENAI_API_KEY=your_api_key_here\n` +
          `OPENAI_BASE_URL=https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1 (可选)\n` +
          `QWEN_MODEL=deepseek-v4-flash (可选)\n` +
          `QWEN_MAX_TOKENS=32768 (可选)`
      );
    }
  }

  /**
   * 获取环境变量值
   */
  getEnvVar(key: string, defaultValue?: string): string | undefined {
    return process.env[key] || defaultValue;
  }

  /**
   * 获取API配置
   */
  getApiConfig() {
    const apiKey = this.getEnvVar("OPENAI_API_KEY");
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY 环境变量未设置");
    }

    return {
      apiKey,
      baseURL: this.getEnvVar(
        "OPENAI_BASE_URL",
        "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1"
      )!,
      model: this.getEnvVar("QWEN_MODEL", "deepseek-v4-flash")!,
      maxTokens: parseInt(this.getEnvVar("QWEN_MAX_TOKENS", "32768")!),
    };
  }
}

/**
 * 创建环境变量加载器实例
 */
export function createEnvLoader(projectRoot: string): EnvLoader {
  return new EnvLoader(projectRoot);
}
