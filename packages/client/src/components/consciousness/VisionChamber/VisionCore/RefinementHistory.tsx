'use client';

import { Clock, GitBranch } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RefinementHistoryProps {
  lastUpdated: Date;
  className?: string;
}

export function RefinementHistory({ lastUpdated, className }: RefinementHistoryProps) {
  return (
    <div className={cn("flex items-center justify-between text-xs text-white/40", className)}>
      <div className="flex items-center gap-2">
        <Clock className="w-3 h-3" />
        <span>
          Last updated: {lastUpdated.toLocaleDateString()} at{' '}
          {lastUpdated.toLocaleTimeString()}
        </span>
      </div>
      
      {/* Placeholder for future version history */}
      <div className="flex items-center gap-1 opacity-50">
        <GitBranch className="w-3 h-3" />
        <span>v1.0</span>
      </div>
    </div>
  );
}

// Future enhancement: Version timeline component
export function VersionTimeline() {
  // Placeholder for future implementation
  // Will show:
  // - Vision statement versions
  // - Rollback capabilities  
  // - Change history
  // - AI suggestion tracking
  return (
    <div className="text-xs text-white/30 p-2 border border-white/5 rounded">
      <p>Version timeline coming soon...</p>
      <p className="text-white/20">• Change history tracking</p>
      <p className="text-white/20">• Rollback capabilities</p>
      <p className="text-white/20">• AI suggestion audit</p>
    </div>
  );
} 