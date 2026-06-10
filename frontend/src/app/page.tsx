import { PainCarousel } from "@/components/home/PainCarousel";
import { ProductShowcase } from "@/components/home/ProductShowcase";
import { ProductFeatures } from "@/components/home/ProductFeatures";

// Interim launch home page: pain-point carousel → product showcase →
// product features. The full V3.08 home (Hero/Stats/Partners/Tech/News…)
// remains in components/home/ for main; it is intentionally not used here.
export default function Home() {
  return (
    <>
      <PainCarousel />
      <ProductShowcase />
      <ProductFeatures />
    </>
  );
}
