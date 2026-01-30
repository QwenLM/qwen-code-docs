"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, User, ArrowRight } from "lucide-react";
import NextLink from "next/link";

import { usePathname } from "next/navigation";

const blogPostsEn = [
  {
    title: "Announcing Qwen Code: The Next Generation AI Coding Agent",
    description: "We are excited to introduce Qwen Code, a powerful AI coding agent designed to revolutionize your development workflow.",
    date: "Jan 30, 2026",
    author: "Qwen Team",
    image: "/assets/qwen-screenshot.png",
    link: "/en/blog/hello-world",
    tag: "Announcement"
  },
  {
    title: "How Qwen Code Uses MCP to Enhance Developer Productivity",
    description: "Learn how the Model Context Protocol (MCP) enables Qwen Code to interact with external tools and services.",
    date: "Jan 25, 2026",
    author: "Qwen DevRel",
    image: "/assets/connected_devtools.png",
    link: "/en/blog/mcp-integration",
    tag: "Technical"
  }
];

const blogPostsZh = [
  {
    title: "发布 Qwen Code：下一代 AI 编程助手",
    description: "我们非常高兴地推出 Qwen Code，这是一个强大的 AI 编程助手，旨在彻底改变您的开发工作流程。",
    date: "2026年1月30日",
    author: "Qwen 团队",
    image: "/assets/qwen-screenshot.png",
    link: "/zh/blog/hello-world",
    tag: "公告"
  },
  {
    title: "Qwen Code 如何利用 MCP 提升开发效率",
    description: "了解模型上下文协议 (MCP) 如何使 Qwen Code 能够与外部工具和服务进行交互。",
    date: "2026年1月25日",
    author: "Qwen 开发者关系团队",
    image: "/assets/connected_devtools.png",
    link: "/zh/blog/mcp-integration",
    tag: "技术细节"
  }
];

export const BlogSection = () => {
  const pathname = usePathname();
  const isZh = pathname?.startsWith("/zh");
  const blogPosts = isZh ? blogPostsZh : blogPostsEn;

  const t = {
    title: isZh ? ["来自", "Qwen Code 博客的最新动态"] : ["Latest from the", "Qwen Code Blog"],
    description: isZh ? "洞察、更新以及对代理解析编程未来的深度探讨。" : "Insights, updates, and deep dives into the future of agentic coding.",
    viewAll: isZh ? "查看全部文章" : "View all posts",
    readArticle: isZh ? "阅读全文" : "Read article",
    blogLink: isZh ? "/zh/blog" : "/en/blog"
  };

  return (
    <section className='py-32 bg-transparent relative overflow-hidden'>
      {/* Decorative background element */}
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-blue-600/5 rounded-full blur-[120px] -ml-64 -mb-64" />
      
      <div className='container mx-auto px-6 relative z-10'>
        <div className='flex flex-col md:flex-row md:items-end justify-between mb-16 gap-6'>
          <div className='max-w-2xl'>
            <h2 className='text-4xl md:text-5xl font-bold mb-6 tracking-tight'>
              <span className='gradient-text-white'>{t.title[0]}</span>
              <br />
              <span className='gradient-text'>{t.title[1]}</span>
            </h2>
            <p className='text-lg text-muted-foreground'>
              {t.description}
            </p>
          </div>
          
          <NextLink 
            href={t.blogLink} 
            className='flex items-center gap-2 text-violet-400 hover:text-violet-300 transition-colors font-medium group'
          >
            {t.viewAll} 
            <ArrowRight className='w-4 h-4 group-hover:translate-x-1 transition-transform' />
          </NextLink>
        </div>

        <div className='grid md:grid-cols-2 gap-8'>
          {blogPosts.map((post, index) => (
            <NextLink 
              key={index} 
              href={post.link}
              className='group flex flex-col bg-card/50 border border-border/50 rounded-3xl overflow-hidden hover:border-violet-500/50 transition-all duration-300'
            >
              <div className='aspect-video overflow-hidden relative'>
                <img 
                  src={post.image} 
                  alt={post.title}
                  className='object-cover w-full h-full group-hover:scale-105 transition-transform duration-500'
                />
                <div className='absolute top-4 left-4'>
                  <Badge variant="secondary" className="bg-background/80 backdrop-blur-md border-none px-3 py-1">
                    {post.tag}
                  </Badge>
                </div>
              </div>
              
              <div className='p-8 flex flex-col flex-1'>
                <div className='flex items-center gap-4 text-xs text-muted-foreground mb-4'>
                  <div className='flex items-center gap-1.5'>
                    <Calendar className='w-3.5 h-3.5' />
                    {post.date}
                  </div>
                  <div className='flex items-center gap-1.5'>
                    <User className='w-3.5 h-3.5' />
                    {post.author}
                  </div>
                </div>
                
                <h3 className='text-2xl font-bold mb-4 group-hover:text-violet-400 transition-colors'>
                  {post.title}
                </h3>
                
                <p className='text-muted-foreground leading-relaxed mb-8 line-clamp-2'>
                  {post.description}
                </p>
                
                <div className='mt-auto flex items-center text-sm font-semibold text-foreground group-hover:gap-2 transition-all'>
                  {t.readArticle} <ArrowRight className='w-4 h-4 ml-1 opacity-0 group-hover:opacity-100 transition-all' />
                </div>
              </div>
            </NextLink>
          ))}
        </div>
      </div>
    </section>
  );
};
