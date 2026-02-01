"use client";

import React, { useState } from "react";
import NextLink from "next/link";
import { User, ArrowRight, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export interface Post {
  title: string;
  description: string;
  date: string;
  author: string;
  image: string;
  link: string;
  tags: string[];
}

interface BlogIndexClientProps {
  posts: Post[];
  lang: string;
}

export const BlogIndexClient = ({ posts, lang }: BlogIndexClientProps) => {
  const isZh = lang === "zh";
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  
  const t = {
    badge: isZh ? "Qwen Code 博客" : "Qwen Code Blog",
    title: "Blog",
    description: isZh ? "团队笔记、洞察、故事和公告。" : "Team notes, insights, stories and announcements.",
    allPosts: isZh ? "全部文章" : "All Posts",
    productUpdates: isZh ? "产品更新" : "Product Updates",
    tutorials: isZh ? "教程" : "Tutorials",
    engineering: isZh ? "工程实践" : "Engineering",
    searchPlaceholder: isZh ? "搜索文章..." : "Search articles...",
    readMore: isZh ? "阅读更多" : "Read more",
  };

  const categories = [
    { id: "all", label: t.allPosts },
    { id: "Product Updates", label: t.productUpdates },
    { id: "Tutorials", label: t.tutorials },
    { id: "Engineering", label: t.engineering },
  ];

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return dateStr;
      
      if (isZh) {
        return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
      }
      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch (e) {
      return dateStr;
    }
  };

  const filteredPosts = posts.filter(post => {
    const matchesSearch = post.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      post.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      post.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesTab = activeTab === "all" || post.tags.includes(activeTab);
    
    return matchesSearch && matchesTab;
  });

  return (
    <div className="min-h-screen pt-4 pb-20">
      <div className="max-w-[90rem] mx-auto px-6 md:px-8">
        {/* Categories/Search Bar */}
        <div className="flex flex-wrap items-center justify-between gap-6 mb-6 py-2 border-b border-border/40">
          <div className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <Button
                key={category.id}
                variant={activeTab === category.id ? "secondary" : "ghost"}
                className={`rounded-full px-5 h-9 text-sm ${
                  activeTab === category.id 
                    ? "bg-primary text-primary-foreground" 
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setActiveTab(category.id)}
              >
                {category.label}
              </Button>
            ))}
          </div>
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input 
              type="text" 
              placeholder={t.searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-transparent border border-border/60 rounded-full py-1.5 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
            />
          </div>
        </div>

        {/* Posts List */}
        <div className="flex flex-col gap-0">
          {filteredPosts.map((post, index) => (
            <NextLink
              key={index}
              href={post.link}
              className="group flex items-start gap-6 py-6 border-b border-border/40 hover:bg-muted/20 transition-colors -mx-4 px-4"
            >
              {/* Date - Left Column */}
              <div className="hidden sm:flex flex-col items-center justify-center w-16 shrink-0 text-center">
                <span className="text-2xl font-bold text-foreground leading-none">
                  {new Date(post.date).getDate()}
                </span>
                <span className="text-xs text-muted-foreground uppercase mt-1">
                  {new Date(post.date).toLocaleDateString(isZh ? "zh-CN" : "en-US", { month: "short" })}
                </span>
              </div>

              {/* Content - Middle Column */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-2">
                  {post.tags.slice(0, 2).map(tag => (
                    <span key={tag} className="text-[10px] uppercase tracking-wider font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">
                      {tag}
                    </span>
                  ))}
                  <span className="sm:hidden text-xs text-muted-foreground">
                    {formatDate(post.date)}
                  </span>
                </div>
                <h3 className="text-lg font-bold mb-1 group-hover:text-primary transition-colors leading-snug">
                  {post.title}
                </h3>
                <p className="text-muted-foreground text-sm line-clamp-1">
                  {post.description}
                </p>
                <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                  <User className="w-3 h-3" />
                  <span>{post.author}</span>
                </div>
              </div>

              {/* Arrow - Right Column */}
              <div className="hidden sm:flex items-center justify-center w-10 h-10 shrink-0">
                <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
              </div>
            </NextLink>
          ))}
        </div>

        {filteredPosts.length === 0 && (
          <div className="text-center py-20">
            <p className="text-muted-foreground">No posts found matching your search.</p>
          </div>
        )}
      </div>
    </div>
  );
};
