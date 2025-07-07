'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { X, Zap, Scale, Cog, Briefcase } from 'lucide-react';
import { ConstraintFormData, Constraint } from '../shared/types';
import { ConstraintSeverityIndicator } from './ConstraintSeverityIndicator';

interface ConstraintCreatorProps {
  isOpen: boolean;
  onClose: () => void;
  onConstraintCreate: (data: ConstraintFormData) => void;
  initialCategory?: Constraint['type'];
}

const CATEGORIES = [
  {
    type: 'resource' as const,
    label: 'Resource',
    icon: Zap,
    description: 'Power, crew, time limitations',
    examples: ['Limited crew capacity', 'Energy consumption constraints', 'Time-sensitive missions']
  },
  {
    type: 'ethical' as const,
    label: 'Ethical',
    icon: Scale,
    description: 'Moral guidelines, rules of engagement',
    examples: ['No harm to civilians', 'Respect planetary sovereignty', 'Preserve cultural artifacts']
  },
  {
    type: 'technical' as const,
    label: 'Technical',
    icon: Cog,
    description: 'System limitations, compatibility',
    examples: ['Warp drive cooldown periods', 'Sensor interference in nebulae', 'Compatibility with alien tech']
  },
  {
    type: 'business' as const,
    label: 'Business',
    icon: Briefcase,
    description: 'Budget, partnerships, regulations',
    examples: ['Budget constraints', 'Trade agreements', 'Federation regulations']
  }
];

const SEVERITY_OPTIONS = [
  { value: 'low', label: 'Low', description: 'Minor limitation, easily worked around' },
  { value: 'medium', label: 'Medium', description: 'Moderate constraint requiring attention' },
  { value: 'high', label: 'High', description: 'Significant limitation affecting operations' },
  { value: 'critical', label: 'Critical', description: 'Absolute constraint that cannot be violated' }
] as const;

export function ConstraintCreator({
  isOpen,
  onClose,
  onConstraintCreate,
  initialCategory = 'resource'
}: ConstraintCreatorProps) {
  const [formData, setFormData] = useState<ConstraintFormData>({
    description: '',
    type: initialCategory,
    severity: 'medium',
    isActive: true
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const selectedCategory = CATEGORIES.find(cat => cat.type === formData.type) || CATEGORIES[0];

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    
    if (!formData.description.trim()) {
      newErrors.description = 'Description is required';
    } else if (formData.description.trim().length < 10) {
      newErrors.description = 'Description must be at least 10 characters';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    
    setIsSubmitting(true);
    try {
      await onConstraintCreate({
        ...formData,
        description: formData.description.trim()
      });
      
      // Reset form and close
      setFormData({
        description: '',
        type: initialCategory,
        severity: 'medium',
        isActive: true
      });
      setErrors({});
      onClose();
    } catch (error) {
      console.error('Failed to create constraint:', error);
      setErrors({ submit: 'Failed to create constraint. Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    setFormData({
      description: '',
      type: initialCategory,
      severity: 'medium',
      isActive: true
    });
    setErrors({});
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-medium">Add New Constraint</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCancel}
              className="h-6 w-6 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Category Selection */}
            <div className="space-y-3">
              <label className="text-sm font-medium">Category</label>
              <div className="grid grid-cols-2 gap-2">
                {CATEGORIES.map((category) => {
                  const Icon = category.icon;
                  const isSelected = formData.type === category.type;
                  
                  return (
                    <Button
                      key={category.type}
                      type="button"
                      variant={isSelected ? "default" : "outline"}
                      className="h-auto p-3 flex flex-col items-start gap-2"
                      onClick={() => setFormData(prev => ({ ...prev, type: category.type }))}
                    >
                      <div className="flex items-center gap-2 w-full">
                        <Icon className="h-4 w-4" />
                        <span className="font-medium">{category.label}</span>
                      </div>
                      <span className="text-xs opacity-70 text-left">
                        {category.description}
                      </span>
                    </Button>
                  );
                })}
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Description
                <span className="text-red-500 ml-1">*</span>
              </label>
              <Textarea
                value={formData.description}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => 
                  setFormData(prev => ({ ...prev, description: e.target.value }))
                }
                placeholder={`Describe this ${selectedCategory.label.toLowerCase()} constraint...`}
                className={`min-h-[100px] ${errors.description ? 'border-red-500' : ''}`}
                disabled={isSubmitting}
              />
              {errors.description && (
                <p className="text-sm text-red-600">{errors.description}</p>
              )}
              
              {/* Examples */}
              <div className="text-xs text-muted-foreground">
                <span className="font-medium">Examples:</span>
                <ul className="mt-1 space-y-1">
                  {selectedCategory.examples.map((example, index) => (
                    <li key={index} className="pl-2">• {example}</li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Severity */}
            <div className="space-y-3">
              <label className="text-sm font-medium">Severity Level</label>
              <div className="grid grid-cols-2 gap-2">
                {SEVERITY_OPTIONS.map((option) => {
                  const isSelected = formData.severity === option.value;
                  
                  return (
                    <Button
                      key={option.value}
                      type="button"
                      variant={isSelected ? "default" : "outline"}
                      className="h-auto p-3 flex items-center gap-3"
                      onClick={() => setFormData(prev => ({ ...prev, severity: option.value }))}
                    >
                      <ConstraintSeverityIndicator severity={option.value} size="sm" />
                      <div className="flex flex-col items-start gap-1">
                        <span className="font-medium">{option.label}</span>
                        <span className="text-xs opacity-70 text-left">
                          {option.description}
                        </span>
                      </div>
                    </Button>
                  );
                })}
              </div>
            </div>

            {/* Active Toggle */}
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="space-y-1">
                <div className="text-sm font-medium">Active Immediately</div>
                <div className="text-xs text-muted-foreground">
                  Whether this constraint is active right away or dormant
                </div>
              </div>
              <Switch
                checked={formData.isActive}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, isActive: checked }))}
                disabled={isSubmitting}
              />
            </div>

            {/* Error Message */}
            {errors.submit && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-600">{errors.submit}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={handleCancel}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || !formData.description.trim()}
              >
                {isSubmitting ? 'Creating...' : 'Create Constraint'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
} 