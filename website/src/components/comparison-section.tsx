import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Check,
  X,
  Terminal,
  FileText,
  Globe,
  Database,
  Shield,
  Zap,
  Code2,
  GitBranch,
  Key,
  Users,
  Cloud,
  Settings,
} from "lucide-react";

const comparisonFeatures = [
  {
    category: "Core Features",
    icon: Code2,
    features: [
      {
        name: "Interactive REPL Environment",
        qwen: true,
        claude: true,
      },
      {
        name: "File System Operations",
        qwen: true,
        claude: true,
      },
      {
        name: "Shell Command Execution",
        qwen: true,
        claude: true,
      },
      {
        name: "Web Scraping & Search",
        qwen: true,
        claude: true,
      },
      {
        name: "Memory Management",
        qwen: true,
        claude: true,
      },
      {
        name: "SubAgent Support",
        qwen: true,
        claude: true,
      },
      {
        name: "SDK Support",
        qwen: "todo",
        claude: true,
      },
      {
        name: "GitHub Actions Integration",
        qwen: "todo",
        claude: true,
      },
      {
        name: "Output Style Customization",
        qwen: "todo",
        claude: true,
      },
      {
        name: "Hooks System",
        qwen: "todo",
        claude: true,
      },
      {
        name: "Git Worktree Support",
        qwen: "todo",
        claude: true,
      },
      {
        name: "Permission Management",
        qwen: "todo",
        claude: true,
      },
    ],
  },
  {
    category: "Cost & Authentication",
    icon: Key,
    features: [
      {
        name: "Free Daily Requests",
        qwen: "2000/day",
        claude: false,
      },
      {
        name: "OpenAI Protocol Support",
        qwen: true,
        claude: "limited",
      },
      {
        name: "Multiple AI Providers",
        qwen: true,
        claude: false,
      },
      {
        name: "Enterprise SSO",
        qwen: false,
        claude: true,
      },
      {
        name: "Team Management",
        qwen: false,
        claude: true,
      },
    ],
  },
  {
    category: "Development Tools",
    icon: Terminal,
    features: [
      {
        name: "Multi-file Reading",
        qwen: true,
        claude: true,
      },
      {
        name: "Code Generation",
        qwen: true,
        claude: true,
      },
      {
        name: "Code Review & Analysis",
        qwen: true,
        claude: true,
      },
      {
        name: "Git Integration",
        qwen: true,
        claude: true,
      },
      {
        name: "IDE Integration",
        qwen: true,
        claude: true,
      },
    ],
  },
  {
    category: "Deployment & Support",
    icon: Cloud,
    features: [
      {
        name: "NPM Installation",
        qwen: true,
        claude: true,
      },
      {
        name: "Docker Support",
        qwen: true,
        claude: true,
      },
      {
        name: "Source Installation",
        qwen: true,
        claude: true,
      },
      {
        name: "Cloud Deployment",
        qwen: "manual",
        claude: true,
      },
      {
        name: "Enterprise Support",
        qwen: "community",
        claude: true,
      },
    ],
  },
];

const getFeatureIcon = (status: boolean | string) => {
  if (status === true) {
    return <Check className='w-5 h-5 text-green-500' strokeWidth={2.5} />;
  } else if (status === false) {
    return <X className='w-5 h-5 text-red-400' strokeWidth={2.5} />;
  } else if (status === "2000/day") {
    return (
      <Badge className='h-5 text-xs px-2 py-1 bg-green-500 text-white font-semibold'>
        {status}
      </Badge>
    );
  } else {
    return (
      <Badge
        variant='outline'
        className='h-5 text-xs px-2 py-1 text-amber-600 border-amber-600/50 font-medium'
      >
        {status}
      </Badge>
    );
  }
};

export const ComparisonSection = () => {
  return (
    <section className='py-24 bg-gradient-to-b from-muted/20 to-background'>
      <div className='container mx-auto px-6'>
        {/* Section Header */}
        <div className='text-center mb-16'>
          <Badge
            variant='outline'
            className='px-4 py-2 mb-4 border-indigo-500/30 bg-indigo-500/10'
          >
            <Users className='w-4 h-4 mr-2' />
            Feature Comparison
          </Badge>
          <h2 className='text-4xl md:text-5xl font-bold mb-6'>
            <span className='gradient-text'>Qwen Code</span> vs{" "}
            <span className='gradient-text-accent'>Claude Code</span>
          </h2>
          <p className='text-xl text-muted-foreground max-w-3xl mx-auto'>
            Side-by-side comparison to help you choose the right AI coding
            assistant.
          </p>
        </div>

        {/* Main Comparison */}
        <div className='max-w-7xl mx-auto'>
          <div className='grid lg:grid-cols-2 gap-8'>
            {/* Qwen Code Card */}
            <Card className='p-8 bg-gradient-to-br from-violet-500/5 to-purple-500/5 border-violet-500/20 relative'>
              {/* Advantage Badge */}
              <div className='absolute -top-3 left-1/2 transform -translate-x-1/2'>
                <Badge className='bg-violet-600 text-white px-4 py-1 font-semibold'>
                  ⭐ Free & Open Source,Worth Waiting!
                </Badge>
              </div>

              <div className='text-center mb-8'>
                <div className='w-16 h-16 bg-violet-500/20 rounded-2xl flex items-center justify-center mb-4 mx-auto'>
                  <Terminal className='w-8 h-8 text-violet-600' />
                </div>
                <h3 className='text-2xl font-bold text-violet-600 mb-2'>
                  Qwen Code
                </h3>
              </div>

              <div className='space-y-8'>
                {comparisonFeatures.map((category, categoryIndex) => (
                  <div key={categoryIndex}>
                    <div className='flex items-center gap-3 mb-4'>
                      <div className='w-8 h-8 bg-violet-500/10 rounded-lg flex items-center justify-center'>
                        <category.icon className='w-4 h-4 text-violet-600' />
                      </div>
                      <h4 className='text-lg font-semibold text-violet-700'>
                        {category.category}
                      </h4>
                    </div>
                    <div className='space-y-3'>
                      {category.features.map((feature, featureIndex) => (
                        <div
                          key={featureIndex}
                          className='flex items-center justify-between py-2'
                        >
                          <span className='text-sm font-medium'>
                            {feature.name}
                          </span>
                          <div className='flex items-center'>
                            {getFeatureIcon(feature.qwen)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Qwen Code Benefits */}
              <div className='mt-8 pt-6 border-t border-violet-500/20'>
                <h4 className='text-lg font-semibold text-violet-700 mb-4'>
                  Why Choose Qwen Code:
                </h4>
                <ul className='space-y-2 text-sm'>
                  <li className='flex items-start gap-2'>
                    <Check
                      className='w-4 h-4 text-green-500 mt-0.5 flex-shrink-0'
                      strokeWidth={2.5}
                    />
                    <span>
                      <strong>Free 2000 daily requests</strong> via QwenChat
                      OAuth
                    </span>
                  </li>
                  <li className='flex items-start gap-2'>
                    <Check
                      className='w-4 h-4 text-green-500 mt-0.5 flex-shrink-0'
                      strokeWidth={2.5}
                    />
                    <span>
                      <strong>OpenAI protocol compatible</strong> - use any AI
                      model
                    </span>
                  </li>
                  <li className='flex items-start gap-2'>
                    <Check
                      className='w-4 h-4 text-green-500 mt-0.5 flex-shrink-0'
                      strokeWidth={2.5}
                    />
                    <span>
                      <strong>SubAgent support</strong> for specialized tasks
                    </span>
                  </li>
                  <li className='flex items-start gap-2'>
                    <Check
                      className='w-4 h-4 text-green-500 mt-0.5 flex-shrink-0'
                      strokeWidth={2.5}
                    />
                    <span>
                      <strong>Fully open source</strong> - customize and extend
                    </span>
                  </li>
                </ul>
              </div>
            </Card>
            {/* Claude Code Card */}
            <Card className='p-8 bg-gradient-to-br from-orange-500/5 to-red-500/5 border-orange-500/20 relative'>
              {/* Advantage Badge */}
              <div className='absolute -top-3 left-1/2 transform -translate-x-1/2'>
                <Badge className='bg-orange-600 text-white px-4 py-1 font-semibold'>
                  🏆 Commercial Solution, Recommended!
                </Badge>
              </div>
              <div className='text-center mb-8'>
                <div className='w-16 h-16 bg-orange-500/20 rounded-2xl flex items-center justify-center mb-4 mx-auto'>
                  <Zap className='w-8 h-8 text-orange-600' />
                </div>
                <h3 className='text-2xl font-bold text-orange-600 mb-2'>
                  Claude Code
                </h3>
              </div>

              <div className='space-y-8'>
                {comparisonFeatures.map((category, categoryIndex) => (
                  <div key={categoryIndex}>
                    <div className='flex items-center gap-3 mb-4'>
                      <div className='w-8 h-8 bg-orange-500/10 rounded-lg flex items-center justify-center'>
                        <category.icon className='w-4 h-4 text-orange-600' />
                      </div>
                      <h4 className='text-lg font-semibold text-orange-700'>
                        {category.category}
                      </h4>
                    </div>
                    <div className='space-y-3'>
                      {category.features.map((feature, featureIndex) => (
                        <div
                          key={featureIndex}
                          className='flex items-center justify-between py-2'
                        >
                          <span className='text-sm font-medium'>
                            {feature.name}
                          </span>
                          <div className='flex items-center'>
                            {getFeatureIcon(feature.claude)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Claude Code Benefits */}
              <div className='mt-8 pt-6 border-t border-orange-500/20'>
                <h4 className='text-lg font-semibold text-orange-700 mb-4'>
                  Best For:
                </h4>
                <ul className='space-y-2 text-sm'>
                  <li className='flex items-start gap-2'>
                    <Zap className='w-4 h-4 text-orange-600 mt-0.5 flex-shrink-0' />
                    <span>Enterprise teams needing advanced features</span>
                  </li>
                  <li className='flex items-start gap-2'>
                    <Zap className='w-4 h-4 text-orange-600 mt-0.5 flex-shrink-0' />
                    <span>Deep IDE integration requirements</span>
                  </li>
                  <li className='flex items-start gap-2'>
                    <Zap className='w-4 h-4 text-orange-600 mt-0.5 flex-shrink-0' />
                    <span>Professional support and SLA needs</span>
                  </li>
                </ul>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </section>
  );
};
