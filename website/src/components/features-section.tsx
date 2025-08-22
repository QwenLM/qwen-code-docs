import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Code2, 
  Zap, 
  Brain, 
  GitBranch, 
  Terminal, 
  Shield,
  Clock,
  Layers
} from "lucide-react";

const features = [
  {
    icon: Code2,
    title: "Code Understanding & Editing",
    description: "Query and edit large codebases beyond traditional context window limits. Understand complex architectures instantly.",
    color: "text-primary",
    bgColor: "bg-primary/10"
  },
  {
    icon: Zap,
    title: "Workflow Automation",
    description: "Automate operational tasks like handling pull requests, complex rebases, and repetitive development workflows.",
    color: "text-accent-blue",
    bgColor: "bg-accent-blue/10"
  },
  {
    icon: Brain,
    title: "Enhanced Parser",
    description: "Adapted parser specifically optimized for Qwen-Coder models, ensuring superior code comprehension.",
    color: "text-accent-purple",
    bgColor: "bg-accent-purple/10"
  },
  {
    icon: GitBranch,
    title: "Git Integration",
    description: "Seamlessly analyze commits, create changelogs, and manage version control workflows with AI assistance.",
    color: "text-accent-orange",
    bgColor: "bg-accent-orange/10"
  },
  {
    icon: Terminal,
    title: "CLI-First Experience",
    description: "Native command-line interface that integrates perfectly with your existing development environment.",
    color: "text-primary-glow",
    bgColor: "bg-primary-glow/10"
  },
  {
    icon: Shield,
    title: "Security Analysis",
    description: "Identify vulnerabilities, find hardcoded credentials, and perform comprehensive security audits automatically.",
    color: "text-accent-blue",
    bgColor: "bg-accent-blue/10"
  }
];

export const FeaturesSection = () => {
  return (
    <section className="py-24 bg-gradient-to-b from-background to-muted/20">
      <div className="container mx-auto px-6">
        {/* Section Header */}
        <div className="text-center mb-16">
          <Badge variant="outline" className="px-4 py-2 mb-4 border-primary/30 bg-primary/10">
            <Layers className="w-4 h-4 mr-2" />
            Features
          </Badge>
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            <span className="gradient-text">Powerful AI Features</span>
            <br />
            Built for Developers
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Unlock the full potential of your development workflow with advanced AI capabilities designed specifically for code.
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
          {features.map((feature, index) => (
            <Card 
              key={index}
              className="p-8 bg-gradient-card border-primary/10 hover:border-primary/20 transition-all duration-300 hover:shadow-elegant transform hover:-translate-y-2 group"
            >
              <div className={`w-12 h-12 ${feature.bgColor} rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300`}>
                <feature.icon className={`w-6 h-6 ${feature.color}`} />
              </div>
              
              <h3 className="text-xl font-semibold mb-4 text-foreground">
                {feature.title}
              </h3>
              
              <p className="text-muted-foreground leading-relaxed">
                {feature.description}
              </p>
            </Card>
          ))}
        </div>

        {/* Free Tier Highlight */}
        <div className="bg-gradient-to-r from-primary/10 via-accent/10 to-primary/10 rounded-3xl p-8 md:p-12 text-center border border-primary/20">
          <div className="flex justify-center mb-4">
            <Badge className="px-4 py-2 bg-primary text-primary-foreground">
              <Clock className="w-4 h-4 mr-2" />
              Free Tier Available
            </Badge>
          </div>
          
          <h3 className="text-3xl font-bold mb-4">
            Start Coding with AI Today
          </h3>
          
          <p className="text-lg text-muted-foreground mb-6 max-w-2xl mx-auto">
            Get started with <span className="text-primary font-semibold">2,000 free requests per day</span> through Qwen OAuth. 
            No credit card required, no token limits to worry about.
          </p>
          
          <div className="grid md:grid-cols-3 gap-6 mt-8">
            <div className="text-center">
              <div className="text-2xl font-bold text-primary mb-2">2,000</div>
              <div className="text-sm text-muted-foreground">Daily Requests</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-accent-blue mb-2">60/min</div>
              <div className="text-sm text-muted-foreground">Rate Limit</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-accent-purple mb-2">∞</div>
              <div className="text-sm text-muted-foreground">No Token Limits</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};