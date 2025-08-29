import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProductHighlights } from "@/components/product-highlights";
import {
  Terminal,
  Download,
  GitBranch,
  Key,
  Globe,
  Zap,
  CheckCircle,
  Copy,
} from "lucide-react";

export const InstallationSection = () => {
  return (
    <section className='py-24 bg-background'>
      <div className='container mx-auto px-6'>
        {/* Section Header */}
        <div className='text-center mb-16'>
          <Badge
            variant='outline'
            className='px-4 py-2 mb-4 border-violet-500/30 bg-violet-500/10'
          >
            <Download className='w-4 h-4 mr-2' />
            Installation & Setup
          </Badge>
          <h2 className='text-4xl md:text-5xl font-bold mb-6'>
            Get Started in
            <br />
            <span className='gradient-text'>30 Seconds</span>
          </h2>
          <p className='text-xl text-muted-foreground max-w-3xl mx-auto'>
            Multiple installation methods and authentication options. Choose
            what works best for your development workflow.
          </p>
        </div>

        <div className='max-w-4xl mx-auto'>
          <Tabs defaultValue='npm' className='w-full'>
            {/* Installation Methods */}
            <TabsList className='grid w-full grid-cols-2 mb-8'>
              <TabsTrigger value='npm' className='flex items-center gap-2'>
                <Download className='w-4 h-4' />
                NPM Install
              </TabsTrigger>
              <TabsTrigger value='source' className='flex items-center gap-2'>
                <GitBranch className='w-4 h-4' />
                From Source
              </TabsTrigger>
            </TabsList>

            <TabsContent value='npm' className='space-y-6'>
              <Card className='p-8 bg-gradient-to-br from-card to-card/50 border-violet-500/10'>
                <div className='flex items-center gap-3 mb-4'>
                  <div className='w-10 h-10 bg-violet-500/10 rounded-xl flex items-center justify-center'>
                    <Terminal className='w-5 h-5 text-violet-600' />
                  </div>
                  <div>
                    <h3 className='text-lg font-semibold'>Install via NPM</h3>
                    <p className='text-sm text-muted-foreground'>
                      Recommended for most users
                    </p>
                  </div>
                </div>

                <div className='bg-background/80 border border-border rounded-lg p-4 font-mono text-sm mb-4'>
                  <div className='flex items-center justify-between mb-2'>
                    <span>
                      <span className='text-violet-500'>$</span> npm install -g
                      @qwen-code/qwen-code@latest
                    </span>
                    <Button variant='ghost' size='sm' className='h-6 w-6 p-0'>
                      <Copy className='w-3 h-3' />
                    </Button>
                  </div>
                  <span>
                    <span className='text-violet-500'>$</span> qwen --version
                  </span>
                </div>

                <div className='flex items-center gap-2 text-sm text-muted-foreground'>
                  <CheckCircle className='w-4 h-4 text-violet-600' />
                  Requires Node.js version 20 or higher
                </div>
              </Card>
            </TabsContent>

            <TabsContent value='source' className='space-y-6'>
              <Card className='p-8 bg-gradient-to-br from-card to-card/50 border-purple-500/10'>
                <div className='flex items-center gap-3 mb-4'>
                  <div className='w-10 h-10 bg-purple-500/10 rounded-xl flex items-center justify-center'>
                    <GitBranch className='w-5 h-5 text-purple-600' />
                  </div>
                  <div>
                    <h3 className='text-lg font-semibold'>Build from Source</h3>
                    <p className='text-sm text-muted-foreground'>
                      For contributors and advanced users
                    </p>
                  </div>
                </div>

                <div className='bg-background/80 border border-border rounded-lg p-4 font-mono text-sm mb-4'>
                  <div className='space-y-1'>
                    <div className='flex items-center justify-between'>
                      <span>
                        <span className='text-purple-500'>$</span> git clone
                        https://github.com/QwenLM/qwen-code.git
                      </span>
                      <Button variant='ghost' size='sm' className='h-6 w-6 p-0'>
                        <Copy className='w-3 h-3' />
                      </Button>
                    </div>
                    <span>
                      <span className='text-purple-500'>$</span> cd qwen-code
                    </span>
                    <span>
                      <span className='text-purple-500'>$</span> npm install
                    </span>
                    <span>
                      <span className='text-purple-500'>$</span> npm install -g
                      .
                    </span>
                  </div>
                </div>

                <div className='flex items-center gap-2 text-sm text-muted-foreground'>
                  <CheckCircle className='w-4 h-4 text-purple-600' />
                  Get the latest features and contribute to development
                </div>
              </Card>
            </TabsContent>
          </Tabs>

          <ProductHighlights />
        </div>
      </div>
    </section>
  );
};
