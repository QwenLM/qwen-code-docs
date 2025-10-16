import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
} from "lucide-react";

export const HeroSection = () => {
  return (
    <section className='relative min-h-screen flex items-center justify-center hero-gradient overflow-hidden'>
      {/* Background Effects - Modern and subtle */}
      <div className='absolute inset-0 bg-[radial-gradient(ellipse_at_center,hsl(262_75%_50%/0.1),transparent_70%)]' />
      <div className='absolute top-1/4 left-1/4 w-96 h-96 bg-gradient-to-r from-violet-500/20 to-purple-600/20 rounded-full blur-3xl opacity-30 animate-pulse' />
      <div className='absolute bottom-1/4 right-1/4 w-72 h-72 bg-gradient-to-l from-purple-600/20 to-indigo-500/20 rounded-full blur-2xl opacity-40' />

      <div className='container pt-24 mx-auto px-6 text-center relative z-10 max-w-6xl'>
        {/* Badge */}
        <Badge
          variant='outline'
          className='px-4 py-2 mb-8 border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400'
        >
          <Terminal className='w-4 h-4 mr-2' />
          Your AI Coding Companion
        </Badge>

        {/* Main Heading - Claude Code inspired */}
        <h1 className='text-5xl md:text-7xl font-bold mb-8 leading-tight tracking-tight'>
          <span className='gradient-text'>A coding agent</span>
          <br />
          <span className='text-foreground'>
            that lives in the digital world
          </span>
        </h1>

        {/* Subheading */}
        <p className='text-xl md:text-2xl text-muted-foreground mb-12 max-w-4xl mx-auto leading-relaxed'>
          It enhances your development workflow with advanced code
          understanding, automated tasks, and intelligent assistance.
        </p>

        {/* Installation Command */}
        <div className='bg-card/50 border border-violet-500/20 rounded-2xl p-8 max-w-3xl mx-auto backdrop-blur-sm shadow-xl'>
          <div className='flex items-center gap-2 mb-6'>
            <div className='w-3 h-3 rounded-full bg-red-500'></div>
            <div className='w-3 h-3 rounded-full bg-yellow-500'></div>
            <div className='w-3 h-3 rounded-full bg-green-500'></div>
            <span className='text-sm text-muted-foreground ml-2 terminal-text'>
              Terminal
            </span>
          </div>

          <div className='space-y-4'>
            <div className='bg-black/90 border border-violet-500/30 rounded-xl p-6 terminal-text text-sm text-left'>
              <div className='text-violet-400 mb-2'>
                <span className='text-violet-300'>user@machine</span>
                <span className='text-white'>:</span>
                <span className='text-blue-400'>~</span>
                <span className='text-white'>$ </span>
                <span className='text-green-400'>
                  npm install -g @qwen-code/qwen-code
                </span>
              </div>
              <div className='text-gray-400 '>
                ✓ Package installed successfully
              </div>
              <div className='text-violet-400 mt-3'>
                <span className='text-violet-300'>user@machine</span>
                <span className='text-white'>:</span>
                <span className='text-blue-400'>~</span>
                <span className='text-white'>$ </span>
                <span className='text-green-400'>qwen</span>
              </div>
              <pre className='text-violet-400 mt-3 font-mono text-[8px] sm:text-xs md:text-sm lg:text-sm xl:text-base leading-tight'>
                {`██╗       ██████╗ ██╗    ██╗███████╗███╗   ██╗
╚██╗     ██╔═══██╗██║    ██║██╔════╝████╗  ██║
 ╚██╗    ██║   ██║██║ █╗ ██║█████╗  ██╔██╗ ██║
 ██╔╝    ██║▄▄ ██║██║███╗██║██╔══╝  ██║╚██╗██║
██╔╝     ╚██████╔╝╚███╔███╔╝███████╗██║ ╚████║
╚═╝       ╚══▀▀═╝  ╚══╝╚══╝ ╚══════╝╚═╝  ╚═══╝`}
              </pre>
              <div className='text-gray-300 mt-3'>
                Welcome to Qwen Code! Type /help for commands.
              </div>
              <div className='text-violet-400 mt-2'>
                <span className='text-violet-300'>qwen</span>
                <span className='text-white'>{">"} </span>
                <span className='terminal-cursor text-violet-500 animate-pulse'>
                  |
                </span>
              </div>
            </div>

            <p className='text-sm text-muted-foreground'>
              Install Node.js 18+, then run the command above
            </p>
          </div>
        </div>

        {/* Trust Indicators */}
        <div className='flex flex-wrap justify-center gap-8 mt-16 text-sm text-muted-foreground'>
          <div className='flex items-center gap-2 px-4 py-2 bg-card/30 rounded-lg backdrop-blur-sm'>
            <Star className='w-4 h-4 text-violet-500' />
            <span>14.4k+ GitHub Stars</span>
          </div>
          <div className='flex items-center gap-2 px-4 py-2 bg-card/30 rounded-lg backdrop-blur-sm'>
            <GitFork className='w-4 h-4 text-violet-500' />
            <span>1.1k Forks</span>
          </div>
          <div className='flex items-center gap-2 px-4 py-2 bg-card/30 rounded-lg backdrop-blur-sm'>
            <Zap className='w-4 h-4 text-violet-500' />
            <span>10k+ Active Users</span>
          </div>
        </div>
      </div>
    </section>
  );
};
