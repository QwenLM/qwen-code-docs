import nextra from "nextra";

const withNextra = nextra({
  latex: true,
  search: {
    codeblocks: false,
  },
  defaultShowCopyCode: true,
  contentDirBasePath: "/",
  unstable_shouldAddLocaleToLinks: true,
});

const isProduction = process.env.NODE_ENV === "production";
const assetPrefix = isProduction ? "/qwen-code-docs" : "";

export default withNextra({
  reactStrictMode: true,
  basePath: assetPrefix,
  assetPrefix: assetPrefix,
  i18n: {
    locales: ["en", "zh", "de", "fr", "ru", "ja", "pt-BR"],
    defaultLocale: "en",
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  output: "export",
  trailingSlash: true,
  images: {
    unoptimized: true, // mandatory, otherwise won't export
  },
  webpack(config, { dev, isServer }) {
    if (dev && isServer) {
      // Next.js 的 eval-source-map devtool 会把所有模块源码内联到单个 page.js，
      // 多语言内容扩展后文件超过 V8 512MB 字符串限制。通过 plugin 在 compiler
      // 层面关闭 devtool，绕过 Next.js 对 devtool 的 revert 检查。
      config.plugins.push({
        apply(compiler) {
          compiler.options.devtool = false;
        },
      });
    }
    return config;
  },
});
