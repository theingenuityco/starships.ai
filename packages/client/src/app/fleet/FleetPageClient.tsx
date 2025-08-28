'use client';

import { StarshipDashboard } from '@/components/command-deck/starship/StarshipDashboard';

interface FleetPageClientProps {
  initialUser: any;
}

export default function FleetPageClient({ initialUser }: FleetPageClientProps) {
  // Token provider is now set up globally in AuthInitializer
  // Just render the dashboard - authentication is already verified server-side
  return <StarshipDashboard />;
}