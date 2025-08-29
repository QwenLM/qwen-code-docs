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
  Layers,
  FileText,
  Globe,
  Database,
  Cog,
  Download,
} from "lucide-react";

const features = [
  {
    icon: Terminal,
    title: "Interactive REPL Environment",
    description:
      "Experience a rich, interactive Read-Eval-Print Loop that brings AI conversations directly to your terminal.",
    color: "text-violet-600",
    bgColor: "bg-violet-500/10",
  },
  {
    icon: FileText,
    title: "File System Operations",
    description:
      "Read, write, and manipulate files seamlessly with AI assistance. Perfect for code reviews and documentation.",
    color: "text-purple-600",
    bgColor: "bg-purple-500/10",
  },
  {
    icon: Database,
    title: "SubAgent Support",
    description:
      "AI agents for specialized development tasks. Automate complex workflows with intelligent assistance.",
    color: "text-indigo-600",
    bgColor: "bg-indigo-500/10",
  },
  {
    icon: Globe,
    title: "Multiple AI Models",
    description:
      "OpenAI protocol compatible. Use OpenAI, Qwen, ModelScope, OpenRouter and more AI providers.",
    color: "text-violet-700",
    bgColor: "bg-violet-600/10",
  },
];

const architectureFeatures = [
  {
    icon: Shield,
    title: "Free & Open Source",
    description:
      "2000 free daily requests via QwenChat OAuth. MIT licensed and fully customizable.",
  },
  {
    icon: Zap,
    title: "Easy Installation",
    description:
      "One command installation via NPM. Works with Docker and can be built from source.",
  },
];

export const FeaturesSection = () => {
  return (
    <section className='py-24 bg-gradient-to-b from-background to-muted/20'>
      <div className='container mx-auto px-6'>
        {/* Core Features Section */}
        <div className='text-center mb-16'>
          <Badge
            variant='outline'
            className='px-4 py-2 mb-4 border-violet-500/30 bg-violet-500/10'
          >
            <Code2 className='w-4 h-4 mr-2' />
            Core Features
          </Badge>
          <h2 className='text-4xl md:text-5xl font-bold mb-6'>
            <span className='gradient-text'>Powerful AI Tools</span>
            <br />
            Built for Developers
          </h2>
          <p className='text-xl text-muted-foreground max-w-3xl mx-auto'>
            Qwen Code brings advanced AI capabilities to your terminal, offering
            a comprehensive toolkit for modern development workflows.
          </p>
        </div>

        {/* Features Grid */}
        <div className='grid md:grid-cols-2 gap-8 mb-16'>
          {features.map((feature, index) => (
            <Card
              key={index}
              className='p-8 bg-gradient-to-br from-card to-card/50 border-violet-500/10 hover:border-violet-500/20 transition-all duration-300 hover:shadow-lg hover:shadow-violet-500/10 transform hover:-translate-y-1 group'
            >
              <div
                className={`w-12 h-12 ${feature.bgColor} rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300`}
              >
                <feature.icon className={`w-6 h-6 ${feature.color}`} />
              </div>

              <h3 className='text-xl font-semibold mb-4 text-foreground'>
                {feature.title}
              </h3>

              <p className='text-muted-foreground leading-relaxed'>
                {feature.description}
              </p>
            </Card>
          ))}
        </div>

        {/* Why Choose Qwen Code */}
        <div className='grid md:grid-cols-2 gap-8'>
          {architectureFeatures.map((feature, index) => (
            <Card
              key={index}
              className='p-8 bg-gradient-to-br from-violet-500/5 to-purple-500/5 border-violet-500/20 hover:border-violet-500/30 transition-all duration-300'
            >
              <div className='w-12 h-12 bg-violet-500/10 rounded-2xl flex items-center justify-center mb-6'>
                <feature.icon className='w-6 h-6 text-violet-600' />
              </div>

              <h3 className='text-xl font-semibold mb-4 text-foreground'>
                {feature.title}
              </h3>

              <p className='text-muted-foreground leading-relaxed'>
                {feature.description}
              </p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
};
