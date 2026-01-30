import { CheckCircle, Globe, Github, Users, Zap, Shield, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const ProductHighlights = () => {
  return (
    <section className='py-24 bg-transparent relative overflow-hidden'>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,hsl(262_75%_50%/0.03),transparent_50%)]" />
      
      <div className='container mx-auto px-6 relative z-10'>
        <div className='max-w-4xl mx-auto'>
          <div className='glass-morphism rounded-[2rem] p-12 border border-border relative overflow-hidden'>
            {/* Animated background glow */}
            <div className="absolute -top-24 -right-24 w-64 h-64 bg-violet-600/10 rounded-full blur-[80px]" />
            
            <div className="text-center mb-12">
              <Badge variant="outline" className="mb-6 border-violet-500/30 text-violet-500 bg-violet-500/5 px-4 py-1 rounded-full uppercase tracking-widest text-[10px] font-bold">
                Ecosystem
              </Badge>
              <h3 className='text-3xl md:text-4xl font-bold mb-6 gradient-text-white'>
                More than just a CLI.
              </h3>
              <p className='text-lg text-muted-foreground mb-10 max-w-2xl mx-auto'>
                Qwen Code co-evolves with the Qwen3-Coder model. Both are open-source, ensuring you always have the most advanced coding agent at your fingertips.
              </p>
            </div>

            <div className='grid sm:grid-cols-2 gap-8 mb-12'>
              <div className="flex gap-4 items-start p-6 rounded-2xl bg-muted border border-border hover:border-violet-500/20 transition-colors group">
                <div className="mt-1 bg-violet-500/20 p-2 rounded-lg group-hover:bg-violet-500/30 transition-colors">
                  <Sparkles className="w-5 h-5 text-violet-500" />
                </div>
                <div>
                  <h4 className="text-foreground font-semibold mb-1">AionUi Support</h4>
                  <p className="text-sm text-muted-foreground">A modern graphical interface for Qwen Code for those who prefer GUI.</p>
                </div>
              </div>
              <div className="flex gap-4 items-start p-6 rounded-2xl bg-muted border border-border hover:border-violet-500/20 transition-colors group">
                <div className="mt-1 bg-violet-500/20 p-2 rounded-lg group-hover:bg-violet-500/30 transition-colors">
                  <Globe className="w-5 h-5 text-violet-500" />
                </div>
                <div>
                  <h4 className="text-foreground font-semibold mb-1">Web & Desktop</h4>
                  <p className="text-sm text-muted-foreground">Cross-platform desktop and mobile UI integrations via our community ecosystem.</p>
                </div>
              </div>
            </div>

            <div className='flex flex-wrap items-center justify-center gap-x-8 gap-y-4 pt-10 border-t border-border'>
              <div className='flex items-center gap-2 text-sm text-muted-foreground'>
                <CheckCircle className='w-4 h-4 text-green-500' />
                2,000 free daily requests
              </div>
              <div className='flex items-center gap-2 text-sm text-muted-foreground'>
                <CheckCircle className='w-4 h-4 text-green-500' />
                No credit card required
              </div>
              <div className='flex items-center gap-2 text-sm text-muted-foreground'>
                <CheckCircle className='w-4 h-4 text-green-500' />
                MIT Licensed
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
