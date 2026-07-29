"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { cn } from "../lib/utils";
import {
  getLocale,
  isWithinDays,
  NEW_BADGE_DAYS,
  getCategoryInfo,
  getBlogText,
  resolveImageUrl,
  type BlogPost,
} from "../lib/blog-utils";

const CATEGORY_IDS = ["quickstart", "cases", "advanced", "updates"] as const;

type FilterId = "all" | (typeof CATEGORY_IDS)[number];

const PAGE_SIZE = 12;

const CATEGORY_GLYPHS: Record<string, string> = {
  quickstart: ">_",
  cases: "~/",
  advanced: "**",
  updates: "##",
  root: ">_",
};

function NewBadge() {
  return (
    <span className="shrink-0 rounded bg-violet-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-violet-600 dark:text-violet-400">
      NEW
    </span>
  );
}

function CategoryTag({ post, lang }: { post: BlogPost; lang: string }) {
  const info = getCategoryInfo(post.category, lang);
  return (
    <span className="code-font shrink-0 text-xs text-violet-600 dark:text-violet-400">
      {info.title}
    </span>
  );
}

function Cover({ post, className }: { post: BlogPost; className?: string }) {
  if (post.image) {
    return (
      <div
        className={cn(
          "aspect-[2.35/1] overflow-hidden bg-muted/40 transition-colors group-hover:border-violet-500/40 dark:group-hover:border-violet-400/40",
          className
        )}
      >
        <img
          src={resolveImageUrl(post.image)}
          alt={post.title}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
        />
      </div>
    );
  }
  return (
    <div
      className={cn(
        "flex aspect-[2.35/1] items-center justify-center bg-gradient-to-br from-violet-500/[0.07] to-violet-500/[0.02] bg-[radial-gradient(circle,rgb(139_92_246/0.10)_1px,transparent_1px)] [background-size:auto,14px_14px] transition-colors group-hover:border-violet-500/40 dark:group-hover:border-violet-400/40",
        className
      )}
    >
      <span className="code-font text-3xl text-violet-500/30 select-none">
        {CATEGORY_GLYPHS[post.category] || ">_"}
      </span>
    </div>
  );
}

export function HeroPost({ post, lang }: { post: BlogPost; lang: string }) {
  const isNew = isWithinDays(post.date, NEW_BADGE_DAYS);
  const locale = getLocale(lang);

  return (
    <Link
      href={post.route}
      className="group grid items-center gap-8 md:grid-cols-[3fr_2fr] md:gap-12"
    >
      <Cover
        post={post}
        className="rounded-2xl border border-border/50 shadow-sm"
      />
      <div>
        <div className="flex items-center gap-3">
          <CategoryTag post={post} lang={lang} />
          {isNew && <NewBadge />}
        </div>
        <h2 className="mt-3 text-3xl font-bold leading-[1.15] tracking-tight text-balance md:text-[2.6rem] md:leading-[1.1]">
          <span className="transition-colors group-hover:text-violet-600 dark:group-hover:text-violet-400">
            {post.title}
          </span>
        </h2>
        <p className="mt-4 max-w-prose text-muted-foreground line-clamp-3 md:text-lg md:leading-relaxed">
          {post.description}
        </p>
        <div className="mt-6 flex items-center gap-3 text-sm text-muted-foreground">
          {post.author && <span>{post.author}</span>}
          {post.author && <span aria-hidden>·</span>}
          <time dateTime={post.date}>
            {new Date(post.date).toLocaleDateString(locale, {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </time>
        </div>
      </div>
    </Link>
  );
}

function ArticleCard({ post, lang }: { post: BlogPost; lang: string }) {
  const isNew = isWithinDays(post.date, NEW_BADGE_DAYS);
  const locale = getLocale(lang);

  return (
    <Link href={post.route} className="group flex h-full flex-col">
      <Cover post={post} className="rounded-xl border border-border/50" />
      <div className="mt-4 flex items-center gap-3">
        <CategoryTag post={post} lang={lang} />
        {isNew && <NewBadge />}
      </div>
      <h3 className="mt-1.5 text-lg font-bold leading-snug line-clamp-2 transition-colors group-hover:text-violet-600 dark:group-hover:text-violet-400">
        {post.title}
      </h3>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground line-clamp-2">
        {post.description}
      </p>
      <time
        dateTime={post.date}
        className="code-font mt-auto pt-3 text-xs text-muted-foreground/80"
      >
        {new Date(post.date).toLocaleDateString(locale, {
          year: "numeric",
          month: "long",
          day: "numeric",
        })}
      </time>
    </Link>
  );
}

function FilterPill({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors duration-200",
        active
          ? "border-transparent bg-violet-700 text-white dark:bg-violet-400 dark:text-violet-950"
          : "border-border/60 text-muted-foreground hover:border-foreground/30 hover:text-foreground"
      )}
    >
      {label}
      <span className="code-font ml-1.5 text-[11px] font-normal opacity-70">
        {count}
      </span>
    </button>
  );
}

export function BlogFeed({
  posts,
  heroRoute,
  lang,
}: {
  posts: BlogPost[];
  heroRoute: string;
  lang: string;
}) {
  const [filter, setFilter] = useState<FilterId>("all");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const counts = CATEGORY_IDS.reduce(
    (acc, catId) => {
      acc[catId] = posts.filter((p) => p.category === catId).length;
      return acc;
    },
    {} as Record<string, number>
  );
  const evergreenCount = posts.filter((p) => p.category !== "updates").length;

  const filtered = posts.filter((p) => {
    if (p.route === heroRoute) return false;
    if (filter === "all") return p.category !== "updates";
    return p.category === filter;
  });
  const visible = filtered.slice(0, visibleCount);
  const remaining = filtered.length - visible.length;

  function changeFilter(next: FilterId) {
    setFilter(next);
    setVisibleCount(PAGE_SIZE);
  }

  return (
    <section>
      <div className="mb-8 flex flex-wrap gap-2">
        <FilterPill
          active={filter === "all"}
          label={getBlogText("allArticles", lang)}
          count={evergreenCount}
          onClick={() => changeFilter("all")}
        />
        {CATEGORY_IDS.map((catId) => (
          <FilterPill
            key={catId}
            active={filter === catId}
            label={getCategoryInfo(catId, lang).title}
            count={counts[catId] || 0}
            onClick={() => changeFilter(catId)}
          />
        ))}
      </div>

      <div
        key={filter}
        className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3"
      >
        {visible.map((post, i) => (
          <div
            key={post.route}
            className="feed-item h-full"
            style={{ animationDelay: `${(i % PAGE_SIZE) * 45}ms` }}
          >
            <ArticleCard post={post} lang={lang} />
          </div>
        ))}
      </div>

      {visible.length === 0 && (
        <p className="py-16 text-center text-muted-foreground">
          {getBlogText("noArticles", lang)}
        </p>
      )}

      {remaining > 0 && (
        <div className="mt-12 flex justify-center">
          <button
            type="button"
            onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
            className="group inline-flex items-center gap-2 rounded-full border border-border/60 px-6 py-2.5 text-sm font-semibold text-muted-foreground transition-colors duration-200 hover:border-violet-500/50 hover:text-violet-600 dark:hover:text-violet-400"
          >
            {getBlogText("loadMore", lang)}
            <span className="code-font text-xs opacity-70">{remaining}</span>
            <ChevronDown className="w-4 h-4 transition-transform duration-200 group-hover:translate-y-0.5 motion-reduce:transition-none" />
          </button>
        </div>
      )}
    </section>
  );
}

function WeeklyHighlightRow({ post, lang }: { post: BlogPost; lang: string }) {
  const isNew = isWithinDays(post.date, NEW_BADGE_DAYS);
  const locale = getLocale(lang);

  return (
    <Link
      href={post.route}
      className="group flex items-center gap-6 py-4"
    >
      <Cover
        post={post}
        className="w-64 shrink-0 rounded-xl border border-border/50 sm:w-80"
      />
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          <CategoryTag post={post} lang={lang} />
          {isNew && <NewBadge />}
        </div>
        <h3 className="mt-1.5 text-lg font-bold leading-snug line-clamp-2 transition-colors group-hover:text-violet-600 dark:group-hover:text-violet-400 sm:text-xl">
          {post.title}
        </h3>
        <time
          dateTime={post.date}
          className="code-font mt-1.5 block text-xs text-muted-foreground/80"
        >
          {new Date(post.date).toLocaleDateString(locale, {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </time>
      </div>
    </Link>
  );
}

export function RecentUpdates({
  post,
  lang,
}: {
  post: BlogPost;
  lang: string;
}) {
  return (
    <section className="mb-16">
      <div className="mb-1 flex items-center gap-3">
        <span aria-hidden className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-500 opacity-60 [animation-duration:2s] motion-reduce:animate-none" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-violet-600 dark:bg-violet-400" />
        </span>
        <h2 className="text-lg font-bold">
          {getBlogText("recentUpdates", lang)}
        </h2>
        <span aria-hidden className="h-px flex-1 bg-border/40" />
      </div>
      <WeeklyHighlightRow post={post} lang={lang} />
    </section>
  );
}
