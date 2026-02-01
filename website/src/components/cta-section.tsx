import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Terminal,
  Github,
  Star,
  Zap,
  ArrowRight,
  CheckCircle,
  Code2,
} from "lucide-react";

export const CTASection = () => {
  return (
    <section className='py-32 bg-background relative overflow-hidden'>
      {/* Background Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-violet-600/10 rounded-full blur-[120px] pointer-events-none" />
      
      <div className='container mx-auto px-6 relative z-10'>
        <div className='max-w-4xl mx-auto text-center'>
          <h2 className='text-5xl md:text-7xl font-bold mb-8 tracking-tighter'>
            <span className='gradient-text-white'>Ready to ship</span>
            <br />
            <span className='gradient-text'>faster than ever?</span>
          </h2>

          <p className='text-lg md:text-xl text-muted-foreground mb-12 max-w-4xl mx-auto leading-relaxed'>
            Join the open-source movement. Experience the power of Qwen3-Coder in your terminal today.
          </p>

          <div className='flex flex-col sm:flex-row gap-4 justify-center items-center mb-20'>
            <Button
              size='lg'
              className='rounded-full px-10 h-14 text-lg bg-violet-600 hover:bg-violet-700 text-white transition-all hover:scale-105 shadow-xl shadow-violet-500/20 border-none'
            >
              Get Started Free <ArrowRight className='w-5 h-5 ml-2' />
            </Button>

            <Button
              variant='outline'
              size='lg'
              className='rounded-full px-10 h-14 text-lg border-border text-foreground hover:bg-accent transition-all'
            >
              <Github className='w-5 h-5 mr-2' />
              <span>View Source</span>
            </Button>
          </div>

          <div className='grid grid-cols-2 md:grid-cols-4 gap-8 py-12 border-y border-border'>
            <div className='flex flex-col gap-1'>
              <span className='text-3xl font-bold text-foreground'>15k+</span>
              <span className='text-[10px] uppercase tracking-widest text-muted-foreground font-bold'>GitHub Stars</span>
            </div>
            <div className='flex flex-col gap-1'>
              <span className='text-3xl font-bold text-foreground'>2k+</span>
              <span className='text-[10px] uppercase tracking-widest text-muted-foreground font-bold'>Daily Users</span>
            </div>
            <div className='flex flex-col gap-1'>
              <span className='text-3xl font-bold text-foreground'>2000</span>
              <span className='text-[10px] uppercase tracking-widest text-muted-foreground font-bold'>Free Requests</span>
            </div>
            <div className='flex flex-col gap-1'>
              <span className='text-3xl font-bold text-foreground'>100%</span>
              <span className='text-[10px] uppercase tracking-widest text-muted-foreground font-bold'>Open Source</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
