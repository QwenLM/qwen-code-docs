"use client";

import React, { useState, useMemo } from "react";
import { Search, Play, Clock, BookOpen, Zap, Layers, Code } from "lucide-react";
import Link from "next/link";
import {
  heroVideo,
  guideVideos,
  featureVideos,
  skillsVideos,
  scenarioVideos,
  featureCategories,
  difficultyLevels,
  type VideoShowcaseItem,
} from "../showcase-videos-data";

interface ShowcaseCardProps {
  video: VideoShowcaseItem;
}

function ShowcaseCard({ video }: ShowcaseCardProps) {
  const difficultyConfig = difficultyLevels.find((d) => d.id === video.difficulty);

  return (
    <Link
      href={`/zh/showcase/${video.id}`}
      className="group block h-full"
    >
      <div className="h-full flex flex-col overflow-hidden rounded-2xl border border-border bg-card hover:border-violet-300 dark:hover:border-violet-700 transition-all duration-300 hover:shadow-lg dark:hover:shadow-xl active:scale-[0.98]">
        {/* Thumbnail */}
        <div className="relative aspect-video overflow-hidden shrink-0">
          <img
            src={video.thumbnail}
            alt={video.title}
            className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
            loading="lazy"
          />
          {video.videoUrl && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              <div className="w-14 h-14 rounded-full bg-white/90 flex items-center justify-center">
                <Play className="w-6 h-6 text-violet-600 ml-1" fill="currentColor" />
              </div>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-4 md:p-5 flex flex-col flex-1">
          {/* Category & Difficulty */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span className="px-2.5 py-1 rounded-md bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 text-xs font-medium">
              {featureCategories.find((c) => c.id === video.category)?.label || video.category}
            </span>
            {difficultyConfig && (
              <span className={`px-2.5 py-1 rounded-md text-xs font-medium ${difficultyConfig.color}`}>
                {difficultyConfig.label}
              </span>
            )}
          </div>

          {/* Title */}
          <h3 className="text-base md:text-lg font-semibold text-foreground group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors mb-2 line-clamp-1">
            {video.title}
          </h3>

          {/* Description */}
          <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2 mb-4 flex-1">
            {video.description}
          </p>

          {/* Command preview */}
          {video.command && (
            <div className="mt-auto bg-muted/50 rounded-md p-2.5 font-mono text-xs text-muted-foreground overflow-x-auto border border-border">
              <code>{video.command.split("\n")[0]}</code>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

interface SectionProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}

function Section({ title, subtitle, icon, children }: SectionProps) {
  return (
    <section className="w-full px-4 md:px-8 py-12">
      <div className="max-w-[1400px] mx-auto">
        {/* Section Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            {icon && (
              <div className="w-10 h-10 rounded-xl bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center">
                {icon}
              </div>
            )}
            <div>
              <h2 className="text-2xl md:text-3xl font-bold text-foreground">{title}</h2>
              {subtitle && (
                <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        {children}
      </div>
    </section>
  );
}

export function VideoShowcaseIndex() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>("all");

  const allVideos = useMemo(() => {
    return [...guideVideos, ...featureVideos, ...skillsVideos, ...scenarioVideos];
  }, []);

  const filteredVideos = useMemo(() => {
    return allVideos.filter((video) => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesSearch =
          video.title.toLowerCase().includes(query) ||
          video.description.toLowerCase().includes(query);
        if (!matchesSearch) return false;
      }

      // Category filter
      if (selectedCategory !== "all" && video.category !== selectedCategory) {
        return false;
      }

      // Difficulty filter
      if (selectedDifficulty !== "all" && video.difficulty !== selectedDifficulty) {
        return false;
      }

      return true;
    });
  }, [allVideos, searchQuery, selectedCategory, selectedDifficulty]);

  return (
    <div className="w-full">
      {/* Hero Section */}
      <section className="w-full px-4 md:px-8 py-12 bg-gradient-to-b from-violet-50 to-transparent dark:from-violet-950/20">
        <div className="max-w-[1400px] mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
            {/* Left: Text */}
            <div>
              <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-4">
                {heroVideo.title}
              </h1>
              <p className="text-lg text-muted-foreground mb-6 leading-relaxed">
                {heroVideo.description}
              </p>
              {heroVideo.link && (
                <a
                  href={heroVideo.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-lg font-medium transition-colors shadow-sm hover:shadow-md"
                >
                  <Play className="w-5 h-5" fill="currentColor" />
                  立即安装
                </a>
              )}
            </div>

            {/* Right: Video Thumbnail */}
            <div className="relative aspect-video rounded-2xl overflow-hidden shadow-2xl">
              {heroVideo.videoUrl ? (
                <video
                  src={heroVideo.videoUrl}
                  poster={heroVideo.thumbnail}
                  controls
                  className="w-full h-full object-cover"
                />
              ) : (
                <img
                  src={heroVideo.thumbnail}
                  alt={heroVideo.title}
                  className="w-full h-full object-cover"
                />
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Search & Filters */}
      <section className="w-full px-4 md:px-8 py-8 border-b border-border sticky top-0 bg-background/95 backdrop-blur-sm z-10">
        <div className="max-w-[1400px] mx-auto">
          <div className="flex flex-col md:flex-row gap-4 md:items-center md:justify-between">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <input
                type="text"
                placeholder="搜索视频演示..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
              />
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-2">
              {/* Category Filter */}
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="px-4 py-2.5 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all text-sm"
              >
                <option value="all">全部分类</option>
                {featureCategories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.label}
                  </option>
                ))}
              </select>

              {/* Difficulty Filter */}
              <select
                value={selectedDifficulty}
                onChange={(e) => setSelectedDifficulty(e.target.value)}
                className="px-4 py-2.5 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all text-sm"
              >
                <option value="all">全部场景</option>
                {difficultyLevels.map((diff) => (
                  <option key={diff.id} value={diff.id}>
                    {diff.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Results count */}
          <div className="mt-4 text-sm text-muted-foreground">
            找到 {filteredVideos.length} 个视频
            {(selectedCategory !== "all" || selectedDifficulty !== "all" || searchQuery) && (
              <button
                onClick={() => {
                  setSearchQuery("");
                  setSelectedCategory("all");
                  setSelectedDifficulty("all");
                }}
                className="ml-2 text-violet-600 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300"
              >
                清除筛选
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Guide Videos Section */}
      <Section
        title="入门指南"
        subtitle="从安装到配置，快速上手 Qwen Code"
        icon={<BookOpen className="w-5 h-5 text-violet-600 dark:text-violet-400" />}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {guideVideos.map((video) => (
            <ShowcaseCard key={video.id} video={video} />
          ))}
        </div>
      </Section>

      {/* Features Section */}
      <Section
        title="核心功能"
        subtitle="探索 Qwen Code 的强大能力"
        icon={<Zap className="w-5 h-5 text-violet-600 dark:text-violet-400" />}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {featureVideos.map((video) => (
            <ShowcaseCard key={video.id} video={video} />
          ))}
        </div>
      </Section>

      {/* Skills Section */}
      <Section
        title="Skills 扩展"
        subtitle="扩展你的 AI 编程能力"
        icon={<Layers className="w-5 h-5 text-violet-600 dark:text-violet-400" />}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {skillsVideos.map((video) => (
            <ShowcaseCard key={video.id} video={video} />
          ))}
        </div>
      </Section>

      {/* Scenarios Section */}
      <Section
        title="场景实战"
        subtitle="真实场景中的最佳实践"
        icon={<Code className="w-5 h-5 text-violet-600 dark:text-violet-400" />}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {scenarioVideos.map((video) => (
            <ShowcaseCard key={video.id} video={video} />
          ))}
        </div>
      </Section>

      {/* All Videos Filter View */}
      {searchQuery || selectedCategory !== "all" || selectedDifficulty !== "all" ? (
        <Section
          title="搜索结果"
          subtitle={filteredVideos.length > 0 ? `找到 ${filteredVideos.length} 个匹配的视频` : "未找到匹配的视频"}
          icon={<Search className="w-5 h-5 text-violet-600 dark:text-violet-400" />}
        >
          {filteredVideos.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredVideos.map((video) => (
                <ShowcaseCard key={video.id} video={video} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
                <Search className="w-7 h-7 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground max-w-[40ch]">
                未找到匹配的视频，尝试其他搜索词或筛选条件
              </p>
            </div>
          )}
        </Section>
      ) : null}
    </div>
  );
}
