"use client";

import {
  Cpu,
  Layers,
  Shield,
  Layout
} from "lucide-react";

const features = [
  {
    icon: Cpu,
    title: "Co-evolving with Qwen3-Coder",
    description: "Deep integration with Qwen3-Coder models, providing superior code understanding and generation capabilities specifically for large-scale projects.",
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
      {/* Background patterns */}
      <div className="absolute inset-0 z-0 opacity-[0.03] pointer-events-none"
           style={{
             backgroundImage: 'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)',
             backgroundSize: '32px 32px'
           }}
      />

      {/* Decorative blobs */}
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-violet-600/10 rounded-full blur-[120px] -mr-64 -mt-64 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-blue-600/5 rounded-full blur-[100px] -ml-48 -mb-48 pointer-events-none" />

      <div className='container mx-auto px-6 relative z-10'>
        <div className='text-center mb-20'>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 mb-6 group cursor-default">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse" />
            <span className="text-xs font-semibold text-violet-400 tracking-wider uppercase">Ecosystem</span>
          </div>

          <h2 className='text-4xl md:text-6xl font-bold mb-8 tracking-tight'>
            <span className='gradient-text-white'>Why Choose </span>
            <span className='gradient-text'>Qwen Code?</span>
          </h2>
          <p className='text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed'>
            Qwen Code is more than just a terminal tool. It's a complete ecosystem designed to help you build software faster and with higher quality.
          </p>
        </div>

        <div className='grid md:grid-cols-2 gap-8'>
          {features.map((feature, index) => (
            <div
              key={index}
              className='group relative p-[1px] rounded-3xl overflow-hidden transition-all duration-500 hover:scale-[1.02] hover:shadow-2xl hover:shadow-violet-500/10'
            >
              {/* Animated Gradient Border */}
              <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent group-hover:from-violet-500/40 group-hover:to-blue-500/40 transition-all duration-700" />

              <div className='relative h-full bg-card/80 backdrop-blur-sm rounded-[23px] p-10 flex flex-col items-start border border-border'>
                {/* Icon with glow */}
                <div className="relative mb-8">
                  <div className={`absolute inset-0 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 ${feature.accent}`} />
                  <div className={`relative w-14 h-14 ${feature.accent} rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform duration-500 ring-1 ring-border`}>
                    <feature.icon className={`w-7 h-7 ${feature.iconColor}`} />
                  </div>
                </div>

                <h3 className='text-2xl font-bold mb-4 text-card-foreground group-hover:text-violet-400 transition-colors duration-300'>
                  {feature.title}
                </h3>

                <p className='text-muted-foreground leading-relaxed text-lg group-hover:text-foreground/80 transition-colors duration-300'>
                  {feature.description}
                </p>

                <div className="mt-auto pt-10 w-full flex items-center justify-between">
                   <span className="text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground/60">
                     Advantage 0{index + 1}
                   </span>
                   <div className="h-1 w-24 bg-muted/30 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-violet-500 to-blue-500 w-0 group-hover:w-full transition-all duration-1000 ease-out" />
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
