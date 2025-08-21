import nextra from "nextra";

const withNextra = nextra({
  latex: true,
  search: {
    codeblocks: false,
  },
  contentDirBasePath: "/",
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
});
