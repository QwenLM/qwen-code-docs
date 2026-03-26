"use client";

import React, { useState, useCallback, useMemo } from "react";
import { ArrowRight, Search, Zap, Book, TrendingUp } from "lucide-react";
import { featuredItems, texts, learningPaths } from "../../showcase-data";

/* ─── Type Definitions ─── */

export interface ShowcaseCard {
  id: string;
  title: string;
  description: string;
  image: string;
  categories: string[]; // e.g., ["日常任务", "Cowork"]
  link: string;
}

export interface CategoryGroup {
  label: string;
  items: string[];
}

export interface LearningPath {
  id: string;
  title: string;
  description: string;
  icon: string;
  steps?: { number: string; text: string }[];
  items?: { title: string; link: string }[];
}

export interface ShowcaseCardsProps {
  cards?: ShowcaseCard[];
  categoryGroups?: CategoryGroup[];
  learningPaths?: LearningPath[];
  texts?: {
    pageTitle: string;
    pageSubtitle: string;
    searchPlaceholder: string;
    categoryLabel?: string;
    featureLabel?: string;
    learningPathTitle?: string;
    learningPathsTitle?: string;
    learningPathSubtitle?: string;
    learningPathsSubtitle?: string;
    viewTutorial?: string;
    emptyState?: string;
    [key: string]: any;
  };
}

/* ─── Helper Functions ─── */

const getCategoryGroups = (cards: ShowcaseCard[]): CategoryGroup[] => {
  const categories = new Set<string>();
  const features = new Set<string>();

  cards.forEach((card) => {
    card.categories.forEach((cat) => {
      if (["日常任务", "编程开发", "数据分析", "入门指南", "网络搜索", "开源协作"].includes(cat)) {
        categories.add(cat);
      } else {
        features.add(cat);
      }
    });
  });

  return [
    {
      label: "分类",
      items: Array.from(categories),
    },
    {
      label: "功能",
      items: Array.from(features),
    },
  ];
};

/* ─── Showcase Card Component ─── */

const ShowcaseCardItem = ({
  card,
  onClick,
}: {
  card: ShowcaseCard;
  onClick: (card: ShowcaseCard) => void;
}) => (
  <div
    role="button"
    tabIndex={0}
    className="group cursor-pointer text-left w-full h-full flex flex-col overflow-hidden rounded-2xl border border-border bg-card hover:border-violet-300 dark:hover:border-violet-700 transition-all duration-300 hover:shadow-lg dark:hover:shadow-xl active:scale-[0.98]"
    onClick={() => onClick(card)}
    onKeyDown={(event) => {
      if (event.key === "Enter" || event.key === " ") {
        onClick(card);
      }
    }}
  >
    {/* Image - direct display without gradient wrapper */}
    <div className="relative aspect-video overflow-hidden shrink-0">
      <img
        src={card.image}
        alt={card.title}
        className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
        loading="lazy"
      />
    </div>

    {/* Content */}
    <div className="p-5 md:p-6 flex flex-col flex-1">
      {/* Category badges */}
      <div className="flex flex-wrap gap-2 mb-3">
        {card.categories.map((category, index) => (
          <span
            key={`${card.id}-cat-${index}`}
            className={`px-2.5 py-1 rounded-full text-xs font-medium ${
              index === 0
                ? "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {category}
          </span>
        ))}
      </div>

      {/* Title */}
      <h3 className="text-base md:text-lg font-semibold text-foreground group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors mb-2 line-clamp-1">
        {card.title}
      </h3>

      {/* Description */}
      <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2 mb-4">
        {card.description}
      </p>

      {/* View tutorial link */}
      <a
        href={card.link}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 transition-colors mt-auto"
        onClick={(event) => event.stopPropagation()}
      >
        查看教程
        <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
      </a>
    </div>
  </div>
);

/* ─── Search Bar Component ─── */

const SearchBar = ({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) => (
  <div className="relative w-full max-w-xl">
    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full pl-11 pr-4 py-3 rounded-xl border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 transition-all shadow-sm"
    />
  </div>
);

/* ─── Category Filter Component ─── */

const CategoryFilter = ({
  groups,
  activeFilters,
  onToggleFilter,
  label,
}: {
  groups: CategoryGroup[];
  activeFilters: string[];
  onToggleFilter: (filter: string) => void;
  label: string;
}) => (
  <div className="space-y-3">
    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
      {label}
    </span>
    <div className="flex flex-wrap gap-2">
      {groups.flatMap((group, groupIndex) =>
        group.items.map((item, itemIndex) => {
          const isActive = activeFilters.includes(item);

          return (
            <button
              key={item}
              onClick={() => onToggleFilter(item)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                isActive
                  ? "bg-violet-600 text-white shadow-sm hover:bg-violet-700"
                  : "bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted border border-border"
              }`}
            >
              {item}
            </button>
          );
        })
      )}
    </div>
  </div>
);

/* ─── Learning Path Card Component ─── */

const LearningPathCard = ({ path }: { path: LearningPath }) => {
  const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
    zap: Zap,
    book: Book,
    trending: TrendingUp,
    "⚡": () => <span className="text-xl">⚡</span>,
    "📖": () => <span className="text-xl">📖</span>,
    "👥": () => <span className="text-xl">👥</span>,
  };

  const IconComponent = typeof path.icon === 'string' 
    ? (iconMap[path.icon] || iconMap.zap)
    : path.icon;

  return (
    <div className="flex flex-col h-full p-6 rounded-2xl border border-border bg-card hover:border-violet-300 dark:hover:border-violet-700 transition-all duration-300 hover:shadow-lg dark:hover:shadow-xl">
      {/* Header */}
      <div className="flex items-start gap-4 mb-5">
        <div className="w-12 h-12 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center shrink-0">
          {typeof IconComponent === 'function' ? (
            <IconComponent className="w-6 h-6 text-violet-600 dark:text-violet-400" />
          ) : (
            <span className="text-2xl">{path.icon}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-foreground mb-1.5">
            {path.title}
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {path.description}
          </p>
        </div>
      </div>

      {/* Steps */}
      <div className="flex-1 border-t border-border pt-5 mt-auto">
        <ul className="space-y-3.5">
          {(path.items || path.steps)?.map((item: any, index: number) => (
            <li key={index} className="flex items-start gap-3">
              <span className="text-xs font-mono text-violet-600 dark:text-violet-400 w-6 shrink-0 pt-0.5">
                {String(index + 1).padStart(2, '0')}
              </span>
              {'link' in item ? (
                <a 
                  href={item.link}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors line-clamp-1"
                >
                  {item.title}
                </a>
              ) : (
                <span className="text-sm text-muted-foreground line-clamp-1">
                  {item.text}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

/* ─── Main Component ─── */

export const ShowcaseCards = ({
  cards: propCards,
  categoryGroups: propCategoryGroups,
  learningPaths: propLearningPaths,
  texts: propTexts,
}: ShowcaseCardsProps) => {
  // Use props if provided, otherwise fall back to imported data
  const cards = useMemo(() => {
    if (propCards && propCards.length > 0) return propCards;
    
    // Convert featuredItems to ShowcaseCard format
    return featuredItems.map((item, index) => ({
      id: String(index + 1),
      title: item.title,
      description: item.description,
      image: item.thumbnail,
      categories: [item.category, item.feature],
      link: item.link,
    }));
  }, [propCards]);

  const categoryGroups = useMemo(() => {
    if (propCategoryGroups && propCategoryGroups.length > 0) return propCategoryGroups;
    return getCategoryGroups(cards);
  }, [propCategoryGroups, cards]);

  const learningPathData = useMemo(() => {
    if (propLearningPaths && propLearningPaths.length > 0) return propLearningPaths;
    return learningPaths;
  }, [propLearningPaths]);

  const textData = useMemo(() => {
    if (propTexts) return propTexts;
    return texts;
  }, [propTexts]);

  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilters, setActiveFilters] = useState<string[]>([]);

  const handleToggleFilter = useCallback((filter: string) => {
    setActiveFilters((prev) =>
      prev.includes(filter)
        ? prev.filter((f) => f !== filter)
        : [...prev, filter]
    );
  }, []);

  // Filter cards based on search and active filters
  const filteredCards = cards.filter((card) => {
    // Search filter
    const matchesSearch =
      searchQuery === "" ||
      card.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      card.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      card.categories.some((cat) =>
        cat.toLowerCase().includes(searchQuery.toLowerCase())
      );

    // Category filter
    const matchesCategory =
      activeFilters.length === 0 ||
      activeFilters.some((filter) =>
        card.categories.some((cat) => cat === filter)
      );

    return matchesSearch && matchesCategory;
  });

  return (
    <div className="min-h-[100dvh] pb-20">
      {/* Hero Section */}
      <section className="w-full px-4 md:px-8 pt-16 pb-12 border-b border-border/50">
        <div className="max-w-[1400px] mx-auto">
          {/* Title */}
          <div className="mb-10 max-w-3xl">
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight leading-tight mb-4 text-foreground">
              {textData.pageTitle}
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed max-w-[65ch]">
              {textData.pageSubtitle}
            </p>
          </div>

          {/* Search */}
          <div className="mb-10">
            <SearchBar
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder={textData.searchPlaceholder}
            />
          </div>

          {/* Category Filters */}
          <div className="space-y-6">
            {categoryGroups.map((group) => (
              <CategoryFilter
                key={group.label}
                groups={[group]}
                activeFilters={activeFilters}
                onToggleFilter={handleToggleFilter}
                label={group.label}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Cards Grid */}
      <section className="w-full px-4 md:px-8 py-12">
        <div className="max-w-[1400px] mx-auto">
          {filteredCards.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredCards.map((card) => (
                <ShowcaseCardItem
                  key={card.id}
                  card={card}
                  onClick={() => {
                    window.location.href = card.link;
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
                <Search className="w-7 h-7 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground max-w-[40ch]">
                {textData.emptyState || "未找到匹配的案例，尝试其他搜索词或筛选条件"}
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Learning Path Section */}
      <section className="w-full px-4 md:px-8 py-16 border-t border-border">
        <div className="max-w-[1400px] mx-auto">
          {/* Section Header */}
          <div className="mb-12 max-w-2xl">
            <h2 className="text-3xl font-bold tracking-tight leading-tight mb-3 text-foreground">
              {(textData as any).learningPathTitle || (textData as any).learningPathsTitle || "学习路径"}
            </h2>
            <p className="text-base text-muted-foreground leading-relaxed">
              {(textData as any).learningPathSubtitle || (textData as any).learningPathsSubtitle || "根据你的经验水平选择合适的学习路径"}
            </p>
          </div>

          {/* Learning Paths Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {learningPathData.map((path) => (
              <LearningPathCard key={path.id} path={path} />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

export default ShowcaseCards;
