import type { Metadata } from 'next';
import { VisionChamber } from '@/components/consciousness/VisionChamber';

export const metadata: Metadata = {
  title: 'Vision Chamber | Starships.ai',
  description: 'Define and refine your mission vision, goals, and constraints with intelligent auto-influence suggestions'
};

export default function VisionChamberPage() {
  return (
    <div className="h-full w-full">
      <VisionChamber className="h-full" />
    </div>
  );
}