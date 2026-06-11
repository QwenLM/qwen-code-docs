"use client";

import React, { useState, useMemo, useEffect, useCallback } from "react";
import { Search, ArrowRight, ArrowLeft, BookOpen, Zap, GraduationCap, LayoutGrid, List, Copy, Check } from "lucide-react";
import Link from "next/link";

export interface Step {
  title: string;
  description: string;
  command?: string;
}

export interface ShowcaseItem {
  id: string;
  title: string;
  description: string;
  category: string;
  features: string[];
  thumbnail: string;
  videoUrl: string | null;
  model: string;
  author?: string;
  date?: string;
  overview?: string;
  steps?: Step[];
}

export interface LearningPathCase {
  id: string;
  label: string;
}

export interface LearningPath {
  level: string;
  description: string;
  iconType: "beginner" | "intermediate" | "advanced";
  cases: LearningPathCase[];
}

interface VideoShowcaseIndexProps {
  items: ShowcaseItem[];
  learningPaths: LearningPath[];
  viewLabel?: string;
  backLabel?: string;
  stepsLabel?: string;
  ctaLabel?: string;
  ctaHref?: string;
  heroTitle?: string;
  heroDescription?: string;
  learningPathsTitle?: string;
  learningPathsDescription?: string;
  searchPlaceholder?: string;
  gridViewLabel?: string;
  listViewLabel?: string;
  categoryLabel?: string;
  featureLabel?: string;
  resultsLabel?: string;
  clearFiltersLabel?: string;
  titleColumnLabel?: string;
  showMoreLabel?: string;
  noResultsLabel?: string;
  copyLabel?: string;
}

function CommandBlock({ command, copyLabel = "复制" }: { command: string; copyLabel?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(command).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [command]);

  return (
    <div className="relative mt-3 group">
      <pre className="px-4 py-3 pr-12 rounded-lg bg-zinc-100 [html.dark_&]:bg-zinc-900 text-[13px] font-mono text-zinc-800 [html.dark_&]:text-zinc-300 overflow-x-auto whitespace-pre-wrap break-all border border-zinc-200 [html.dark_&]:border-zinc-800">
        <code>{command}</code>
      </pre>
      <button
        onClick={handleCopy}
        className="absolute top-2.5 right-2.5 p-1.5 rounded-md text-zinc-400 hover:text-zinc-700 [html.dark_&]:hover:text-zinc-200 hover:bg-zinc-200/60 [html.dark_&]:hover:bg-zinc-700/60 transition-all opacity-0 group-hover:opacity-100 cursor-pointer"
        title={copyLabel}
      >
        {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}

const ICON_MAP = {
  beginner: <BookOpen className="w-5 h-5" />,
  intermediate: <Zap className="w-5 h-5" />,
  advanced: <GraduationCap className="w-5 h-5" />,
};

function renderMarkdownText(text: string): React.ReactNode {
  let preprocessed = text;
  preprocessed = preprocessed.replace(/(?<!\n)\s+\*\*(\d+)\.\s/g, "\n**$1. ");
  preprocessed = preprocessed.replace(/(?<!\n)\s+- /g, "\n- ");
  preprocessed = preprocessed.replace(/(?<!\n)\s+(\d+)\.\s+/g, "\n$1. ");

  const lines = preprocessed.split(/\n/);
  const result: React.ReactNode[] = [];
  let currentList: { type: "ul" | "ol"; items: React.ReactNode[] } | null = null;

  const flushList = () => {
    if (!currentList) return;
    if (currentList.type === "ul") {
      result.push(<ul key={`list-${result.length}`} className="ml-4 list-disc space-y-1 my-1">{currentList.items}</ul>);
    } else {
      result.push(<ol key={`list-${result.length}`} className="ml-4 list-decimal space-y-1 my-1">{currentList.items}</ol>);
    }
    currentList = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const unorderedMatch = trimmed.match(/^- (.+)/);
    const orderedMatch = trimmed.match(/^(\d+)\.\s+(.+)/);

    if (unorderedMatch) {
      if (currentList?.type !== "ul") { flushList(); currentList = { type: "ul", items: [] }; }
      currentList.items.push(<li key={i}>{renderInlineMarkdown(unorderedMatch[1])}</li>);
    } else if (orderedMatch) {
      if (currentList?.type !== "ol") { flushList(); currentList = { type: "ol", items: [] }; }
      currentList.items.push(<li key={i}>{renderInlineMarkdown(orderedMatch[2])}</li>);
    } else {
      flushList();
      if (trimmed === "") {
        result.push(<br key={i} />);
      } else {
        if (result.length > 0) result.push(<br key={`br-${i}`} />);
        result.push(<React.Fragment key={i}>{renderInlineMarkdown(trimmed)}</React.Fragment>);
      }
    }
  }
  flushList();
  return <>{result}</>;
}

function renderInlineMarkdown(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*(.+?)\*\*|`(.+?)`|\[(.+?)\]\((.+?)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[2]) {
      parts.push(<strong key={match.index} className="font-semibold text-zinc-800 [html.dark_&]:text-zinc-200">{match[2]}</strong>);
    } else if (match[3]) {
      parts.push(<code key={match.index} className="px-1 py-0.5 rounded bg-[#EBEBEB] [html.dark_&]:bg-zinc-700 text-[#D46461] text-xs font-mono">{match[3]}</code>);
    } else if (match[4] && match[5]) {
      parts.push(<a key={match.index} href={match[5]} target="_blank" rel="noopener noreferrer" className="text-blue-600 [html.dark_&]:text-blue-400 underline underline-offset-2">{match[4]}</a>);
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return <>{parts}</>;
}

function ShowcaseCard({ item, onSelect, viewLabel }: { item: ShowcaseItem; onSelect: (id: string) => void; viewLabel: string }) {
  return (
    <button onClick={() => onSelect(item.id)} className="group block text-left w-full cursor-pointer">
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-transparent [html.dark_&]:border-zinc-800 hover:border-zinc-400 [html.dark_&]:hover:border-zinc-600 transition-all duration-300 hover:shadow-[0_8px_30px_-12px_rgba(0,0,0,0.12)] [html.dark_&]:hover:shadow-[0_8px_30px_-12px_rgba(0,0,0,0.4)] active:scale-[0.98]">
        <div className="relative aspect-video overflow-hidden bg-zinc-100 [html.dark_&]:bg-zinc-900">
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
              <span className="px-2 py-0.5 text-[11px] font-medium rounded border border-zinc-300 [html.dark_&]:border-zinc-700 text-zinc-700 [html.dark_&]:text-zinc-300">
                {item.category}
              </span>
            )}
            {item.features.slice(0, 2).map((feature) => (
              <span
                key={feature}
                className="px-2 py-0.5 text-[11px] font-medium rounded text-zinc-500 [html.dark_&]:text-zinc-400"
              >
                {feature}
              </span>
            ))}
          </div>

          <h3 className="text-[15px] font-semibold text-zinc-900 [html.dark_&]:text-zinc-100 mb-1.5 line-clamp-1 tracking-tight">
            {item.title}
          </h3>

          <p className="text-sm text-zinc-500 [html.dark_&]:text-zinc-400 line-clamp-2 leading-relaxed mb-4">
            {item.description}
          </p>

          <span className="inline-flex items-center gap-1 text-sm font-medium text-zinc-900 [html.dark_&]:text-zinc-100 group-hover:gap-2 transition-all">
            {viewLabel}
            <ArrowRight className="w-3.5 h-3.5" />
          </span>
        </div>
      </div>
    </button>
  );
}

function ShowcaseListItem({ item, onSelect }: { item: ShowcaseItem; onSelect: (id: string) => void }) {
  return (
    <button
      onClick={() => onSelect(item.id)}
      className="group flex items-center gap-6 py-4 px-4 -mx-4 rounded-lg hover:bg-zinc-50 [html.dark_&]:hover:bg-zinc-900/50 transition-colors w-full text-left cursor-pointer"
    >
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-medium text-zinc-900 [html.dark_&]:text-zinc-100 truncate group-hover:text-blue-600 [html.dark_&]:group-hover:text-blue-400 transition-colors">
          {item.title}
        </h3>
        <p className="text-xs text-zinc-500 [html.dark_&]:text-zinc-400 mt-1 line-clamp-1">
          {item.description}
        </p>
      </div>

      <div className="flex items-center gap-4 flex-shrink-0">
        {item.category && (
          <span className="px-2.5 py-1 text-xs font-medium rounded border border-zinc-200 [html.dark_&]:border-zinc-700 text-zinc-600 [html.dark_&]:text-zinc-300">
            {item.category}
          </span>
        )}

        <div className="flex items-center gap-1.5">
          {item.features.slice(0, 2).map((feature) => (
            <span
              key={feature}
              className="px-2 py-0.5 text-xs rounded bg-zinc-100 [html.dark_&]:bg-zinc-800 text-zinc-500 [html.dark_&]:text-zinc-400"
            >
              {feature}
            </span>
          ))}
        </div>

        <ArrowRight className="w-4 h-4 text-zinc-300 [html.dark_&]:text-zinc-600 group-hover:text-blue-500 [html.dark_&]:group-hover:text-blue-400 transition-colors" />
      </div>
    </button>
  );
}

export function VideoShowcaseIndex({ items, learningPaths, viewLabel = "查看教程", backLabel = "返回全部案例", stepsLabel = "操作步骤", ctaLabel = "立即开始使用 Qwen Code", ctaHref = "/zh/users/overview", heroTitle = "Qwen Code Showcases", heroDescription = "从真实项目案例中学习 Qwen Code，掌握 AI 编程最佳实践", learningPathsTitle = "学习路径", learningPathsDescription = "根据你的经验水平选择合适的学习路径", searchPlaceholder = "搜索案例...", gridViewLabel = "网格视图", listViewLabel = "列表视图", categoryLabel = "分类", featureLabel = "功能", resultsLabel = "个结果", clearFiltersLabel = "清除筛选", titleColumnLabel = "标题", showMoreLabel = "显示更多", noResultsLabel = "未找到匹配的案例，尝试其他搜索词或筛选条件", copyLabel = "复制" }: VideoShowcaseIndexProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
  const [visibleCount, setVisibleCount] = useState(9);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  const allItems = useMemo(() => [...items].reverse(), [items]);
  const allItemIds = useMemo(() => new Set(allItems.map((item) => item.id)), [allItems]);

  const basePath = typeof window !== "undefined"
    ? window.location.pathname.replace(/\/$/, "")
    : "";

  // Read selected item from URL query parameter on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    const query = window.location.search.replace(/^\?/, "").split("&")[0].split("=")[0];
    if (query && allItems.some((item) => item.id === query)) {
      setSelectedItemId(query);
    }
  }, [allItems]);

  const handleSelectItem = useCallback((itemId: string) => {
    setSelectedItemId(itemId);
    window.history.pushState(null, "", `${basePath}?${itemId}`);
    window.scrollTo({ top: 0 });
  }, [basePath]);

  const handleCloseDetail = useCallback(() => {
    setSelectedItemId(null);
    window.history.pushState(null, "", basePath || window.location.pathname);
  }, [basePath]);

  // Handle browser back button
  useEffect(() => {
    const handlePopState = () => {
      const query = window.location.search.replace(/^\?/, "").split("&")[0].split("=")[0];
      if (query && allItems.some((item) => item.id === query)) {
        setSelectedItemId(query);
      } else {
        setSelectedItemId(null);
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [allItems]);

  const selectedItem = useMemo(
    () => (selectedItemId ? allItems.find((item) => item.id === selectedItemId) ?? null : null),
    [selectedItemId, allItems]
  );

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

  if (selectedItem) {
    return (
      <div className="w-full min-h-[80vh] bg-transparent text-zinc-900 [html.dark_&]:text-zinc-100">
        {/* Back Navigation */}
        <div className="w-full px-4 md:px-8 pt-8">
          <div className="max-w-4xl mx-auto">
            <button
              onClick={handleCloseDetail}
              className="inline-flex items-center gap-2 text-sm text-zinc-500 [html.dark_&]:text-zinc-400 hover:text-zinc-900 [html.dark_&]:hover:text-zinc-200 transition-colors cursor-pointer group"
            >
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
              {backLabel}
            </button>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 md:px-8">
          {/* Title + Meta Header */}
          <div className="pt-10 pb-6">
            <h1 className="text-3xl md:text-4xl font-bold text-zinc-900 [html.dark_&]:text-zinc-100 tracking-tight mb-5 leading-tight">
              {selectedItem.title}
            </h1>

            <div className="flex flex-wrap items-center gap-2.5">
              {selectedItem.category && (
                <span className="px-3 py-1 rounded-full bg-violet-50 text-violet-700 [html.dark_&]:bg-violet-900/30 [html.dark_&]:text-violet-300 text-xs font-medium border border-violet-200/60 [html.dark_&]:border-violet-800/40">
                  {selectedItem.category}
                </span>
              )}
              {selectedItem.model && (
                <span className="px-3 py-1 rounded-full bg-purple-50 text-purple-700 [html.dark_&]:bg-purple-900/30 [html.dark_&]:text-purple-300 text-xs font-medium font-mono border border-purple-200/60 [html.dark_&]:border-purple-800/40">
                  {selectedItem.model}
                </span>
              )}
              {selectedItem.features?.map((feature) => (
                <span
                  key={feature}
                  className="px-2.5 py-1 rounded-full bg-zinc-50 [html.dark_&]:bg-zinc-800/60 text-zinc-500 [html.dark_&]:text-zinc-400 text-xs font-medium border border-zinc-200/60 [html.dark_&]:border-zinc-700/40"
                >
                  {feature}
                </span>
              ))}
            </div>
          </div>

          {/* Video / Thumbnail */}
          <div className="pb-8">
            <div className="relative bg-zinc-950 w-full aspect-video rounded-xl overflow-hidden ring-1 ring-zinc-200 [html.dark_&]:ring-zinc-800">
              {selectedItem.videoUrl ? (
                <video
                  src={selectedItem.videoUrl}
                  poster={selectedItem.thumbnail}
                  controls
                  autoPlay
                  className="w-full h-full object-contain"
                />
              ) : selectedItem.thumbnail ? (
                <img
                  src={selectedItem.thumbnail}
                  alt={selectedItem.title}
                  className="w-full h-full object-contain"
                />
              ) : null}
            </div>
          </div>

          {/* Overview */}
          {selectedItem.overview && (
            <div className="pb-8">
              <div className="text-[15px] text-zinc-700 [html.dark_&]:text-zinc-300 leading-[1.8]">
                {renderMarkdownText(selectedItem.overview)}
              </div>
            </div>
          )}

          {/* Steps */}
          {selectedItem.steps && selectedItem.steps.length > 0 && (
            <div className="pb-10">
              <div className="border-t border-zinc-200 [html.dark_&]:border-zinc-800 pt-8 mb-6">
                <h2 className="text-xl font-semibold text-zinc-900 [html.dark_&]:text-zinc-100 tracking-tight">
                  {stepsLabel}
                </h2>
              </div>
              <div className="space-y-8">
                {selectedItem.steps.map((step, index) => (
                  <div key={index} className="flex gap-5">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-zinc-900 [html.dark_&]:bg-zinc-100 flex items-center justify-center text-xs font-bold text-white [html.dark_&]:text-zinc-900 mt-0.5">
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0 pt-1">
                      <h3 className="text-base font-semibold text-zinc-900 [html.dark_&]:text-zinc-100 mb-2">
                        {step.title}
                      </h3>
                      {step.description && (
                        <div className="text-sm text-zinc-600 [html.dark_&]:text-zinc-400 leading-[1.8]">
                          {renderMarkdownText(step.description)}
                        </div>
                      )}
                      {step.command && (
                        <CommandBlock command={step.command} copyLabel={copyLabel} />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* CTA */}
          <div className="border-t border-zinc-200 [html.dark_&]:border-zinc-800 py-12">
            <div className="flex flex-col items-center gap-4">
              <Link
                href={ctaHref}
                className="inline-flex items-center justify-center px-8 py-3 bg-zinc-900 [html.dark_&]:bg-zinc-100 text-white [html.dark_&]:text-zinc-900 rounded-lg font-semibold no-underline text-sm hover:bg-zinc-800 [html.dark_&]:hover:bg-zinc-200 transition-colors active:scale-[0.98]"
              >
                {ctaLabel}
              </Link>
              <button
                onClick={handleCloseDetail}
                className="inline-flex items-center gap-1.5 text-sm text-zinc-400 [html.dark_&]:text-zinc-500 hover:text-zinc-900 [html.dark_&]:hover:text-zinc-200 transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                {backLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full bg-transparent text-zinc-900 [html.dark_&]:text-zinc-100">
      {/* Hero — left-aligned */}
      <section className="w-full px-4 md:px-8 pt-12 pb-6 md:pt-16 md:pb-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-zinc-900 [html.dark_&]:text-zinc-100 mb-3">
            {heroTitle}
          </h1>
          <p className="text-base md:text-lg text-zinc-500 [html.dark_&]:text-zinc-400 max-w-[55ch] leading-relaxed">
            {heroDescription}
          </p>
        </div>
      </section>

      {/* Learning Paths */}
      <section className="w-full px-4 md:px-8 pt-4 pb-10">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900 [html.dark_&]:text-zinc-100 mb-2">
            {learningPathsTitle}
          </h2>
          <p className="text-sm text-zinc-500 [html.dark_&]:text-zinc-400 mb-8">
            {learningPathsDescription}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-zinc-200/70 [html.dark_&]:bg-zinc-800 rounded-xl overflow-hidden border border-zinc-200/70 [html.dark_&]:border-zinc-800">
            {learningPaths.map((path) => (
              <div
                key={path.level}
                className="bg-zinc-100/50 p-6 md:p-8 [html.dark_&]:bg-transparent"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-lg bg-zinc-100 [html.dark_&]:bg-zinc-900 flex items-center justify-center text-zinc-600 [html.dark_&]:text-zinc-400">
                    {ICON_MAP[path.iconType]}
                  </div>
                  <h3 className="text-base font-semibold text-zinc-900 [html.dark_&]:text-zinc-100 tracking-tight">
                    {path.level}
                  </h3>
                </div>

                <p className="text-sm text-zinc-500 [html.dark_&]:text-zinc-400 leading-relaxed mb-6">
                  {path.description}
                </p>

                <div className="space-y-1">
                  {path.cases
                    .filter((caseItem) => allItemIds.has(caseItem.id))
                    .map((caseItem, index) => (
                    <button
                      key={caseItem.id}
                      onClick={() => handleSelectItem(caseItem.id)}
                      className="flex items-center gap-3 py-2.5 px-3 -mx-3 rounded-lg hover:bg-zinc-50 [html.dark_&]:hover:bg-zinc-900 transition-colors group w-full text-left cursor-pointer"
                    >
                      <span className="flex-shrink-0 text-xs font-mono text-zinc-400 [html.dark_&]:text-zinc-600 tabular-nums w-5">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="text-sm text-zinc-700 [html.dark_&]:text-zinc-300 group-hover:text-zinc-900 [html.dark_&]:group-hover:text-zinc-100 transition-colors">
                        {caseItem.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Divider */}
      <div className="w-full px-4 md:px-8">
        <div className="max-w-7xl mx-auto border-t border-zinc-200 [html.dark_&]:border-zinc-800" />
      </div>

      {/* Search + Filters */}
      <section className="w-full px-4 md:px-8 py-6">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Search and View Toggle */}
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input
                type="text"
                placeholder={searchPlaceholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-zinc-300 [html.dark_&]:border-zinc-800 bg-transparent text-sm text-zinc-900 [html.dark_&]:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 [html.dark_&]:focus:ring-zinc-100/10 focus:border-zinc-500 [html.dark_&]:focus:border-zinc-600 transition-all placeholder:text-zinc-400"
              />
            </div>

            {/* View Toggle */}
            <div className="flex items-center border border-zinc-300 [html.dark_&]:border-zinc-800 rounded-lg overflow-hidden bg-transparent">
              <button
                onClick={() => setViewMode("grid")}
                className={`p-2 transition-colors ${
                  viewMode === "grid"
                    ? "bg-zinc-900 text-white [html.dark_&]:bg-zinc-100 [html.dark_&]:text-zinc-900"
                    : "text-zinc-500 hover:text-zinc-900 [html.dark_&]:hover:text-zinc-200"
                }`}
                title={gridViewLabel}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`p-2 transition-colors ${
                  viewMode === "list"
                    ? "bg-zinc-900 text-white [html.dark_&]:bg-zinc-100 [html.dark_&]:text-zinc-900"
                    : "text-zinc-500 hover:text-zinc-900 [html.dark_&]:hover:text-zinc-200"
                }`}
                title={listViewLabel}
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Category */}
          <div>
            <span className="text-xs font-medium text-zinc-400 [html.dark_&]:text-zinc-500 uppercase tracking-wider">
              {categoryLabel}
            </span>
            <div className="flex flex-wrap gap-2 mt-2">
              {categoryTags.map((category) => (
                <button
                  key={category}
                  onClick={() => toggleCategory(category)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all active:scale-[0.96] ${
                    selectedCategories.includes(category)
                      ? "bg-zinc-900 text-white [html.dark_&]:bg-zinc-100 [html.dark_&]:text-zinc-900"
                      : "border border-zinc-300 [html.dark_&]:border-zinc-800 bg-transparent text-zinc-700 [html.dark_&]:text-zinc-400 hover:border-zinc-500 [html.dark_&]:hover:border-zinc-600 hover:text-zinc-950 [html.dark_&]:hover:text-zinc-200"
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>

          {/* Feature */}
          <div>
            <span className="text-xs font-medium text-zinc-400 [html.dark_&]:text-zinc-500 uppercase tracking-wider">
              {featureLabel}
            </span>
            <div className="flex flex-wrap gap-2 mt-2">
              {featureTags.map((feature) => (
                <button
                  key={feature}
                  onClick={() => toggleFeature(feature)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all active:scale-[0.96] ${
                    selectedFeatures.includes(feature)
                      ? "bg-zinc-900 text-white [html.dark_&]:bg-zinc-100 [html.dark_&]:text-zinc-900"
                      : "border border-zinc-300 [html.dark_&]:border-zinc-800 bg-transparent text-zinc-700 [html.dark_&]:text-zinc-400 hover:border-zinc-500 [html.dark_&]:hover:border-zinc-600 hover:text-zinc-950 [html.dark_&]:hover:text-zinc-200"
                  }`}
                >
                  {feature}
                </button>
              ))}
            </div>
          </div>

          {/* Active filter info */}
          {hasActiveFilters && (
            <div className="flex items-center gap-3 text-sm text-zinc-500 [html.dark_&]:text-zinc-400">
              <span>
                {filteredItems.length} {resultsLabel}
              </span>
              <button
                onClick={clearFilters}
                className="underline underline-offset-2 hover:text-zinc-900 [html.dark_&]:hover:text-zinc-200 transition-colors"
              >
                {clearFiltersLabel}
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Card Grid / List */}
      <section className="w-full px-4 md:px-8 pt-2 pb-12 md:pb-16">
        <div className="max-w-7xl mx-auto">
          {displayedItems.length > 0 ? (
            <>
              {viewMode === "grid" ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
                  {displayedItems.map((item) => (
                    <ShowcaseCard key={item.id} item={item} onSelect={handleSelectItem} viewLabel={viewLabel} />
                  ))}
                </div>
              ) : (
                <div className="divide-y divide-zinc-200 [html.dark_&]:divide-zinc-800">
                  {/* List Header */}
                  <div className="flex items-center gap-6 py-3 px-4 text-xs font-medium text-zinc-400 [html.dark_&]:text-zinc-500 uppercase tracking-wider border-b border-zinc-200 [html.dark_&]:border-zinc-800">
                    <div className="flex-1">{titleColumnLabel}</div>
                    <div className="flex items-center gap-4 flex-shrink-0">
                      <span className="text-center">{categoryLabel}</span>
                      <span>{featureLabel}</span>
                      <span className="w-4" />
                    </div>
                  </div>
                  {/* List Items */}
                  {displayedItems.map((item) => (
                    <ShowcaseListItem key={item.id} item={item} onSelect={handleSelectItem} />
                  ))}
                </div>
              )}

              {hasMore && (
                <div className="flex justify-center mt-12">
                  <button
                    onClick={handleShowMore}
                    className="px-8 py-3 text-sm font-medium rounded-lg border border-zinc-300 [html.dark_&]:border-zinc-700 text-zinc-700 [html.dark_&]:text-zinc-300 hover:bg-zinc-50 [html.dark_&]:hover:bg-zinc-900 transition-all active:scale-[0.98]"
                  >
                    {showMoreLabel} ({itemsToShow.length - visibleCount})
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="py-24 text-center">
              <p className="text-sm text-zinc-400 [html.dark_&]:text-zinc-500">
                {noResultsLabel}
              </p>
            </div>
          )}
        </div>
      </section>

    </div>
  );
}
