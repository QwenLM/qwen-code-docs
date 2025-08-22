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
  Shield
} from "lucide-react";

const examples = [
  {
    category: "Code Exploration",
    icon: Search,
    color: "text-primary",
    bgColor: "bg-primary/10",
    items: [
      "Describe the main pieces of this system's architecture",
      "What are the key dependencies and how do they interact?",
      "Find all API endpoints and their authentication methods",
      "Generate a dependency graph for this module"
    ]
  },
  {
    category: "Development",
    icon: Code,
    color: "text-accent-blue", 
    bgColor: "bg-accent-blue/10",
    items: [
      "Refactor this function to improve readability and performance",
      "Create a REST API endpoint for user management", 
      "Generate unit tests for the authentication module",
      "Add error handling to all database operations"
    ]
  },
  {
    category: "Automation",
    icon: Workflow,
    color: "text-accent-purple",
    bgColor: "bg-accent-purple/10", 
    items: [
      "Analyze git commits from the last 7 days, grouped by feature",
      "Create a changelog from recent commits",
      "Find all TODO comments and create GitHub issues",
      "Convert all images in this directory to PNG format"
    ]
  },
  {
    category: "Debugging",
    icon: Bug,
    color: "text-accent-orange",
    bgColor: "bg-accent-orange/10",
    items: [
      "Identify performance bottlenecks in this React component",
      "Find all N+1 query problems in the codebase", 
      "Check for potential SQL injection vulnerabilities",
      "Find all hardcoded credentials or API keys"
    ]
  }
];

export const UsageExamples = () => {
  return (
    <section className="py-24 bg-gradient-to-b from-muted/20 to-background">
      <div className="container mx-auto px-6">
        {/* Section Header */}
        <div className="text-center mb-16">
          <Badge variant="outline" className="px-4 py-2 mb-4 border-primary/30 bg-primary/10">
            <Terminal className="w-4 h-4 mr-2" />
            Usage Examples
          </Badge>
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            <span className="gradient-text">What Can You Build?</span>
            <br />
            Real-World Examples
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Explore how developers use Qwen Code to solve everyday programming challenges and automate their workflows.
          </p>
        </div>

        {/* Examples Grid */}
        <div className="grid md:grid-cols-2 gap-8 mb-16">
          {examples.map((example, index) => (
            <Card key={index} className="p-8 bg-gradient-card border-primary/10 hover:border-primary/20 transition-all duration-300 hover:shadow-elegant group">
              <div className="flex items-center gap-4 mb-6">
                <div className={`w-12 h-12 ${example.bgColor} rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300`}>
                  <example.icon className={`w-6 h-6 ${example.color}`} />
                </div>
                <h3 className="text-xl font-semibold">{example.category}</h3>
              </div>

              <div className="space-y-3">
                {example.items.map((item, itemIndex) => (
                  <div key={itemIndex} className="flex items-start gap-3 p-3 bg-background/50 rounded-lg border border-border/50 hover:border-primary/20 transition-colors group/item">
                    <ChevronRight className="w-4 h-4 text-muted-foreground mt-0.5 group-hover/item:text-primary transition-colors" />
                    <span className="text-sm text-muted-foreground group-hover/item:text-foreground transition-colors font-mono">
                      {item}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>

        {/* Interactive Demo Section */}
        <div className="bg-gradient-to-r from-primary/10 via-background to-accent/10 rounded-3xl p-8 md:p-12 border border-primary/20">
          <div className="text-center mb-8">
            <h3 className="text-3xl font-bold mb-4">Try It Yourself</h3>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              See Qwen Code in action with these popular development tasks
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <Card className="p-6 bg-card/50 border-primary/20 hover:border-primary/30 transition-colors">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
                  <Search className="w-4 h-4 text-primary" />
                </div>
                <h4 className="font-semibold">Code Analysis</h4>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Understand large codebases instantly
              </p>
              <Button variant="outline" size="sm" className="w-full">
                <Terminal className="w-4 h-4 mr-2" />
                Try Example
              </Button>
            </Card>

            <Card className="p-6 bg-card/50 border-accent-blue/20 hover:border-accent-blue/30 transition-colors">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 bg-accent-blue/10 rounded-lg flex items-center justify-center">
                  <GitBranch className="w-4 h-4 text-accent-blue" />
                </div>
                <h4 className="font-semibold">Git Automation</h4>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Automate version control workflows
              </p>
              <Button variant="outline" size="sm" className="w-full">
                <Terminal className="w-4 h-4 mr-2" />
                Try Example
              </Button>
            </Card>

            <Card className="p-6 bg-card/50 border-accent-purple/20 hover:border-accent-purple/30 transition-colors">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 bg-accent-purple/10 rounded-lg flex items-center justify-center">
                  <Shield className="w-4 h-4 text-accent-purple" />
                </div>
                <h4 className="font-semibold">Security Audit</h4>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Find vulnerabilities automatically
              </p>
              <Button variant="outline" size="sm" className="w-full">
                <Terminal className="w-4 h-4 mr-2" />
                Try Example
              </Button>
            </Card>
          </div>
        </div>
      </div>
    </section>
  );
};