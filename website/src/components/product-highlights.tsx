import { CheckCircle } from "lucide-react";

export const ProductHighlights = () => {
  return (
    <div className='mt-16 text-center'>
      <div className='bg-gradient-to-r from-violet-500/10 to-purple-500/10 rounded-2xl p-8 border border-violet-500/20'>
        <h3 className='text-2xl font-bold mb-4'>
          Ready to Transform Your Development Workflow?
        </h3>
        <p className='text-lg text-muted-foreground mb-6 max-w-2xl mx-auto'>
          Join thousands of developers using Qwen Code for AI-powered coding
          assistance.
        </p>
        <div className='flex flex-col sm:flex-row gap-4 justify-center'>
          <div className='flex items-center gap-2 text-sm text-violet-600 font-medium'>
            <CheckCircle className='w-4 h-4' />
            2,000 free daily requests
          </div>
          <div className='flex items-center gap-2 text-sm text-violet-600 font-medium'>
            <CheckCircle className='w-4 h-4' />
            No credit card required
          </div>
          <div className='flex items-center gap-2 text-sm text-violet-600 font-medium'>
            <CheckCircle className='w-4 h-4' />
            MIT licensed
          </div>
        </div>
      </div>
    </div>
  );
};
