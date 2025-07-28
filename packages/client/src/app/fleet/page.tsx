import { Metadata } from 'next';
import { PageLayout } from '@/components/layout/PageLayout';
import { StarshipDashboard } from '@/components/command-deck/starship/StarshipDashboard';

export const metadata: Metadata = {
  title: 'Fleet Management | Starships AI',
  description: 'Manage your fleet of starships',
};

export default function ShipsPage() {
  return (
    <PageLayout>
      <StarshipDashboard />
    </PageLayout>
  );
}