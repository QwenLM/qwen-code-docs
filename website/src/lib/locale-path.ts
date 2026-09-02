const SUPPORTED_LOCALES = [
  "en",
  "zh",
  "de",
  "fr",
  "ru",
  "ja",
  "pt-BR",
  "ko",
] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

/** Returns the route locale after removing an optional deployment base path. */
export function getLocaleFromPathname(
  pathname: string,
  basePath = ""
): SupportedLocale | undefined {
  const routePath =
    basePath && (pathname === basePath || pathname.startsWith(`${basePath}/`))
      ? pathname.slice(basePath.length)
      : pathname;
  const locale = routePath.split("/").find(Boolean);

  return SUPPORTED_LOCALES.find((supported) => supported === locale);
}
