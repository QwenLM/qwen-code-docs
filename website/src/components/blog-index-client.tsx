"use client";

import React, { useState } from "react";
import NextLink from "next/link";
import { Calendar, User, ArrowRight, Search } from "lucide-react";
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

        {/* Posts Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-6">
          {filteredPosts.map((post, index) => (
            <NextLink key={index} href={post.link} className="group flex flex-col space-y-4">
              <div className="aspect-[16/10] overflow-hidden rounded-2xl bg-muted/30">
                <img 
                  src={post.image} 
                  alt={post.title} 
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
              </div>
              <div className="flex flex-col flex-1">
                <div className="flex gap-2 mb-3">
                  {post.tags.slice(0, 1).map(tag => (
                    <span key={tag} className="text-[10px] uppercase tracking-wider font-bold text-primary">{tag}</span>
                  ))}
                </div>
                <h3 className="text-xl font-bold mb-2 group-hover:text-primary transition-colors line-clamp-2 leading-snug">
                  {post.title}
                </h3>
                <p className="text-muted-foreground text-sm mb-4 line-clamp-2">
                  {post.description}
                </p>
                <div className="mt-auto flex items-center justify-between text-xs text-muted-foreground font-medium">
                  <span>{formatDate(post.date)}</span>
                  <div className="flex items-center gap-1 group-hover:text-foreground transition-colors">
                    {t.readMore} <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
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
