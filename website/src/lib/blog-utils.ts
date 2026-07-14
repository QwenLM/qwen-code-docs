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

export function getBasePath(): string {
  return BASE_PATH;
}

interface CategoryInfo {
  title: string;
  description: string;
}

const CATEGORY_I18N: Record<string, Record<string, CategoryInfo>> = {
  quickstart: {
    zh: { title: "入门", description: "了解 Qwen Code 的核心概念，快速上手 AI 编程。" },
    en: { title: "Getting Started", description: "Learn core concepts of Qwen Code and start AI coding quickly." },
    de: { title: "Einstieg", description: "Lernen Sie die Kernkonzepte von Qwen Code und starten Sie schnell mit KI-Programmierung." },
    fr: { title: "Démarrage", description: "Découvrez les concepts fondamentaux de Qwen Code et commencez rapidement la programmation IA." },
    ja: { title: "はじめに", description: "Qwen Code のコアコンセプトを学び、AI プログラミングを素早く始めましょう。" },
    ru: { title: "Начало работы", description: "Изучите основные концепции Qwen Code и быстро начните программировать с ИИ." },
    "pt-BR": { title: "Introdução", description: "Aprenda os conceitos fundamentais do Qwen Code e comece a programar com IA rapidamente." },
  },
  cases: {
    zh: { title: "实战案例", description: "真实使用场景和教程，从办公自动化到代码开发。" },
    en: { title: "Use Cases", description: "Real-world scenarios and tutorials, from office automation to code development." },
    de: { title: "Anwendungsfälle", description: "Reale Szenarien und Tutorials, von Büroautomatisierung bis Codeentwicklung." },
    fr: { title: "Cas d'utilisation", description: "Scénarios réels et tutoriels, de l'automatisation bureautique au développement de code." },
    ja: { title: "活用事例", description: "オフィス自動化からコード開発まで、実際の使用シナリオとチュートリアル。" },
    ru: { title: "Примеры использования", description: "Реальные сценарии и руководства: от автоматизации офиса до разработки кода." },
    "pt-BR": { title: "Casos de Uso", description: "Cenários reais e tutoriais, desde automação de escritório até desenvolvimento de código." },
  },
  advanced: {
    zh: { title: "进阶应用", description: "Skills、百炼 CLI、公众号封面等高级功能指南。" },
    en: { title: "Advanced", description: "Advanced guides for Skills, Bailian CLI, WeChat cover generation, and more." },
    de: { title: "Fortgeschritten", description: "Erweiterte Anleitungen für Skills, Bailian CLI, WeChat-Cover-Generierung und mehr." },
    fr: { title: "Avancé", description: "Guides avancés pour Skills, Bailian CLI, génération de couvertures WeChat, etc." },
    ja: { title: "上級ガイド", description: "Skills、Bailian CLI、WeChat カバー生成などの高度な機能ガイド。" },
    ru: { title: "Продвинутый", description: "Расширенные руководства по Skills, Bailian CLI, генерации обложек WeChat и другому." },
    "pt-BR": { title: "Avançado", description: "Guias avançados para Skills, Bailian CLI, geração de capas WeChat e mais." },
  },
  updates: {
    zh: { title: "周报更新", description: "每周产品版本发布记录、新功能与社区动态。" },
    en: { title: "Weekly Updates", description: "Weekly product releases, new features, and community highlights." },
    de: { title: "Wöchentliche Updates", description: "Wöchentliche Produktveröffentlichungen, neue Funktionen und Community-Highlights." },
    fr: { title: "Mises à jour hebdomadaires", description: "Versions hebdomadaires, nouvelles fonctionnalités et actualités communautaires." },
    ja: { title: "週次アップデート", description: "毎週の製品リリース、新機能、コミュニティのハイライト。" },
    ru: { title: "Еженедельные обновления", description: "Еженедельные релизы, новые функции и новости сообщества." },
    "pt-BR": { title: "Atualizações Semanais", description: "Lançamentos semanais, novos recursos e destaques da comunidade." },
  },
};

const BLOG_I18N: Record<string, Record<string, string>> = {
  blogTitle: {
    zh: "Qwen Code 博客",
    en: "Qwen Code Blog",
    de: "Qwen Code Blog",
    fr: "Blog Qwen Code",
    ja: "Qwen Code ブログ",
    ru: "Блог Qwen Code",
    "pt-BR": "Blog Qwen Code",
  },
  blogDescription: {
    zh: "获取产品更新、AI 编程实践、功能发布和真实案例。",
    en: "Product updates, AI coding practices, feature releases, and real-world cases.",
    de: "Produktupdates, KI-Programmierpraktiken, Funktionsveröffentlichungen und reale Fälle.",
    fr: "Mises à jour produit, pratiques de codage IA, sorties de fonctionnalités et cas réels.",
    ja: "製品アップデート、AI プログラミング実践、機能リリース、実際の活用事例。",
    ru: "Обновления продукта, практики AI-программирования, выпуски функций и реальные кейсы.",
    "pt-BR": "Atualizações de produto, práticas de codificação IA, lançamentos e casos reais.",
  },
  recentUpdates: {
    zh: "最近更新",
    en: "Recent Updates",
    de: "Aktuelle Updates",
    fr: "Mises à jour récentes",
    ja: "最近の更新",
    ru: "Последние обновления",
    "pt-BR": "Atualizações Recentes",
  },
  withinDays: {
    zh: "天内",
    en: "days",
    de: "Tagen",
    fr: "jours",
    ja: "日以内",
    ru: "дней",
    "pt-BR": "dias",
  },
  articles: {
    zh: "篇文章",
    en: "articles",
    de: "Artikel",
    fr: "articles",
    ja: "件の記事",
    ru: "статей",
    "pt-BR": "artigos",
  },
  noArticles: {
    zh: "暂无文章",
    en: "No articles yet",
    de: "Noch keine Artikel",
    fr: "Aucun article pour le moment",
    ja: "記事はまだありません",
    ru: "Статей пока нет",
    "pt-BR": "Nenhum artigo ainda",
  },
};

export function getCategoryInfo(directory: string, lang: string): CategoryInfo {
  const fallback = { title: directory, description: "" };
  return CATEGORY_I18N[directory]?.[lang] || CATEGORY_I18N[directory]?.["en"] || fallback;
}

export function getBlogText(key: keyof typeof BLOG_I18N, lang: string): string {
  return BLOG_I18N[key]?.[lang] || BLOG_I18N[key]?.["en"] || key;
}

export interface BlogPost {
  title: string;
  date: string;
  description: string;
  author: string;
  route: string;
  category: string;
}

export function extractPosts(pageMap: any[]): BlogPost[] {
  const posts: BlogPost[] = [];

  for (const item of pageMap) {
    if (item.children) {
      for (const child of item.children) {
        if (child.frontMatter && child.route && child.name !== "index") {
          posts.push({
            title: child.frontMatter.title || child.name,
            date: child.frontMatter.date || "",
            description: child.frontMatter.description || "",
            author: child.frontMatter.author || "",
            route: child.route,
            category: item.name,
          });
        }
      }
    } else if (
      item.frontMatter &&
      item.route &&
      item.name !== "index" &&
      item.name !== "recent-update"
    ) {
      posts.push({
        title: item.frontMatter.title || item.name,
        date: item.frontMatter.date || "",
        description: item.frontMatter.description || "",
        author: item.frontMatter.author || "",
        route: item.route,
        category: "root",
      });
    }
  }

  return posts;
}

export function sortPostsByDate(posts: BlogPost[]): BlogPost[] {
  return [...posts].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}
