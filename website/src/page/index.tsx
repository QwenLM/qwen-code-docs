import { HeroSection } from "@/components/hero-section";
import { IntegrationSection } from "@/components/integration-section";
import { FeaturesSection } from "@/components/features-section";
import { ComparisonSection } from "@/components/comparison-section";
import { UsageExamples } from "@/components/usage-examples";
import { CTASection } from "@/components/cta-section";
import { CustomNavbar } from "@/components/custom-navbar";

const Index = () => {
  return (
    <div className='min-h-screen bg-background text-foreground selection:bg-violet-500/30 font-sans transition-colors duration-300'>
      <CustomNavbar
        logo={
          <>
            <span
              className='ms-2 select-none font-extrabold flex items-center'
              title={`Qwen Code: AI Coding Agent`}
            >
              <img
                src='/favicon.png'
                alt='Qwen Code'
                width={32}
                height={32}
                className='inline-block align-middle mr-2 '
                style={{ verticalAlign: "middle" }}
              />
              <span className='text-[1.3rem] font-normal align-middle mr-1 max-md:hidden'>
                Qwen
              </span>
              <span className='text-[1.3rem] font-normal align-middle max-md:hidden'>
                Code
              </span>
            </span>
          </>
        }
        projectLink='https://github.com/QwenLM/qwen-code'
      />
      <HeroSection />
      <IntegrationSection />
      <FeaturesSection />
      <ComparisonSection />
      <UsageExamples />
      <CTASection />
    </div>
  );
};

export default Index;
