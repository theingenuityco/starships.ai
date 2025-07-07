'use client';

import { motion } from 'motion/react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface ConfidenceIndicatorProps {
  confidence: number;
  className?: string;
}

export function ConfidenceIndicator({ confidence, className }: ConfidenceIndicatorProps) {
  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 80) return 'text-green-400 bg-green-500/20 border-green-500/30';
    if (confidence >= 60) return 'text-yellow-400 bg-yellow-500/20 border-yellow-500/30';
    if (confidence >= 40) return 'text-orange-400 bg-orange-500/20 border-orange-500/30';
    return 'text-red-400 bg-red-500/20 border-red-500/30';
  };

  const getConfidenceLabel = (confidence: number) => {
    if (confidence >= 80) return 'Clear';
    if (confidence >= 60) return 'Moderate';
    if (confidence >= 40) return 'Developing';
    return 'Unclear';
  };

  const getGradientColor = (confidence: number) => {
    if (confidence >= 80) return 'from-green-500 to-emerald-500';
    if (confidence >= 60) return 'from-yellow-500 to-amber-500';
    if (confidence >= 40) return 'from-orange-500 to-red-500';
    return 'from-red-500 to-rose-500';
  };

  if (confidence <= 0) return null;

  return (
    <div className={cn("flex items-center gap-3", className)}>
      {/* Confidence Badge */}
      <Badge
        variant="outline"
        className={cn("text-xs font-medium", getConfidenceColor(confidence))}
      >
        {getConfidenceLabel(confidence)} ({confidence}%)
      </Badge>

      {/* Animated Progress Bar */}
      <div className="flex-1 max-w-24 h-2 bg-white/5 rounded-full overflow-hidden">
        <motion.div
          className={cn(
            "h-full bg-gradient-to-r rounded-full",
            getGradientColor(confidence)
          )}
          initial={{ width: 0 }}
          animate={{ width: `${confidence}%` }}
          transition={{
            duration: 1.2,
            ease: "easeOut",
            delay: 0.2
          }}
        />
      </div>

      {/* Pulse Effect for High Confidence */}
      {confidence >= 80 && (
        <motion.div
          className="w-2 h-2 bg-green-400 rounded-full"
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.7, 1, 0.7]
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />
      )}
    </div>
  );
} 