import { PainCarousel } from "@/components/home/PainCarousel";
import { ProductShowcase } from "@/components/home/ProductShowcase";
import { ProductFeatures } from "@/components/home/ProductFeatures";
import { SocialFollow } from "@/components/home/SocialFollow";

// Interim launch home page: pain-point carousel → product showcase →
// product features → social follow. The full V3.08 home (Hero/Stats/…)
// remains in components/home/ for main; it is intentionally not used here.
export default function Home() {
  return (
    <>
      <PainCarousel />
      <ProductShowcase />
      <ProductFeatures />
      <SocialFollow />
    </>
  );
}
