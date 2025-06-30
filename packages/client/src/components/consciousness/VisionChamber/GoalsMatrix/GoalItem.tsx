'use client';

import { useState } from 'react';
import { motion } from 'motion/react';
import { Edit3, Trash2, Calendar, Flag, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { Goal } from '../shared/types';

interface GoalItemProps {
  goal: Goal;
  onUpdate: (id: string, changes: Partial<Goal>) => void;
  onDelete: (id: string) => void;
}

export function GoalItem({ goal, onUpdate, onDelete }: GoalItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editingDescription, setEditingDescription] = useState(goal.description);

  const getTypeColor = (type: Goal['type']) => {
    switch (type) {
      case 'short_term': return 'text-green-400 bg-green-500/20 border-green-500/30';
      case 'long_term': return 'text-blue-400 bg-blue-500/20 border-blue-500/30';
      case 'milestone': return 'text-purple-400 bg-purple-500/20 border-purple-500/30';
    }
  };

  const getStatusColor = (status: Goal['status']) => {
    switch (status) {
      case 'active': return 'text-green-400 bg-green-500/20';
      case 'completed': return 'text-blue-400 bg-blue-500/20';
      case 'paused': return 'text-yellow-400 bg-yellow-500/20';
      case 'cancelled': return 'text-red-400 bg-red-500/20';
    }
  };

  const getPriorityIcon = (priority: number) => {
    if (priority >= 8) return '🔥';
    if (priority >= 6) return '⭐';
    if (priority >= 4) return '📍';
    return '💫';
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString();
  };

  const handleSaveEdit = () => {
    if (editingDescription.trim() && editingDescription !== goal.description) {
      onUpdate(goal.id, { description: editingDescription.trim() });
    }
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditingDescription(goal.description);
    setIsEditing(false);
  };

  const handleStatusChange = (status: Goal['status']) => {
    const updates: Partial<Goal> = { status };
    if (status === 'completed') {
      updates.completedAt = new Date().toISOString();
    }
    onUpdate(goal.id, updates);
  };

  return (
    <motion.div
      layout
      className="p-4 bg-black/20 border border-white/10 rounded-lg hover:border-white/20 transition-colors"
    >
      <div className="flex items-start justify-between gap-4">
        {/* Goal Content */}
        <div className="flex-1 min-w-0">
          {/* Goal Header */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg" role="img" aria-label="Priority">
              {getPriorityIcon(goal.priority)}
            </span>
            
            <Badge variant="outline" className={cn("text-xs", getTypeColor(goal.type))}>
              {goal.type.replace('_', ' ')}
            </Badge>
            
            <Badge variant="outline" className={cn("text-xs", getStatusColor(goal.status))}>
              {goal.status}
            </Badge>
            
            <span className="text-xs text-white/40">
              Priority {goal.priority}/10
            </span>
          </div>

          {/* Goal Description */}
          <div className="mb-3">
            {isEditing ? (
              <div className="space-y-2">
                <textarea
                  value={editingDescription}
                  onChange={(e) => setEditingDescription(e.target.value)}
                  className="w-full p-2 text-sm bg-black/30 border border-white/10 rounded text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-500/50 resize-none"
                  rows={2}
                  autoFocus
                />
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={handleSaveEdit}
                    className="bg-purple-500/20 text-purple-400 hover:bg-purple-500/30"
                  >
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCancelEdit}
                    className="border-white/10 text-white/60 hover:bg-white/5"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-white/80 leading-relaxed">
                {goal.description}
              </p>
            )}
          </div>

          {/* Goal Metadata */}
          <div className="flex items-center gap-4 text-xs text-white/40">
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              <span>Created {formatDate(goal.createdAt)}</span>
            </div>
            
            {goal.targetDate && (
              <div className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                <span>Target {formatDate(goal.targetDate)}</span>
              </div>
            )}
            
            {goal.completedAt && (
              <div className="flex items-center gap-1">
                <Flag className="w-3 h-3" />
                <span>Completed {formatDate(goal.completedAt)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {/* Status Quick Actions */}
          {goal.status === 'active' && (
            <Button
              size="sm"
              onClick={() => handleStatusChange('completed')}
              className="bg-green-500/20 text-green-400 hover:bg-green-500/30"
            >
              Complete
            </Button>
          )}

          {goal.status === 'completed' && (
            <Button
              size="sm"
              onClick={() => handleStatusChange('active')}
              className="bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
            >
              Reopen
            </Button>
          )}

          {/* Edit/Delete */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setIsEditing(!isEditing)}
            className="border-white/10 text-white/60 hover:bg-white/5"
          >
            <Edit3 className="w-3 h-3" />
          </Button>
          
          <Button
            size="sm"
            variant="outline"
            onClick={() => onDelete(goal.id)}
            className="border-red-500/30 text-red-400 hover:bg-red-500/10"
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </div>
    </motion.div>
  );
} 