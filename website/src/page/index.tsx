import { HeroSection } from "@/components/ui/hero-section";
import { FeaturesSection } from "@/components/ui/features-section";
import { InstallationSection } from "@/components/ui/installation-section";
import { UsageExamples } from "@/components/ui/usage-examples";
import { CTASection } from "@/components/ui/cta-section";
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
