import { FinalCTA } from '@/components/FinalCTA';
import { Footer } from '@/components/Footer';
import { Hero } from '@/components/Hero';
import { PainPoints } from '@/components/PainPoints';
import { Primitives } from '@/components/Primitives';
import { TrustControl } from '@/components/TrustControl';
import { VirtualOrg } from '@/components/VirtualOrg';

export default function HomePage() {
  return (
    <main>
      <Hero />
      <PainPoints />
      <VirtualOrg />
      <Primitives />
      <TrustControl />
      <FinalCTA />
      <Footer />
    </main>
  );
}
