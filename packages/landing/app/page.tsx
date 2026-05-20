import { Concept } from '@/components/Concept';
import { FinalCTA } from '@/components/FinalCTA';
import { Footer } from '@/components/Footer';
import { Hero } from '@/components/Hero';
import { PainPoints } from '@/components/PainPoints';
import { Product } from '@/components/Product';
import { UseCases } from '@/components/UseCases';

export default function HomePage() {
  return (
    <main>
      <Hero />
      <PainPoints />
      <Concept />
      <UseCases />
      <Product />
      <FinalCTA />
      <Footer />
    </main>
  );
}
