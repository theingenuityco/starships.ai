'use client';

import { DebugMissionList } from '@/components/missions/DebugMissionList';

export default function MissionsPage() {
  return (
    <div className="h-full bg-background p-8">
      <div className="max-w-6xl mx-auto">
        <DebugMissionList />
      </div>
    </div>
  );
}