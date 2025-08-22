import { HeroSection } from "@/components/hero-section";
import { FeaturesSection } from "@/components/features-section";
import { InstallationSection } from "@/components/installation-section";
import { UsageExamples } from "@/components/usage-examples";
import { CTASection } from "@/components/cta-section";
import { CustomNavbar } from "@/components/custom-navbar";
import "../styles/globals.css";

const Index = () => {
  return (
    <div className='min-h-screen bg-background'>
      <CustomNavbar
        logo={
          <>
            <span
              className='ms-2 select-none font-extrabold max-md:hidden flex items-center'
              title={`Qwen Code: AI Coding Agent`}
            >
              <img
                src='https://assets.alicdn.com/g/qwenweb/qwen-webui-fe/0.0.191/static/favicon.png'
                alt='Qwen Code'
                width={32}
                height={32}
                className='inline-block align-middle mr-2'
                style={{ verticalAlign: "middle" }}
              />
              <span className='text-[1.3rem]  font-normal align-middle mr-1'>
                Qwen
              </span>
              <span className='text-[1.3rem] font-normal align-middle'>
                Code
              </span>
            </span>
          </>
        }
        projectLink='https://github.com/QwenLM/qwen-code'
      />
      <HeroSection />
      <FeaturesSection />
      <InstallationSection />
      <UsageExamples />
      <CTASection />
    </div>
  );
};

export default Index;
