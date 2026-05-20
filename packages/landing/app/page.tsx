import { Audience } from '@/components/Audience';
import { Capabilities } from '@/components/Capabilities';
import { Footer } from '@/components/Footer';
import { Hero } from '@/components/Hero';
import { TrustBlock } from '@/components/TrustBlock';
import { VisualStrip } from '@/components/VisualStrip';
import { WhyExists } from '@/components/WhyExists';

export default function HomePage() {
  return (
    <main>
      <Hero />
      <VisualStrip />
      <WhyExists />
      <Capabilities />
      <Audience />
      <TrustBlock />
      <Footer />
    </main>
  );
}
