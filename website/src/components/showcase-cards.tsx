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
    className="group cursor-pointer text-left w-full h-full flex flex-col overflow-hidden rounded-2xl border border-border/50 bg-card hover:border-violet-200 dark:hover:border-violet-800 transition-all duration-300 hover:shadow-[0_12px_40px_-16px_rgba(0,0,0,0.1)] dark:hover:shadow-[0_12px_40px_-16px_rgba(0,0,0,0.4)] active:scale-[0.99]"
    onClick={() => onClick(card)}
    onKeyDown={(event) => {
      if (event.key === "Enter" || event.key === " ") {
        onClick(card);
      }
    }}
  >
    {/* Image with gradient background */}
    <div className="relative aspect-[4/3] overflow-hidden shrink-0 bg-gradient-to-br from-violet-500 via-fuchsia-500 to-orange-400 p-4 md:p-6">
      <div className="w-full h-full rounded-xl overflow-hidden shadow-lg">
        <img
          src={card.image}
          alt={card.title}
          className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-500"
          loading="lazy"
        />
      </div>
    </div>

    {/* Content */}
    <div className="p-5 md:p-6 flex flex-col flex-1 bg-card rounded-b-2xl">
      {/* Category badges */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {card.categories.map((category, index) => (
          <span
            key={`${card.id}-cat-${index}`}
            className={`px-2.5 py-1 rounded-full text-xs font-medium ${
              index === 0
                ? "border border-border text-foreground bg-transparent"
                : "bg-muted/60 text-muted-foreground"
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
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-violet-600 dark:hover:text-violet-400 transition-colors mt-auto"
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
    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all"
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
    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
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
              className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                isActive
                  ? "bg-foreground text-background shadow-sm"
                  : "bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted/60"
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
    <div className="flex flex-col h-full p-6 rounded-2xl border border-border/50 bg-card hover:border-violet-200 dark:hover:border-violet-800 transition-all duration-300 hover:shadow-[0_8px_30px_-12px_rgba(0,0,0,0.08)] dark:hover:shadow-[0_8px_30px_-12px_rgba(0,0,0,0.3)]">
      {/* Header */}
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-muted/60 flex items-center justify-center shrink-0">
          {typeof IconComponent === 'function' ? (
            <IconComponent className="w-5 h-5 text-foreground" />
          ) : (
            <span className="text-xl">{path.icon}</span>
          )}
        </div>
        <div>
          <h3 className="text-base font-semibold text-foreground mb-1">
            {path.title}
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {path.description}
          </p>
        </div>
      </div>

      {/* Steps */}
      <div className="flex-1 border-t border-border/50 pt-4 mt-auto">
        <ul className="space-y-3">
          {(path.items || path.steps)?.map((item: any, index: number) => (
            <li key={index} className="flex items-center gap-3">
              <span className="text-xs font-mono text-muted-foreground/60 w-6 shrink-0">
                {String(index + 1).padStart(2, '0')}
              </span>
              {'link' in item ? (
                <a 
                  href={item.link}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {item.title}
                </a>
              ) : (
                <span className="text-sm text-muted-foreground">
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
    <div className="min-h-[100dvh] pb-16">
      {/* Hero Section */}
      <section className="w-full px-4 md:px-8 pt-12 pb-8">
        <div className="max-w-[1400px] mx-auto">
          {/* Title */}
          <div className="mb-8 max-w-3xl">
            <h1 className="text-3xl md:text-5xl font-bold tracking-tighter leading-none mb-4 text-foreground">
              {textData.pageTitle}
            </h1>
            <p className="text-base md:text-lg text-muted-foreground leading-relaxed max-w-[65ch]">
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
      <section className="w-full px-4 md:px-8 py-8">
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
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
                <Search className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground max-w-[40ch]">
                {textData.emptyState || "未找到匹配的案例，尝试其他搜索词或筛选条件"}
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Learning Path Section */}
      <section className="w-full px-4 md:px-8 py-16 border-t border-border/50">
        <div className="max-w-[1400px] mx-auto">
          {/* Section Header */}
          <div className="mb-10 max-w-2xl">
            <h2 className="text-2xl md:text-3xl font-bold tracking-tighter leading-none mb-3 text-foreground">
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
