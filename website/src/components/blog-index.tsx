import React from "react";
import { getPageMap } from "nextra/page-map";
import { BlogIndexClient, Post } from "./blog-index-client";

interface BlogIndexProps {
  lang?: string;
}

export const BlogIndex = async ({ lang = "en" }: BlogIndexProps) => {
  // 获取对应语言博客目录下的所有页面
  const pageMap = await getPageMap(`/${lang}/blog`);
  
  // 过滤出 MDX 页面并排除索引页
  const posts: Post[] = pageMap
    .filter((item: any) => 
      item.name && 
      item.name !== "index" &&
      item.frontMatter &&
      item.route // 确保是页面
    )
    .map((item: any) => ({
      title: item.frontMatter.title || item.name,
      description: item.frontMatter.description || "",
      date: item.frontMatter.date || "",
      author: item.frontMatter.author || "",
      image: item.frontMatter.image || "",
      link: item.route,
      tags: item.frontMatter.tags || []
    }))
    // 按日期降序排序
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return <BlogIndexClient posts={posts} lang={lang} />;
};
