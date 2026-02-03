"use client";

import {
  Github,
  Terminal,
  Code2,
  Box,
  Zap,
  Copy,
  Check,
  Globe,
  Puzzle,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button";
import { useState } from "react";

const TabContent = ({
  title,
  description,
  command,
  imageSrc,
  imageAlt,
  videoSrc
}: {
  title: string,
  description: string,
  command?: string,
  imageSrc?: string,
  imageAlt?: string,
  videoSrc?: string
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (command) {
      navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className='flex flex-col items-center text-center'>
      {/* Title and Description - Top Section */}
      <div className="mb-8">
        <h3 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight mb-4">
          {title}
        </h3>
        <p className="text-lg text-muted-foreground max-w-4xl mx-auto leading-relaxed">
          {description}
        </p>
      </div>

      {/* Command */}
      {command && (
        <div className="w-full max-w-xl bg-muted/50 backdrop-blur-sm border border-border rounded-xl p-4 flex items-center justify-between font-mono text-sm group/cmd hover:border-primary/30 transition-colors mb-8">
          <code className="text-primary overflow-hidden text-ellipsis whitespace-nowrap mr-4">
            {command}
          </code>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 hover:bg-primary/10 hover:text-foreground shrink-0"
            onClick={handleCopy}
          >
            {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
          </Button>
        </div>
      )}

      {/* Window with Video/Image - Full Width */}
      <div className="w-full relative rounded-2xl border border-border bg-card shadow-2xl overflow-hidden ring-1 ring-border/50 group">
          {/* Window Header */}
          <div className="h-10 bg-muted/50 border-b border-border flex items-center px-4 justify-between backdrop-blur-md">
              <div className="flex gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#ff5f56] border border-[#e0443e]/50 shadow-inner" />
                  <div className="w-3 h-3 rounded-full bg-[#ffbd2e] border border-[#dea123]/50 shadow-inner" />
                  <div className="w-3 h-3 rounded-full bg-[#27c93f] border border-[#1aab29]/50 shadow-inner" />
              </div>
              <div className="text-[10px] font-mono text-muted-foreground flex gap-2">
                  <span>qwen-agent — 80x24</span>
              </div>
              <div className="w-10" />
          </div>

          {/* Content Area */}
          <div className="relative aspect-video bg-muted/30 flex items-center justify-center overflow-hidden">
              {videoSrc ? (
                <video
                  src={videoSrc}
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                />
              ) : (
                <img
                  src={imageSrc}
                  alt={imageAlt}
                  className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity duration-500"
                />
              )}
          </div>
      </div>
    </div>
  );
};

export const IntegrationSection = () => {
  return (
    <section className='py-20 relative overflow-hidden'>
      <div className='container mx-auto px-6 relative z-10 flex flex-col items-center'>

        <div className='text-center mb-12'>
          <h2 className='text-4xl md:text-5xl font-bold tracking-tight'>
            <span className='gradient-text-white'>Use Qwen Code </span>
            <span className='gradient-text'>where you work</span>
          </h2>
        </div>

        {/* Product Showcase Frame */}
        <div className='w-full max-w-6xl mx-auto'>
          <Tabs defaultValue="interactive" className="w-full">

            {/* Floating Segmented Control */}
            <div className="flex justify-center mb-12 px-4">
              <div className="inline-flex items-center justify-center p-1.5 bg-muted/20 backdrop-blur-xl border border-border rounded-full shadow-2xl overflow-x-auto max-w-full">
                <TabsList className="bg-transparent h-auto p-0 gap-1">
                  <TabsTrigger value="interactive" className="rounded-full px-3 md:px-5 py-2 data-[state=active]:bg-violet-500 data-[state=active]:text-white data-[state=active]:shadow-lg transition-all text-muted-foreground hover:text-foreground whitespace-nowrap">
                    <Terminal className="w-4 h-4 md:w-3.5 md:h-3.5" />
                    <span className="hidden md:inline md:ml-2 text-xs font-medium">Interactive</span>
                  </TabsTrigger>
                  <TabsTrigger value="headless" className="rounded-full px-3 md:px-5 py-2 data-[state=active]:bg-orange-500 data-[state=active]:text-white data-[state=active]:shadow-lg transition-all text-muted-foreground hover:text-foreground whitespace-nowrap">
                    <Zap className="w-4 h-4 md:w-3.5 md:h-3.5" />
                    <span className="hidden md:inline md:ml-2 text-xs font-medium">Headless</span>
                  </TabsTrigger>
                  <TabsTrigger value="ide" className="rounded-full px-3 md:px-5 py-2 data-[state=active]:bg-blue-500 data-[state=active]:text-white data-[state=active]:shadow-lg transition-all text-muted-foreground hover:text-foreground whitespace-nowrap">
                    <Code2 className="w-4 h-4 md:w-3.5 md:h-3.5" />
                    <span className="hidden md:inline md:ml-2 text-xs font-medium">IDE</span>
                  </TabsTrigger>
                  <TabsTrigger value="sdk" className="rounded-full px-3 md:px-5 py-2 data-[state=active]:bg-emerald-500 data-[state=active]:text-white data-[state=active]:shadow-lg transition-all text-muted-foreground hover:text-foreground whitespace-nowrap">
                    <Box className="w-4 h-4 md:w-3.5 md:h-3.5" />
                    <span className="hidden md:inline md:ml-2 text-xs font-medium">SDK</span>
                  </TabsTrigger>
                </TabsList>
              </div>
            </div>

            {/* Tab Contents */}
            <div className="relative">
                <TabsContent value="interactive" className="mt-0 focus-visible:outline-none">
                    <TabContent
                        title="Interactive Mode"
                        description="Launch a rich terminal UI to chat with your codebase. Use @ to reference files and symbols, helping you understand and edit code in real-time."
                        command="qwen"
                        imageSrc="https://gw.alicdn.com/imgextra/i3/O1CN01NVV7Sy1VckCYdeBuT_!!6000000002674-2-tps-1600-900.png"
                        imageAlt="Interactive Terminal UI"
                    />
                </TabsContent>

                <TabsContent value="headless" className="mt-0 focus-visible:outline-none">
                    <TabContent
                        title="Headless Mode"
                        description="Execute tasks directly from the command line without the UI. Perfect for one-off prompts, complex shell scripts, and CI/CD pipelines."
                        command='qwen -p "Explain the auth flow"'
                        imageSrc="https://gw.alicdn.com/imgextra/i3/O1CN01gOm37Q1HRNksxmOc0_!!6000000000754-1-tps-1280-720.gif"
                        imageAlt="Headless Mode Automation"
                    />
                </TabsContent>

                <TabsContent value="ide" className="mt-0 focus-visible:outline-none">
                    <TabContent
                        title="IDE Integration"
                        description="Bring Qwen Code's intelligence to your favorite editor. Supporting VS Code, Zed, and JetBrains IDEs for a seamless, AI-native developer experience."
                        command='Search "Qwen Code" in VS Code'
                        videoSrc="https://cloud.video.taobao.com/vod/IKKwfM-kqNI3OJjM_U8uMCSMAoeEcJhs6VNCQmZxUfk.mp4"
                        imageAlt="IDE Integration"
                    />
                </TabsContent>

                <TabsContent value="sdk" className="mt-0 focus-visible:outline-none">
                    <TabContent
                        title="TypeScript SDK"
                        description="Build your own AI agents and tools on top of Qwen Code. Our SDK provides programmable access to the same powerful engine that drives the CLI."
                        command="npm install @qwen-code/sdk"
                        imageSrc="https://gw.alicdn.com/imgextra/i1/O1CN01np6TOR1uZs6ylG1Fv_!!6000000006052-2-tps-1702-952.png"
                        imageAlt="TypeScript SDK Integration"
                    />
                </TabsContent>

                <TabsContent value="chrome" className="mt-0 focus-visible:outline-none">
                    <TabContent
                        title="Chrome Extension"
                        description="Bring Qwen Code to your browser. The Chrome Extension allows you to interact with AI assistance on any web page, from Stack Overflow to GitHub."
                        command="Install from Chrome Web Store"
                        imageSrc="/images/extension-demo.png"
                        imageAlt="Chrome Extension"
                    />
                </TabsContent>

                <TabsContent value="web" className="mt-0 focus-visible:outline-none">
                    <TabContent
                        title="Web Interface"
                        description="Access Qwen Code directly from your browser. No installation required—just open the web app and start coding with AI assistance."
                        command="Open web.qwen-code.com"
                        imageSrc="/images/github-demo.png"
                        imageAlt="Web Interface"
                    />
                </TabsContent>
            </div>
          </Tabs>
        </div>
      </div>
    </section>
  );
};
