import React from "react";
import Link from "next/link";
import { getPageMap } from "nextra/page-map";
import { ArrowRight, ChevronDown } from "lucide-react";
import { getLocale, isWithinDays, NEW_BADGE_DAYS, getCategoryInfo, getBlogText, extractPosts, sortPostsByDate, type BlogPost } from "../lib/blog-utils";
import { withFileDates } from "../lib/blog-file-dates";

function PostItem({ post, lang }: { post: BlogPost; lang: string }) {
  const isNew = isWithinDays(post.date, NEW_BADGE_DAYS);
  const date = new Date(post.date);
  const locale = getLocale(lang);

  return (
    <Link
      href={post.route}
      className="group flex items-start gap-6 py-6 border-b border-border/40 hover:bg-muted/20 transition-colors -mx-4 px-4"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-2">
          {isNew && (
            <span className="text-[10px] font-bold uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded">
              NEW
            </span>
          )}
          <span className="text-xs text-muted-foreground">
            {date.toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric" })}
          </span>
        </div>
        <h2 className="text-lg font-bold mb-1 group-hover:text-primary transition-colors leading-snug">
          {post.title}
        </h2>
        <p className="text-muted-foreground text-sm line-clamp-2">
          {post.description}
        </p>
        {post.author && (
          <span className="text-xs text-muted-foreground mt-2 block">
            {post.author}
          </span>
        )}
      </div>

      <div className="hidden sm:flex items-center justify-center w-10 h-10 shrink-0">
        <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
      </div>
    </Link>
  );
}

/**
 * 博客分类文章列表组件
 * @param directory - 博客分类目录名（如 "updates"、"cases"）
 * @param lang - 语言代码，默认 "zh"
 * @param recentCount - 近期文章数量阈值。传入时，前 N 篇直接展示，其余折叠到"往期更新"中；不传则全部平铺展示
 */
export const BlogCategoryList = async ({
  directory,
  lang = "zh",
  recentCount,
}: {
  directory: string;
  lang?: string;
  /** 近期文章数量阈值。传入时，前 N 篇直接展示，其余折叠到"往期更新"中；不传则全部平铺展示 */
  recentCount?: number;
}) => {
  const pageMap = await getPageMap(`/${lang}/blog/${directory}`);
  const info = getCategoryInfo(directory, lang);

  const posts = sortPostsByDate(withFileDates(extractPosts(pageMap as any[])));
  const recentPosts = recentCount ? posts.slice(0, recentCount) : posts;
  const archivePosts = recentCount ? posts.slice(recentCount) : [];

  return (
    <div className="pt-4 pb-20">
      <div className="max-w-[90rem] mx-auto px-6 md:px-8">
        <header className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">
            {info.title}
          </h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            {info.description}
          </p>
        </header>

        <div className="flex flex-col gap-0 border-t border-border/40">
          {recentPosts.map((post) => (
            <PostItem key={post.route} post={post} lang={lang} />
          ))}
        </div>

        {archivePosts.length > 0 && (
          <details className="mt-10 group">
            <summary
              className="flex items-center gap-2 cursor-pointer list-none text-lg font-semibold text-muted-foreground hover:text-foreground transition-colors select-none"
              aria-label={`${getBlogText("pastUpdates", lang)} (${archivePosts.length})`}
            >
              <ChevronDown className="w-5 h-5 group-open:rotate-180 transition-transform" />
              {getBlogText("pastUpdates", lang)}
              <span className="text-sm font-normal text-muted-foreground/60">
                ({archivePosts.length})
              </span>
            </summary>
            <div className="flex flex-col gap-0 border-t border-border/40 mt-4">
              {archivePosts.map((post) => (
                <PostItem key={post.route} post={post} lang={lang} />
              ))}
            </div>
          </details>
        )}

        {posts.length === 0 && (
          <div className="text-center py-20">
            <p className="text-muted-foreground">{getBlogText("noArticles", lang)}</p>
          </div>
        )}
      </div>
    </div>
  );
};
