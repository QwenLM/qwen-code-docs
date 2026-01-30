import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Code2,
  Zap,
  Brain,
  GitBranch,
  Terminal,
  Shield,
  Layers,
  Layout,
  Cpu,
  Globe,
  Database,
  Blocks
} from "lucide-react";

const features = [
  {
    icon: Cpu,
    title: "Optimized for Qwen2.5-Coder",
    description: "Deep integration with Qwen2.5-Coder models, providing superior code understanding and generation capabilities specifically for large-scale projects.",
    accent: "bg-violet-500/10",
    iconColor: "text-violet-400"
  },
  {
    icon: Layers,
    title: "Agentic Workflow",
    description: "Built-in support for Skills, SubAgents, and Plan Mode. Orchestrate multiple agents to handle complex refactoring and feature development.",
    accent: "bg-blue-500/10",
    iconColor: "text-blue-400"
  },
  {
    icon: Shield,
    title: "OAuth Free Tier",
    description: "Sign in with Qwen OAuth to get 2,000 free requests per day. No credit card required, perfect for individual developers and small teams.",
    accent: "bg-green-500/10",
    iconColor: "text-green-400"
  },
  {
    icon: Layout,
    title: "IDE Friendly",
    description: "While terminal-first, Qwen Code optionally integrates with VS Code, Zed, and JetBrains IDEs to fit perfectly into your existing environment.",
    accent: "bg-purple-500/10",
    iconColor: "text-purple-400"
  }
];

export const FeaturesSection = () => {
  return (
    <section className='py-32 bg-transparent relative overflow-hidden'>
      {/* Decorative background element */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-violet-600/5 rounded-full blur-[120px] -mr-64 -mt-64" />
      
      <div className='container mx-auto px-6 relative z-10'>
        <div className='text-center mb-20'>
          <h2 className='text-4xl md:text-5xl font-bold mb-6 tracking-tight'>
            <span className='gradient-text-white'>Built for the modern</span>
            <br />
            <span className='gradient-text'>developer workflow</span>
          </h2>
          <p className='text-lg text-muted-foreground max-w-2xl mx-auto'>
            Qwen Code is more than just a terminal tool. it's a complete ecosystem designed to help you build software faster and with higher quality.
          </p>
        </div>

        <div className='grid md:grid-cols-2 gap-6'>
          {features.map((feature, index) => (
            <div
              key={index}
              className='group relative p-[1px] rounded-3xl overflow-hidden transition-all duration-300 hover:scale-[1.01]'
            >
              {/* Gradient Border Effect */}
              <div className="absolute inset-0 bg-gradient-to-br from-border/50 to-transparent group-hover:from-violet-500/30 transition-all duration-500" />
              
              <div className='relative h-full bg-card rounded-[23px] p-10 flex flex-col items-start'>
                <div className={`w-12 h-12 ${feature.accent} rounded-2xl flex items-center justify-center mb-8 group-hover:scale-110 transition-transform duration-500`}>
                  <feature.icon className={`w-6 h-6 ${feature.iconColor}`} />
                </div>
                
                <h3 className='text-2xl font-semibold mb-4 text-card-foreground group-hover:text-violet-500 transition-colors'>
                  {feature.title}
                </h3>
                
                <p className='text-muted-foreground leading-relaxed text-lg'>
                  {feature.description}
                </p>

                <div className="mt-8 pt-8 border-t border-border w-full flex items-center justify-between">
                   <span className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Feature 0{index + 1}</span>
                   <div className="h-1 w-12 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-violet-500/50 w-0 group-hover:w-full transition-all duration-1000" />
                   </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
