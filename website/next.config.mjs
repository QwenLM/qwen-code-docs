import nextra from "nextra";

const withNextra = nextra({
  latex: true,
  search: {
    codeblocks: false,
  },
  contentDirBasePath: "/",
  unstable_shouldAddLocaleToLinks: true,
});

export default withNextra({
  reactStrictMode: true,
  i18n: {
    locales: ["en", "zh", "de", "fr", "ru", "ja"],
    defaultLocale: "en",
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  output: "export",
  images: {
    unoptimized: true, // mandatory, otherwise won't export
  },
});
