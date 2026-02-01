import {
  Github,
  Terminal,
  Code2,
  Chrome,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export const IntegrationSection = () => {
  return (
    <section className='py-20 relative overflow-hidden'>
      <div className='container mx-auto px-6 relative z-10 flex flex-col items-center'>
        
        <div className='text-center mb-12'>
          <h2 className='text-4xl md:text-5xl font-bold mb-6 tracking-tight'>
            <span className='gradient-text-white'>Use Qwen Code </span>
            <span className='gradient-text'>where you work</span>
          </h2>
        </div>

        {/* Product Showcase Frame */}
        <div className='w-full max-w-5xl mx-auto'>
          <Tabs defaultValue="cli" className="w-full flex flex-col items-center">
            
            {/* Floating Segmented Control */}
            <div className="inline-flex items-center justify-center p-1.5 bg-muted/20 backdrop-blur-xl border border-white/10 rounded-full mb-8 shadow-2xl">
              <TabsList className="bg-transparent h-auto p-0 gap-1">
                <TabsTrigger value="cli" className="rounded-full px-5 py-2 text-xs font-medium data-[state=active]:bg-violet-500 data-[state=active]:text-white data-[state=active]:shadow-lg transition-all text-muted-foreground hover:text-foreground">
                  <Terminal className="w-3.5 h-3.5 mr-2" /> Terminal
                </TabsTrigger>
                <TabsTrigger value="ide" className="rounded-full px-5 py-2 text-xs font-medium data-[state=active]:bg-blue-500 data-[state=active]:text-white data-[state=active]:shadow-lg transition-all text-muted-foreground hover:text-foreground">
                  <Code2 className="w-3.5 h-3.5 mr-2" /> VS Code
                </TabsTrigger>
                <TabsTrigger value="github" className="rounded-full px-5 py-2 text-xs font-medium data-[state=active]:bg-zinc-700 data-[state=active]:text-white data-[state=active]:shadow-lg transition-all text-muted-foreground hover:text-foreground">
                  <Github className="w-3.5 h-3.5 mr-2" /> CI/CD
                </TabsTrigger>
                <TabsTrigger value="extension" className="rounded-full px-5 py-2 text-xs font-medium data-[state=active]:bg-amber-500 data-[state=active]:text-white data-[state=active]:shadow-lg transition-all text-muted-foreground hover:text-foreground">
                  <Chrome className="w-3.5 h-3.5 mr-2" /> Extension
                </TabsTrigger>
              </TabsList>
            </div>

            {/* The "Window" */}
            <div className="relative w-full rounded-2xl border border-white/10 bg-[#0c0c0c] shadow-2xl overflow-hidden ring-1 ring-white/5 group">
                {/* Window Header */}
                <div className="h-10 bg-[#1a1a1a]/50 border-b border-white/5 flex items-center px-4 justify-between backdrop-blur-md">
                    <div className="flex gap-2">
                        <div className="w-3 h-3 rounded-full bg-[#ff5f56] border border-[#e0443e]/50 shadow-inner" />
                        <div className="w-3 h-3 rounded-full bg-[#ffbd2e] border border-[#dea123]/50 shadow-inner" />
                        <div className="w-3 h-3 rounded-full bg-[#27c93f] border border-[#1aab29]/50 shadow-inner" />
                    </div>
                    <div className="text-[10px] font-mono text-white/20 flex gap-2">
                        <span>qwen-agent — 80x24</span>
                    </div>
                    <div className="w-10" /> {/* Spacer for centering */}
                </div>

                {/* Content Area */}
                <div className="relative min-h-[420px] bg-black/40 backdrop-blur-sm flex items-center justify-center">
                    {/* CLI View */}
                    <TabsContent value="cli" className="mt-0 w-full h-full p-1">
                        <img 
                          src="/images/cli-demo.png" 
                          alt="Terminal Integration" 
                          className="w-full h-full object-cover opacity-80 hover:opacity-100 transition-opacity" 
                        />
                    </TabsContent>

                    {/* IDE View */}
                    <TabsContent value="ide" className="mt-0 w-full h-full p-1">
                        <img 
                          src="/images/vscode-demo.png" 
                          alt="VS Code Integration" 
                          className="w-full h-full object-cover opacity-80 hover:opacity-100 transition-opacity" 
                        />
                    </TabsContent>

                    {/* GitHub View */}
                    <TabsContent value="github" className="mt-0 w-full h-full p-1">
                        <img 
                          src="/images/github-demo.png" 
                          alt="GitHub Actions Integration" 
                          className="w-full h-full object-cover opacity-80 hover:opacity-100 transition-opacity" 
                        />
                    </TabsContent>

                    {/* Extension View */}
                    <TabsContent value="extension" className="mt-0 w-full h-full p-1">
                         <img 
                          src="/images/extension-demo.png" 
                          alt="Browser Extension" 
                          className="w-full h-full object-cover opacity-80 hover:opacity-100 transition-opacity" 
                        />
                    </TabsContent>
                </div>
            </div>
          </Tabs>
        </div>
      </div>
    </section>
  );
};
