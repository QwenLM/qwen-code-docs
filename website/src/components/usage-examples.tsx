import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles,
  Briefcase,
  Bot,
  MessageSquare
} from "lucide-react";

const scenarios = [
  {
    title: "Vibe Coding",
    icon: Sparkles,
    color: "text-blue-400",
    description: "Interactive terminal experience. Chat-style coding that turns inspiration into code instantly, making coding feel natural and intuitive.",
  },
  {
    title: "Serious Coding",
    icon: Briefcase,
    color: "text-violet-400",
    description: "Deep integration with development workflows. Supports VS Code/Zed plugins and Headless mode, handling production challenges from complex refactoring to CI automation with confidence.",
  },
  {
    title: "Personal Assistant",
    icon: Bot,
    color: "text-green-400",
    description: "All-around tech partner. Beyond code generation, it's your technical encyclopedia. Write articles, create presentations, draw charts, troubleshoot complex issues - it excels at everything!",
  },
];

export const UsageExamples = () => {
  return (
    <section className='py-32 bg-transparent relative overflow-hidden'>
      <div className='container mx-auto px-6 relative z-10'>
        <div className='text-center mb-16'>
          <h2 className='text-4xl md:text-5xl font-bold mb-6 tracking-tight'>
            <span className='gradient-text'>Three Usage Scenarios</span>
          </h2>
          <p className='text-lg text-muted-foreground max-w-2xl mx-auto'>
            From interactive exploration to professional production, Qwen Code adapts to your unique workflow.
          </p>
        </div>

        <div className='grid md:grid-cols-3 gap-8'>
          {scenarios.map((scenario, index) => (
            <div
              key={index}
              className='group p-8 rounded-3xl bg-card border border-border hover:border-violet-500/20 transition-all duration-300 shadow-sm flex flex-col items-center text-center'
            >
              <div className={`w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-8 group-hover:scale-110 transition-transform`}>
                <scenario.icon className={`w-7 h-7 ${scenario.color}`} />
              </div>
              
              <h3 className='text-2xl font-bold text-card-foreground mb-4 tracking-tight'>
                {scenario.title}
              </h3>

              <p className='text-muted-foreground leading-relaxed'>
                {scenario.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
