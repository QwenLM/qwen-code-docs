import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Search,
  Code,
  Workflow,
  Bug,
  ChevronRight,
  Terminal,
  GitBranch,
  Shield,
} from "lucide-react";

const examples = [
  {
    category: "Code Exploration",
    icon: Search,
    color: "text-violet-600",
    bgColor: "bg-violet-500/10",
    items: [
      "Describe the main pieces of this system's architecture",
      "What are the key dependencies and how do they interact?",
      "Find all API endpoints and their authentication methods",
      "Generate a dependency graph for this module",
    ],
  },
  {
    category: "Development",
    icon: Code,
    color: "text-purple-600",
    bgColor: "bg-purple-500/10",
    items: [
      "Refactor this function to improve readability and performance",
      "Create a REST API endpoint for user management",
      "Generate unit tests for the authentication module",
      "Add error handling to all database operations",
    ],
  },
  {
    category: "Automation",
    icon: Workflow,
    color: "text-indigo-600",
    bgColor: "bg-indigo-500/10",
    items: [
      "Analyze git commits from the last 7 days, grouped by feature",
      "Create a changelog from recent commits",
      "Find all TODO comments and create GitHub issues",
      "Convert all images in this directory to PNG format",
    ],
  },
  {
    category: "Debugging",
    icon: Bug,
    color: "text-violet-700",
    bgColor: "bg-violet-600/10",
    items: [
      "Identify performance bottlenecks in this React component",
      "Find all N+1 query problems in the codebase",
      "Check for potential SQL injection vulnerabilities",
      "Find all hardcoded credentials or API keys",
    ],
  },
];

export const UsageExamples = () => {
  return (
    <section className='py-24 bg-gradient-to-b from-muted/30 via-background/50 to-background relative overflow-hidden'>
      {/* Background decoration */}
      <div className='absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-accent/5' />
      <div className='absolute top-0 left-1/3 w-[600px] h-[300px] bg-gradient-to-b from-accent-blue/10 to-transparent rounded-full blur-3xl opacity-40' />
      <div className='absolute bottom-0 right-1/3 w-[500px] h-[250px] bg-gradient-to-t from-accent-purple/10 to-transparent rounded-full blur-3xl opacity-30' />

      <div className='container mx-auto px-6 relative z-10'>
        {/* Section Header */}
        <div className='text-center mb-20'>
          <Badge
            variant='outline'
            className='px-6 py-3 mb-6 border-violet-500/30 bg-violet-500/10 hover:bg-violet-500/20 transition-smooth'
          >
            <Terminal className='w-4 h-4 mr-2' />
            Usage Examples
          </Badge>
          <h2 className='text-4xl md:text-6xl font-bold mb-8 leading-tight'>
            <span className='gradient-text'>What Can You Build?</span>
            <br />
            Real-World Examples
          </h2>
          <p className='text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed'>
            Explore how developers use Qwen Code to solve everyday programming
            challenges and automate their workflows.
          </p>
        </div>

        {/* Examples Grid */}
        <div className='grid md:grid-cols-2 gap-8 lg:gap-10 mb-20'>
          {examples.map((example, index) => (
            <Card
              key={index}
              className='p-8 bg-gradient-to-br from-card to-card/50 border-violet-500/20 hover:border-violet-500/40 transition-all duration-300 hover:shadow-lg hover:shadow-violet-500/10 group hover:-translate-y-1 relative'
            >
              <div className='flex items-center gap-5 mb-8 relative z-10'>
                <div
                  className={`w-12 h-12 ${example.bgColor} rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300`}
                >
                  <example.icon className={`w-6 h-6 ${example.color}`} />
                </div>
                <h3 className='text-xl font-semibold text-foreground'>
                  {example.category}
                </h3>
              </div>

              <div className='space-y-3'>
                {example.items.map((item, itemIndex) => (
                  <div
                    key={itemIndex}
                    className='flex items-start gap-3 p-3 bg-background/50 rounded-lg border border-violet-500/20 hover:border-violet-500/40 transition-colors group/item'
                  >
                    <ChevronRight className='w-4 h-4 text-muted-foreground mt-0.5 group-hover/item:text-violet-600 transition-colors' />
                    <span className='text-sm text-muted-foreground group-hover/item:text-foreground transition-colors font-mono'>
                      {item}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
};
