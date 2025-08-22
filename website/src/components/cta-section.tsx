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
    <section className='py-24 bg-gradient-to-br from-background via-muted/10 to-background relative overflow-hidden'>
      {/* Background Effects */}
      <div className='absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-accent/5' />
      <div className='absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-gradient-to-b from-primary/10 to-transparent rounded-full blur-3xl opacity-30' />

      <div className='container mx-auto px-6 relative z-10'>
        <div className='max-w-4xl mx-auto text-center'>
          {/* Badge */}
          <Badge
            variant='outline'
            className='px-4 py-2 mb-6 border-primary/30 bg-primary/10 hover:bg-primary/20 transition-smooth'
          >
            <Zap className='w-4 h-4 mr-2' />
            Ready to Start Coding with AI?
          </Badge>

          {/* Main Heading */}
          <h2 className='text-4xl md:text-6xl font-bold mb-6 leading-tight'>
            Transform Your
            <br />
            <span className='gradient-text'>Development Workflow</span>
          </h2>

          {/* Description */}
          <p className='text-xl text-muted-foreground mb-12 max-w-2xl mx-auto leading-relaxed'>
            Join thousands of developers who are already using Qwen Code to
            understand, edit, and automate their codebases with AI-powered
            assistance.
          </p>

          {/* Features List */}
          <div className='flex flex-wrap justify-center gap-6 mb-12'>
            <div className='flex items-center gap-2 text-sm'>
              <CheckCircle className='w-5 h-5 text-primary' />
              <span>2,000 free requests daily</span>
            </div>
            <div className='flex items-center gap-2 text-sm'>
              <CheckCircle className='w-5 h-5 text-primary' />
              <span>No credit card required</span>
            </div>
            <div className='flex items-center gap-2 text-sm'>
              <CheckCircle className='w-5 h-5 text-primary' />
              <span>Open source & MIT licensed</span>
            </div>
            <div className='flex items-center gap-2 text-sm'>
              <CheckCircle className='w-5 h-5 text-primary' />
              <span>Works with any codebase</span>
            </div>
          </div>

          {/* CTA Buttons */}
          <div className='flex flex-col sm:flex-row gap-4 justify-center items-center mb-16'>
            <Button
              size='lg'
              className='px-8 py-4 text-lg font-semibold bg-gradient-primary hover:shadow-glow transition-all duration-300 transform hover:scale-105 group'
            >
              <Terminal className='w-5 h-5 mr-2' />
              Start Free Now
              <ArrowRight className='w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform' />
            </Button>

            <Button
              variant='outline'
              size='lg'
              className='px-8 py-4 text-lg font-semibold border-primary/30 hover:border-primary/50 hover:bg-primary/10 transition-smooth group'
            >
              <Github className='w-5 h-5 mr-2' />
              <span>Star on GitHub</span>
              <Star className='w-4 h-4 ml-2 group-hover:fill-current transition-all' />
            </Button>
          </div>

          {/* Stats */}
          <div className='flex justify-center gap-8 mt-12 text-sm text-muted-foreground'>
            <div className='text-center'>
              <div className='text-2xl font-bold text-primary mb-1'>10.4k+</div>
              <div>GitHub Stars</div>
            </div>
            <div className='text-center'>
              <div className='text-2xl font-bold text-accent-blue mb-1'>
                753
              </div>
              <div>Forks</div>
            </div>
            <div className='text-center'>
              <div className='text-2xl font-bold text-accent-purple mb-1'>
                2k+
              </div>
              <div>Daily Users</div>
            </div>
            <div className='text-center'>
              <div className='text-2xl font-bold text-accent-orange mb-1'>
                MIT
              </div>
              <div>License</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
