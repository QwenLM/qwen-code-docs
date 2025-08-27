import { Button } from "@/components/ui/button";

export const HeroSection = () => {
  return (
    <section className='relative min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 via-white to-gray-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 overflow-hidden transition-colors duration-300'>
      {/* Main Heading */}
      <h1 className='text-5xl md:text-7xl font-bold mb-6 leading-tight text-gray-900 dark:text-white'>
        <span>Hello</span>
      </h1>
      <br />
      <Button variant='outline'>World</Button>
    </section>
  );
};
