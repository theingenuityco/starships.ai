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
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            Fleet Management
          </h1>
          <p className="text-gray-600 mt-2">
            Manage and monitor your fleet of starships
          </p>
        </div>
        
        <StarshipDashboard />
      </div>
    </AuthGate>
  );
}