"use client"

import { Button } from "@/components/ui/button";
import NextLink from "next/link";
import {
  Terminal,
  Code2,
  ArrowRight,
  Box,
  Cpu,
  Copy,
  Check,
} from "lucide-react";
import { useState } from "react";

export const HeroSection = () => {
  const [copied, setCopied] = useState(false);
  const installCommand = "npm i @qwen-code/qwen-code@latest -g";

  const handleCopy = () => {
    navigator.clipboard.writeText(installCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className='relative min-h-screen flex flex-col items-center pt-20 pb-20 overflow-hidden'>
      {/* Background Effects */}
      <div className='absolute inset-0 bg-[radial-gradient(ellipse_at_top,hsl(262_75%_50%/0.15),transparent_70%)]' />
      <div className='hero-glow opacity-50' />
      
      <div className='container mx-auto px-6 text-center relative z-10 max-w-5xl flex-grow flex flex-col items-center justify-center'>
        {/* Main Heading */}
        <h1 className='text-5xl md:text-7xl font-bold mb-6 leading-[1.08] tracking-tighter animate-in fade-in slide-in-from-bottom-8 duration-700'>
          <span className='gradient-text-white'>An open-source AI agent</span>
          <br />
          <span className='gradient-text'>that lives in your terminal</span>
        </h1>

        {/* Subheading */}
        <p className='text-lg text-muted-foreground mb-8 max-w-xl mx-auto leading-relaxed animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100'>
          Co-evolving with <span className="text-foreground font-medium">Qwen3-Coder</span>.
          Understand large codebases, automate tedious work, and ship faster.
        </p>

        {/* NPM Install Command */}
        <div className="mb-6 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-200">
          <div className="flex items-center gap-3 px-5 py-3 bg-muted/50 backdrop-blur-sm border border-border rounded-full font-mono text-sm hover:border-violet-500/30 transition-colors group">
            <Terminal className="w-4 h-4 text-violet-500" />
            <code className="text-foreground">{installCommand}</code>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 hover:bg-violet-500/10 hover:text-violet-500 ml-2"
              onClick={handleCopy}
            >
              {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
            </Button>
          </div>
        </div>

        {/* Action Button */}
        <div className="animate-in fade-in slide-in-from-bottom-8 duration-700 delay-300">
          <NextLink href="/en/users/overview">
            <Button size="lg" className="bg-violet-600 hover:bg-violet-700 text-white rounded-full px-8 h-12 text-base transition-all hover:scale-105 shadow-xl shadow-violet-500/20">
              View Documentation <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          </NextLink>
        </div>

        {/* Tech Stack Strip */}
        <div className="mt-16 pt-6 border-t border-border w-full max-w-3xl flex justify-center gap-8 opacity-40 grayscale hover:grayscale-0 transition-all duration-500">
             <div className="flex items-center gap-2"><Cpu className="w-4 h-4" /> <span className="text-xs font-mono">Qwen3-Coder</span></div>
             <div className="flex items-center gap-2"><Code2 className="w-4 h-4" /> <span className="text-xs font-mono">VS Code</span></div>
             <div className="flex items-center gap-2"><Box className="w-4 h-4" /> <span className="text-xs font-mono">Docker</span></div>
             <div className="flex items-center gap-2"><Terminal className="w-4 h-4" /> <span className="text-xs font-mono">TypeScript</span></div>
        </div>

      </div>
    </section>
  );
};
