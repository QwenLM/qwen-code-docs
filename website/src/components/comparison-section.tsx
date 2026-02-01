import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Check,
  X,
  Terminal,
  Zap,
  Code2,
  Key,
  Users,
  Cloud,
} from "lucide-react";

const comparisonFeatures = [
  {
    category: "Core Features",
    icon: Code2,
    features: [
      { name: "Subagents", qwen: true, claude: true },
      { name: "Skills", qwen: true, claude: true },
      { name: "Approval Mode", qwen: true, claude: true },
      { name: "Interactive REPL", qwen: true, claude: true },
      { name: "File System Tools", qwen: true, claude: true },
      { name: "Shell / Bash Tools", qwen: true, claude: true },
      { name: "Web Search & Fetch", qwen: true, claude: true },
      { name: "MCP Support", qwen: true, claude: true },
    ],
  },
  {
    category: "Cost & Access",
    icon: Key,
    features: [
      { name: "Free Tier", qwen: "2000/day", claude: false },
      { name: "OpenAI Compatible", qwen: true, claude: "limited" },
      { name: "Open Source", qwen: true, claude: false },
    ],
  },
];

const getFeatureIcon = (status: boolean | string) => {
  if (status === true) {
    return <Check className='w-5 h-5 text-violet-500' strokeWidth={3} />;
  } else if (status === false) {
    return <X className='w-5 h-5 text-muted-foreground' strokeWidth={3} />;
  } else if (typeof status === 'string') {
    return (
      <Badge className='h-5 text-[10px] px-2 py-0 bg-violet-500/20 text-violet-600 dark:text-violet-300 border-violet-500/30 font-bold uppercase tracking-tighter'>
        {status}
      </Badge>
    );
  }
};

export const ComparisonSection = () => {
  return (
    <section className='py-32 bg-transparent relative'>
      <div className='container mx-auto px-6'>
        <div className='text-center mb-20'>
          <h2 className='text-4xl md:text-5xl font-bold mb-6 tracking-tight'>
            <span className='gradient-text-white'>The Open Alternative to </span>
            <span className='gradient-text'>Claude Code</span>
          </h2>
          <p className='text-lg text-muted-foreground max-w-2xl mx-auto'>
            Qwen Code provides a similar agentic experience with more freedom, compatibility, and a generous free tier.
          </p>
        </div>

        <div className='max-w-5xl mx-auto'>
           <div className="glass-morphism rounded-3xl overflow-hidden border border-border shadow-2xl">
              <div className="grid md:grid-cols-3 border-b border-border bg-muted/50">
                 <div className="p-6 md:border-r border-border flex items-center justify-center font-bold text-muted-foreground uppercase tracking-[0.2em] text-[10px]">Feature</div>
                 <div className="p-6 md:border-r border-border flex flex-col items-center gap-2">
                    <div className="w-8 h-8 bg-violet-500/20 rounded-lg flex items-center justify-center">
                       <Terminal className="w-4 h-4 text-violet-500" />
                    </div>
                    <span className="font-bold text-foreground tracking-tight">Qwen Code</span>
                 </div>
                 <div className="p-6 flex flex-col items-center gap-2">
                    <div className="w-8 h-8 bg-orange-500/10 rounded-lg flex items-center justify-center">
                       <Zap className="w-4 h-4 text-orange-500" />
                    </div>
                    <span className="font-bold text-muted-foreground tracking-tight">Claude Code</span>
                 </div>
              </div>

              {comparisonFeatures.map((category) => (
                <div key={category.category} className="border-b border-border last:border-0">
                  <div className="px-8 py-4 bg-muted/20 flex items-center gap-3">
                     <category.icon className="w-3.5 h-3.5 text-violet-500/50" />
                     <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{category.category}</span>
                  </div>
                  {category.features.map((feature) => (
                    <div key={feature.name} className="grid md:grid-cols-3 border-t border-border/50">
                       <div className="px-8 py-5 md:border-r border-border/50 text-sm font-medium text-muted-foreground">
                          {feature.name}
                       </div>
                       <div className="px-8 py-5 md:border-r border-border/50 flex items-center justify-center">
                          {getFeatureIcon(feature.qwen)}
                       </div>
                       <div className="px-8 py-5 flex items-center justify-center">
                          {getFeatureIcon(feature.claude)}
                       </div>
                    </div>
                  ))}
                </div>
              ))}
           </div>
           
           <div className="mt-12 text-center">
              <p className="text-sm text-muted-foreground italic">
                * Comparison based on public documentation as of Jan 2026.
              </p>
           </div>
        </div>
      </div>
    </section>
  );
};
