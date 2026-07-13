export const NEW_BADGE_DAYS = 7;

const LOCALE_MAP: Record<string, string> = {
  zh: "zh-CN",
  en: "en-US",
  de: "de-DE",
  fr: "fr-FR",
  ru: "ru-RU",
  ja: "ja-JP",
  "pt-BR": "pt-BR",
};

export function getLocale(lang: string): string {
  return LOCALE_MAP[lang] || lang;
}

export function isWithinDays(dateStr: string, days: number): boolean {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return false;
  return Date.now() - date.getTime() < days * 24 * 60 * 60 * 1000;
}

const BASE_PATH = process.env.NODE_ENV === "production" ? "/qwen-code-docs" : "";

export function normalizeHref(href: string): string {
  return href.replace(BASE_PATH, "").replace(/\/$/, "");
}
