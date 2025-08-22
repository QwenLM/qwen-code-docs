import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Terminal, 
  Download, 
  GitBranch, 
  Key,
  Globe,
  Zap,
  CheckCircle,
  Copy
} from "lucide-react";

export const InstallationSection = () => {
  return (
    <section className="py-24 bg-background">
      <div className="container mx-auto px-6">
        {/* Section Header */}
        <div className="text-center mb-16">
          <Badge variant="outline" className="px-4 py-2 mb-4 border-primary/30 bg-primary/10">
            <Download className="w-4 h-4 mr-2" />
            Installation
          </Badge>
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            Get Started in
            <br />
            <span className="gradient-text">30 Seconds</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Choose your preferred installation method and authentication option to start coding with AI assistance.
          </p>
        </div>

        <div className="max-w-4xl mx-auto">
          <Tabs defaultValue="npm" className="w-full">
            {/* Installation Methods */}
            <TabsList className="grid w-full grid-cols-2 mb-8">
              <TabsTrigger value="npm" className="flex items-center gap-2">
                <Download className="w-4 h-4" />
                NPM Install
              </TabsTrigger>
              <TabsTrigger value="source" className="flex items-center gap-2">
                <GitBranch className="w-4 h-4" />
                From Source
              </TabsTrigger>
            </TabsList>

            <TabsContent value="npm" className="space-y-6">
              <Card className="p-8 bg-gradient-card border-primary/10">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
                    <Terminal className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">Install via NPM</h3>
                    <p className="text-sm text-muted-foreground">Recommended for most users</p>
                  </div>
                </div>
                
                <div className="bg-background/80 border border-border rounded-lg p-4 font-mono text-sm mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span><span className="text-primary">$</span> npm install -g @qwen-code/qwen-code@latest</span>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                  <span><span className="text-primary">$</span> qwen --version</span>
                </div>

                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="w-4 h-4 text-primary" />
                  Requires Node.js version 20 or higher
                </div>
              </Card>
            </TabsContent>

            <TabsContent value="source" className="space-y-6">
              <Card className="p-8 bg-gradient-card border-primary/10">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-accent-blue/10 rounded-xl flex items-center justify-center">
                    <GitBranch className="w-5 h-5 text-accent-blue" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">Build from Source</h3>
                    <p className="text-sm text-muted-foreground">For contributors and advanced users</p>
                  </div>
                </div>
                
                <div className="bg-background/80 border border-border rounded-lg p-4 font-mono text-sm mb-4">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span><span className="text-primary">$</span> git clone https://github.com/QwenLM/qwen-code.git</span>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                        <Copy className="w-3 h-3" />
                      </Button>
                    </div>
                    <span><span className="text-primary">$</span> cd qwen-code</span>
                    <span><span className="text-primary">$</span> npm install</span>
                    <span><span className="text-primary">$</span> npm install -g .</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="w-4 h-4 text-primary" />
                  Get the latest features and contribute to development
                </div>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Authentication Options */}
          <div className="mt-16">
            <h3 className="text-2xl font-bold text-center mb-8">Authentication Options</h3>
            
            <div className="grid md:grid-cols-2 gap-6">
              {/* Qwen OAuth */}
              <Card className="p-6 bg-gradient-to-br from-primary/10 to-primary-glow/10 border-primary/20">
                <div className="flex items-center gap-3 mb-4">
                  <Badge className="bg-primary text-primary-foreground">Recommended</Badge>
                </div>
                
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-primary/20 rounded-xl flex items-center justify-center">
                    <Zap className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-semibold">Qwen OAuth</h4>
                    <p className="text-sm text-muted-foreground">Start in 30 seconds</p>
                  </div>
                </div>

                <div className="space-y-2 mb-4">
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className="w-4 h-4 text-primary" />
                    2,000 requests/day
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className="w-4 h-4 text-primary" />
                    60 requests/minute
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className="w-4 h-4 text-primary" />
                    Zero configuration
                  </div>
                </div>

                <div className="bg-background/60 border border-primary/20 rounded-lg p-3 font-mono text-sm">
                  <span><span className="text-primary">$</span> qwen</span>
                </div>
              </Card>

              {/* API Keys */}
              <Card className="p-6 bg-gradient-card border-primary/10">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-accent-blue/10 rounded-xl flex items-center justify-center">
                    <Key className="w-5 h-5 text-accent-blue" />
                  </div>
                  <div>
                    <h4 className="font-semibold">API Keys</h4>
                    <p className="text-sm text-muted-foreground">OpenAI compatible</p>
                  </div>
                </div>

                <div className="space-y-2 mb-4">
                  <div className="flex items-center gap-2 text-sm">
                    <Globe className="w-4 h-4 text-accent-blue" />
                    OpenAI, ModelScope, OpenRouter
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className="w-4 h-4 text-accent-blue" />
                    Higher rate limits available
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className="w-4 h-4 text-accent-blue" />
                    Enterprise support
                  </div>
                </div>

                <div className="bg-background/60 border border-border rounded-lg p-3 font-mono text-sm">
                  <div className="text-xs text-muted-foreground mb-1">Set environment variables:</div>
                  <div className="text-accent-blue">OPENAI_API_KEY</div>
                </div>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};