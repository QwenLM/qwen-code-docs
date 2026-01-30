import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import NextLink from "next/link";
import {
  Github,
  Star,
  GitFork,
  Terminal,
  Zap,
  Code2,
  ArrowRight,
  Download,
  Play,
  Layers,
  Shield,
  Search,
  MessageSquare
} from "lucide-react";

export const HeroSection = () => {
  return (
    <section className='relative min-h-[90vh] flex items-center justify-center overflow-hidden pt-20 pb-16'>
      {/* Background Effects - Modern Mastra-like glow */}
      <div className='absolute inset-0 bg-[radial-gradient(ellipse_at_center,hsl(262_75%_50%/0.05),transparent_70%)]' />
      <div className='hero-glow' />
      
      <div className='container mx-auto px-6 text-center relative z-10 max-w-6xl'>
        {/* Badge */}
        <div className="flex justify-center mb-8">
          <Badge
            variant='outline'
            className='px-4 py-1.5 border-white/10 bg-white/5 text-violet-400 backdrop-blur-md rounded-full flex items-center gap-2 hover:bg-white/10 transition-colors'
          >
            <span className="flex h-2 w-2 rounded-full bg-violet-500 animate-pulse" />
            <span className="text-xs font-medium tracking-wide uppercase">v0.8.0 is now live</span>
          </Badge>
        </div>

        {/* Main Heading - Mastra inspired */}
        <h1 className='text-6xl md:text-8xl font-bold mb-8 leading-[1.05] tracking-tighter'>
          <span className='gradient-text-white'>An open-source AI agent</span>
          <br />
          <span className='gradient-text'>
            that lives in your terminal
          </span>
        </h1>

        {/* Subheading */}
        <p className='text-lg md:text-xl text-muted-foreground mb-12 max-w-2xl mx-auto leading-relaxed'>
          Optimized for <span className="text-foreground font-medium">Qwen2.5-Coder</span>. 
          Understand large codebases, automate tedious work, and ship faster with a terminal-first agentic workflow.
        </p>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
          <NextLink href="/en/users/overview">
            <Button size="lg" className="bg-violet-600 hover:bg-violet-700 text-white rounded-full px-8 h-12 text-base transition-all hover:scale-105 shadow-lg shadow-violet-500/20">
              Start Building <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          </NextLink>
          <a href="https://github.com/QwenLM/qwen-code" target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="lg" className="rounded-full px-8 h-12 text-base border-border text-foreground hover:bg-accent transition-all">
              <Github className="mr-2 w-4 h-4" /> GitHub
            </Button>
          </a>
        </div>

        {/* Installation Command - Sleeker version */}
        <div className='max-w-3xl mx-auto mb-20'>
          <div className='glass-morphism rounded-2xl overflow-hidden shadow-2xl border border-border'>
            <div className='flex items-center justify-between px-6 py-3 border-b border-border bg-muted/50'>
              <div className='flex items-center gap-2'>
                <div className='flex gap-1.5'>
                  <div className='w-3 h-3 rounded-full bg-red-500/40'></div>
                  <div className='w-3 h-3 rounded-full bg-yellow-500/40'></div>
                  <div className='w-3 h-3 rounded-full bg-green-500/40'></div>
                </div>
                <span className='text-[10px] uppercase tracking-[0.2em] text-muted-foreground ml-3 font-mono font-medium'>
                  Terminal
                </span>
              </div>
              <div className="flex items-center gap-4">
                 <span className="text-[10px] text-muted-foreground/40 font-mono tracking-tighter max-md:hidden">zsh — 80×24</span>
              </div>
            </div>

            <div className='p-8 terminal-text text-sm sm:text-base text-left bg-background/40 backdrop-blur-xl'>
              <div className='flex items-start gap-3'>
                <span className='text-violet-500/70 select-none'>$</span>
                <span className='text-green-600 dark:text-green-400'>npm install -g @qwen-code/qwen-code@latest</span>
              </div>
              <div className='flex items-start gap-3 mt-4'>
                <span className='text-violet-500/70 select-none'>$</span>
                <span className='text-foreground'>qwen</span>
              </div>
              
              <div className="mt-10 pt-6 border-t border-border flex flex-wrap items-center gap-x-8 gap-y-3">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs">
                    <Zap className="w-3.5 h-3.5 text-violet-500" />
                    <span>OpenAI Compatible</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground text-xs">
                    <Shield className="w-3.5 h-3.5 text-violet-500" />
                    <span>OAuth Free Tier</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground text-xs">
                    <Layers className="w-3.5 h-3.5 text-violet-500" />
                    <span>Agentic Workflow</span>
                  </div>
              </div>
            </div>
          </div>
        </div>

        {/* Secondary Badges */}
        <div className='flex flex-wrap justify-center gap-x-12 gap-y-6 mt-16 py-8 border-t border-border'>
          <div className='flex flex-col items-center gap-1 group cursor-default'>
            <span className="text-2xl font-bold text-foreground">2,000</span>
            <span className="text-xs uppercase tracking-widest text-muted-foreground group-hover:text-violet-500 transition-colors">Free Requests/Day</span>
          </div>
          <div className='flex flex-col items-center gap-1 group cursor-default'>
            <span className="text-2xl font-bold text-foreground">15k+</span>
            <span className="text-xs uppercase tracking-widest text-muted-foreground group-hover:text-violet-500 transition-colors">GitHub Stars</span>
          </div>
          <div className='flex flex-col items-center gap-1 group cursor-default'>
            <span className="text-2xl font-bold text-foreground">100%</span>
            <span className="text-xs uppercase tracking-widest text-muted-foreground group-hover:text-violet-500 transition-colors">Open Source</span>
          </div>
        </div>
      </div>
    </section>
  );
};
