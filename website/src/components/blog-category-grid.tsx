import React from "react";
import Link from "next/link";
import { getPageMap } from "nextra/page-map";
import { ArrowRight, Sparkles, BookOpen, Layers, Newspaper } from "lucide-react";
import { getLocale, isWithinDays, NEW_BADGE_DAYS, getCategoryInfo, getBlogText } from "../lib/blog-utils";

interface Post {
  title: string;
  date: string;
  description: string;
  route: string;
  category: string;
}

const CATEGORY_IDS = ["quickstart", "cases", "advanced", "updates"] as const;

const CATEGORY_ICONS: Record<string, typeof BookOpen> = {
  quickstart: BookOpen,
  cases: Sparkles,
  advanced: Layers,
  updates: Newspaper,
};

function extractPosts(pageMap: any[]): Post[] {
  const posts: Post[] = [];

  for (const item of pageMap) {
    if (item.children) {
      for (const child of item.children) {
        if (child.frontMatter && child.route && child.name !== "index") {
          posts.push({
            title: child.frontMatter.title || child.name,
            date: child.frontMatter.date || "",
            description: child.frontMatter.description || "",
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
        route: item.route,
        category: "root",
      });
    }
  }

  return posts;
}

export const BlogCategoryGrid = async ({ lang = "zh" }: { lang?: string }) => {
  const pageMap = await getPageMap(`/${lang}/blog`);
  const allPosts = extractPosts(pageMap).sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const counts = CATEGORY_IDS.reduce(
    (acc, catId) => {
      acc[catId] = allPosts.filter((p) => p.category === catId).length;
      return acc;
    },
    {} as Record<string, number>
  );

  const recentPosts = allPosts.slice(0, 4);

  return (
    <div className="min-h-screen pt-4 pb-20">
      <div className="max-w-[90rem] mx-auto px-6 md:px-8">
        <header className="mb-10">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">
            {getBlogText("blogTitle", lang)}
          </h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            {getBlogText("blogDescription", lang)}
          </p>
        </header>

        {/* Category Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-12">
          {CATEGORY_IDS.map((catId) => {
            const Icon = CATEGORY_ICONS[catId];
            const info = getCategoryInfo(catId, lang);
            const count = counts[catId] || 0;
            const hasNew = allPosts
              .filter((p) => p.category === catId)
              .some((p) => isWithinDays(p.date, NEW_BADGE_DAYS));

            return (
              <Link
                key={catId}
                href={`/${lang}/blog/${catId}`}
                className="group relative rounded-xl border border-border/60 bg-card p-6 hover:border-primary/40 hover:shadow-md transition-all"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                  {hasNew && (
                    <span className="text-[10px] font-bold uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                      NEW
                    </span>
                  )}
                </div>
                <h3 className="text-lg font-bold mb-1.5 group-hover:text-primary transition-colors">
                  {info.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">
                  {info.description}
                </p>
                <div className="flex items-center gap-1 mt-4 text-xs text-muted-foreground">
                  <span>{count} {getBlogText("articles", lang)}</span>
                  <ArrowRight className="w-3 h-3 ml-1 group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>
            );
          })}
        </div>

        {/* Recent Posts */}
        {recentPosts.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-xl font-bold">{getBlogText("recentUpdates", lang)}</h2>
              <span className="text-xs text-muted-foreground">
                （{NEW_BADGE_DAYS} {getBlogText("withinDays", lang)}）
              </span>
            </div>
            <div className="flex flex-col gap-0 border-t border-border/40">
              {recentPosts.map((post) => {
                const isNew = isWithinDays(post.date, NEW_BADGE_DAYS);
                const date = new Date(post.date);
                const locale = getLocale(lang);

                return (
                  <Link
                    key={post.route}
                    href={post.route}
                    className="group flex items-start gap-6 py-5 border-b border-border/40 hover:bg-muted/20 transition-colors -mx-4 px-4"
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
                      <div className="flex items-center gap-2 mb-1">
                        {isNew && (
                          <span className="text-[10px] font-bold uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded">
                            NEW
                          </span>
                        )}
                        <span className="sm:hidden text-xs text-muted-foreground">
                          {date.toLocaleDateString(locale)}
                        </span>
                      </div>
                      <h3 className="text-base font-bold mb-1 group-hover:text-primary transition-colors leading-snug">
                        {post.title}
                      </h3>
                      <p className="text-muted-foreground text-sm line-clamp-1">
                        {post.description}
                      </p>
                    </div>
                    <div className="hidden sm:flex items-center justify-center w-10 h-10 shrink-0">
                      <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
