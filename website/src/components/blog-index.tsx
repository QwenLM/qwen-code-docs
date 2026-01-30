"use client";

import React from "react";
import NextLink from "next/link";
import { Calendar, User, ArrowRight, Search, Tag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { usePathname } from "next/navigation";

const allPostsEn = [
  {
    title: "Announcing Qwen Code: The Next Generation AI Coding Agent",
    description: "We are excited to introduce Qwen Code, a powerful AI coding agent designed to revolutionize your development workflow. Built on Qwen2.5-Coder, it brings agentic capabilities directly to your terminal.",
    date: "Jan 30, 2026",
    author: "Qwen Team",
    image: "/assets/qwen-screenshot.png",
    link: "/en/blog/hello-world",
    tags: ["Announcement", "AI Agent"]
  },
  {
    title: "How Qwen Code Uses MCP to Enhance Developer Productivity",
    description: "Learn how the Model Context Protocol (MCP) enables Qwen Code to interact with external tools and services, from web search to database queries.",
    date: "Jan 25, 2026",
    author: "Qwen DevRel",
    image: "/assets/connected_devtools.png",
    link: "/en/blog/mcp-integration",
    tags: ["Technical", "MCP"]
  }
];

const allPostsZh = [
  {
    title: "发布 Qwen Code：下一代 AI 编程助手",
    description: "我们非常高兴地推出 Qwen Code，这是一个强大的 AI 编程助手，旨在彻底改变您的开发工作流程。基于 Qwen2.5-Coder 构建，它将代理能力直接带到您的终端。",
    date: "2026年1月30日",
    author: "Qwen 团队",
    image: "/assets/qwen-screenshot.png",
    link: "/zh/blog/hello-world",
    tags: ["公告", "AI 代理"]
  },
  {
    title: "Qwen Code 如何利用 MCP 提升开发效率",
    description: "了解模型上下文协议 (MCP) 如何使 Qwen Code 能够与外部工具和服务进行交互，从网页搜索到数据库查询。",
    date: "2026年1月25日",
    author: "Qwen 开发者关系团队",
    image: "/assets/connected_devtools.png",
    link: "/zh/blog/mcp-integration",
    tags: ["技术细节", "MCP"]
  }
];

export const BlogIndex = () => {
  const pathname = usePathname();
  const isZh = pathname?.startsWith("/zh");
  const allPosts = isZh ? allPostsZh : allPostsEn;
  
  const t = {
    badge: isZh ? "Qwen Code 博客" : "Qwen Code Blog",
    title: isZh ? ["洞察", "智能代理解析的未来"] : ["Insights into the", "Agentic Future"],
    description: isZh ? "随时关注 Qwen Code 团队的最新功能、技术深度解析和社区故事。" : "Stay updated with the latest features, technical deep dives, and community stories from the Qwen Code team.",
    allPosts: isZh ? "全部文章" : "All Posts",
    productUpdates: isZh ? "产品更新" : "Product Updates",
    tutorials: isZh ? "教程" : "Tutorials",
    engineering: isZh ? "工程实践" : "Engineering",
    searchPlaceholder: isZh ? "搜索文章..." : "Search articles...",
    readMore: isZh ? "阅读更多" : "Read more",
  };

  const featuredPost = allPosts[0];
  const remainingPosts = allPosts.slice(1);

  return (
    <div className="bg-background min-h-screen pb-20">
      {/* Hero Section */}
      <section className="relative pt-20 pb-24 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-6xl h-full bg-[radial-gradient(circle_at_center,hsl(262_75%_50%/0.08),transparent_70%)] pointer-events-none" />
        
        <div className="container mx-auto px-6 relative z-10">
          <div className="max-w-3xl">
            <Badge variant="outline" className="mb-6 px-4 py-1 border-violet-500/20 bg-violet-500/5 text-violet-400 rounded-full">
              {t.badge}
            </Badge>
            <h1 className="text-5xl md:text-7xl font-bold mb-8 tracking-tighter">
              <span className="gradient-text-white">{t.title[0]}</span>
              <br />
              <span className="gradient-text">{t.title[1]}</span>
            </h1>
            <p className="text-xl text-muted-foreground leading-relaxed">
              {t.description}
            </p>
          </div>
        </div>
      </section>

      <div className="container mx-auto px-6">
        {/* Featured Post */}
        <div className="mb-20">
          <NextLink href={featuredPost.link} className="group grid lg:grid-cols-2 gap-10 items-center bg-card/30 border border-border/50 rounded-[2.5rem] overflow-hidden hover:border-violet-500/50 transition-all duration-500">
            <div className="aspect-[16/10] overflow-hidden">
              <img 
                src={featuredPost.image} 
                alt={featuredPost.title} 
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
              />
            </div>
            <div className="p-10 lg:pr-16">
              <div className="flex flex-wrap gap-2 mb-6">
                {featuredPost.tags.map(tag => (
                  <Badge key={tag} variant="secondary" className="bg-background/50 border-none">{tag}</Badge>
                ))}
              </div>
              <h2 className="text-3xl md:text-4xl font-bold mb-6 group-hover:text-violet-400 transition-colors">
                {featuredPost.title}
              </h2>
              <p className="text-lg text-muted-foreground mb-8 line-clamp-3">
                {featuredPost.description}
              </p>
              <div className="flex items-center gap-6 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4" />
                  {featuredPost.author}
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  {featuredPost.date}
                </div>
              </div>
            </div>
          </NextLink>
        </div>

        {/* Categories/Search Bar (Placeholder for UI) */}
        <div className="flex flex-wrap items-center justify-between gap-6 mb-12 py-8 border-y border-border/50">
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" className="rounded-full px-6 bg-violet-500 text-white hover:bg-violet-600">{t.allPosts}</Button>
            <Button variant="ghost" className="rounded-full px-6 hover:bg-accent">{t.productUpdates}</Button>
            <Button variant="ghost" className="rounded-full px-6 hover:bg-accent">{t.tutorials}</Button>
            <Button variant="ghost" className="rounded-full px-6 hover:bg-accent">{t.engineering}</Button>
          </div>
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input 
              type="text" 
              placeholder={t.searchPlaceholder}
              className="w-full bg-accent/50 border border-border/50 rounded-full py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 transition-all"
            />
          </div>
        </div>

        {/* Posts Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {remainingPosts.map((post, index) => (
            <NextLink key={index} href={post.link} className="group flex flex-col bg-card/30 border border-border/50 rounded-3xl overflow-hidden hover:border-violet-500/50 transition-all duration-300">
              <div className="aspect-video overflow-hidden">
                <img 
                  src={post.image} 
                  alt={post.title} 
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
              </div>
              <div className="p-8 flex flex-col flex-1">
                <div className="flex gap-2 mb-4">
                  {post.tags.slice(0, 1).map(tag => (
                    <span key={tag} className="text-[10px] uppercase tracking-widest font-bold text-violet-500">{tag}</span>
                  ))}
                </div>
                <h3 className="text-xl font-bold mb-4 group-hover:text-violet-400 transition-colors line-clamp-2">
                  {post.title}
                </h3>
                <p className="text-muted-foreground text-sm mb-6 line-clamp-2">
                  {post.description}
                </p>
                <div className="mt-auto flex items-center justify-between text-xs text-muted-foreground">
                  <span>{post.date}</span>
                  <div className="flex items-center gap-1.5 group-hover:text-foreground transition-colors">
                    {t.readMore} <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              </div>
            </NextLink>
          ))}
        </div>
      </div>
    </div>
  );
};
