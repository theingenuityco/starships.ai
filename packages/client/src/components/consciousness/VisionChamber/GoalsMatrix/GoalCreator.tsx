'use client';

import { useState } from 'react';
import { motion } from 'motion/react';
import { X, Save, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { GoalFormData, Goal } from '../shared/types';

interface GoalCreatorProps {
  onSave: (data: GoalFormData) => void;
  onCancel: () => void;
}

export function GoalCreator({ onSave, onCancel }: GoalCreatorProps) {
  const [formData, setFormData] = useState<GoalFormData>({
    description: '',
    type: 'short_term',
    priority: 5,
    targetDate: ''
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.description.trim()) {
      newErrors.description = 'Description is required';
    } else if (formData.description.length < 10) {
      newErrors.description = 'Description must be at least 10 characters';
    }

    if (formData.priority < 1 || formData.priority > 10) {
      newErrors.priority = 'Priority must be between 1 and 10';
    }

    if (formData.targetDate) {
      const targetDate = new Date(formData.targetDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      if (targetDate < today) {
        newErrors.targetDate = 'Target date cannot be in the past';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (validateForm()) {
      onSave({
        ...formData,
        targetDate: formData.targetDate || undefined
      });
    }
  };

  const handleInputChange = (field: keyof GoalFormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Clear error for this field
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const getTypeDescription = (type: Goal['type']) => {
    switch (type) {
      case 'short_term': return 'Achievable within weeks to a few months';
      case 'long_term': return 'Major objectives spanning months to years';
      case 'milestone': return 'Significant achievement markers';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="w-full max-w-lg"
      >
        <Card className="p-6 bg-black/90 border-white/20 backdrop-blur-sm">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <Target className="w-5 h-5 text-purple-400" />
              <h3 className="text-lg font-semibold text-white">Create New Goal</h3>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={onCancel}
              className="border-white/10 text-white/60 hover:bg-white/5"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-white/80 mb-2">
                Goal Description *
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                placeholder="What do you want to achieve? Be specific and actionable..."
                className="w-full p-3 bg-black/30 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-transparent resize-none"
                rows={3}
                autoFocus
              />
              {errors.description && (
                <p className="mt-1 text-sm text-red-400">{errors.description}</p>
              )}
            </div>

            {/* Type */}
            <div>
              <label className="block text-sm font-medium text-white/80 mb-2">
                Goal Type
              </label>
              <div className="space-y-2">
                {(['short_term', 'long_term', 'milestone'] as Goal['type'][]).map((type) => (
                  <label
                    key={type}
                    className="flex items-start gap-3 p-3 bg-black/20 border border-white/10 rounded-lg cursor-pointer hover:border-white/20 transition-colors"
                  >
                    <input
                      type="radio"
                      name="type"
                      value={type}
                      checked={formData.type === type}
                      onChange={(e) => handleInputChange('type', e.target.value)}
                      className="mt-0.5 text-purple-500 focus:ring-purple-500/50"
                    />
                    <div>
                      <div className="text-sm font-medium text-white capitalize">
                        {type.replace('_', ' ')}
                      </div>
                      <div className="text-xs text-white/60">
                        {getTypeDescription(type)}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Priority and Target Date */}
            <div className="grid grid-cols-2 gap-4">
              {/* Priority */}
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">
                  Priority ({formData.priority}/10)
                </label>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={formData.priority}
                  onChange={(e) => handleInputChange('priority', parseInt(e.target.value))}
                  className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-xs text-white/40 mt-1">
                  <span>Low</span>
                  <span>Critical</span>
                </div>
                {errors.priority && (
                  <p className="mt-1 text-sm text-red-400">{errors.priority}</p>
                )}
              </div>

              {/* Target Date */}
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">
                  Target Date (Optional)
                </label>
                <input
                  type="date"
                  value={formData.targetDate}
                  onChange={(e) => handleInputChange('targetDate', e.target.value)}
                  className="w-full p-2 bg-black/30 border border-white/10 rounded text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                />
                {errors.targetDate && (
                  <p className="mt-1 text-sm text-red-400">{errors.targetDate}</p>
                )}
              </div>
            </div>

            {/* Form Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                className="border-white/10 text-white/60 hover:bg-white/5"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 border border-purple-500/30"
              >
                <Save className="w-4 h-4 mr-2" />
                Create Goal
              </Button>
            </div>
          </form>
        </Card>
      </motion.div>
    </motion.div>
  );
} 