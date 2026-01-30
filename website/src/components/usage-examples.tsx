import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  Code,
  Workflow,
  Bug,
  ChevronRight,
  Terminal,
  MessageSquare
} from "lucide-react";

const examples = [
  {
    category: "Code Exploration",
    icon: Search,
    color: "text-violet-400",
    items: [
      "Describe the main pieces of this system's architecture",
      "Find all API endpoints and their authentication methods",
      "Generate a dependency graph for this module",
    ],
  },
  {
    category: "Development",
    icon: Code,
    color: "text-blue-400",
    items: [
      "Refactor this function to improve readability and performance",
      "Create a REST API endpoint for user management",
      "Generate unit tests for the authentication module",
    ],
  },
  {
    category: "Automation",
    icon: Workflow,
    color: "text-green-400",
    items: [
      "Create a changelog from recent commits",
      "Find all TODO comments and create GitHub issues",
      "Convert all images in this directory to PNG format",
    ],
  },
  {
    category: "Debugging",
    icon: Bug,
    color: "text-red-400",
    items: [
      "Identify performance bottlenecks in this React component",
      "Find all N+1 query problems in the codebase",
      "Check for potential SQL injection vulnerabilities",
    ],
  },
];

export const UsageExamples = () => {
  return (
    <section className='py-32 bg-transparent relative overflow-hidden'>
      <div className='container mx-auto px-6 relative z-10'>
        <div className='flex flex-col md:flex-row justify-between items-end mb-16 gap-8'>
          <div className="max-w-2xl">
            <h2 className='text-4xl md:text-5xl font-bold mb-6 tracking-tight'>
              <span className='gradient-text-white'>What can you do with</span>
              <br />
              <span className='gradient-text'>Qwen Code?</span>
            </h2>
            <p className='text-lg text-muted-foreground'>
              From simple questions to complex refactors, Qwen Code handles the tedious parts so you can focus on building.
            </p>
          </div>
          <Badge variant="outline" className="border-border text-muted-foreground font-mono px-4 py-2 rounded-full hidden md:block">
            /help for more commands
          </Badge>
        </div>

        <div className='grid md:grid-cols-2 lg:grid-cols-4 gap-6'>
          {examples.map((example, index) => (
            <div
              key={index}
              className='group p-8 rounded-3xl bg-card border border-border hover:border-violet-500/20 transition-all duration-300 shadow-sm'
            >
              <div className={`w-10 h-10 rounded-xl bg-muted flex items-center justify-center mb-6 group-hover:scale-110 transition-transform`}>
                <example.icon className={`w-5 h-5 ${example.color}`} />
              </div>
              
              <h3 className='text-lg font-bold text-card-foreground mb-6 tracking-tight'>
                {example.category}
              </h3>

              <div className='space-y-4'>
                {example.items.map((item, itemIndex) => (
                  <div
                    key={itemIndex}
                    className='flex items-start gap-2 group/item cursor-default'
                  >
                    <MessageSquare className='w-3 h-3 text-muted-foreground/60 mt-1' />
                    <span className='text-xs text-muted-foreground leading-relaxed group-hover/item:text-violet-500 transition-colors'>
                      {item}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
