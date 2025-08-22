import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Github, Star, GitFork, Terminal, Zap, Code2 } from "lucide-react";

export const HeroSection = () => {
  return (
    <section className='relative min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/20 overflow-hidden'>
      {/* Background Effects */}
      <div className='absolute inset-0 bg-gradient-to-r from-primary/10 via-transparent to-accent/10 animate-pulse' />
      <div className='absolute top-20 left-20 w-72 h-72 bg-primary/20 rounded-full blur-3xl opacity-20' />
      <div className='absolute bottom-20 right-20 w-96 h-96 bg-accent-purple/20 rounded-full blur-3xl opacity-20' />

      <div className='container pt-24 mx-auto px-6 text-center relative z-10'>
        {/* Main Heading */}
        <h1 className='text-4xl md:text-6xl font-bold mb-6 leading-tight'>
          <span className='gradient-text orbitron-font'>Qwen Code</span>
        </h1>

        {/* Subheading */}
        <p className='text-xl md:text-2xl text-muted-foreground mb-8 max-w-4xl mx-auto leading-relaxed orbitron-font'>
          A powerful AI coding assistant that lives in your terminal.
          <br className='hidden md:block' />
          Understand, edit, and automate your codebase beyond traditional
          limits.
        </p>

        {/* Features Pills */}
        <div className='flex flex-wrap justify-center gap-3 mb-10 max-md:hidden'>
          <div className='flex items-center gap-2 px-4 py-2 bg-background/80 border border-primary/30 rounded-md text-sm orbitron-font'>
            <span className='text-primary'>{">"}</span>
            <Code2 className='w-4 h-4 text-primary' />
            code-understanding
          </div>
          <div className='flex items-center gap-2 px-4 py-2 bg-background/80 border border-primary/30 rounded-md text-sm orbitron-font'>
            <span className='text-primary'>{">"}</span>
            <Zap className='w-4 h-4 text-primary' />
            workflow-automation
          </div>
          <div className='flex items-center gap-2 px-4 py-2 bg-background/80 border border-primary/30 rounded-md text-sm orbitron-font'>
            <span className='text-primary'>{">"}</span>
            <Terminal className='w-4 h-4 text-primary' />
            enhanced-parser
          </div>
        </div>

        {/* CTA Buttons */}
        <div className='flex flex-col sm:flex-row gap-4 justify-center items-center mb-12'>
          <Button
            size='lg'
            className='px-8 py-4 text-lg font-semibold bg-primary hover:bg-primary/90 transition-all duration-300 orbitron-font'
          >
            <Terminal className='w-5 h-5 mr-2' />
            qwen --install
          </Button>
          <Button
            variant='outline'
            size='lg'
            className='px-8 py-4 text-lg font-semibold border-primary/30 hover:border-primary/50 hover:bg-primary/10 transition-smooth orbitron-font'
          >
            <Github className='w-5 h-5 mr-2' />
            view source
          </Button>
        </div>

        {/* Quick Install */}
        <div className='bg-background/90 border border-primary/30 rounded-lg p-6 max-w-2xl mx-auto backdrop-blur'>
          <div className='flex items-center gap-2 mb-4'>
            <div className='w-3 h-3 rounded-full bg-red-500'></div>
            <div className='w-3 h-3 rounded-full bg-yellow-500'></div>
            <div className='w-3 h-3 rounded-full bg-green-500'></div>
            <span className='text-sm text-muted-foreground ml-2 terminal-text'>
              terminal
            </span>
          </div>
          <div className='bg-black/80 border border-primary/20 rounded-md p-4 terminal-text text-sm'>
            <div className='text-purple-400'>
              <span style={{ color: "#615ced" }}>user@machine</span>
              <span className='text-white'>:</span>
              <span className='text-blue-400'>~</span>
              <span className='text-white'>$ </span>
              <span className='text-white'>
                npm install -g @qwen-code/qwen-code@latest
              </span>
            </div>
            <div className='text-gray-400 mt-1'>
              ✓ Package installed successfully
            </div>
            <div className='text-purple-400 mt-2'>
              <span style={{ color: "#615ced" }}>user@machine</span>
              <span className='text-white'>:</span>
              <span className='text-blue-400'>~</span>
              <span className='text-white'>$ </span>
              <span className='text-white'>qwen</span>
              <span className='terminal-cursor' style={{ color: "#615ced" }}>
                |
              </span>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className='flex justify-center gap-8 mt-8 text-sm text-muted-foreground terminal-text'>
          <div className='flex items-center gap-2'>
            <span className='text-primary'>{">"}</span>
            <Star className='w-4 h-4' />
            10.4k stars
          </div>
          <div className='flex items-center gap-2'>
            <span className='text-primary'>{">"}</span>
            <GitFork className='w-4 h-4' />
            753 forks
          </div>
          <div className='flex items-center gap-2'>
            <span className='text-primary'>{">"}</span>
            <Zap className='w-4 h-4' />
            2k+ users
          </div>
        </div>
      </div>
    </section>
  );
};
