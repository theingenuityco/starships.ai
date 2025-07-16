import type { Metadata } from 'next';
import { SimpleVisionChamber } from '@/components/vision-chamber/SimpleVisionChamber';

export const metadata: Metadata = {
  title: 'Vision Chamber | Starships.ai',
  description: 'Create and manage your starship vision statement'
};

export default function VisionChamberPage() {
  return (
    <div className="h-full w-full">
      <SimpleVisionChamber />
    </div>
  );
}