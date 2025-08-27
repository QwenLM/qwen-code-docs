const GITHUB_PAGE_PREFIX = "qwen-code-docs";
export const locales = ["en", "zh", "de", "fr", "ru", "ja"];

export const getAssetPrefix = () => {
  const isProduction = process.env.NODE_ENV === "production";
  const assetPrefix = isProduction ? `/${GITHUB_PAGE_PREFIX}` : "";
  return assetPrefix;
};
