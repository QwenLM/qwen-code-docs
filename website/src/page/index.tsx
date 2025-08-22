import { HeroSection } from "@/components/hero-section";
import { FeaturesSection } from "@/components/features-section";
import { InstallationSection } from "@/components/installation-section";
import { UsageExamples } from "@/components/usage-examples";
import { CTASection } from "@/components/cta-section";
import "../styles/globals.css";

const Index = () => {
  return (
    <div className='min-h-screen bg-background'>
      <HeroSection />
      <FeaturesSection />
      <InstallationSection />
      <UsageExamples />
      <CTASection />
    </div>
  );
};

export default Index;
