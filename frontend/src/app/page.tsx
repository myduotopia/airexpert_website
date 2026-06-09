import { Hero } from "@/components/home/Hero";
import { HeroImage } from "@/components/home/HeroImage";
import { StatBar } from "@/components/home/StatBar";
import { Partners } from "@/components/home/Partners";
import { ProductOverview } from "@/components/home/ProductOverview";
import { TechSection } from "@/components/home/TechSection";
import { NewsTeaser } from "@/components/home/NewsTeaser";
import { CtaBanner } from "@/components/home/CtaBanner";

// Home page body (issue #5). The shell Header/Footer come from the root layout,
// so this file only composes the page sections. Content is static for MVP per
// docs/design/home-page.md; news/products can wire to @/lib/data later (#8/#11).
export default function Home() {
  return (
    <>
      <Hero />
      <HeroImage />
      <StatBar />
      <Partners />
      <ProductOverview />
      <TechSection />
      <NewsTeaser />
      <CtaBanner />
    </>
  );
}
