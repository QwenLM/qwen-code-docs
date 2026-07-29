import React from "react";
import { getPageMap } from "nextra/page-map";
import { extractPosts, sortPostsByDate, getBlogText } from "../lib/blog-utils";
import { withFileDates } from "../lib/blog-file-dates";
import { HeroPost, RecentUpdates, BlogFeed } from "./blog-feed";

export const BlogHome = async ({ lang = "zh" }: { lang?: string }) => {
  const pageMap = await getPageMap(`/${lang}/blog`);
  const allPosts = sortPostsByDate(withFileDates(extractPosts(pageMap)));

  const evergreen = allPosts.filter((p) => p.category !== "updates");
  const weeklies = allPosts.filter((p) => p.category === "updates");
  const heroPost = evergreen[0];

  return (
    <div className="relative overflow-x-clip pt-4 pb-20">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 right-[-6rem] h-[30rem] w-[30rem] rounded-full bg-violet-500/[0.06] blur-3xl dark:bg-violet-500/[0.09]"
      />
      <div className="relative mx-auto max-w-[90rem] px-6 md:px-8">
        <header className="mb-12">
          <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            {getBlogText("blogTitle", lang)}
          </h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            {getBlogText("blogDescription", lang)}
          </p>
        </header>

        {heroPost && (
          <section className="mb-16">
            <HeroPost post={heroPost} lang={lang} />
          </section>
        )}

        {weeklies[0] && <RecentUpdates post={weeklies[0]} lang={lang} />}

        <BlogFeed
          posts={allPosts}
          heroRoute={heroPost?.route ?? ""}
          lang={lang}
        />
      </div>
    </div>
  );
};
