import { Metadata } from 'next';
import { AuthGate } from '@/components/auth/AuthGate';
import { StarshipDashboard } from '@/components/command-deck/starship/StarshipDashboard';

export const metadata: Metadata = {
  title: 'Fleet Management | Starships AI',
  description: 'Manage your fleet of starships',
};

export default function ShipsPage() {
  return (
    <AuthGate>
      <div className="h-screen w-screen overflow-hidden">
        <StarshipDashboard />
      </div>
    </AuthGate>
  );
}