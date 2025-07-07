'use client';

import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import { MoreHorizontal, Edit2, Trash2, Save, X, Zap, Scale, Cog, Briefcase } from 'lucide-react';
import { ConstraintWithSeverity, Constraint } from '../shared/types';
import { ConstraintSeverityIndicator } from './ConstraintSeverityIndicator';

interface ConstraintItemProps {
  constraint: ConstraintWithSeverity;
  onUpdate: (id: string, changes: Partial<Constraint>) => void;
  onDelete: (id: string) => void;
}

const CATEGORY_ICONS = {
  resource: Zap,
  ethical: Scale, 
  technical: Cog,
  business: Briefcase
};

const SEVERITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' }
] as const;

export function ConstraintItem({
  constraint,
  onUpdate,
  onDelete
}: ConstraintItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editDescription, setEditDescription] = useState(constraint.description);
  const [editSeverity, setEditSeverity] = useState(constraint.severity);
  const [isUpdating, setIsUpdating] = useState(false);

  const Icon = CATEGORY_ICONS[constraint.type];

  const handleSave = async () => {
    if (editDescription.trim() === constraint.description && editSeverity === constraint.severity) {
      setIsEditing(false);
      return;
    }

    setIsUpdating(true);
    try {
      await onUpdate(constraint.id, {
        description: editDescription.trim(),
        severity: editSeverity
      });
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to update constraint:', error);
      // Reset to original values on error
      setEditDescription(constraint.description);
      setEditSeverity(constraint.severity);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCancel = () => {
    setEditDescription(constraint.description);
    setEditSeverity(constraint.severity);
    setIsEditing(false);
  };

  const handleToggleActive = async (isActive: boolean) => {
    try {
      await onUpdate(constraint.id, { isActive });
    } catch (error) {
      console.error('Failed to toggle constraint:', error);
    }
  };

  const handleDelete = async () => {
    if (window.confirm('Are you sure you want to delete this constraint?')) {
      try {
        await onDelete(constraint.id);
      } catch (error) {
        console.error('Failed to delete constraint:', error);
      }
    }
  };

  return (
    <Card className={`
      transition-all duration-200 
      ${constraint.isActive ? 'border-l-4 border-l-primary' : 'border-l-4 border-l-muted'} 
      ${constraint.isNew ? 'ring-2 ring-green-200' : ''}
      ${constraint.isModified ? 'ring-2 ring-blue-200' : ''}
    `}>
      <CardContent className="p-3">
        <div className="flex items-start gap-3">
          {/* Icon and Severity */}
          <div className="flex flex-col items-center gap-2 pt-1">
            <Icon className={`h-4 w-4 ${constraint.isActive ? 'text-primary' : 'text-muted-foreground'}`} />
            <ConstraintSeverityIndicator severity={constraint.severity} size="sm" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {isEditing ? (
              <div className="space-y-3">
                <Textarea
                  value={editDescription}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setEditDescription(e.target.value)}
                  className="min-h-[60px] text-sm"
                  placeholder="Describe this constraint..."
                  autoFocus
                />
                
                <div className="flex items-center gap-2">
                  <select
                    value={editSeverity}
                    onChange={(e) => setEditSeverity(e.target.value as Constraint['severity'])}
                    className="flex h-8 w-32 items-center justify-between rounded-md border border-input bg-background px-3 py-1 text-xs ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {SEVERITY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  
                  <div className="flex items-center gap-1 ml-auto">
                    <Button
                      size="sm"
                      onClick={handleSave}
                      disabled={isUpdating || !editDescription.trim()}
                      className="h-7 px-2"
                    >
                      <Save className="h-3 w-3 mr-1" />
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleCancel}
                      disabled={isUpdating}
                      className="h-7 px-2"
                    >
                      <X className="h-3 w-3 mr-1" />
                      Cancel
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-2">
                  <p className={`text-sm leading-relaxed ${constraint.isActive ? '' : 'opacity-60'}`}>
                    {constraint.description}
                  </p>
                  
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {/* Active Toggle */}
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={constraint.isActive}
                        onCheckedChange={handleToggleActive}
                        size="sm"
                      />
                      <span className="text-xs text-muted-foreground">
                        {constraint.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>

                    {/* More Menu */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                          <MoreHorizontal className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setIsEditing(true)}>
                          <Edit2 className="h-3 w-3 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={handleDelete}
                          className="text-red-600 focus:text-red-600"
                        >
                          <Trash2 className="h-3 w-3 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                {/* Metadata */}
                <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                  <span>
                    Created {new Date(constraint.createdAt).toLocaleDateString()}
                  </span>
                  {constraint.updatedAt !== constraint.createdAt && (
                    <span>
                      Updated {new Date(constraint.updatedAt).toLocaleDateString()}
                    </span>
                  )}
                  {constraint.isNew && (
                    <Badge variant="outline" className="h-4 text-xs px-1">
                      New
                    </Badge>
                  )}
                  {constraint.isModified && (
                    <Badge variant="outline" className="h-4 text-xs px-1">
                      Modified
                    </Badge>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
} 