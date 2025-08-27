import { HeroSection } from "@/components/hero-section";
import { CustomNavbar } from "@/components/custom-navbar";
import { ThemeProvider } from "@/contexts/theme-context";
import "../styles/globals.css";

const Index = () => {
  return (
    <ThemeProvider>
      <div className='min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 transition-colors duration-300'>
        <CustomNavbar
          logo={
            <>
              {/* NeuG Logo */}
              <span className='ms-2 select-none font-extrabold flex items-center'>
                <span className='text-lg font-bold align-middle text-gray-900 dark:text-white'>
                  Your website
                </span>
              </span>
            </>
          }
          projectLink='https://github.com/GraphScope/neug'
        />
        <HeroSection />
      </div>
    </ThemeProvider>
  );
};

export default Index;
