'use client';

import React from 'react';
import { Rocket, Users, Activity } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface ExpeditionStatsProps {
  totalExpeditions: number;
  totalAgents: number;
  activeExpeditions: number;
  className?: string;
}

export function ExpeditionStats({
  totalExpeditions,
  totalAgents,
  activeExpeditions,
  className
}: ExpeditionStatsProps) {
  const stats = [
    {
      label: 'Total Expeditions',
      value: totalExpeditions,
      icon: Rocket,
      color: 'text-primary',
      bgColor: 'bg-primary/10'
    },
    {
      label: 'Assigned Agents',
      value: totalAgents,
      icon: Users,
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10'
    },
    {
      label: 'Active Expeditions',
      value: activeExpeditions,
      icon: Activity,
      color: 'text-emerald-500',
      bgColor: 'bg-emerald-500/10'
    }
  ];

  return (
    <div className={cn("grid grid-cols-1 md:grid-cols-3 gap-4", className)}>
      {stats.map((stat, index) => (
        <Card
          key={index}
          className="bg-card/50 backdrop-blur-sm border-border/50 hover:bg-card/70 transition-all duration-200"
        >
          <div className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
                <p className="text-2xl font-bold mt-1">{stat.value}</p>
              </div>
              <div className={cn("p-3 rounded-lg", stat.bgColor)}>
                <stat.icon className={cn("w-6 h-6", stat.color)} />
              </div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}