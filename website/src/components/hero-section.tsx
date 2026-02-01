"use client"

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import NextLink from "next/link";
import {
  Github,
  Terminal,
  Code2,
  ArrowRight,
  Box,
  Cpu,
} from "lucide-react";
import { VideoModal } from "@/components/video-modal";

export const HeroSection = () => {
  return (
    <section className='relative min-h-screen flex flex-col items-center pt-20 pb-20 overflow-hidden'>
      {/* Background Effects */}
      <div className='absolute inset-0 bg-[radial-gradient(ellipse_at_top,hsl(262_75%_50%/0.15),transparent_70%)]' />
      <div className='hero-glow opacity-50' />
      
      <div className='container mx-auto px-6 text-center relative z-10 max-w-6xl flex-grow flex flex-col items-center'>
        {/* Badge */}
        <div className="flex justify-center mb-8 animate-in fade-in slide-in-from-top-4 duration-700">
          <Badge
            variant='outline'
            className='px-4 py-1.5 border-border bg-muted/50 text-violet-500 backdrop-blur-md rounded-full flex items-center gap-2 hover:bg-muted transition-colors shadow-lg shadow-violet-500/10'
          >
            <span className="flex h-2 w-2 rounded-full bg-violet-500 animate-pulse" />
            <span className="text-xs font-medium tracking-wide uppercase">v0.8.0 is now live</span>
          </Badge>
        </div>

        {/* Main Heading */}
        <h1 className='text-6xl md:text-8xl font-bold mb-8 leading-[1.05] tracking-tighter animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100'>
          <span className='gradient-text-white'>An open-source AI agent</span>
          <br />
          <span className='gradient-text'>
            that lives in your terminal
          </span>
        </h1>

        {/* Subheading */}
        <p className='text-lg md:text-xl text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed animate-in fade-in slide-in-from-bottom-8 duration-700 delay-200'>
          Co-evolving with <span className="text-foreground font-medium">Qwen3-Coder</span>. 
          Understand large codebases, automate tedious work, and ship faster with a terminal-first agentic workflow.
        </p>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-20 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-300">
          <NextLink href="/en/users/overview">
            <Button size="lg" className="bg-violet-600 hover:bg-violet-700 text-white rounded-full px-8 h-12 text-base transition-all hover:scale-105 shadow-xl shadow-violet-500/20 ring-offset-2 focus:ring-2 ring-violet-500">
              Start Building <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          </NextLink>
          <VideoModal />
          <a href="https://github.com/QwenLM/qwen-code" target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="lg" className="rounded-full px-8 h-12 text-base border-border text-foreground hover:bg-accent transition-all">
              <Github className="mr-2 w-4 h-4" /> GitHub
            </Button>
          </a>
        </div>
        
        {/* Tech Stack Strip - Integrated visually */}
        <div className="mt-16 pt-8 border-t border-border w-full max-w-4xl flex justify-center gap-8 opacity-50 grayscale hover:grayscale-0 transition-all duration-500">
             <div className="flex items-center gap-2"><Cpu className="w-4 h-4" /> <span className="text-xs font-mono">Qwen3-Coder</span></div>
             <div className="flex items-center gap-2"><Code2 className="w-4 h-4" /> <span className="text-xs font-mono">VS Code</span></div>
             <div className="flex items-center gap-2"><Box className="w-4 h-4" /> <span className="text-xs font-mono">Docker</span></div>
             <div className="flex items-center gap-2"><Terminal className="w-4 h-4" /> <span className="text-xs font-mono">TypeScript</span></div>
        </div>

      </div>
    </section>
  );
};
