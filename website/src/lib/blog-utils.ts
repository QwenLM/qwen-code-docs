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
  pastUpdates: {
    zh: "往期更新",
    en: "Past Updates",
    de: "Frühere Updates",
    fr: "Anciennes mises à jour",
    ja: "過去の更新",
    ru: "Предыдущие обновления",
    "pt-BR": "Atualizações Anteriores",
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

export const RECENT_SIDEBAR_COUNT = 3;

interface PageMapItem {
  name?: string;
  route?: string;
  title?: string;
  children?: PageMapItem[];
  data?: Record<string, any>;
  frontMatter?: Record<string, any>;
}

export function modifyUpdatesSidebar(pageMap: PageMapItem[], lang: string): PageMapItem[] {
  const label = getBlogText("pastUpdates", lang);
  const cloned = JSON.parse(JSON.stringify(pageMap)) as PageMapItem[];

  const blogFolder = cloned.find((item) => item.name === "blog" && item.children);
  if (!blogFolder) return cloned;

  const updatesFolder = blogFolder.children!.find(
    (item) => item.name === "updates" && item.children
  );
  if (!updatesFolder) return cloned;

  let metaFile: PageMapItem | null = null;
  const posts: PageMapItem[] = [];
  let indexItem: PageMapItem | null = null;

  for (const child of updatesFolder.children!) {
    if (child.data && !child.name) {
      metaFile = child;
    } else if (child.name === "index") {
      indexItem = child;
    } else if (child.name && child.route) {
      posts.push(child);
    }
  }

  if (metaFile && metaFile.data) {
    const metaOrder = Object.keys(metaFile.data).filter(
      (k) => k !== "index" && !k.startsWith("--")
    );
    posts.sort((a, b) => {
      const aIdx = metaOrder.indexOf(a.name!);
      const bIdx = metaOrder.indexOf(b.name!);
      return (aIdx === -1 ? Infinity : aIdx) - (bIdx === -1 ? Infinity : bIdx);
    });
  }

  if (posts.length <= RECENT_SIDEBAR_COUNT) return cloned;

  const recentPosts = posts.slice(0, RECENT_SIDEBAR_COUNT);
  const archivePosts = posts.slice(RECENT_SIDEBAR_COUNT);

  const archiveMetaFile: PageMapItem = { data: {} };
  if (metaFile && metaFile.data) {
    for (const post of archivePosts) {
      if (metaFile.data[post.name!]) {
        archiveMetaFile.data![post.name!] = metaFile.data[post.name!];
      }
    }
  }

  if (metaFile && metaFile.data) {
    const newData: Record<string, any> = {};
    let postCount = 0;
    for (const [key, value] of Object.entries(metaFile.data)) {
      if (key === "index" || key.startsWith("--")) {
        newData[key] = value;
        continue;
      }
      postCount++;
      if (postCount <= RECENT_SIDEBAR_COUNT) {
        newData[key] = value;
      }
      if (postCount === RECENT_SIDEBAR_COUNT) {
        newData["past-updates"] = label;
      }
    }
    metaFile.data = newData;
  }

  const pastUpdatesFolder: PageMapItem = {
    name: "past-updates",
    route: `${updatesFolder.route}/past-updates`,
    title: label,
    children: [archiveMetaFile, ...archivePosts],
  };

  const newChildren: PageMapItem[] = [];
  if (metaFile) newChildren.push(metaFile);
  if (indexItem) newChildren.push(indexItem);
  newChildren.push(...recentPosts);
  newChildren.push(pastUpdatesFolder);

  updatesFolder.children = newChildren;

  return cloned;
}
