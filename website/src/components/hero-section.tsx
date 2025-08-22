import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Github, Star, GitFork, Terminal, Zap, Code2 } from "lucide-react";

export const HeroSection = () => {
  return (
    <section className="relative min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/20 overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-transparent to-accent/10 animate-pulse" />
      <div className="absolute top-20 left-20 w-72 h-72 bg-primary/20 rounded-full blur-3xl opacity-20" />
      <div className="absolute bottom-20 right-20 w-96 h-96 bg-accent-purple/20 rounded-full blur-3xl opacity-20" />
      
      <div className="container mx-auto px-6 text-center relative z-10">
        {/* Badge */}
        <div className="flex justify-center mb-6">
          <Badge variant="outline" className="px-4 py-2 text-sm font-medium border-primary/30 bg-primary/10 hover:bg-primary/20 transition-smooth">
            <Star className="w-4 h-4 mr-2" />
            10.4k+ GitHub Stars
          </Badge>
        </div>

        {/* Main Heading */}
        <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-tight">
          <span className="gradient-text">Qwen Code</span>
          <br />
          <span className="text-foreground">AI Coding Agent</span>
        </h1>

        {/* Subheading */}
        <p className="text-xl md:text-2xl text-muted-foreground mb-8 max-w-3xl mx-auto leading-relaxed">
          A powerful AI coding assistant that lives in your terminal. 
          <br className="hidden md:block" />
          Understand, edit, and automate your codebase beyond traditional limits.
        </p>

        {/* Features Pills */}
        <div className="flex flex-wrap justify-center gap-3 mb-10">
          <div className="flex items-center gap-2 px-4 py-2 bg-card border border-primary/20 rounded-full text-sm">
            <Code2 className="w-4 h-4 text-primary" />
            Code Understanding
          </div>
          <div className="flex items-center gap-2 px-4 py-2 bg-card border border-accent-blue/20 rounded-full text-sm">
            <Zap className="w-4 h-4 text-accent-blue" />
            Workflow Automation
          </div>
          <div className="flex items-center gap-2 px-4 py-2 bg-card border border-accent-purple/20 rounded-full text-sm">
            <Terminal className="w-4 h-4 text-accent-purple" />
            Enhanced Parser
          </div>
        </div>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-12">
          <Button 
            size="lg" 
            className="px-8 py-4 text-lg font-semibold bg-gradient-primary hover:shadow-glow transition-all duration-300 transform hover:scale-105"
          >
            <Terminal className="w-5 h-5 mr-2" />
            Get Started Free
          </Button>
          <Button 
            variant="outline" 
            size="lg"
            className="px-8 py-4 text-lg font-semibold border-primary/30 hover:border-primary/50 hover:bg-primary/10 transition-smooth"
          >
            <Github className="w-5 h-5 mr-2" />
            View on GitHub
          </Button>
        </div>

        {/* Quick Install */}
        <div className="bg-card/50 backdrop-blur border border-primary/20 rounded-2xl p-6 max-w-2xl mx-auto">
          <p className="text-sm text-muted-foreground mb-3">Quick Install:</p>
          <div className="bg-background/80 border border-border rounded-lg p-4 font-mono text-sm">
            <span className="text-primary">$</span> <span className="text-foreground">npm install -g @qwen-code/qwen-code@latest</span>
            <br />
            <span className="text-primary">$</span> <span className="text-foreground">qwen</span>
          </div>
        </div>

        {/* Stats */}
        <div className="flex justify-center gap-8 mt-8 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Star className="w-4 h-4" />
            10.4k Stars
          </div>
          <div className="flex items-center gap-2">
            <GitFork className="w-4 h-4" />
            753 Forks
          </div>
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4" />
            2k+ Daily Users
          </div>
        </div>
      </div>
    </section>
  );
};