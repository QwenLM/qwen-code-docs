"use client";

import React, { useState, useMemo } from "react";
import { Search, ArrowRight, BookOpen, Zap, GraduationCap, LayoutGrid, List } from "lucide-react";
import Link from "next/link";
import showcaseItems from "../generated/showcase-data.json";

interface ShowcaseItem {
  id: string;
  title: string;
  description: string;
  category: string;
  features: string[];
  thumbnail: string;
  videoUrl: string | null;
  model: string;
}

const LEARNING_PATHS = [
  {
    level: "入门",
    description: "快速上手 Qwen Code 核心功能，10 分钟完成你的第一个 AI 编程任务",
    icon: <BookOpen className="w-5 h-5" />,
    cases: [
      { id: "guide-script-install", label: "脚本一键安装" },
      { id: "guide-first-conversation", label: "开始第一次对话" },
      { id: "guide-api-setup", label: "API 配置指南" },
      { id: "guide-skill-install", label: "安装 Skills" },
    ],
  },
  {
    level: "进阶",
    description: "深入学习高级功能和编程场景，掌握智能搜索和开源协作技巧",
    icon: <Zap className="w-5 h-5" />,
    cases: [
      { id: "guide-bailian-coding-plan", label: "百炼 Coding Plan 模式" },
      { id: "guide-web-search", label: "Web Search 网络搜索" },
      { id: "guide-plan-with-search", label: "Plan 模式 + Web Search" },
      { id: "code-lsp-intelligence", label: "LSP 智能感知" },
    ],
  },
  {
    level: "高级实战",
    description: "复杂项目开发和真实业务场景应用，参与开源贡献和代码审查",
    icon: <GraduationCap className="w-5 h-5" />,
    cases: [
      { id: "study-learning", label: "代码学习" },
      { id: "code-solve-issue", label: "解决 issue" },
      { id: "code-pr-review", label: "PR Review" },
      { id: "study-read-paper", label: "读论文" },
    ],
  },
];

function ShowcaseCard({ item }: { item: ShowcaseItem }) {
  return (
    <Link href={`/zh/showcase/${item.id}`} className="group block">
      <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600 transition-all duration-300 hover:shadow-[0_8px_30px_-12px_rgba(0,0,0,0.12)] dark:hover:shadow-[0_8px_30px_-12px_rgba(0,0,0,0.4)] active:scale-[0.98]">
        <div className="relative aspect-video overflow-hidden bg-zinc-100 dark:bg-zinc-900">
          <img
            src={item.thumbnail}
            alt={item.title}
            className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-500"
            loading="lazy"
          />
        </div>

        <div className="p-5">
          <div className="flex flex-wrap items-center gap-1.5 mb-3">
            {item.category && (
              <span className="px-2 py-0.5 text-[11px] font-medium rounded border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300">
                {item.category}
              </span>
            )}
            {item.features.slice(0, 2).map((feature) => (
              <span
                key={feature}
                className="px-2 py-0.5 text-[11px] font-medium rounded text-zinc-500 dark:text-zinc-400"
              >
                {feature}
              </span>
            ))}
          </div>

          <h3 className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100 mb-1.5 line-clamp-1 tracking-tight">
            {item.title}
          </h3>

          <p className="text-sm text-zinc-500 dark:text-zinc-400 line-clamp-2 leading-relaxed mb-4">
            {item.description}
          </p>

          <span className="inline-flex items-center gap-1 text-sm font-medium text-zinc-900 dark:text-zinc-100 group-hover:gap-2 transition-all">
            查看教程
            <ArrowRight className="w-3.5 h-3.5" />
          </span>
        </div>
      </div>
    </Link>
  );
}

function ShowcaseListItem({ item }: { item: ShowcaseItem }) {
  return (
    <Link
      href={`/zh/showcase/${item.id}`}
      className="group flex items-center gap-4 py-4 px-4 -mx-4 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors"
    >
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
          {item.title}
        </h3>
      </div>

      <div className="flex items-center gap-6 flex-shrink-0">
        {item.category && (
          <span className="text-xs text-zinc-500 dark:text-zinc-400 w-20 text-center">
            {item.category}
          </span>
        )}

        <span className="text-xs text-zinc-400 dark:text-zinc-500 w-24 text-center font-mono">
          {item.model}
        </span>

        <div className="flex items-center gap-1.5 w-32">
          {item.features.slice(0, 2).map((feature) => (
            <span
              key={feature}
              className="px-2 py-0.5 text-[11px] font-medium rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
            >
              {feature}
            </span>
          ))}
        </div>

        <ArrowRight className="w-4 h-4 text-zinc-300 dark:text-zinc-600 group-hover:text-zinc-500 dark:group-hover:text-zinc-400 transition-colors" />
      </div>
    </Link>
  );
}

export function VideoShowcaseIndex() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
  const [visibleCount, setVisibleCount] = useState(9);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const allItems = useMemo(() => showcaseItems as ShowcaseItem[], []);
  const allItemIds = useMemo(() => new Set(allItems.map((item) => item.id)), [allItems]);

  const categoryTags = useMemo(() => {
    const categories = new Set<string>();
    for (const item of allItems) {
      if (item.category) categories.add(item.category);
    }
    return Array.from(categories).sort();
  }, [allItems]);

  const featureTags = useMemo(() => {
    const features = new Set<string>();
    for (const item of allItems) {
      for (const feature of item.features) {
        features.add(feature);
      }
    }
    return Array.from(features).sort();
  }, [allItems]);

  const filteredItems = useMemo(() => {
    return allItems.filter((item) => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesSearch =
          item.title.toLowerCase().includes(query) ||
          item.description.toLowerCase().includes(query);
        if (!matchesSearch) return false;
      }

      if (selectedCategories.length > 0) {
        if (!item.category || !selectedCategories.includes(item.category)) {
          return false;
        }
      }

      if (selectedFeatures.length > 0) {
        if (!item.features.some((feature) => selectedFeatures.includes(feature))) {
          return false;
        }
      }

      return true;
    });
  }, [allItems, searchQuery, selectedCategories, selectedFeatures]);

  React.useEffect(() => {
    setVisibleCount(9);
  }, [searchQuery, selectedCategories, selectedFeatures]);

  const toggleCategory = (category: string) => {
    setSelectedCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]
    );
  };

  const toggleFeature = (feature: string) => {
    setSelectedFeatures((prev) =>
      prev.includes(feature) ? prev.filter((f) => f !== feature) : [...prev, feature]
    );
  };

  const clearFilters = () => {
    setSearchQuery("");
    setSelectedCategories([]);
    setSelectedFeatures([]);
  };

  const hasActiveFilters =
    searchQuery || selectedCategories.length > 0 || selectedFeatures.length > 0;

  const itemsToShow = hasActiveFilters ? filteredItems : allItems;
  const displayedItems = itemsToShow.slice(0, visibleCount);
  const hasMore = visibleCount < itemsToShow.length;

  const handleShowMore = () => {
    setVisibleCount((prev) => prev + 9);
  };

  return (
    <div className="w-full">
      {/* Hero — left-aligned */}
      <section className="w-full px-4 md:px-8 pt-16 pb-12 md:pt-24 md:pb-16">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 mb-3">
            Qwen Code Showcases
          </h1>
          <p className="text-base md:text-lg text-zinc-500 dark:text-zinc-400 max-w-[55ch] leading-relaxed">
            从真实项目案例中学习 Qwen Code，掌握 AI 编程最佳实践
          </p>
        </div>
      </section>

      {/* Search + Filters */}
      <section className="w-full px-4 md:px-8 pb-10">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Search and View Toggle */}
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input
                type="text"
                placeholder="搜索案例..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-zinc-100/10 focus:border-zinc-400 dark:focus:border-zinc-600 transition-all placeholder:text-zinc-400"
              />
            </div>

            {/* View Toggle */}
            <div className="flex items-center border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
              <button
                onClick={() => setViewMode("grid")}
                className={`p-2 transition-colors ${
                  viewMode === "grid"
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
                }`}
                title="网格视图"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`p-2 transition-colors ${
                  viewMode === "list"
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
                }`}
                title="列表视图"
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Category */}
          <div>
            <span className="text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
              分类
            </span>
            <div className="flex flex-wrap gap-2 mt-2">
              {categoryTags.map((category) => (
                <button
                  key={category}
                  onClick={() => toggleCategory(category)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all active:scale-[0.96] ${
                    selectedCategories.includes(category)
                      ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                      : "border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-400 dark:hover:border-zinc-600 hover:text-zinc-900 dark:hover:text-zinc-200"
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>

          {/* Feature */}
          <div>
            <span className="text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
              功能
            </span>
            <div className="flex flex-wrap gap-2 mt-2">
              {featureTags.map((feature) => (
                <button
                  key={feature}
                  onClick={() => toggleFeature(feature)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all active:scale-[0.96] ${
                    selectedFeatures.includes(feature)
                      ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                      : "border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-400 dark:hover:border-zinc-600 hover:text-zinc-900 dark:hover:text-zinc-200"
                  }`}
                >
                  {feature}
                </button>
              ))}
            </div>
          </div>

          {/* Active filter info */}
          {hasActiveFilters && (
            <div className="flex items-center gap-3 text-sm text-zinc-500 dark:text-zinc-400">
              <span>
                {filteredItems.length} 个结果
              </span>
              <button
                onClick={clearFilters}
                className="underline underline-offset-2 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors"
              >
                清除筛选
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Divider */}
      <div className="w-full px-4 md:px-8">
        <div className="max-w-7xl mx-auto border-t border-zinc-200 dark:border-zinc-800" />
      </div>

      {/* Card Grid / List */}
      <section className="w-full px-4 md:px-8 py-12 md:py-16">
        <div className="max-w-7xl mx-auto">
          {displayedItems.length > 0 ? (
            <>
              {viewMode === "grid" ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
                  {displayedItems.map((item) => (
                    <ShowcaseCard key={item.id} item={item} />
                  ))}
                </div>
              ) : (
                <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {/* List Header */}
                  <div className="flex items-center gap-4 py-3 px-4 text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider border-b border-zinc-200 dark:border-zinc-800">
                    <div className="flex-1">标题</div>
                    <div className="flex items-center gap-6 flex-shrink-0">
                      <span className="w-20 text-center">分类</span>
                      <span className="w-24 text-center">模型</span>
                      <span className="w-32 text-center">功能</span>
                      <span className="w-4" />
                    </div>
                  </div>
                  {/* List Items */}
                  {displayedItems.map((item) => (
                    <ShowcaseListItem key={item.id} item={item} />
                  ))}
                </div>
              )}

              {hasMore && (
                <div className="flex justify-center mt-12">
                  <button
                    onClick={handleShowMore}
                    className="px-8 py-3 text-sm font-medium rounded-lg border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-all active:scale-[0.98]"
                  >
                    显示更多 ({itemsToShow.length - visibleCount} 个)
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="py-24 text-center">
              <p className="text-sm text-zinc-400 dark:text-zinc-500">
                未找到匹配的案例，尝试其他搜索词或筛选条件
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Learning Paths */}
      <section className="w-full px-4 md:px-8 pt-8 pb-20">
        <div className="max-w-7xl mx-auto">
          <div className="border-t border-zinc-200 dark:border-zinc-800 pt-16 mb-12">
            <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 mb-2">
              学习路径
            </h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              根据你的经验水平选择合适的学习路径
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-zinc-200 dark:bg-zinc-800 rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800">
            {LEARNING_PATHS.map((path) => (
              <div
                key={path.level}
                className="bg-background p-6 md:p-8"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-lg bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center text-zinc-600 dark:text-zinc-400">
                    {path.icon}
                  </div>
                  <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
                    {path.level}
                  </h3>
                </div>

                <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed mb-6">
                  {path.description}
                </p>

                <div className="space-y-1">
                  {path.cases
                    .filter((caseItem) => allItemIds.has(caseItem.id))
                    .map((caseItem, index) => (
                    <Link
                      key={caseItem.id}
                      href={`/zh/showcase/${caseItem.id}`}
                      className="flex items-center gap-3 py-2.5 px-3 -mx-3 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors group"
                    >
                      <span className="flex-shrink-0 text-xs font-mono text-zinc-400 dark:text-zinc-600 tabular-nums w-5">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="text-sm text-zinc-700 dark:text-zinc-300 group-hover:text-zinc-900 dark:group-hover:text-zinc-100 transition-colors">
                        {caseItem.label}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
