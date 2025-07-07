'use client';

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, AlertCircle, AlertOctagon, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Constraint } from '../shared/types';

interface ConstraintSeverityIndicatorProps {
  severity: Constraint['severity'];
  size?: 'sm' | 'default' | 'lg';
  showLabel?: boolean;
  className?: string;
}

const SEVERITY_CONFIG = {
  low: {
    label: 'Low',
    icon: Zap,
    color: 'text-gray-600 dark:text-gray-400',
    bgColor: 'bg-gray-100 dark:bg-gray-800',
    borderColor: 'border-gray-300 dark:border-gray-600'
  },
  medium: {
    label: 'Medium', 
    icon: AlertTriangle,
    color: 'text-yellow-600 dark:text-yellow-400',
    bgColor: 'bg-yellow-100 dark:bg-yellow-900/30',
    borderColor: 'border-yellow-300 dark:border-yellow-600'
  },
  high: {
    label: 'High',
    icon: AlertCircle,
    color: 'text-orange-600 dark:text-orange-400',
    bgColor: 'bg-orange-100 dark:bg-orange-900/30',
    borderColor: 'border-orange-300 dark:border-orange-600'
  },
  critical: {
    label: 'Critical',
    icon: AlertOctagon,
    color: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-100 dark:bg-red-900/30',
    borderColor: 'border-red-300 dark:border-red-600'
  }
};

export function ConstraintSeverityIndicator({
  severity,
  size = 'default',
  showLabel = false,
  className
}: ConstraintSeverityIndicatorProps) {
  const config = SEVERITY_CONFIG[severity];
  const Icon = config.icon;
  
  const sizeClasses = {
    sm: 'h-3 w-3',
    default: 'h-4 w-4',
    lg: 'h-5 w-5'
  };

  const badgeSizeClasses = {
    sm: 'text-xs px-1.5 py-0.5',
    default: 'text-xs px-2 py-1',
    lg: 'text-sm px-3 py-1.5'
  };

  if (showLabel) {
    return (
      <Badge
        variant="outline"
        className={cn(
          'flex items-center gap-1.5 border',
          config.color,
          config.bgColor,
          config.borderColor,
          badgeSizeClasses[size],
          className
        )}
      >
        <Icon className={sizeClasses[size]} />
        {config.label}
      </Badge>
    );
  }

  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-full border',
        config.color,
        config.bgColor,
        config.borderColor,
        size === 'sm' ? 'h-5 w-5' : size === 'lg' ? 'h-8 w-8' : 'h-6 w-6',
        className
      )}
      title={`${config.label} severity`}
    >
      <Icon className={sizeClasses[size]} />
    </div>
  );
} 