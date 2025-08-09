'use client';

import React from 'react';
import { Switch } from '@/components/ui/switch';

interface PricingToggleProps {
  isYearly: boolean;
  onChange: (isYearly: boolean) => void;
}

export const PricingToggle: React.FC<PricingToggleProps> = ({
  isYearly,
  onChange,
}) => {
  return (
    <div className="flex items-center justify-center space-x-4 mb-8">
      <span className={`text-sm font-medium transition-colors ${!isYearly ? 'text-white' : 'text-gray-400'}`}>
        Monthly
      </span>
      
      <Switch
        checked={isYearly}
        onCheckedChange={onChange}
        className="data-[state=checked]:bg-purple-600"
      />
      
      <div className="flex items-center space-x-2">
        <span className={`text-sm font-medium transition-colors ${isYearly ? 'text-white' : 'text-gray-400'}`}>
          Yearly
        </span>
        <span className="bg-green-500/20 text-green-400 text-xs px-2 py-1 rounded-full font-medium">
          Save 17%
        </span>
      </div>
    </div>
  );
};