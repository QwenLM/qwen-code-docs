"use client";

import React, { useState, useMemo } from "react";
import { Search, ArrowRight, BookOpen, Zap, GraduationCap, LayoutGrid, List } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import showcaseDataZh from "../generated/showcase-data-zh.json";
import showcaseDataEn from "../generated/showcase-data-en.json";
import showcaseDataDe from "../generated/showcase-data-de.json";
import showcaseDataFr from "../generated/showcase-data-fr.json";
import showcaseDataJa from "../generated/showcase-data-ja.json";
import showcaseDataPtBR from "../generated/showcase-data-pt-BR.json";
import showcaseDataRu from "../generated/showcase-data-ru.json";

interface ShowcaseItem {
  id: string;
  title: string;
  description: string;
  category: string;
  features: string[];
  thumbnail: string;
  videoUrl: string | null;
  model: string;
  author: string;
  date: string;
}

type Locale = "zh" | "en" | "de" | "fr" | "ja" | "pt-BR" | "ru";

const SHOWCASE_DATA_MAP = {
  zh: showcaseDataZh,
  en: showcaseDataEn,
  de: showcaseDataDe,
  fr: showcaseDataFr,
  ja: showcaseDataJa,
  "pt-BR": showcaseDataPtBR,
  ru: showcaseDataRu,
} as Record<Locale, ShowcaseItem[]>;

const ITEMS_PER_PAGE = 9;
const MAX_FEATURES_DISPLAY = 2;

/* ─── i18n texts ─── */

interface UiTexts {
  heroSubtitle: string;
  learningPathTitle: string;
  learningPathSubtitle: string;
  searchPlaceholder: string;
  gridView: string;
  listView: string;
  categoryLabel: string;
  featureLabel: string;
  resultsCount: (count: number) => string;
  clearFilters: string;
  viewTutorial: string;
  titleHeader: string;
  categoryHeader: string;
  featureHeader: string;
  showMore: (remaining: number) => string;
  emptyState: string;
}

const UI_TEXTS: Record<Locale, UiTexts> = {
  zh: {
    heroSubtitle: "从真实项目案例中学习 Qwen Code，掌握 AI 编程最佳实践",
    learningPathTitle: "学习路径",
    learningPathSubtitle: "根据你的经验水平选择合适的学习路径",
    searchPlaceholder: "搜索案例...",
    gridView: "网格视图",
    listView: "列表视图",
    categoryLabel: "分类",
    featureLabel: "功能",
    resultsCount: (count) => `${count} 个结果`,
    clearFilters: "清除筛选",
    viewTutorial: "查看教程",
    titleHeader: "标题",
    categoryHeader: "分类",
    featureHeader: "功能",
    showMore: (remaining) => `显示更多 (${remaining} 个)`,
    emptyState: "未找到匹配的案例，尝试其他搜索词或筛选条件",
  },
  en: {
    heroSubtitle: "Learn Qwen Code from real project examples and master AI programming best practices",
    learningPathTitle: "Learning Paths",
    learningPathSubtitle: "Choose the right learning path based on your experience level",
    searchPlaceholder: "Search showcases...",
    gridView: "Grid view",
    listView: "List view",
    categoryLabel: "Category",
    featureLabel: "Features",
    resultsCount: (count) => `${count} results`,
    clearFilters: "Clear filters",
    viewTutorial: "View Tutorial",
    titleHeader: "Title",
    categoryHeader: "Category",
    featureHeader: "Features",
    showMore: (remaining) => `Show more (${remaining})`,
    emptyState: "No matching showcases found. Try different search terms or filters",
  },
  de: {
    heroSubtitle: "Lernen Sie Qwen Code anhand realer Projektbeispiele und meistern Sie KI-Programmierung",
    learningPathTitle: "Lernpfade",
    learningPathSubtitle: "Wählen Sie den passenden Lernpfad basierend auf Ihrem Erfahrungsniveau",
    searchPlaceholder: "Beispiele suchen...",
    gridView: "Rasteransicht",
    listView: "Listenansicht",
    categoryLabel: "Kategorie",
    featureLabel: "Funktionen",
    resultsCount: (count) => `${count} Ergebnisse`,
    clearFilters: "Filter löschen",
    viewTutorial: "Tutorial ansehen",
    titleHeader: "Titel",
    categoryHeader: "Kategorie",
    featureHeader: "Funktionen",
    showMore: (remaining) => `Mehr anzeigen (${remaining})`,
    emptyState: "Keine passenden Beispiele gefunden. Versuchen Sie andere Suchbegriffe oder Filter",
  },
  fr: {
    heroSubtitle: "Apprenez Qwen Code à partir d'exemples de projets réels et maîtrisez les meilleures pratiques de programmation IA",
    learningPathTitle: "Parcours d'apprentissage",
    learningPathSubtitle: "Choisissez le parcours adapté à votre niveau d'expérience",
    searchPlaceholder: "Rechercher des exemples...",
    gridView: "Vue grille",
    listView: "Vue liste",
    categoryLabel: "Catégorie",
    featureLabel: "Fonctionnalités",
    resultsCount: (count) => `${count} résultats`,
    clearFilters: "Effacer les filtres",
    viewTutorial: "Voir le tutoriel",
    titleHeader: "Titre",
    categoryHeader: "Catégorie",
    featureHeader: "Fonctionnalités",
    showMore: (remaining) => `Afficher plus (${remaining})`,
    emptyState: "Aucun exemple trouvé. Essayez d'autres termes de recherche ou filtres",
  },
  ja: {
    heroSubtitle: "実際のプロジェクト事例から Qwen Code を学び、AI プログラミングのベストプラクティスを習得しましょう",
    learningPathTitle: "学習パス",
    learningPathSubtitle: "経験レベルに合った学習パスを選択してください",
    searchPlaceholder: "事例を検索...",
    gridView: "グリッド表示",
    listView: "リスト表示",
    categoryLabel: "カテゴリ",
    featureLabel: "機能",
    resultsCount: (count) => `${count} 件の結果`,
    clearFilters: "フィルターをクリア",
    viewTutorial: "チュートリアルを見る",
    titleHeader: "タイトル",
    categoryHeader: "カテゴリ",
    featureHeader: "機能",
    showMore: (remaining) => `もっと表示 (${remaining} 件)`,
    emptyState: "一致する事例が見つかりません。別の検索語やフィルターをお試しください",
  },
  "pt-BR": {
    heroSubtitle: "Aprenda Qwen Code com exemplos de projetos reais e domine as melhores práticas de programação com IA",
    learningPathTitle: "Trilhas de Aprendizado",
    learningPathSubtitle: "Escolha a trilha de aprendizado adequada ao seu nível de experiência",
    searchPlaceholder: "Pesquisar exemplos...",
    gridView: "Visualização em grade",
    listView: "Visualização em lista",
    categoryLabel: "Categoria",
    featureLabel: "Recursos",
    resultsCount: (count) => `${count} resultados`,
    clearFilters: "Limpar filtros",
    viewTutorial: "Ver Tutorial",
    titleHeader: "Título",
    categoryHeader: "Categoria",
    featureHeader: "Recursos",
    showMore: (remaining) => `Mostrar mais (${remaining})`,
    emptyState: "Nenhum exemplo encontrado. Tente outros termos de pesquisa ou filtros",
  },
  ru: {
    heroSubtitle: "Изучайте Qwen Code на реальных примерах проектов и осваивайте лучшие практики ИИ-программирования",
    learningPathTitle: "Пути обучения",
    learningPathSubtitle: "Выберите подходящий путь обучения в зависимости от вашего уровня опыта",
    searchPlaceholder: "Поиск примеров...",
    gridView: "Сетка",
    listView: "Список",
    categoryLabel: "Категория",
    featureLabel: "Функции",
    resultsCount: (count) => `${count} результатов`,
    clearFilters: "Сбросить фильтры",
    viewTutorial: "Смотреть руководство",
    titleHeader: "Название",
    categoryHeader: "Категория",
    featureHeader: "Функции",
    showMore: (remaining) => `Показать ещё (${remaining})`,
    emptyState: "Подходящие примеры не найдены. Попробуйте другие поисковые запросы или фильтры",
  },
};

/* ─── i18n learning paths ─── */

interface LearningPathCase {
  id: string;
  label: string;
}

interface LearningPath {
  level: string;
  description: string;
  icon: React.ReactNode;
  cases: LearningPathCase[];
}

const LEARNING_PATHS: Record<Locale, LearningPath[]> = {
  zh: [
    { level: "入门", description: "快速上手 Qwen Code 核心功能，10 分钟完成你的第一个 AI 编程任务", icon: <BookOpen className="w-5 h-5" />, cases: [{ id: "guide-script-install", label: "脚本一键安装" }, { id: "guide-first-conversation", label: "开始第一次对话" }, { id: "guide-api-setup", label: "API 配置指南" }, { id: "guide-skill-install", label: "安装 Skills" }] },
    { level: "进阶", description: "深入学习高级功能和编程场景，掌握智能搜索和开源协作技巧", icon: <Zap className="w-5 h-5" />, cases: [{ id: "guide-bailian-coding-plan", label: "百炼 Coding Plan 模式" }, { id: "guide-web-search", label: "Web Search 网络搜索" }, { id: "guide-plan-with-search", label: "Plan 模式 + Web Search" }, { id: "code-lsp-intelligence", label: "LSP 智能感知" }] },
    { level: "高级实战", description: "复杂项目开发和真实业务场景应用，参与开源贡献和代码审查", icon: <GraduationCap className="w-5 h-5" />, cases: [{ id: "study-learning", label: "代码学习" }, { id: "code-solve-issue", label: "解决 issue" }, { id: "code-pr-review", label: "PR Review" }, { id: "study-read-paper", label: "读论文" }] },
  ],
  en: [
    { level: "Beginner", description: "Get started with Qwen Code core features — complete your first AI programming task in 10 minutes", icon: <BookOpen className="w-5 h-5" />, cases: [{ id: "guide-script-install", label: "One-Click Script Install" }, { id: "guide-first-conversation", label: "Start Your First Conversation" }, { id: "guide-api-setup", label: "API Configuration Guide" }, { id: "guide-skill-install", label: "Install Skills" }] },
    { level: "Intermediate", description: "Dive into advanced features and programming scenarios — master smart search and open source collaboration", icon: <Zap className="w-5 h-5" />, cases: [{ id: "guide-bailian-coding-plan", label: "Bailian Coding Plan Mode" }, { id: "guide-web-search", label: "Web Search" }, { id: "guide-plan-with-search", label: "Plan Mode + Web Search" }, { id: "code-lsp-intelligence", label: "LSP IntelliSense" }] },
    { level: "Advanced", description: "Complex project development and real-world scenarios — contribute to open source and code review", icon: <GraduationCap className="w-5 h-5" />, cases: [{ id: "study-learning", label: "Code Learning" }, { id: "code-solve-issue", label: "Solve Issues" }, { id: "code-pr-review", label: "PR Review" }, { id: "study-read-paper", label: "Read Papers" }] },
  ],
  de: [
    { level: "Einsteiger", description: "Schnelleinstieg in die Kernfunktionen von Qwen Code — erste KI-Programmieraufgabe in 10 Minuten", icon: <BookOpen className="w-5 h-5" />, cases: [{ id: "guide-script-install", label: "Ein-Klick-Skriptinstallation" }, { id: "guide-first-conversation", label: "Erstes Gespräch starten" }, { id: "guide-api-setup", label: "API-Konfigurationsanleitung" }, { id: "guide-skill-install", label: "Skills installieren" }] },
    { level: "Fortgeschritten", description: "Erweiterte Funktionen und Programmierszenarien — intelligente Suche und Open-Source-Zusammenarbeit", icon: <Zap className="w-5 h-5" />, cases: [{ id: "guide-bailian-coding-plan", label: "Bailian Coding Plan Modus" }, { id: "guide-web-search", label: "Web Search" }, { id: "guide-plan-with-search", label: "Plan Modus + Web Search" }, { id: "code-lsp-intelligence", label: "LSP IntelliSense" }] },
    { level: "Experte", description: "Komplexe Projektentwicklung und reale Szenarien — Open-Source-Beiträge und Code-Review", icon: <GraduationCap className="w-5 h-5" />, cases: [{ id: "study-learning", label: "Code-Lernen" }, { id: "code-solve-issue", label: "Issues lösen" }, { id: "code-pr-review", label: "PR Review" }, { id: "study-read-paper", label: "Paper lesen" }] },
  ],
  fr: [
    { level: "Débutant", description: "Prise en main rapide des fonctionnalités principales de Qwen Code — première tâche IA en 10 minutes", icon: <BookOpen className="w-5 h-5" />, cases: [{ id: "guide-script-install", label: "Installation par script" }, { id: "guide-first-conversation", label: "Première conversation" }, { id: "guide-api-setup", label: "Guide de configuration API" }, { id: "guide-skill-install", label: "Installer des Skills" }] },
    { level: "Intermédiaire", description: "Fonctionnalités avancées et scénarios de programmation — recherche intelligente et collaboration open source", icon: <Zap className="w-5 h-5" />, cases: [{ id: "guide-bailian-coding-plan", label: "Mode Bailian Coding Plan" }, { id: "guide-web-search", label: "Web Search" }, { id: "guide-plan-with-search", label: "Mode Plan + Web Search" }, { id: "code-lsp-intelligence", label: "LSP IntelliSense" }] },
    { level: "Avancé", description: "Développement de projets complexes et scénarios réels — contribution open source et revue de code", icon: <GraduationCap className="w-5 h-5" />, cases: [{ id: "study-learning", label: "Apprentissage du code" }, { id: "code-solve-issue", label: "Résoudre des issues" }, { id: "code-pr-review", label: "Revue de PR" }, { id: "study-read-paper", label: "Lire des articles" }] },
  ],
  ja: [
    { level: "入門", description: "Qwen Code のコア機能をすぐに使い始めましょう — 10分で最初の AI プログラミングタスクを完了", icon: <BookOpen className="w-5 h-5" />, cases: [{ id: "guide-script-install", label: "ワンクリックスクリプトインストール" }, { id: "guide-first-conversation", label: "最初の会話を始める" }, { id: "guide-api-setup", label: "API 設定ガイド" }, { id: "guide-skill-install", label: "スキルをインストール" }] },
    { level: "中級", description: "高度な機能とプログラミングシナリオを深く学ぶ — スマート検索とオープンソース協力", icon: <Zap className="w-5 h-5" />, cases: [{ id: "guide-bailian-coding-plan", label: "百炼 Coding Plan モード" }, { id: "guide-web-search", label: "Web Search" }, { id: "guide-plan-with-search", label: "Plan モード + Web Search" }, { id: "code-lsp-intelligence", label: "LSP インテリセンス" }] },
    { level: "上級実践", description: "複雑なプロジェクト開発と実際のビジネスシナリオ — オープンソース貢献とコードレビュー", icon: <GraduationCap className="w-5 h-5" />, cases: [{ id: "study-learning", label: "コード学習" }, { id: "code-solve-issue", label: "issue を解決" }, { id: "code-pr-review", label: "PR レビュー" }, { id: "study-read-paper", label: "論文を読む" }] },
  ],
  "pt-BR": [
    { level: "Iniciante", description: "Comece rapidamente com as funcionalidades principais do Qwen Code — complete sua primeira tarefa de programação IA em 10 minutos", icon: <BookOpen className="w-5 h-5" />, cases: [{ id: "guide-script-install", label: "Instalação por Script" }, { id: "guide-first-conversation", label: "Primeira Conversa" }, { id: "guide-api-setup", label: "Guia de Configuração de API" }, { id: "guide-skill-install", label: "Instalar Skills" }] },
    { level: "Intermediário", description: "Aprofunde-se em funcionalidades avançadas e cenários de programação — busca inteligente e colaboração open source", icon: <Zap className="w-5 h-5" />, cases: [{ id: "guide-bailian-coding-plan", label: "Modo Bailian Coding Plan" }, { id: "guide-web-search", label: "Web Search" }, { id: "guide-plan-with-search", label: "Modo Plan + Web Search" }, { id: "code-lsp-intelligence", label: "LSP IntelliSense" }] },
    { level: "Avançado", description: "Desenvolvimento de projetos complexos e cenários reais — contribuição open source e revisão de código", icon: <GraduationCap className="w-5 h-5" />, cases: [{ id: "study-learning", label: "Aprendizado de Código" }, { id: "code-solve-issue", label: "Resolver Issues" }, { id: "code-pr-review", label: "Revisão de PR" }, { id: "study-read-paper", label: "Ler Artigos" }] },
  ],
  ru: [
    { level: "Начинающий", description: "Быстрый старт с основными функциями Qwen Code — выполните первую задачу ИИ-программирования за 10 минут", icon: <BookOpen className="w-5 h-5" />, cases: [{ id: "guide-script-install", label: "Установка скриптом" }, { id: "guide-first-conversation", label: "Первый разговор" }, { id: "guide-api-setup", label: "Настройка API" }, { id: "guide-skill-install", label: "Установка скиллов" }] },
    { level: "Продвинутый", description: "Углублённое изучение расширенных функций и сценариев программирования — умный поиск и open source", icon: <Zap className="w-5 h-5" />, cases: [{ id: "guide-bailian-coding-plan", label: "Режим Bailian Coding Plan" }, { id: "guide-web-search", label: "Web Search" }, { id: "guide-plan-with-search", label: "Режим Plan + Web Search" }, { id: "code-lsp-intelligence", label: "LSP IntelliSense" }] },
    { level: "Эксперт", description: "Разработка сложных проектов и реальные сценарии — вклад в open source и ревью кода", icon: <GraduationCap className="w-5 h-5" />, cases: [{ id: "study-learning", label: "Изучение кода" }, { id: "code-solve-issue", label: "Решение issues" }, { id: "code-pr-review", label: "Ревью PR" }, { id: "study-read-paper", label: "Чтение статей" }] },
  ],
};

/* ─── Locale detection helper ─── */

function getLocaleFromPathname(pathname: string | null): Locale {
  if (!pathname) return "zh";
  const segments = pathname.split("/").filter(Boolean);
  const firstSegment = segments[0];
  if (firstSegment && firstSegment in SHOWCASE_DATA_MAP) {
    return firstSegment as Locale;
  }
  return "zh";
}

/* ─── Sub-components ─── */

function ShowcaseCard({ item, locale, texts }: { item: ShowcaseItem; locale: Locale; texts: UiTexts }) {
  return (
    <Link href={`/${locale}/showcase/${item.id}`} target="_blank" rel="noopener noreferrer" className="group block">
      <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600 transition-all duration-300 hover:shadow-[0_8px_30px_-12px_rgba(0,0,0,0.12)] dark:hover:shadow-[0_8px_30px_-12px_rgba(0,0,0,0.4)] active:scale-[0.98]">
        <div className="relative aspect-video overflow-hidden bg-zinc-100 dark:bg-zinc-900">
          <img src={item.thumbnail} alt={item.title} className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-500" loading="lazy" />
        </div>
        <div className="p-5">
          <div className="flex flex-wrap items-center gap-1.5 mb-3">
            {item.category && (<span className="px-2 py-0.5 text-[11px] font-medium rounded border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300">{item.category}</span>)}
            {item.features.slice(0, MAX_FEATURES_DISPLAY).map((feature) => (<span key={feature} className="px-2 py-0.5 text-[11px] font-medium rounded text-zinc-500 dark:text-zinc-400">{feature}</span>))}
          </div>
          <h3 className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100 mb-1.5 line-clamp-1 tracking-tight">{item.title}</h3>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 line-clamp-2 leading-relaxed mb-4">{item.description}</p>
          <span className="inline-flex items-center gap-1 text-sm font-medium text-zinc-900 dark:text-zinc-100 group-hover:gap-2 transition-all">
            {texts.viewTutorial}
            <ArrowRight className="w-3.5 h-3.5" />
          </span>
        </div>
      </div>
    </Link>
  );
}

function ShowcaseListItem({ item, locale }: { item: ShowcaseItem; locale: Locale }) {
  return (
    <Link href={`/${locale}/showcase/${item.id}`} target="_blank" rel="noopener noreferrer" className="group flex items-center gap-6 py-4 px-4 -mx-4 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors">
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{item.title}</h3>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 line-clamp-1">{item.description}</p>
      </div>
      <div className="flex items-center gap-4 flex-shrink-0">
        {item.category && (<span className="px-2.5 py-1 text-xs font-medium rounded border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300">{item.category}</span>)}
        <div className="flex items-center gap-1.5">
          {item.features.slice(0, MAX_FEATURES_DISPLAY).map((feature) => (<span key={feature} className="px-2 py-0.5 text-xs rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400">{feature}</span>))}
        </div>
        <ArrowRight className="w-4 h-4 text-zinc-300 dark:text-zinc-600 group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors" />
      </div>
    </Link>
  );
}

/* ─── Main Component ─── */

export function VideoShowcaseIndex() {
  const pathname = usePathname();
  const locale = getLocaleFromPathname(pathname);
  const texts = UI_TEXTS[locale];
  const learningPaths = LEARNING_PATHS[locale];

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
  const [visibleCount, setVisibleCount] = useState(ITEMS_PER_PAGE);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const allItems = useMemo(() => SHOWCASE_DATA_MAP[locale] || [], [locale]);
  const allItemIds = useMemo(() => new Set(allItems.map((item) => item.id)), [allItems]);

  const categoryTags = useMemo(() => {
    const categories = new Set<string>();
    for (const item of allItems) { if (item.category) categories.add(item.category); }
    return Array.from(categories).sort();
  }, [allItems]);

  const featureTags = useMemo(() => {
    const features = new Set<string>();
    for (const item of allItems) { for (const feature of item.features) { features.add(feature); } }
    return Array.from(features).sort();
  }, [allItems]);

  const filteredItems = useMemo(() => {
    return allItems.filter((item) => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesSearch = item.title.toLowerCase().includes(query) || item.description.toLowerCase().includes(query);
        if (!matchesSearch) return false;
      }
      if (selectedCategories.length > 0) { if (!item.category || !selectedCategories.includes(item.category)) return false; }
      if (selectedFeatures.length > 0) { if (!item.features.some((feature) => selectedFeatures.includes(feature))) return false; }
      return true;
    });
  }, [allItems, searchQuery, selectedCategories, selectedFeatures]);

  React.useEffect(() => { setVisibleCount(ITEMS_PER_PAGE); }, [searchQuery, selectedCategories, selectedFeatures]);

  const toggleCategory = (category: string) => { setSelectedCategories((prev) => prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]); };
  const toggleFeature = (feature: string) => { setSelectedFeatures((prev) => prev.includes(feature) ? prev.filter((f) => f !== feature) : [...prev, feature]); };
  const clearFilters = () => { setSearchQuery(""); setSelectedCategories([]); setSelectedFeatures([]); };

  const hasActiveFilters = searchQuery || selectedCategories.length > 0 || selectedFeatures.length > 0;
  const itemsToShow = hasActiveFilters ? filteredItems : allItems;
  const displayedItems = itemsToShow.slice(0, visibleCount);
  const hasMore = visibleCount < itemsToShow.length;
  const handleShowMore = () => { setVisibleCount((prev) => prev + ITEMS_PER_PAGE); };

  return (
    <div className="w-full">
      {/* Hero */}
      <section className="w-full px-4 md:px-8 pt-16 pb-12 md:pt-24 md:pb-16">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 mb-3">Qwen Code Showcases</h1>
          <p className="text-base md:text-lg text-zinc-500 dark:text-zinc-400 max-w-[55ch] leading-relaxed">{texts.heroSubtitle}</p>
        </div>
      </section>

      {/* Learning Paths */}
      <section className="w-full px-4 md:px-8 py-16">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 mb-2">{texts.learningPathTitle}</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-8">{texts.learningPathSubtitle}</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-zinc-200 dark:bg-zinc-800 rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800">
            {learningPaths.map((path) => (
              <div key={path.level} className="bg-background p-6 md:p-8">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-lg bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center text-zinc-600 dark:text-zinc-400">{path.icon}</div>
                  <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">{path.level}</h3>
                </div>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed mb-6">{path.description}</p>
                <div className="space-y-1">
                  {path.cases.filter((caseItem) => allItemIds.has(caseItem.id)).map((caseItem, index) => (
                    <Link key={caseItem.id} href={`/${locale}/showcase/${caseItem.id}`} className="flex items-center gap-3 py-2.5 px-3 -mx-3 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors group">
                      <span className="flex-shrink-0 text-xs font-mono text-zinc-400 dark:text-zinc-600 tabular-nums w-5">{String(index + 1).padStart(2, "0")}</span>
                      <span className="text-sm text-zinc-700 dark:text-zinc-300 group-hover:text-zinc-900 dark:group-hover:text-zinc-100 transition-colors">{caseItem.label}</span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Divider */}
      <div className="w-full px-4 md:px-8"><div className="max-w-7xl mx-auto border-t border-zinc-200 dark:border-zinc-800" /></div>

      {/* Search + Filters */}
      <section className="w-full px-4 md:px-8 py-10">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input type="text" placeholder={texts.searchPlaceholder} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-zinc-100/10 focus:border-zinc-400 dark:focus:border-zinc-600 transition-all placeholder:text-zinc-400" />
            </div>
            <div className="flex items-center border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
              <button onClick={() => setViewMode("grid")} className={`p-2 transition-colors ${viewMode === "grid" ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"}`} title={texts.gridView}><LayoutGrid className="w-4 h-4" /></button>
              <button onClick={() => setViewMode("list")} className={`p-2 transition-colors ${viewMode === "list" ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"}`} title={texts.listView}><List className="w-4 h-4" /></button>
            </div>
          </div>
          <div>
            <span className="text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">{texts.categoryLabel}</span>
            <div className="flex flex-wrap gap-2 mt-2">
              {categoryTags.map((category) => (<button key={category} onClick={() => toggleCategory(category)} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all active:scale-[0.96] ${selectedCategories.includes(category) ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-400 dark:hover:border-zinc-600 hover:text-zinc-900 dark:hover:text-zinc-200"}`}>{category}</button>))}
            </div>
          </div>
          <div>
            <span className="text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">{texts.featureLabel}</span>
            <div className="flex flex-wrap gap-2 mt-2">
              {featureTags.map((feature) => (<button key={feature} onClick={() => toggleFeature(feature)} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all active:scale-[0.96] ${selectedFeatures.includes(feature) ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-400 dark:hover:border-zinc-600 hover:text-zinc-900 dark:hover:text-zinc-200"}`}>{feature}</button>))}
            </div>
          </div>
          {hasActiveFilters && (
            <div className="flex items-center gap-3 text-sm text-zinc-500 dark:text-zinc-400">
              <span>{texts.resultsCount(filteredItems.length)}</span>
              <button onClick={clearFilters} className="underline underline-offset-2 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors">{texts.clearFilters}</button>
            </div>
          )}
        </div>
      </section>

      {/* Card Grid / List */}
      <section className="w-full px-4 md:px-8 py-12 md:py-16">
        <div className="max-w-7xl mx-auto">
          {displayedItems.length > 0 ? (
            <>
              {viewMode === "grid" ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
                  {displayedItems.map((item) => (<ShowcaseCard key={item.id} item={item} locale={locale} texts={texts} />))}
                </div>
              ) : (
                <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  <div className="flex items-center gap-6 py-3 px-4 text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider border-b border-zinc-200 dark:border-zinc-800">
                    <div className="flex-1">{texts.titleHeader}</div>
                    <div className="flex items-center gap-4 flex-shrink-0">
                      <span className="text-center">{texts.categoryHeader}</span>
                      <span>{texts.featureHeader}</span>
                      <span className="w-4" />
                    </div>
                  </div>
                  {displayedItems.map((item) => (<ShowcaseListItem key={item.id} item={item} locale={locale} />))}
                </div>
              )}
              {hasMore && (
                <div className="flex justify-center mt-12">
                  <button onClick={handleShowMore} className="px-8 py-3 text-sm font-medium rounded-lg border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-all active:scale-[0.98]">{texts.showMore(itemsToShow.length - visibleCount)}</button>
                </div>
              )}
            </>
          ) : (
            <div className="py-24 text-center">
              <p className="text-sm text-zinc-400 dark:text-zinc-500">{texts.emptyState}</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
