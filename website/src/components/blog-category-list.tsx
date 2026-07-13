import React from "react";
import Link from "next/link";
import { getPageMap } from "nextra/page-map";
import { ArrowRight } from "lucide-react";
import { getLocale, isWithinDays, NEW_BADGE_DAYS } from "../lib/blog-utils";

interface Post {
  title: string;
  date: string;
  description: string;
  author: string;
  route: string;
}

const CATEGORY_INFO: Record<string, { title: string; description: string }> = {
  quickstart: {
    title: "入门",
    description: "了解 Qwen Code 的核心概念，快速上手 AI 编程。",
  },
  cases: {
    title: "实战案例",
    description: "真实使用场景和教程，从办公自动化到代码开发。",
  },
  advanced: {
    title: "进阶应用",
    description: "Skills、百炼 CLI、公众号封面等高级功能指南。",
  },
  updates: {
    title: "周报更新",
    description: "每周产品版本发布记录、新功能与社区动态。",
  },
};

export const BlogCategoryList = async ({
  directory,
  lang = "zh",
}: {
  directory: string;
  lang?: string;
}) => {
  const pageMap = await getPageMap(`/${lang}/blog/${directory}`);
  const info = CATEGORY_INFO[directory] || { title: directory, description: "" };

  const posts: Post[] = [];

  for (const item of pageMap as any[]) {
    if (
      item.frontMatter &&
      item.route &&
      item.name !== "index"
    ) {
      posts.push({
        title: item.frontMatter.title || item.name,
        date: item.frontMatter.date || "",
        description: item.frontMatter.description || "",
        author: item.frontMatter.author || "",
        route: item.route,
      });
    }
  }

  posts.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

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
          {posts.map((post) => {
            const isNew = isWithinDays(post.date, NEW_BADGE_DAYS);
            const date = new Date(post.date);
            const locale = getLocale(lang);

            return (
              <Link
                key={post.route}
                href={post.route}
                className="group flex items-start gap-6 py-6 border-b border-border/40 hover:bg-muted/20 transition-colors -mx-4 px-4"
              >
                <div className="hidden sm:flex flex-col items-center justify-center w-16 shrink-0 text-center">
                  <span className="text-2xl font-bold text-foreground leading-none">
                    {date.getDate()}
                  </span>
                  <span className="text-xs text-muted-foreground uppercase mt-1">
                    {date.toLocaleDateString(locale, { month: "short" })}
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    {isNew && (
                      <span className="text-[10px] font-bold uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded">
                        NEW
                      </span>
                    )}
                    <span className="sm:hidden text-xs text-muted-foreground">
                      {date.toLocaleDateString(locale)}
                    </span>
                    <span className="hidden sm:inline text-xs text-muted-foreground">
                      {date.getFullYear()}年{date.getMonth() + 1}月
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
          })}
        </div>

        {posts.length === 0 && (
          <div className="text-center py-20">
            <p className="text-muted-foreground">暂无文章</p>
          </div>
        )}
      </div>
    </div>
  );
};
